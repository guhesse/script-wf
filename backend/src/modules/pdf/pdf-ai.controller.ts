import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CommentEnhancementService } from './comment-enhancement.service';
import { AIProcessingService } from './ai-processing.service';
import {
    ProcessCommentsWithAIDto,
    ProcessCommentsWithAIResponseDto,
    EnhanceExtractionDto,
    EnhanceExtractionResponseDto,
    AIProvider
} from './dto/ai-processing.dto';

@ApiTags('PDF AI Processing')
@Controller('pdf/ai')
export class PdfAIController {
    private readonly logger = new Logger(PdfAIController.name);

    constructor(
        private readonly commentEnhancement: CommentEnhancementService,
        private readonly aiProcessing: AIProcessingService
    ) {}

    @Get('health')
    @ApiOperation({ summary: 'Verificar se os serviços de IA estão disponíveis' })
    @ApiResponse({ status: 200, description: 'Status dos serviços de IA' })
    async healthCheck() {
        const isAvailable = await this.aiProcessing.isAvailable();
        
        // Log detalhado para debug
        this.logger.log(`🏥 [HEALTH-CHECK] IA disponível: ${isAvailable}`);
        this.logger.log(`🏥 [HEALTH-CHECK] OPENAI_API_KEY: ${!!process.env.OPENAI_API_KEY ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}`);
        this.logger.log(`🏥 [HEALTH-CHECK] ANTHROPIC_API_KEY: ${!!process.env.ANTHROPIC_API_KEY ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}`);
        this.logger.log(`🏥 [HEALTH-CHECK] LOCAL_AI_ENDPOINT: ${process.env.LOCAL_AI_ENDPOINT || 'NÃO CONFIGURADO'}`);
        
        return {
            service: 'pdf-ai',
            available: isAvailable,
            timestamp: new Date().toISOString(),
            providers: {
                openai: !!process.env.OPENAI_API_KEY,
                anthropic: !!process.env.ANTHROPIC_API_KEY,
                local: !!process.env.LOCAL_AI_ENDPOINT
            },
            debug: {
                nodeEnv: process.env.NODE_ENV,
                aiProvider: process.env.AI_PROVIDER,
                hasOpenAIKey: !!process.env.OPENAI_API_KEY,
                hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
                localEndpoint: process.env.LOCAL_AI_ENDPOINT
            }
        };
    }

    @Post('test-simple')
    @ApiOperation({ summary: 'Teste simples da IA com comentários fake' })
    async testSimple() {
        this.logger.log(`🧪 [TEST] Iniciando teste simples da IA`);
        
        const testComments = [
            "Alterar a cor do título para azul",
            "O logo está muito pequeno, aumentar",
            "Texto está ok, pode aprovar"
        ];

        try {
            const result = await this.commentEnhancement.processWithAI({
                comments: testComments,
                provider: AIProvider.OPENAI,
                context: 'Teste de funcionalidade IA'
            });

            this.logger.log(`🧪 [TEST] Resultado: ${JSON.stringify(result, null, 2)}`);

            return {
                success: true,
                message: 'Teste executado com sucesso',
                input: testComments,
                output: result,
                aiUsed: result.success,
                confidence: result.confidence
            };
        } catch (error) {
            this.logger.error(`🧪 [TEST] Erro no teste: ${error.message}`);
            return {
                success: false,
                message: 'Erro no teste',
                error: error.message,
                input: testComments
            };
        }
    }

    @Post('process-comments')
    @ApiOperation({ 
        summary: 'Processar comentários diretamente com IA',
        description: 'Envia comentários para IA analisar e extrair informações estruturadas'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Comentários processados com sucesso',
        type: ProcessCommentsWithAIResponseDto
    })
    async processComments(
        @Body() dto: ProcessCommentsWithAIDto
    ): Promise<ProcessCommentsWithAIResponseDto> {
        this.logger.log(`🤖 Processando ${dto.comments.length} comentários com IA`);
        
        const result = await this.commentEnhancement.processWithAI(dto);
        
        this.logger.log(`✅ Processamento concluído - Confiança: ${result.confidence.toFixed(2)}`);
        
        return result;
    }

    @Post('enhance-extraction')
    @ApiOperation({ 
        summary: 'Melhorar extração de comentários usando IA',
        description: 'Analisa extração tradicional e usa IA para melhorar quando necessário'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Extração melhorada com sucesso',
        type: EnhanceExtractionResponseDto
    })
    async enhanceExtraction(
        @Body() dto: EnhanceExtractionDto
    ): Promise<EnhanceExtractionResponseDto> {
        this.logger.log(`🔍 Analisando extração de ${dto.extractedComments.length} comentários`);
        
        const result = await this.commentEnhancement.enhanceExtraction(dto);
        
        if (result.aiEnhanced) {
            this.logger.log(`✅ Extração melhorada com IA - Confiança: ${result.originalConfidence.toFixed(2)} → ${result.finalConfidence.toFixed(2)}`);
        } else {
            this.logger.log(`ℹ️ Extração mantida - Confiança: ${result.originalConfidence.toFixed(2)}`);
        }
        
        return result;
    }

    @Post('analyze-single')
    @ApiOperation({ 
        summary: 'Analisar um único comentário',
        description: 'Processa um comentário individual com IA'
    })
    async analyzeSingleComment(@Body() body: { comment: string; context?: string }) {
        this.logger.log(`🔍 Analisando comentário individual`);
        
        const result = await this.aiProcessing.processSingleComment(body.comment, {
            context: body.context
        });
        
        return {
            success: result.success,
            confidence: result.confidence,
            analysis: result.extractedData,
            processingTime: Date.now(),
            rawResponse: result.rawResponse
        };
    }

    @Post('extract-from-text')
    @ApiOperation({ 
        summary: 'Extrair comentários de texto com IA',
        description: 'Extrai comentários de um texto usando métodos tradicionais + IA para melhoramento'
    })
    async extractFromText(@Body() body: { 
        text: string; 
        documentContext?: string; 
        useAI?: boolean;
        confidenceThreshold?: number;
    }) {
        this.logger.log(`📄 Extraindo comentários de texto (${body.text.length} chars)`);
        
        // Simular extração usando o ExtractionService (precisa ser injetado)
        // Por agora, vamos usar diretamente o CommentEnhancementService
        
        // Extração básica usando regex simples
        const basicComments = body.text
            .split(/[.!?]\s+/)
            .filter(sentence => 
                sentence.length > 10 && 
                /\b(alterar|mudar|corrigir|ajustar|revisar|comentário|feedback)\b/i.test(sentence)
            )
            .map(s => s.trim())
            .slice(0, 10); // Limitar a 10 comentários

        if (basicComments.length === 0) {
            return {
                success: false,
                message: 'Nenhum comentário encontrado no texto',
                extractedComments: [],
                originalText: body.text.substring(0, 200) + '...'
            };
        }

        // Usar IA se solicitado
        if (body.useAI !== false) {
            const enhanceDto: EnhanceExtractionDto = {
                originalText: body.text,
                extractedComments: basicComments,
                useAIEnhancement: true,
                confidenceThreshold: body.confidenceThreshold || 0.7,
                documentContext: body.documentContext
            };

            const result = await this.commentEnhancement.enhanceExtraction(enhanceDto);
            return result;
        } else {
            // Retornar apenas extração básica
            return {
                success: true,
                aiEnhanced: false,
                originalComments: basicComments,
                extractedData: {
                    feedback: basicComments,
                    actionItems: basicComments.filter(c => 
                        /\b(alterar|mudar|corrigir|ajustar|revisar)\b/i.test(c)
                    ),
                    approvalStatus: 'pending',
                    priority: 'medium',
                    categories: ['general'],
                    mentions: []
                },
                processingTime: 0,
                originalConfidence: 0.6,
                finalConfidence: 0.6,
                processingDetails: {
                    originalMethod: 'regex',
                    triggeredEnhancement: false,
                    reason: 'IA desabilitada'
                }
            };
        }
    }
}