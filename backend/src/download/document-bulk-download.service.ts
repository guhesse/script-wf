import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { BriefingExtractionService } from '../modules/briefing/briefing-extraction.service';
import { FolderOrganizationService } from './folder-organization.service';

export interface BulkDownloadOptions {
    headless?: boolean;
    downloadPath?: string;
    continueOnError?: boolean;
    keepFiles?: boolean;
    organizeByDSID?: boolean;
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
    ) {}

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
        const pipeline: any = await this.extraction.processProjectsBriefings(projectUrls, { headless, continueOnError, keepFiles });

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
                projectFolder = await this.folders.ensureProjectFolder(downloadPath, projectName, dsid, { organizeByDSID, keepFiles });
                for (const pdf of success.pdfProcessing.results) {
                    if (!pdf.filePath) continue;
                    const stat = await fs.stat(pdf.filePath).catch(() => null);
                    if (stat) totalSize += stat.size;
                    await this.folders.moveIntoProject(projectFolder, pdf.filePath);
                    organizedCount++;
                }
                // Limpar diretório temporário original, se conhecido
                const tmp = success.downloadDir;
                if (tmp) {
                    await fs.rm(tmp, { recursive: true, force: true }).catch(() => void 0);
                }
            }

            result.successful.push({
                url,
                projectNumber,
                projectName,
                filesDownloaded: organizedCount || success.filesDownloaded || 0,
                totalSize: totalSize || success.totalSize || 0,
                files: success.files || [],
                pdfProcessing: success.pdfProcessing || undefined,
                downloadDir: projectFolder || success.downloadDir
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