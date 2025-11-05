import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApprovalStatus, Priority } from './dto/ai-processing.dto';

export interface CommentAnalysisResult {
    success: boolean;
    confidence: number; // 0-1
    extractedData: {
        feedback: string[];
        actionItems: string[];
        approvalStatus: ApprovalStatus;
        priority: Priority;
        categories: string[];
        mentions: string[];
        structuredFields?: {
            liveDate?: string;
            liveDateNormalized?: string;
            vf?: string;
            headline?: string;
            copy?: string;
            description?: string;
            cta?: string;
            backgroundColor?: string;
            copyColor?: string;
            postcopy?: string;
            urn?: string;
            allocadia?: string;
            po?: string;
            formats?: any;
        };
    };
    rawResponse?: string;
    error?: string;
}

export interface AIProcessingOptions {
    provider?: 'openai' | 'anthropic' | 'local';
    model?: string;
    temperature?: number;
    maxTokens?: number;
    context?: string;
}

@Injectable()
export class AIProcessingService {
    private readonly logger = new Logger(AIProcessingService.name);

    constructor(private readonly configService: ConfigService) {}

    /**
     * Processa comentários de PDF usando IA para extrair informações estruturadas
     */
    async processComments(
        comments: string[],
        options: AIProcessingOptions = {}
    ): Promise<CommentAnalysisResult> {
        const startTime = Date.now();
        try {
            const provider = options.provider || this.configService.get('AI_PROVIDER', 'openai');
            
            this.logger.log(`🤖 [AI-PROCESSING] Iniciando processamento de ${comments.length} comentários`);
            this.logger.log(`🤖 [AI-PROCESSING] Provider: ${provider}`);
            this.logger.log(`🤖 [AI-PROCESSING] Modelo: ${options.model || 'padrão'}`);
            this.logger.log(`🤖 [AI-PROCESSING] Comentários: ${JSON.stringify(comments.slice(0, 2))}...`);

            let result: CommentAnalysisResult;

            switch (provider) {
                case 'openai':
                    result = await this.processWithOpenAI(comments, options);
                    break;
                case 'anthropic':
                    result = await this.processWithAnthropic(comments, options);
                    break;
                case 'local':
                    result = await this.processWithLocalModel(comments, options);
                    break;
                default:
                    throw new Error(`Provider não suportado: ${provider}`);
            }

            const duration = Date.now() - startTime;
            this.logger.log(`✅ [AI-PROCESSING] Processamento concluído em ${duration}ms`);
            this.logger.log(`✅ [AI-PROCESSING] Confiança: ${result.confidence.toFixed(2)}`);
            this.logger.log(`✅ [AI-PROCESSING] Feedback extraído: ${result.extractedData.feedback.length} itens`);
            this.logger.log(`✅ [AI-PROCESSING] Ações identificadas: ${result.extractedData.actionItems.length} itens`);
            this.logger.log(`✅ [AI-PROCESSING] Status: ${result.extractedData.approvalStatus}`);

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`❌ [AI-PROCESSING] Erro após ${duration}ms: ${error.message}`);
            this.logger.error(`❌ [AI-PROCESSING] Stack: ${error.stack}`);
            
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
                error: error.message
            };
        }
    }

    private async processWithOpenAI(
        comments: string[],
        options: AIProcessingOptions
    ): Promise<CommentAnalysisResult> {
        const apiKey = this.configService.get('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY não configurada');
        }

        const prompt = this.buildPrompt(comments, options.context);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: options.model || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um especialista em análise de feedback de design e revisão de materiais de marketing. 
                        Analise os comentários fornecidos e extraia informações estruturadas em formato JSON.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: options.temperature || 0.3,
                max_tokens: options.maxTokens || 1000,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API erro: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return this.parseAIResponse(result.choices[0].message.content);
    }

    private async processWithAnthropic(
        comments: string[],
        options: AIProcessingOptions
    ): Promise<CommentAnalysisResult> {
        const apiKey = this.configService.get('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY não configurada');
        }

        const prompt = this.buildPrompt(comments, options.context);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: options.model || 'claude-3-haiku-20240307',
                max_tokens: options.maxTokens || 1000,
                messages: [
                    {
                        role: 'user',
                        content: `Você é um especialista em análise de feedback de design. Analise os comentários e retorne JSON estruturado.\n\n${prompt}`
                    }
                ],
                temperature: options.temperature || 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API erro: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return this.parseAIResponse(result.content[0].text);
    }

    private async processWithLocalModel(
        comments: string[],
        options: AIProcessingOptions
    ): Promise<CommentAnalysisResult> {
        // Implementação para modelo local (Ollama, etc.)
        const localEndpoint = this.configService.get('LOCAL_AI_ENDPOINT', 'http://localhost:11434');
        const model = options.model || 'llama3.1';

        const prompt = this.buildPrompt(comments, options.context);

        const response = await fetch(`${localEndpoint}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                prompt: `Analyze these PDF comments and extract structured data as JSON:\n\n${prompt}`,
                stream: false,
                options: {
                    temperature: options.temperature || 0.3
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Local AI erro: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return this.parseAIResponse(result.response);
    }

    private buildPrompt(comments: string[], context?: string): string {
        const contextText = context ? `\nContexto adicional: ${context}` : '';
        
        return `
Analise os seguintes comentários de revisão de PDF e extraia informações estruturadas:

${comments.map((comment, i) => `${i + 1}. ${comment}`).join('\n')}

${contextText}

Retorne um JSON com a seguinte estrutura:
{
    "confidence": <número entre 0 e 1 indicando confiança na análise>,
    "extractedData": {
        "feedback": [<array de strings com feedback específico>],
        "actionItems": [<array de strings com ações necessárias>],
        "approvalStatus": "<approved|rejected|pending|needs_changes>",
        "priority": "<low|medium|high|critical>",
        "categories": [<array de categorias como "design", "texto", "cores", "layout", etc>],
        "mentions": [<array de nomes/pessoas mencionadas>],
        "structuredFields": {
            // Mapeie labels comuns para os campos do nosso modelo quando possível
            // Somente inclua quando houver evidência explícita nos comentários
            "liveDate": "<valor bruto como no comentário, ex: 11/22/2025 to 12/2/2025>",
            "vf": "<Visual Framework>",
            "headline": "<Headline>",
            "copy": "<Copy>",
            "description": "<Descrição>",
            "cta": "<CTA>",
            "backgroundColor": "<cor>",
            "copyColor": "<cor>",
            "postcopy": "<Postcopy>",
            "urn": "<URN/URL>",
            "allocadia": "<Allocadia>",
            "po": "<PO>"
        }
    }
}

Regras adicionais importantes:
- Não invente valores.
- Para o campo liveDate, normalize mentalmente para o formato "DD, Mon – DD, Mon" (ex: "11/22/2025 to 12/2/2025" => "22, Nov – 02, Dec"),
  mas retorne o valor bruto em structuredFields.liveDate; a normalização final será feita pelo servidor.
Seja preciso e extraia apenas informações explícitas nos comentários.
        `.trim();
    }

    private parseAIResponse(responseText: string): CommentAnalysisResult {
        try {
            // Tentar extrair JSON da resposta
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? jsonMatch[0] : responseText;
            
            const parsed = JSON.parse(jsonText);
            const structured = parsed.extractedData?.structuredFields || undefined;

            // Normalizar liveDate se vier presente
            if (structured?.liveDate) {
                const norm = this.normalizeLiveDate(structured.liveDate);
                if (norm) {
                    structured.liveDateNormalized = norm;
                }
            }
            
            return {
                success: true,
                confidence: parsed.confidence || 0.8,
                extractedData: {
                    feedback: parsed.extractedData?.feedback || [],
                    actionItems: parsed.extractedData?.actionItems || [],
                    approvalStatus: parsed.extractedData?.approvalStatus || 'pending',
                    priority: parsed.extractedData?.priority || 'medium',
                    categories: parsed.extractedData?.categories || [],
                    mentions: parsed.extractedData?.mentions || [],
                    structuredFields: structured
                },
                rawResponse: responseText
            };
        } catch (error) {
            this.logger.warn(`⚠️ Erro ao parsear resposta da IA: ${error.message}`);
            
            // Fallback: extrair informações simples usando regex
            return this.fallbackExtraction(responseText);
        }
    }

    /**
     * Normaliza liveDate para o padrão "DD, Mon – DD, Mon"
     * Aceita entradas como:
     *  - MM/DD/YYYY to MM/DD/YYYY
     *  - MM/DD to MM/DD
     *  - MM/DD - MM/DD
     *  - Mon DD – Mon DD
     */
    private normalizeLiveDate(input: string | undefined): string | undefined {
        if (!input) return undefined;
        const original = input.trim();
        if (!original) return undefined;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        const toDash = original
            .replace(/[–—]/g, '-')
            .replace(/\s+(?:to|a|à|ate|até)\s+/gi, '-')
            .replace(/\s{2,}/g, ' ')
            .trim();

        // MM/DD/YYYY - MM/DD/YYYY
        let m = toDash.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
        if (m) {
            const [, m1, d1, m2, d2] = m;
            const mi1 = Math.min(Math.max(parseInt(m1,10)-1,0),11);
            const mi2 = Math.min(Math.max(parseInt(m2,10)-1,0),11);
            return `${d1.padStart(2,'0')}, ${months[mi1]} – ${d2.padStart(2,'0')}, ${months[mi2]}`;
        }

        // Mon DD - Mon DD
        m = toDash.match(/^([A-Za-z]{3,9})\s*(\d{1,2})\s*-\s*([A-Za-z]{3,9})\s*(\d{1,2})$/);
        if (m) {
            const [, mon1, d1, mon2, d2] = m;
            const std1 = mon1.slice(0,3); const std2 = mon2.slice(0,3);
            return `${d1.padStart(2,'0')}, ${std1.charAt(0).toUpperCase()+std1.slice(1).toLowerCase()} – ${d2.padStart(2,'0')}, ${std2.charAt(0).toUpperCase()+std2.slice(1).toLowerCase()}`;
        }

        // MM/DD single
        m = toDash.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
        if (m) {
            const [, mm, dd] = m; const mi = Math.min(Math.max(parseInt(mm,10)-1,0),11);
            return `${dd.padStart(2,'0')}, ${months[mi]}`;
        }

        // Já no padrão DD, Mon – DD, Mon? então normaliza capitalização e zeros
        m = original.match(/^(\d{1,2}),\s*([A-Za-z]{3})\s*[–-]\s*(\d{1,2}),\s*([A-Za-z]{3})$/);
        if (m) {
            const [, d1, mon1, d2, mon2] = m;
            const fmt = (mon: string) => mon.charAt(0).toUpperCase()+mon.slice(1).toLowerCase();
            return `${d1.padStart(2,'0')}, ${fmt(mon1)} – ${d2.padStart(2,'0')}, ${fmt(mon2)}`;
        }
        return undefined;
    }

    private fallbackExtraction(text: string): CommentAnalysisResult {
        const feedback = text.match(/feedback[:\s]*([^\n]+)/gi) || [];
        const actionItems = text.match(/action[:\s]*([^\n]+)/gi) || [];
        const mentions = text.match(/@[\w\s]+/g) || [];
        
        let approvalStatus: ApprovalStatus = ApprovalStatus.PENDING;
        if (text.toLowerCase().includes('approved')) approvalStatus = ApprovalStatus.APPROVED;
        else if (text.toLowerCase().includes('rejected')) approvalStatus = ApprovalStatus.REJECTED;
        else if (text.toLowerCase().includes('changes')) approvalStatus = ApprovalStatus.NEEDS_CHANGES;

        return {
            success: true,
            confidence: 0.5,
            extractedData: {
                feedback: feedback.map(f => f.replace(/feedback[:\s]*/i, '')),
                actionItems: actionItems.map(a => a.replace(/action[:\s]*/i, '')),
                approvalStatus,
                priority: Priority.MEDIUM,
                categories: ['general'],
                mentions: mentions.map(m => m.replace('@', ''))
            },
            rawResponse: text
        };
    }

    /**
     * Processa um único comentário
     */
    async processSingleComment(
        comment: string,
        options: AIProcessingOptions = {}
    ): Promise<CommentAnalysisResult> {
        return this.processComments([comment], options);
    }

    /**
     * Verifica se o processamento IA está disponível
     */
    async isAvailable(): Promise<boolean> {
        const openaiKey = this.configService.get('OPENAI_API_KEY');
        const anthropicKey = this.configService.get('ANTHROPIC_API_KEY');
        const localEndpoint = this.configService.get('LOCAL_AI_ENDPOINT');

        // Debug detalhado
        this.logger.log(`🔍 [DEBUG] OPENAI_API_KEY: ${openaiKey ? `${openaiKey.substring(0, 10)}...` : 'NÃO ENCONTRADA'}`);
        this.logger.log(`🔍 [DEBUG] ANTHROPIC_API_KEY: ${anthropicKey ? `${anthropicKey.substring(0, 10)}...` : 'NÃO ENCONTRADA'}`);
        this.logger.log(`🔍 [DEBUG] LOCAL_AI_ENDPOINT: ${localEndpoint || 'NÃO ENCONTRADO'}`);
        this.logger.log(`🔍 [DEBUG] process.env.OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NÃO ENCONTRADA NO PROCESS.ENV'}`);

        const available = !!(openaiKey || anthropicKey || localEndpoint);
        this.logger.log(`🔍 [DEBUG] IA disponível: ${available}`);

        return available;
    }
}