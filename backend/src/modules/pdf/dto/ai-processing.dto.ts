import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum AIProvider {
    OPENAI = 'openai',
    ANTHROPIC = 'anthropic',
    LOCAL = 'local'
}

export enum ApprovalStatus {
    APPROVED = 'approved',
    REJECTED = 'rejected',
    PENDING = 'pending',
    NEEDS_CHANGES = 'needs_changes'
}

export enum Priority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export class ProcessCommentsWithAIDto {
    @ApiProperty({ description: 'Array de comentários para processar', type: [String] })
    @IsArray()
    @IsString({ each: true })
    comments: string[];

    @ApiProperty({ 
        description: 'Provider de IA a usar', 
        enum: AIProvider, 
        required: false,
        default: AIProvider.OPENAI 
    })
    @IsOptional()
    @IsEnum(AIProvider)
    provider?: AIProvider = AIProvider.OPENAI;

    @ApiProperty({ 
        description: 'Modelo específico (ex: gpt-4o-mini, claude-3-haiku)', 
        required: false 
    })
    @IsOptional()
    @IsString()
    model?: string;

    @ApiProperty({ 
        description: 'Temperatura para criatividade (0-1)', 
        required: false,
        minimum: 0,
        maximum: 1 
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    temperature?: number = 0.3;

    @ApiProperty({ 
        description: 'Máximo de tokens na resposta', 
        required: false 
    })
    @IsOptional()
    @IsNumber()
    maxTokens?: number = 1000;

    @ApiProperty({ 
        description: 'Contexto adicional para ajudar a IA', 
        required: false 
    })
    @IsOptional()
    @IsString()
    context?: string;
}

export class ExtractedDataDto {
    @ApiProperty({ description: 'Feedback específico extraído', type: [String] })
    feedback: string[];

    @ApiProperty({ description: 'Itens de ação identificados', type: [String] })
    actionItems: string[];

    @ApiProperty({ 
        description: 'Status de aprovação identificado', 
        enum: ApprovalStatus 
    })
    approvalStatus: ApprovalStatus;

    @ApiProperty({ 
        description: 'Prioridade identificada', 
        enum: Priority 
    })
    priority: Priority;

    @ApiProperty({ description: 'Categorias identificadas', type: [String] })
    categories: string[];

    @ApiProperty({ description: 'Menções (@pessoa) encontradas', type: [String] })
    mentions: string[];

    // Campos estruturados opcionais mapeados para o modelo da aplicação
    @ApiProperty({ description: 'Campos estruturados detectados a partir das labels dos comentários', required: false, type: 'object' })
    @IsOptional()
    structuredFields?: {
        liveDate?: string; // valor bruto extraído
        liveDateNormalized?: string; // valor normalizado no padrão da aplicação
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
}

export class ProcessCommentsWithAIResponseDto {
    @ApiProperty({ description: 'Se o processamento foi bem-sucedido' })
    success: boolean;

    @ApiProperty({ 
        description: 'Nível de confiança na análise (0-1)', 
        minimum: 0, 
        maximum: 1 
    })
    confidence: number;

    @ApiProperty({ description: 'Dados estruturados extraídos', type: ExtractedDataDto })
    extractedData: ExtractedDataDto;

    @ApiProperty({ description: 'Resposta bruta da IA', required: false })
    rawResponse?: string;

    @ApiProperty({ description: 'Mensagem de erro, se houver', required: false })
    error?: string;

    @ApiProperty({ description: 'Tempo de processamento em ms', required: false })
    processingTime?: number;
}

export class EnhanceExtractionDto {
    @ApiProperty({ description: 'Texto extraído originalmente' })
    @IsString()
    originalText: string;

    @ApiProperty({ description: 'Comentários extraídos via parsing tradicional', type: [String] })
    @IsArray()
    @IsString({ each: true })
    extractedComments: string[];

    @ApiProperty({ 
        description: 'Se deve usar IA para melhorar a extração quando confiança < threshold',
        required: false,
        default: true
    })
    @IsOptional()
    useAIEnhancement?: boolean = true;

    @ApiProperty({ 
        description: 'Threshold de confiança para triggerar IA (0-1)', 
        required: false,
        minimum: 0,
        maximum: 1,
        default: 0.7
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    confidenceThreshold?: number = 0.7;

    @ApiProperty({ description: 'Contexto do documento (nome, tipo, etc.)', required: false })
    @IsOptional()
    @IsString()
    documentContext?: string;
}

export class EnhanceExtractionResponseDto {
    @ApiProperty({ description: 'Se o processamento foi bem-sucedido' })
    success: boolean;

    @ApiProperty({ description: 'Se IA foi usada para melhorar a extração' })
    aiEnhanced: boolean;

    @ApiProperty({ description: 'Dados extraídos (melhorados ou originais)', type: ExtractedDataDto })
    extractedData: ExtractedDataDto;

    @ApiProperty({ description: 'Confiança na extração original (0-1)' })
    originalConfidence: number;

    @ApiProperty({ description: 'Confiança final após processamento (0-1)' })
    finalConfidence: number;

    @ApiProperty({ description: 'Comentários originais' })
    originalComments: string[];

    @ApiProperty({ description: 'Comentários processados pela IA (se aplicável)', required: false })
    enhancedComments?: string[];

    @ApiProperty({ description: 'Tempo total de processamento em ms' })
    processingTime: number;

    @ApiProperty({ description: 'Detalhes do processamento' })
    processingDetails: {
        originalMethod: 'regex' | 'parsing' | 'manual';
        aiProvider?: string;
        aiModel?: string;
        triggeredEnhancement: boolean;
        reason?: string;
    };
}