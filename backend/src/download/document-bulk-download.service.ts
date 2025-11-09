import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as archiver from 'archiver';
import { Readable } from 'stream';
import { BriefingExtractionService } from '../modules/briefing/briefing-extraction.service';
import { FolderOrganizationService } from './folder-organization.service';
import { BulkProgressService } from '../modules/pdf/bulk-progress.service';

export interface BulkDownloadOptions {
    headless?: boolean;
    downloadPath?: string;
    continueOnError?: boolean;
    keepFiles?: boolean;
    organizeByDSID?: boolean;
    concurrency?: number;
    mode?: 'pm' | 'studio';
    generatePpt?: boolean;
}

export interface BulkDownloadResult {
    total: number;
    successful: Array<{
        url: string;
        projectNumber: number;
        projectName: string;
        filesDownloaded: number;
        totalSize?: number;
        files?: Array<any>;
        pdfProcessing?: {
            processed: number;
            results: Array<{
                fileName: string;
                filePath: string;
                metadata?: any;
                text?: string;
                textLength?: number;
                hasContent?: boolean;
                hasComments?: boolean;
                commentsCount?: number;
                comments?: Array<any>;
            }>;
            hasTextExtraction: boolean;
        };
        downloadDir?: string;
        ppt?: { fileName: string; path?: string; testMode?: boolean };
    }>;
    failed: Array<{
        url: string;
        projectNumber: number;
        error: string;
    }>;
    summary: {
        totalFiles: number;
        totalSize: number;
        pdfProcessing?: {
            totalPdfs: number;
            successfulExtractions: number;
            totalCharactersExtracted: number;
        };
    };
    zipBuffer?: Buffer; // ZIP criado em memória
    zipFileName?: string; // Nome do arquivo ZIP
}

@Injectable()
export class DocumentBulkDownloadService {
    private readonly logger = new Logger(DocumentBulkDownloadService.name);
    private zipStorage = new Map<string, { buffer: Buffer; fileName: string; createdAt: Date }>();
    
    constructor(
        private readonly extraction: BriefingExtractionService,
        private readonly folders: FolderOrganizationService,
        private readonly progress: BulkProgressService,
    ) { 
        // Limpar ZIPs antigos a cada 1 hora
        setInterval(() => this.cleanupOldZips(), 60 * 60 * 1000);
    }

    /**
     * Download em massa de briefings usando o serviço legado
     */
    async bulkDownloadBriefings(
        projectUrls: string[],
        options: BulkDownloadOptions = {}
    ): Promise<BulkDownloadResult> {
        const headless = options.headless !== false;
        const continueOnError = options.continueOnError !== false;
        const keepFiles = options.keepFiles !== false; // default manter pois vamos organizar
        const organizeByDSID = options.organizeByDSID !== false;
        const downloadPath = options.downloadPath || path.join(process.cwd(), 'downloads');
        const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 3, 5));
        const mode = options.mode === 'studio' ? 'studio' : 'pm';

        await fs.mkdir(downloadPath, { recursive: true });

        const result: BulkDownloadResult = {
            total: projectUrls.length,
            successful: [],
            failed: [],
            summary: {
                totalFiles: 0,
                totalSize: 0,
                pdfProcessing: { totalPdfs: 0, successfulExtractions: 0, totalCharactersExtracted: 0 }
            }
        };

        // Usar pipeline já existente que também persiste no banco
        const pipeline: any = await this.extraction.processProjectsBriefings(projectUrls, { headless, continueOnError, keepFiles, concurrency, generatePpt: options.generatePpt });

        // Mapear falhas primeiro
        for (const fail of pipeline.downloadResults?.failed || []) {
            result.failed.push({ url: fail.url, projectNumber: fail.projectNumber, error: fail.error });
        }

        // Organizar sucessos e compor resultado
        for (const success of pipeline.downloadResults?.successful || []) {
            const url = success.url;
            const projectNumber = success.projectNumber;
            const projectName = success.projectName;
            const dsid = (this.extraction as any)['extractDSIDFromProjectName']?.call(this.extraction, projectName) || null;

            let organizedCount = 0;
            let totalSize = 0;
            let projectFolder: string | undefined;

            if (keepFiles && success.pdfProcessing?.results?.length) {
                projectFolder = await this.folders.ensureProjectFolder(downloadPath, projectName, dsid, { organizeByDSID, keepFiles, mode });
                for (const pdf of success.pdfProcessing.results) {
                    if (!pdf.filePath) continue;
                    const stat = await fs.stat(pdf.filePath).catch(() => null);
                    if (stat) totalSize += stat.size;
                    await this.folders.moveIntoProject(projectFolder, pdf.filePath, { organizeByDSID, keepFiles, mode });
                    organizedCount++;
                }
                // Limpar diretório temporário original, se conhecido
                const tmp = success.downloadDir;
                if (tmp) {
                    await fs.rm(tmp, { recursive: true, force: true }).catch(() => void 0);
                }
            }

            // Mover PPT se existir e não testMode
            if (success.ppt && success.ppt.path && projectFolder) {
                try {
                    const pptFolder = path.join(projectFolder, 'ppt');
                    await fs.mkdir(pptFolder, { recursive: true });
                    const dest = path.join(pptFolder, path.basename(success.ppt.path));
                    await fs.rename(success.ppt.path, dest).catch(async () => {
                        await fs.copyFile(success.ppt.path, dest);
                        await fs.unlink(success.ppt.path).catch(() => void 0);
                    });
                    success.ppt.path = dest;
                } catch { /* ignore move errors para não falhar bulk */ }
            }

            result.successful.push({
                url,
                projectNumber,
                projectName,
                filesDownloaded: organizedCount || success.filesDownloaded || 0,
                totalSize: totalSize || success.totalSize || 0,
                files: success.files || [],
                pdfProcessing: success.pdfProcessing || undefined,
                downloadDir: projectFolder || success.downloadDir,
                ppt: success.ppt ? { fileName: success.ppt.fileName, path: success.ppt.path, testMode: success.ppt.testMode } : undefined
            });

            result.summary.totalFiles += organizedCount || (success.filesDownloaded || 0);
            result.summary.totalSize += totalSize || (success.totalSize || 0);
            if (success.pdfProcessing) {
                result.summary.pdfProcessing.totalPdfs += success.pdfProcessing.processed || 0;
                result.summary.pdfProcessing.successfulExtractions += (success.pdfProcessing.results || []).filter((p: any) => p.hasContent).length;
                result.summary.pdfProcessing.totalCharactersExtracted += (success.pdfProcessing.results || []).reduce((s: number, p: any) => s + (p.textLength || 0), 0);
            }
        }

        return result;
    }

    /**
     * Variante com progresso: emite eventos SSE usando operationId
     */
    async startBulkWithProgress(operationId: string, projectUrls: string[], options: BulkDownloadOptions = {}) {
        const headless = options.headless !== false;
        const continueOnError = options.continueOnError !== false;
        const keepFiles = options.keepFiles !== false;
        const organizeByDSID = options.organizeByDSID !== false;
        const downloadPath = options.downloadPath || path.join(process.cwd(), 'downloads');
        const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 3, 5));
        const mode = options.mode === 'studio' ? 'studio' : 'pm';

        await fs.mkdir(downloadPath, { recursive: true });
        this.progress.create(operationId);

        const progressHook = (ev: { type: string; data?: any }) => {
            switch (ev.type) {
                case 'start':
                    this.progress.emit(operationId, { type: 'start', data: ev.data }); break;
                case 'project-start':
                    this.progress.emit(operationId, { type: 'project-start', data: ev.data }); break;
                case 'stage':
                    this.progress.emit(operationId, { type: 'stage', data: ev.data }); break;
                case 'project-success':
                    this.progress.emit(operationId, { type: 'project-success', data: ev.data }); break;
                case 'project-fail':
                    this.progress.emit(operationId, { type: 'project-fail', data: ev.data }); break;
                case 'project-meta':
                    this.progress.emit(operationId, { type: 'project-meta', data: ev.data }); break;
                case 'ppt-generated':
                    // Encaminhar diretamente
                    this.progress.emit(operationId, { type: 'ppt-generated', data: ev.data }); break;
                case 'ppt-error':
                    this.progress.emit(operationId, { type: 'ppt-error', data: ev.data }); break;
                case 'completed':
                    this.progress.emit(operationId, { type: 'completed', data: ev.data }); break;
            }
        };

        const pipeline: any = await this.extraction.processProjectsBriefings(projectUrls, {
            headless, continueOnError, keepFiles, concurrency, progress: progressHook, operationId,
            isCanceled: (projectNumber: number) => this.progress.isCanceled(operationId, projectNumber),
            generatePpt: options.generatePpt,
            downloadPath, organizeByDSID, mode,
            // Não precisamos mais organizar arquivos em pastas físicas
            // Os arquivos temporários serão adicionados diretamente ao ZIP
            onProjectComplete: undefined
        });

        // Pipeline já processou tudo, incluindo organização de arquivos e PPTs
        // Apenas contar PPTs gerados para o evento final
        const pptCount = (pipeline.downloadResults?.successful || []).filter((s: any) => s.ppt?.fileName).length;

        // Criar ZIP com todos os arquivos em memória
        this.logger.log('📦 Iniciando criação do ZIP em memória...');
        this.progress.emit(operationId, { type: 'creating-zip', data: { status: 'starting' } });
        
        try {
            const zipResult = await this.createZipInMemory(
                pipeline.downloadResults?.successful || [],
                mode,
                operationId
            );

            this.progress.emit(operationId, { 
                type: 'completed', 
                data: { 
                    successful: pipeline.successful, 
                    failed: pipeline.failed, 
                    pptGenerated: pptCount,
                    zipFileName: zipResult.fileName,
                    zipSize: zipResult.buffer.length
                } 
            });

            // Armazenar ZIP temporariamente para download
            await this.storeZipTemporarily(operationId, zipResult.buffer, zipResult.fileName);
            
            // Limpar arquivos temporários usados no ZIP
            await this.cleanupTemporaryFiles(pipeline.downloadResults?.successful || []);
            
        } catch (error) {
            this.logger.error(`❌ Erro ao criar ZIP: ${error.message}`);
            this.progress.emit(operationId, { type: 'error', data: { message: 'Erro ao criar ZIP', error: error.message } });
        }

        this.progress.complete(operationId);
    }

    /**
     * Obter preview do download em massa
     */
    async getDownloadPreview(projectUrls: string[]) {
        return {
            totalProjects: projectUrls.length,
            projects: projectUrls.map((url, i) => ({ number: i + 1, url }))
        };
    }

    /**
     * Buscar dados estruturados de um projeto
     */
    async getStructuredDataFromProject(projectPath: string) {
        this.logger.warn('⚠️ Método getStructuredDataFromProject stub sem implementação.');
        return {};
    }

    /**
     * Validar sessão do Workfront
     */
    async validateSession() {
        this.logger.warn('⚠️ validateSession stub retornando true.');
        return { valid: true };
    }

    /**
     * Criar ZIP em memória com todos os arquivos dos projetos
     */
    private async createZipInMemory(
        successfulProjects: Array<{
            projectName: string;
            pdfProcessing?: { results: Array<{ fileName: string; filePath: string }> };
            ppt?: { fileName: string; path?: string };
        }>,
        mode: 'pm' | 'studio',
        operationId?: string
    ): Promise<{ buffer: Buffer; fileName: string }> {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks: Buffer[] = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const fileName = `bulk-download-${timestamp}.zip`;
                resolve({ buffer, fileName });
            });
            archive.on('error', reject);

            // Adicionar arquivos de cada projeto ao ZIP
            let totalFiles = 0;
            for (const project of successfulProjects) {
                const projectFolderName = this.sanitizeFolderName(project.projectName);

                // Estrutura de pastas baseada no modo
                if (mode === 'pm') {
                    // === MODO PM ===
                    // Adicionar PDFs na pasta 'brief'
                    if (project.pdfProcessing?.results) {
                        for (const pdf of project.pdfProcessing.results) {
                            if (pdf.filePath) {
                                try {
                                    archive.file(pdf.filePath, { 
                                        name: `${projectFolderName}/brief/${pdf.fileName}` 
                                    });
                                    totalFiles++;
                                } catch (err) {
                                    this.logger.warn(`Erro ao adicionar ${pdf.fileName} ao ZIP: ${err.message}`);
                                }
                            }
                        }
                    }

                    // Adicionar PPT na pasta 'ppt'
                    if (project.ppt?.path) {
                        try {
                            archive.file(project.ppt.path, { 
                                name: `${projectFolderName}/ppt/${project.ppt.fileName}` 
                            });
                            totalFiles++;
                        } catch (err) {
                            this.logger.warn(`Erro ao adicionar PPT ao ZIP: ${err.message}`);
                        }
                    }

                    // Criar pasta 'creatives' vazia
                    archive.append('', { name: `${projectFolderName}/creatives/` });

                } else {
                    // === MODO STUDIO ===
                    // Adicionar PDFs na pasta 'brief'
                    if (project.pdfProcessing?.results) {
                        for (const pdf of project.pdfProcessing.results) {
                            if (pdf.filePath) {
                                try {
                                    archive.file(pdf.filePath, { 
                                        name: `${projectFolderName}/brief/${pdf.fileName}` 
                                    });
                                    totalFiles++;
                                } catch (err) {
                                    this.logger.warn(`Erro ao adicionar ${pdf.fileName} ao ZIP: ${err.message}`);
                                }
                            }
                        }
                    }



                    // Criar estrutura de pastas vazias para Studio
                    archive.append('', { name: `${projectFolderName}/assets/master/` });
                    archive.append('', { name: `${projectFolderName}/assets/products/` });
                    archive.append('', { name: `${projectFolderName}/assets/lifestyles/` });
                    archive.append('', { name: `${projectFolderName}/assets/screenfill/` });
                    archive.append('', { name: `${projectFolderName}/deliverables/` });
                    archive.append('', { name: `${projectFolderName}/sb/` });
                }
            }

            if (operationId) {
                this.progress.emit(operationId, { 
                    type: 'creating-zip', 
                    data: { totalFiles, totalProjects: successfulProjects.length } 
                });
            }

            this.logger.log(`📦 Finalizando ZIP com ${totalFiles} arquivos de ${successfulProjects.length} projetos`);
            archive.finalize();
        });
    }

    /**
     * Sanitizar nome de pasta para uso em ZIP
     */
    private sanitizeFolderName(name: string): string {
        return name
            .replace(/[<>:"|?*]/g, '_')
            .replace(/\//g, '-')
            .replace(/\\/g, '-')
            .trim();
    }

    /**
     * Armazenar ZIP temporariamente em memória
     */
    private async storeZipTemporarily(operationId: string, buffer: Buffer, fileName: string) {
        this.zipStorage.set(operationId, {
            buffer,
            fileName,
            createdAt: new Date()
        });
        this.logger.log(`💾 ZIP armazenado temporariamente: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    }

    /**
     * Recuperar ZIP armazenado
     */
    getStoredZip(operationId: string): { buffer: Buffer; fileName: string } | null {
        const stored = this.zipStorage.get(operationId);
        if (!stored) return null;
        return { buffer: stored.buffer, fileName: stored.fileName };
    }

    /**
     * Limpar ZIPs antigos (mais de 2 horas)
     */
    private cleanupOldZips() {
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        
        for (const [operationId, data] of this.zipStorage.entries()) {
            if (data.createdAt < twoHoursAgo) {
                this.zipStorage.delete(operationId);
                this.logger.log(`🗑️ ZIP removido da memória: ${data.fileName}`);
            }
        }
    }

    /**
     * Limpar arquivos temporários após criação do ZIP
     */
    private async cleanupTemporaryFiles(
        successfulProjects: Array<{
            pdfProcessing?: { results: Array<{ filePath: string }> };
            ppt?: { path?: string };
            downloadDir?: string;
        }>
    ) {
        for (const project of successfulProjects) {
            // Limpar PDFs temporários
            if (project.pdfProcessing?.results) {
                for (const pdf of project.pdfProcessing.results) {
                    if (pdf.filePath) {
                        await fs.unlink(pdf.filePath).catch(() => void 0);
                    }
                }
            }

            // Limpar PPT temporário
            if (project.ppt?.path) {
                await fs.unlink(project.ppt.path).catch(() => void 0);
            }

            // Limpar diretório temporário se existir
            if (project.downloadDir) {
                await fs.rm(project.downloadDir, { recursive: true, force: true }).catch(() => void 0);
            }
        }
        this.logger.log('🗑️ Arquivos temporários limpos após criação do ZIP');
    }
}