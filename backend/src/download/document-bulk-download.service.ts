import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
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
}

@Injectable()
export class DocumentBulkDownloadService {
    private readonly logger = new Logger(DocumentBulkDownloadService.name);
    constructor(
        private readonly extraction: BriefingExtractionService,
        private readonly folders: FolderOrganizationService,
        private readonly progress: BulkProgressService,
    ) { }

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
            // pptTestMode removido
        });

        // Emit organização e término por projeto
        let pptCount = 0;
        for (const success of pipeline.downloadResults?.successful || []) {
            const dsid = (this.extraction as any)['extractDSIDFromProjectName']?.call(this.extraction, success.projectName) || null;
            let projectFolder: string | undefined;
            if (keepFiles && success.pdfProcessing?.results?.length) {
                this.progress.emit(operationId, { type: 'stage', data: { projectNumber: success.projectNumber, stage: 'organizing-files' } });
                projectFolder = await this.folders.ensureProjectFolder(downloadPath, success.projectName, dsid, { organizeByDSID, keepFiles, mode });
                for (const pdf of success.pdfProcessing.results) {
                    if (!pdf.filePath) continue;
                    await this.folders.moveIntoProject(projectFolder, pdf.filePath, { organizeByDSID, keepFiles, mode });
                }
            }
            if (success.ppt) {
                pptCount++;
                // Se não for testMode e houver path, mover para subpasta /ppt
                if (success.ppt.path && projectFolder) {
                    try {
                        const pptFolder = path.join(projectFolder, 'ppt');
                        await fs.mkdir(pptFolder, { recursive: true });
                        const dest = path.join(pptFolder, path.basename(success.ppt.path));
                        await fs.rename(success.ppt.path, dest).catch(async () => {
                            // fallback copiar e remover
                            await fs.copyFile(success.ppt.path, dest);
                            await fs.unlink(success.ppt.path).catch(() => void 0);
                        });
                        success.ppt.path = dest;
                        (this.progress as any).emit(operationId, { type: 'ppt', data: { projectNumber: success.projectNumber, fileName: success.ppt.fileName, folder: dest, testMode: success.ppt.testMode } });
                    } catch (e: any) {
                        this.progress.emit(operationId, { type: 'ppt-error', data: { projectNumber: success.projectNumber, error: 'move-failed: ' + e.message } });
                    }
                } else {
                    (this.progress as any).emit(operationId, { type: 'ppt', data: { projectNumber: success.projectNumber, fileName: success.ppt.fileName } });
                }
            }
            this.progress.emit(operationId, { type: 'project-success', data: { projectNumber: success.projectNumber, folder: projectFolder } });
        }

        this.progress.emit(operationId, { type: 'completed', data: { successful: pipeline.successful, failed: pipeline.failed, pptGenerated: pptCount } });
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
}