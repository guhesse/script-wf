import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../modules/database/prisma.service';

interface TempUploadRecord {
    id: string;
    storagePath: string;
    cdnUrl: string;
    fileName: string;
    fileSize?: number;
    userId?: string;
    projectUrl?: string;
    createdAt: Date;
    expiresAt: Date;
}

@Injectable()
export class BunnyUploadUrlService {
    private readonly logger = new Logger(BunnyUploadUrlService.name);

    constructor(private readonly prisma: PrismaService) { }

    private get config() {
        return {
            storageZone: process.env.BUNNY_STORAGE_ZONE || 'scriptwf',
            hostname: process.env.BUNNY_HOSTNAME || 'storage.bunnycdn.com',
            apiKey: process.env.BUNNY_API_KEY,
            pullZoneBase: process.env.BUNNY_PULLZONE_BASE || 'https://scriptwf.b-cdn.net',
        };
    }

    /**
     * Gera URL assinada para upload direto ao Bunny CDN
     * Útil para arquivos muito grandes (>50MB) evitando passar pelo servidor
     */
    async generateSignedUploadUrl(options: {
        fileName: string;
        brand?: string;
        subfolder?: string;
        expiresInMinutes?: number;
        userId?: string;
        projectUrl?: string;
        fileSize?: number;
    }): Promise<{
        success: boolean;
        uploadId?: string;
        uploadUrl?: string;
        headers?: Record<string, string>;
        storagePath?: string;
        cdnUrl?: string;
        error?: string;
    }> {
        const { apiKey, storageZone, hostname, pullZoneBase } = this.config;

        if (!apiKey) {
            return { success: false, error: 'Bunny API key ausente (BUNNY_API_KEY)' };
        }

        try {
            // Gerar ID único para este upload
            const uploadId = `temp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

            // Construir caminho no storage com timestamp para evitar conflitos
            const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const brand = options.brand || 'temp';
            const subfolder = options.subfolder || 'staging';
            const storagePath = `${brand}/${subfolder}/${timestamp}/${uploadId}_${options.fileName}`;

            const normalizedPath = storagePath.replace(/\\/g, '/').replace(/^\//, '');
            const uploadUrl = `https://${hostname}/${storageZone}/${normalizedPath}`;

            // Headers necessários para o upload
            const headers = {
                'AccessKey': apiKey,
                'Content-Type': 'application/octet-stream'
            };

            // URL final do CDN onde o arquivo ficará disponível
            const cdnUrl = `${pullZoneBase.replace(/\/$/, '')}/${normalizedPath}`;

            // Registrar upload temporário no banco
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + (options.expiresInMinutes || 60));

            await this.prisma.tempUpload.create({
                data: {
                    id: uploadId,
                    storagePath: normalizedPath,
                    cdnUrl,
                    fileName: options.fileName,
                    fileSize: options.fileSize,
                    userId: options.userId,
                    projectUrl: options.projectUrl,
                    expiresAt
                }
            });

            this.logger.log(`Gerada URL de upload direto: ${uploadUrl} (ID: ${uploadId})`);

            return {
                success: true,
                uploadId,
                uploadUrl,
                headers,
                storagePath: normalizedPath,
                cdnUrl
            };
        } catch (error) {
            this.logger.error('Erro ao gerar URL de upload:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verifica se um arquivo existe no Bunny CDN
     */
    async checkFileExists(storagePath: string): Promise<boolean> {
        const { storageZone, hostname, apiKey } = this.config;

        if (!apiKey) return false;

        try {
            const normalizedPath = storagePath.replace(/\\/g, '/').replace(/^\//, '');
            const url = `https://${hostname}/${storageZone}/${normalizedPath}`;

            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'AccessKey': apiKey
                }
            });

            return response.ok;
        } catch (error) {
            this.logger.warn(`Erro ao verificar arquivo ${storagePath}:`, error.message);
            return false;
        }
    }

    /**
     * Marcar um upload temporário como utilizado
     */
    async markAsUsed(uploadId: string): Promise<boolean> {
        try {
            await this.prisma.tempUpload.update({
                where: { id: uploadId },
                data: { isUsed: true }
            });
            this.logger.log(`Upload temporário ${uploadId} marcado como utilizado`);
            return true;
        } catch (error) {
            this.logger.error(`Erro ao marcar upload ${uploadId} como utilizado:`, error.message);
            return false;
        }
    }

    /**
     * Deletar arquivo do Bunny CDN
     */
    async deleteFile(storagePath: string): Promise<boolean> {
        const { storageZone, hostname, apiKey } = this.config;

        if (!apiKey) return false;

        try {
            const normalizedPath = storagePath.replace(/\\/g, '/').replace(/^\//, '');
            const url = `https://${hostname}/${storageZone}/${normalizedPath}`;

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'AccessKey': apiKey
                }
            });

            if (response.ok) {
                this.logger.log(`Arquivo deletado do Bunny CDN: ${storagePath}`);
                return true;
            } else {
                this.logger.warn(`Falha ao deletar arquivo do Bunny CDN: ${response.status} - ${storagePath}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`Erro ao deletar arquivo ${storagePath}:`, error.message);
            return false;
        }
    }

    /**
     * Limpeza de arquivos expirados
     */
    async cleanupExpiredFiles(): Promise<{
        deletedCount: number;
        failedCount: number;
        errors: string[];
    }> {
        const now = new Date();
        let deletedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        try {
            // Buscar arquivos expirados
            const expiredFiles = await this.prisma.tempUpload.findMany({
                where: {
                    expiresAt: { lt: now },
                    deletedAt: null
                }
            });

            this.logger.log(`Encontrados ${expiredFiles.length} arquivos expirados para limpeza`);

            for (const file of expiredFiles) {
                try {
                    // Deletar do Bunny CDN
                    const deleted = await this.deleteFile(file.storagePath);

                    // Marcar como deletado no banco (soft delete)
                    await this.prisma.tempUpload.update({
                        where: { id: file.id },
                        data: { deletedAt: now }
                    });

                    if (deleted) {
                        deletedCount++;
                    } else {
                        failedCount++;
                        errors.push(`Falha ao deletar do CDN: ${file.storagePath}`);
                    }
                } catch (error) {
                    failedCount++;
                    const errorMsg = `Erro ao processar arquivo ${file.id}: ${error.message}`;
                    errors.push(errorMsg);
                    this.logger.error(errorMsg);
                }
            }

            this.logger.log(`Limpeza concluída: ${deletedCount} deletados, ${failedCount} falharam`);

            return { deletedCount, failedCount, errors };
        } catch (error) {
            this.logger.error('Erro na limpeza de arquivos expirados:', error.message);
            throw error;
        }
    }

    /**
     * Limpeza de arquivos utilizados (mais antigos que X horas)
     */
    async cleanupUsedFiles(olderThanHours: number = 24): Promise<{
        deletedCount: number;
        failedCount: number;
        errors: string[];
    }> {
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

        let deletedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        try {
            // Buscar arquivos utilizados e antigos
            const usedFiles = await this.prisma.tempUpload.findMany({
                where: {
                    isUsed: true,
                    createdAt: { lt: cutoffDate },
                    deletedAt: null
                }
            });

            this.logger.log(`Encontrados ${usedFiles.length} arquivos utilizados antigos para limpeza`);

            for (const file of usedFiles) {
                try {
                    // Deletar do Bunny CDN
                    const deleted = await this.deleteFile(file.storagePath);

                    // Marcar como deletado no banco
                    await this.prisma.tempUpload.update({
                        where: { id: file.id },
                        data: { deletedAt: new Date() }
                    });

                    if (deleted) {
                        deletedCount++;
                    } else {
                        failedCount++;
                        errors.push(`Falha ao deletar do CDN: ${file.storagePath}`);
                    }
                } catch (error) {
                    failedCount++;
                    const errorMsg = `Erro ao processar arquivo ${file.id}: ${error.message}`;
                    errors.push(errorMsg);
                    this.logger.error(errorMsg);
                }
            }

            this.logger.log(`Limpeza de arquivos utilizados concluída: ${deletedCount} deletados, ${failedCount} falharam`);

            return { deletedCount, failedCount, errors };
        } catch (error) {
            this.logger.error('Erro na limpeza de arquivos utilizados:', error.message);
            throw error;
        }
    }

    /**
     * Obter estatísticas de uploads temporários
     */
    async getStats(): Promise<{
        total: number;
        active: number;
        used: number;
        expired: number;
        deleted: number;
        totalSize: number;
    }> {
        const now = new Date();

        const [
            total,
            active,
            used,
            expired,
            deleted,
            sizeResult
        ] = await Promise.all([
            this.prisma.tempUpload.count(),
            this.prisma.tempUpload.count({
                where: {
                    isUsed: false,
                    expiresAt: { gt: now },
                    deletedAt: null
                }
            }),
            this.prisma.tempUpload.count({
                where: { isUsed: true, deletedAt: null }
            }),
            this.prisma.tempUpload.count({
                where: {
                    expiresAt: { lt: now },
                    deletedAt: null
                }
            }),
            this.prisma.tempUpload.count({
                where: { deletedAt: { not: null } }
            }),
            this.prisma.tempUpload.aggregate({
                _sum: { fileSize: true },
                where: { deletedAt: null }
            })
        ]);

        return {
            total,
            active,
            used,
            expired,
            deleted,
            totalSize: Number(sizeResult._sum.fileSize) || 0
        };
    }
}