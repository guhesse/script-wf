import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontService } from '../workfront/workfront.service';
import { CommentEnhancementService } from './comment-enhancement.service';
import {
    ExtractDocumentsDto,
    ExtractDocumentsResponseDto,
} from './dto/pdf.dto';
import { 
    EnhanceExtractionDto, 
    EnhanceExtractionResponseDto 
} from './dto/ai-processing.dto';
import { chromium } from 'playwright';

@Injectable()
export class ExtractionService {
    private readonly logger = new Logger(ExtractionService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => WorkfrontService))
        private readonly workfrontService: WorkfrontService,
        private readonly commentEnhancement: CommentEnhancementService,
    ) {}

    /**
     * Extrair documentos de um projeto
     */
    async extractDocuments(extractDto: ExtractDocumentsDto): Promise<ExtractDocumentsResponseDto> {
        try {
            const { projectUrl, headless } = extractDto;
            
            this.logger.log(`📂 Extraindo documentos do projeto: ${projectUrl}`);
            this.logger.log(`🎭 Modo headless: ${headless}`);

            // Salvar projeto no histórico
            const project = await this.workfrontService.saveProjectFromUrl(projectUrl, {
                title: 'Extração de documentos',
                description: 'Documentos extraídos via API',
            });

            // Implementação real com Playwright (baseada no legado)
            const start = Date.now();
            const browser = await chromium.launch({ headless: headless ?? false, args: (headless ?? false) ? [] : ['--start-maximized'] });
            try {
                const context = await browser.newContext({ storageState: 'wf_state.json', viewport: null });
                const page = await context.newPage();
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
                await page.waitForTimeout(2000);

                const targetFolders = ['Asset Release', 'Final Materials'];
                const folders: Array<{ name: string; files: Array<{ name: string; type: string; url?: string }> }> = [];

                for (const folderName of targetFolders) {
                    try {
                        const btn = frameLocator.getByRole('button', { name: new RegExp(folderName, 'i') })
                            .or(frameLocator.getByText(folderName))
                            .first();
                        await btn.waitFor({ timeout: 5000 });
                        await btn.click();
                        await page.waitForTimeout(3000);

                        const files = await this.extractFilesFromFolder(frameLocator);
                        folders.push({ name: folderName, files });
                    } catch (e: any) {
                        this.logger.warn(`Pasta "${folderName}" não encontrada: ${e?.message}`);
                    }
                }

                const totalFiles = folders.reduce((acc, f) => acc + (f.files?.length || 0), 0);
                const took = `${((Date.now() - start) / 1000).toFixed(2)} segundos`;

                const result: ExtractDocumentsResponseDto = {
                    success: true,
                    message: 'Documentos extraídos com sucesso',
                    totalFolders: folders.length,
                    totalFiles,
                    // Atenção: nosso DTO antigo usava objeto; o frontend espera array de WorkfrontFolder
                    folders: folders as any,
                    project,
                    processingTime: took,
                } as any;

                this.logger.log(`✅ Extração concluída: ${totalFiles} arquivos em ${folders.length} pastas`);
                return result;
            } catch (e) {
                throw e;
            } finally {
                await browser.close();
            }

        } catch (error) {
            this.logger.error(`❌ Erro na extração de documentos: ${error.message}`);
            throw new Error(`Falha na extração: ${error.message}`);
        }
    }

    private async extractFilesFromFolder(frameLocator: any): Promise<Array<{ name: string; type: string; url?: string }>> {
        const files: Array<{ name: string; type: string; url?: string }> = [];
        try {
            await frameLocator.locator('body').waitFor({ timeout: 3000 });
            // Estratégia 1: containers específicos
            const containers = frameLocator.locator('[data-testid="standard-item-container"]');
            const n = await containers.count();
            for (let i = 0; i < n; i++) {
                try {
                    const c = containers.nth(i);
                    const link = c.locator('a.doc-item-link').first();
                    if (await link.isVisible()) {
                        const fileName = (await link.textContent())?.trim();
                        const href = await link.getAttribute('href');
                        if (fileName) files.push({ name: fileName, type: this.getFileTypeFromName(fileName), url: href || undefined });
                    }
                } catch {}
            }
            // Estratégia 2: fallback
            if (files.length === 0) {
                const links = frameLocator.locator('a[href*="document"], a.doc-item-link');
                const m = await links.count();
                for (let i = 0; i < m; i++) {
                    try {
                        const l = links.nth(i);
                        const text = (await l.textContent())?.trim();
                        const href = await l.getAttribute('href');
                        if (text && text.includes('.') && text.length > 5) files.push({ name: text, type: this.getFileTypeFromName(text), url: href || undefined });
                    } catch {}
                }
            }
        } catch (e) {
            this.logger.warn(`Erro ao extrair arquivos: ${(e as Error).message}`);
        }
        return files;
    }

    private getFileTypeFromName(fileName: string) {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const map: Record<string, string> = {
            pdf: 'PDF', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
            doc: 'Document', docx: 'Document', xls: 'Spreadsheet', xlsx: 'Spreadsheet',
            ppt: 'Presentation', pptx: 'Presentation', zip: 'Archive', rar: 'Archive',
            mp4: 'Video', avi: 'Video', mov: 'Video',
        };
        return map[ext] || 'Document';
    }

    /**
     * Extrair documentos com progresso em tempo real (SSE)
     */
    async extractDocumentsStream(projectId: string, projectUrl: string): Promise<any> {
        try {
            this.logger.log(`🔄 Iniciando extração com stream para projeto: ${projectId}`);

            // TODO: Implementar Server-Sent Events (SSE) para progresso em tempo real
            // Por enquanto, retornar dados simulados
            
            return {
                message: 'Stream de extração iniciado',
                projectId,
                projectUrl,
                status: 'processing',
            };

        } catch (error) {
            this.logger.error(`❌ Erro na extração com stream: ${error.message}`);
            throw new Error(`Falha na extração com stream: ${error.message}`);
        }
    }

    /**
     * Extrair comentários de texto com IA enhancement
     */
    async extractCommentsWithAI(
        text: string, 
        documentContext?: string,
        useAI: boolean = true
    ): Promise<EnhanceExtractionResponseDto> {
        try {
            this.logger.log(`🔍 Extraindo comentários de texto (${text.length} chars)`);

            // 1. Extração tradicional usando regex/parsing
            const extractedComments = this.extractCommentsTraditional(text);
            
            // 2. Se IA está habilitada, tentar melhorar
            if (useAI) {
                const enhanceDto: EnhanceExtractionDto = {
                    originalText: text,
                    extractedComments,
                    useAIEnhancement: true,
                    confidenceThreshold: 0.7,
                    documentContext
                };

                return await this.commentEnhancement.enhanceExtraction(enhanceDto);
            } else {
                // Retornar apenas extração tradicional
                return {
                    success: true,
                    aiEnhanced: false,
                    extractedData: {
                        feedback: extractedComments,
                        actionItems: extractedComments.filter(c => 
                            /\b(alterar|mudar|corrigir|ajustar|revisar)\b/i.test(c)
                        ),
                        approvalStatus: 'pending',
                        priority: 'medium',
                        categories: ['general'],
                        mentions: []
                    } as any,
                    originalConfidence: 0.8,
                    finalConfidence: 0.8,
                    originalComments: extractedComments,
                    processingTime: 0,
                    processingDetails: {
                        originalMethod: 'parsing',
                        triggeredEnhancement: false,
                        reason: 'IA desabilitada pelo usuário'
                    }
                };
            }

        } catch (error) {
            this.logger.error(`❌ Erro na extração de comentários: ${error.message}`);
            throw new Error(`Falha na extração de comentários: ${error.message}`);
        }
    }

    /**
     * Extração tradicional de comentários usando regex
     */
    private extractCommentsTraditional(text: string): string[] {
        const comments: string[] = [];

        // Padrões comuns de comentários em PDFs
        const patterns = [
            // Comentários com prefixos
            /(?:comentário|comment|feedback|observação):\s*(.+?)(?:\n|$)/gi,
            // Linhas que começam com "-" ou "•"
            /^[\-•]\s*(.+?)$/gm,
            // Texto entre parênteses ou colchetes (possíveis comentários)
            /[\(\[]((?:(?![\)\]]).)+)[\)\]]/g,
            // Frases que parecem feedback
            /\b(?:alterar|mudar|corrigir|ajustar|revisar|remover|adicionar)\b.+?(?:\.|$)/gi,
            // Menções de aprovação/rejeição
            /\b(?:aprovado|rejeitado|ok|não ok|aprovação|rejeição)\b.+?(?:\.|$)/gi,
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const cleaned = match.replace(/^[\-•\(\[\s]+|[\)\]\s]+$/g, '').trim();
                    if (cleaned.length > 5 && !comments.includes(cleaned)) {
                        comments.push(cleaned);
                    }
                }
            }
        }

        // Filtrar comentários muito curtos ou genéricos
        return comments.filter(comment => 
            comment.length > 10 && 
            !/^(sim|não|ok|test|página|page|\d+)$/i.test(comment.trim())
        );
    }

    /**
     * Verificar se IA está disponível para processamento
     */
    async isAIAvailable(): Promise<boolean> {
        return this.commentEnhancement.isAvailable();
    }
}