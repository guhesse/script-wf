import { Injectable, Logger } from '@nestjs/common';

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
    constructor() {}

    /**
     * Download em massa de briefings usando o serviço legado
     */
    async bulkDownloadBriefings(
        projectUrls: string[], 
        options: BulkDownloadOptions = {}
    ): Promise<BulkDownloadResult> {
        // Stub temporário: delegar para lógica simulada (pode ser substituída por implementação Playwright própria)
        this.logger.warn('⚠️ Serviço legado desabilitado. Retornando resultado simulado de bulk download.');
        return {
            total: projectUrls.length,
            successful: projectUrls.map((url, idx) => ({
                url,
                projectNumber: idx + 1,
                projectName: `Projeto ${idx + 1}`,
                filesDownloaded: 0,
                totalSize: 0,
                files: [],
                pdfProcessing: { processed: 0, results: [], hasTextExtraction: false }
            })),
            failed: [],
            summary: {
                totalFiles: 0,
                totalSize: 0,
                pdfProcessing: { totalPdfs: 0, successfulExtractions: 0, totalCharactersExtracted: 0 }
            }
        };
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