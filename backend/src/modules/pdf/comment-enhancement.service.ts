import { Injectable, Logger } from '@nestjs/common';
import { AIProcessingService, CommentAnalysisResult } from './ai-processing.service';
import { 
    EnhanceExtractionDto, 
    EnhanceExtractionResponseDto, 
    ProcessCommentsWithAIDto,
    ProcessCommentsWithAIResponseDto,
    ExtractedDataDto,
    ApprovalStatus,
    Priority 
} from './dto/ai-processing.dto';

@Injectable()
export class CommentEnhancementService {
    private readonly logger = new Logger(CommentEnhancementService.name);

    constructor(private readonly aiProcessing: AIProcessingService) {}

    /**
     * Melhora a extração de comentários usando IA quando necessário
     */
    async enhanceExtraction(dto: EnhanceExtractionDto): Promise<EnhanceExtractionResponseDto> {
        const startTime = Date.now();
        
        try {
            this.logger.log(`🔍 Analisando extração de ${dto.extractedComments.length} comentários`);

            // 1. Avaliar qualidade da extração original
            const originalConfidence = this.assessExtractionQuality(dto.extractedComments, dto.originalText);
            
            // 2. Decidir se precisa de IA
            const needsAI = dto.useAIEnhancement && originalConfidence < dto.confidenceThreshold;
            const aiAvailable = await this.aiProcessing.isAvailable();
            
            this.logger.log(`🔍 [ENHANCEMENT] Confiança original: ${originalConfidence.toFixed(2)}`);
            this.logger.log(`🔍 [ENHANCEMENT] Threshold: ${dto.confidenceThreshold}`);
            this.logger.log(`🔍 [ENHANCEMENT] Precisa IA: ${needsAI}`);
            this.logger.log(`🔍 [ENHANCEMENT] IA disponível: ${aiAvailable}`);
            
            let finalData: ExtractedDataDto;
            let aiEnhanced = false;
            let finalConfidence = originalConfidence;
            let enhancedComments: string[] | undefined;

            if (needsAI && aiAvailable) {
                this.logger.log(`🤖 [ENHANCEMENT] USANDO IA - Confiança baixa (${originalConfidence.toFixed(2)})`);
                
                const aiResult = await this.aiProcessing.processComments(
                    dto.extractedComments,
                    { context: dto.documentContext }
                );

                if (aiResult.success) {
                    finalData = aiResult.extractedData;
                    finalConfidence = aiResult.confidence;
                    aiEnhanced = true;
                    enhancedComments = this.reconstructComments(aiResult.extractedData);
                    this.logger.log(`✅ [ENHANCEMENT] IA aplicada com sucesso - Confiança: ${finalConfidence.toFixed(2)}`);
                } else {
                    this.logger.warn(`⚠️ [ENHANCEMENT] IA falhou, usando extração tradicional`);
                    finalData = this.buildBasicExtractedData(dto.extractedComments);
                }
            } else {
                if (!needsAI) {
                    this.logger.log(`ℹ️ [ENHANCEMENT] IA não necessária - Confiança suficiente`);
                } else if (!aiAvailable) {
                    this.logger.warn(`⚠️ [ENHANCEMENT] IA não disponível - Usando extração tradicional`);
                }
                finalData = this.buildBasicExtractedData(dto.extractedComments);
            }

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                aiEnhanced,
                extractedData: finalData,
                originalConfidence,
                finalConfidence,
                originalComments: dto.extractedComments,
                enhancedComments,
                processingTime,
                processingDetails: {
                    originalMethod: 'parsing',
                    aiProvider: aiEnhanced ? 'openai' : undefined,
                    triggeredEnhancement: needsAI,
                    reason: needsAI ? `Confiança original baixa: ${originalConfidence.toFixed(2)}` : 'Confiança suficiente'
                }
            };

        } catch (error) {
            this.logger.error(`❌ Erro no enhancement: ${error.message}`);
            
            return {
                success: false,
                aiEnhanced: false,
                extractedData: this.buildBasicExtractedData(dto.extractedComments || []),
                originalConfidence: 0,
                finalConfidence: 0,
                originalComments: dto.extractedComments || [],
                processingTime: Date.now() - startTime,
                processingDetails: {
                    originalMethod: 'parsing',
                    triggeredEnhancement: false,
                    reason: `Erro: ${error.message}`
                }
            };
        }
    }

    /**
     * Processa comentários diretamente com IA
     */
    async processWithAI(dto: ProcessCommentsWithAIDto): Promise<ProcessCommentsWithAIResponseDto> {
        const startTime = Date.now();

        try {
            const result = await this.aiProcessing.processComments(dto.comments, {
                provider: dto.provider,
                model: dto.model,
                temperature: dto.temperature,
                maxTokens: dto.maxTokens,
                context: dto.context
            });

            return {
                ...result,
                processingTime: Date.now() - startTime
            };

        } catch (error) {
            this.logger.error(`❌ Erro no processamento IA: ${error.message}`);
            
            return {
                success: false,
                confidence: 0,
                extractedData: {
                    feedback: [],
                    actionItems: [],
                    approvalStatus: ApprovalStatus.PENDING,
                    priority: Priority.MEDIUM,
                    categories: [],
                    mentions: []
                },
                error: error.message,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Avalia a qualidade da extração original
     */
    private assessExtractionQuality(comments: string[], originalText: string): number {
        if (!comments || comments.length === 0) return 0;

        let score = 0.5; // Base score

        // Factores que aumentam confiança
        const hasStructuredComments = comments.some(c => 
            c.includes(':') || c.includes('-') || c.includes('•')
        );
        if (hasStructuredComments) score += 0.2;

        // Comentários com ações específicas
        const hasActionWords = comments.some(c => 
            /\b(alterar|mudar|corrigir|ajustar|revisar|remover|adicionar)\b/i.test(c)
        );
        if (hasActionWords) score += 0.15;

        // Menções de pessoas
        const hasMentions = comments.some(c => c.includes('@'));
        if (hasMentions) score += 0.1;

        // Factores que diminuem confiança
        const hasGarbledText = comments.some(c => 
            /[^\w\s\-.,!?@:;()]/g.test(c) || c.length < 3
        );
        if (hasGarbledText) score -= 0.3;

        // Muito poucos comentários em relação ao texto original
        const ratio = comments.join(' ').length / Math.max(originalText.length, 1);
        if (ratio < 0.01) score -= 0.2;

        // Comentários muito repetitivos
        const uniqueComments = new Set(comments.map(c => c.toLowerCase().trim()));
        const uniquenessRatio = uniqueComments.size / comments.length;
        if (uniquenessRatio < 0.7) score -= 0.15;

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Constrói dados básicos extraídos sem IA
     */
    private buildBasicExtractedData(comments: string[]): ExtractedDataDto {
        const feedback: string[] = [];
        const actionItems: string[] = [];
        const mentions: string[] = [];
        const categories: string[] = [];

        for (const comment of comments) {
            // Extrair feedback
            if (comment.length > 10) {
                feedback.push(comment);
            }

            // Extrair action items
            if (/\b(alterar|mudar|corrigir|ajustar|revisar|remover|adicionar|implementar)\b/i.test(comment)) {
                actionItems.push(comment);
            }

            // Extrair menções
            const commentMentions = comment.match(/@[\w\s]+/g) || [];
            mentions.push(...commentMentions.map(m => m.replace('@', '')));

            // Categorizar básico
            if (/\b(cor|color|rgb|hex)\b/i.test(comment)) categories.push('cores');
            if (/\b(texto|font|tipografia)\b/i.test(comment)) categories.push('texto');
            if (/\b(layout|posição|alinhamento)\b/i.test(comment)) categories.push('layout');
            if (/\b(imagem|foto|ícone)\b/i.test(comment)) categories.push('imagens');
        }

        // Determinar status de aprovação básico
        let approvalStatus: ApprovalStatus = ApprovalStatus.PENDING;
        const allText = comments.join(' ').toLowerCase();
        if (allText.includes('aprovado') || allText.includes('ok')) {
            approvalStatus = ApprovalStatus.APPROVED;
        } else if (allText.includes('rejeitado') || allText.includes('não aprovado')) {
            approvalStatus = ApprovalStatus.REJECTED;
        } else if (actionItems.length > 0) {
            approvalStatus = ApprovalStatus.NEEDS_CHANGES;
        }

        // Determinar prioridade básica
        let priority: Priority = Priority.MEDIUM;
        if (allText.includes('urgente') || allText.includes('crítico')) {
            priority = Priority.CRITICAL;
        } else if (allText.includes('importante') || allText.includes('alta')) {
            priority = Priority.HIGH;
        } else if (allText.includes('baixa') || allText.includes('opcional')) {
            priority = Priority.LOW;
        }

        const structuredFields: any = {};

        // Heurística leve para mapear labels simples presentes nos comentários
        // Ex: "Live Date: 11/22/2025 to 12/2/2025" => structuredFields.liveDate + normalização
        for (const comment of comments) {
            const c = comment.trim();
            let m: RegExpMatchArray | null;
            if ((m = c.match(/\blive\s*date\s*[:\-]\s*(.+)$/i))) {
                const raw = m[1].trim();
                (structuredFields as any).liveDate = raw;
            }
            if ((m = c.match(/\bcta\s*[:\-]\s*(.+)$/i))) structuredFields.cta = m[1].trim();
            if ((m = c.match(/\burn\s*[:\-]\s*(.+)$/i))) structuredFields.urn = m[1].trim();
            if ((m = c.match(/\bvf\s*[:\-]\s*(.+)$/i))) structuredFields.vf = m[1].trim();
            if ((m = c.match(/\bheadline\s*[:\-]\s*(.+)$/i))) structuredFields.headline = m[1].trim();
            if ((m = c.match(/\bcopy\s*[:\-]\s*(.+)$/i))) structuredFields.copy = m[1].trim();
            if ((m = c.match(/\bdescription\s*[:\-]\s*(.+)$/i))) structuredFields.description = m[1].trim();
            if ((m = c.match(/\bpost\s*copy\s*[:\-]\s*(.+)$/i))) structuredFields.postcopy = m[1].trim();
            if ((m = c.match(/\bbackground\s*color\s*[:\-]\s*(.+)$/i))) structuredFields.backgroundColor = m[1].trim();
            if ((m = c.match(/\bcopy\s*color\s*[:\-]\s*(.+)$/i))) structuredFields.copyColor = m[1].trim();
            if ((m = c.match(/\ballocadia\s*[:\-]\s*(.+)$/i))) structuredFields.allocadia = m[1].trim();
            if ((m = c.match(/\bpo[#:]?\s*(.+)$/i))) structuredFields.po = m[1].trim();
        }

        if (structuredFields.liveDate && typeof (this as any).aiProcessing?.normalizeLiveDate === 'function') {
            const norm = (this as any).aiProcessing.normalizeLiveDate(structuredFields.liveDate);
            if (norm) structuredFields.liveDateNormalized = norm;
        }

        return {
            feedback: [...new Set(feedback)],
            actionItems: [...new Set(actionItems)],
            approvalStatus,
            priority,
            categories: [...new Set(categories)],
            mentions: [...new Set(mentions)],
            structuredFields: Object.keys(structuredFields).length ? structuredFields : undefined
        };
    }

    /**
     * Reconstrói comentários a partir de dados estruturados
     */
    private reconstructComments(data: ExtractedDataDto): string[] {
        const reconstructed: string[] = [];

        // Adicionar feedback
        reconstructed.push(...data.feedback);

        // Adicionar action items formatados
        data.actionItems.forEach(item => {
            if (!data.feedback.includes(item)) {
                reconstructed.push(`Ação necessária: ${item}`);
            }
        });

        return reconstructed;
    }

    /**
     * Verifica se o serviço está disponível
     */
    async isAvailable(): Promise<boolean> {
        return this.aiProcessing.isAvailable();
    }
}