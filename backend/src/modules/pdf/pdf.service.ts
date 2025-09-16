import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
    ExtractPdfDto,
    ExtractPdfResponseDto,
    ProcessPdfsDto,
    ProcessPdfsResponseDto,
    StructuredDataQueryDto,
    StructuredDataResponseDto,
    BulkDownloadDto,
    BulkDownloadResponseDto,
    BulkDownloadPreviewResponseDto,
} from './dto/pdf.dto';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class PdfService {
    private readonly logger = new Logger(PdfService.name);
    private readonly defaultDownloadPath = join(process.cwd(), 'downloads');
    private pdfParse: any = null;

    constructor(private readonly prisma: PrismaService) {}

    async healthCheck(): Promise<any> {
        return {
            service: 'pdf',
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Inicializar biblioteca pdf-parse
     */
    private async initPdfParse(): Promise<any> {
        if (!this.pdfParse) {
            try {
                // Usar dynamic import para pdf-parse
                this.pdfParse = (await import('pdf-parse')).default;
                this.logger.log('✅ Biblioteca pdf-parse carregada com sucesso');
            } catch (error) {
                this.logger.error('❌ Erro ao carregar pdf-parse:', error.message);
                throw new Error('Biblioteca pdf-parse não disponível. Execute: npm install pdf-parse');
            }
        }
        return this.pdfParse;
    }

    /**
     * Extrair conteúdo de um arquivo PDF
     */
    async extractPdfContent(extractDto: ExtractPdfDto): Promise<ExtractPdfResponseDto> {
        try {
            const { pdfFilePath } = extractDto;
            this.logger.log(`📄 Extraindo conteúdo do PDF: ${pdfFilePath}`);

            // Verificar se o arquivo existe
            try {
                await fs.access(pdfFilePath);
            } catch (error) {
                throw new Error(`Arquivo PDF não encontrado: ${pdfFilePath}`);
            }

            // Inicializar biblioteca pdf-parse
            const pdfParseLib = await this.initPdfParse();

            // Ler o arquivo PDF
            const pdfBuffer = await fs.readFile(pdfFilePath);

            // Extrair dados do PDF
            const pdfData = await pdfParseLib(pdfBuffer);

            const result: ExtractPdfResponseDto = {
                success: true,
                fileName: pdfFilePath.split(/[\/\\]/).pop() || 'unknown.pdf',
                metadata: {
                    title: pdfData.info?.Title || 'Sem título',
                    author: pdfData.info?.Author || 'Autor não informado',
                    pages: pdfData.numpages || 0,
                },
                text: pdfData.text || '',
                textLength: (pdfData.text || '').length,
                hasContent: !!(pdfData.text && pdfData.text.trim().length > 0),
            };

            this.logger.log(`✅ Conteúdo extraído: ${result.textLength} caracteres, ${result.metadata.pages} páginas`);
            return result;
        } catch (error) {
            this.logger.error(`❌ Erro ao extrair conteúdo do PDF: ${error.message}`);
            throw new Error(`Falha na extração do PDF: ${error.message}`);
        }
    }

    /**
     * Processar todos os PDFs em uma pasta de projeto
     */
    async processPdfsInProject(processDto: ProcessPdfsDto): Promise<ProcessPdfsResponseDto> {
        try {
            const { projectPath, projectName } = processDto;
            this.logger.log(`📁 Processando PDFs do projeto: ${projectName || 'Sem nome'}`);

            // Verificar se a pasta existe
            try {
                await fs.access(projectPath);
            } catch (error) {
                throw new Error(`Pasta do projeto não encontrada: ${projectPath}`);
            }

            // Buscar recursivamente por arquivos PDF
            const pdfFiles = await this.findPdfFiles(projectPath);

            if (pdfFiles.length === 0) {
                this.logger.warn('⚠️ Nenhum arquivo PDF encontrado na pasta');
                return {
                    success: true,
                    summary: {
                        totalPdfs: 0,
                        successful: 0,
                        failed: 0,
                        totalCharacters: 0,
                    },
                    results: [],
                };
            }

            this.logger.log(`📋 Encontrados ${pdfFiles.length} arquivos PDF para processar`);

            const results = [];
            let successful = 0;
            let failed = 0;
            let totalCharacters = 0;

            // Processar cada PDF
            for (const pdfFile of pdfFiles) {
                try {
                    const extractResult = await this.extractPdfContent({ pdfFilePath: pdfFile });
                    results.push({
                        fileName: extractResult.fileName,
                        hasContent: extractResult.hasContent,
                        textLength: extractResult.textLength,
                    });

                    if (extractResult.hasContent) {
                        successful++;
                        totalCharacters += extractResult.textLength;
                    }
                } catch (error) {
                    this.logger.error(`❌ Erro ao processar ${pdfFile}: ${error.message}`);
                    results.push({
                        fileName: pdfFile.split(/[\/\\]/).pop() || 'unknown.pdf',
                        hasContent: false,
                        textLength: 0,
                    });
                    failed++;
                }
            }

            return {
                success: true,
                summary: {
                    totalPdfs: pdfFiles.length,
                    successful,
                    failed,
                    totalCharacters,
                },
                results,
            };
        } catch (error) {
            this.logger.error(`❌ Erro ao processar PDFs do projeto: ${error.message}`);
            throw error;
        }
    }

    /**
     * Buscar dados estruturados de PDFs processados
     */
    async getStructuredData(queryDto: StructuredDataQueryDto): Promise<StructuredDataResponseDto> {
        try {
            const { projectPath } = queryDto;
            this.logger.log(`📁 Buscando dados estruturados em: ${projectPath}`);

            // Verificar se a pasta existe
            try {
                await fs.access(projectPath);
            } catch (error) {
                throw new Error(`Pasta do projeto não encontrada: ${projectPath}`);
            }

            // Buscar recursivamente por arquivos JSON de dados estruturados
            const structuredFiles = await this.findStructuredDataFiles(projectPath);

            this.logger.log(`✅ Encontrados ${structuredFiles.length} arquivos de dados estruturados`);

            return {
                success: true,
                data: structuredFiles,
            };
        } catch (error) {
            this.logger.error(`❌ Erro ao buscar dados estruturados: ${error.message}`);
            throw error;
        }
    }

    /**
     * Preview do download em massa
     */
    getBulkDownloadPreview(projectUrls: string[]): BulkDownloadPreviewResponseDto {
        return {
            success: true,
            preview: {
                totalProjects: projectUrls.length,
                targetFolder: '05. Briefing',
                downloadPath: this.defaultDownloadPath,
                estimatedTime: `${projectUrls.length * 2}-${projectUrls.length * 5} minutos`,
                projects: projectUrls.map((url, index) => ({
                    number: index + 1,
                    url: url,
                    status: 'pending',
                })),
            },
        };
    }

    /**
     * Download em massa (TODO: Implementar integração com sistema de automação)
     */
    async bulkDownloadBriefings(downloadDto: BulkDownloadDto): Promise<BulkDownloadResponseDto> {
        try {
            const { projectUrls, downloadPath = this.defaultDownloadPath, headless = true, continueOnError = true } = downloadDto;

            this.logger.log('📦 === DOWNLOAD EM MASSA DE BRIEFINGS ===');
            this.logger.log(`🔗 ${projectUrls.length} projetos para processar`);

            // TODO: Implementar integração com sistema de automação Playwright
            // Por enquanto, retornar resultado simulado

            const results: BulkDownloadResponseDto = {
                success: true,
                message: `Download em massa concluído: ${projectUrls.length} projetos processados`,
                total: projectUrls.length,
                successful: projectUrls.map((url, index) => ({
                    url,
                    projectNumber: index + 1,
                    projectName: `Projeto ${index + 1}`,
                    filesDownloaded: 3,
                    totalSize: 1024 * 1024 * 5, // 5MB simulado
                })),
                failed: [],
                summary: {
                    totalFiles: projectUrls.length * 3,
                    totalSize: projectUrls.length * 1024 * 1024 * 5,
                },
            };

            return results;
        } catch (error) {
            this.logger.error(`❌ Erro no download em massa: ${error.message}`);
            throw error;
        }
    }

    /**
     * Buscar arquivos PDF recursivamente em uma pasta
     */
    private async findPdfFiles(dirPath: string): Promise<string[]> {
        const pdfFiles: string[] = [];

        async function searchInDirectory(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    await searchInDirectory(fullPath);
                } else if (entry.name.toLowerCase().endsWith('.pdf')) {
                    pdfFiles.push(fullPath);
                }
            }
        }

        await searchInDirectory(dirPath);
        return pdfFiles;
    }

    /**
     * Buscar arquivos de dados estruturados
     */
    private async findStructuredDataFiles(dirPath: string): Promise<any[]> {
        const structuredFiles: any[] = [];

        async function searchInDirectory(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    await searchInDirectory(fullPath);
                } else if (entry.name.endsWith('_structured_data.json')) {
                    try {
                        const jsonContent = await fs.readFile(fullPath, 'utf8');
                        const data = JSON.parse(jsonContent);
                        structuredFiles.push({
                            fileName: entry.name,
                            ...data,
                        });
                    } catch (parseError) {
                        // Ignorar arquivos JSON inválidos
                    }
                }
            }
        }

        await searchInDirectory(dirPath);
        return structuredFiles;
    }
}