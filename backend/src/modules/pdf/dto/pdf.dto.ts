// DTOs para serviços de documentos
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean, IsEnum, IsNumber } from 'class-validator';

// Enum para tipos de comentário
export enum CommentType {
    ASSET_RELEASE = 'assetRelease',
    FINAL_MATERIALS = 'finalMaterials',
    APPROVAL = 'approval',
}

// Enum para usuários/equipes
export enum UserTeam {
    CAROL = 'carol',
    GIOVANA = 'giovana',
    TEST = 'test',
}

// DTO para extração de documentos
export class ExtractDocumentsDto {
    @ApiProperty({ description: 'URL do projeto no Workfront' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ description: 'Executar em modo headless', required: false, default: true })
    @IsOptional()
    @IsBoolean()
    headless?: boolean = true;
}

// DTO para resposta de extração de documentos
export class ExtractDocumentsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty()
    totalFolders: number;

    @ApiProperty()
    totalFiles: number;

    @ApiProperty({ type: 'object', additionalProperties: true })
    folders: Record<string, any>;

    @ApiProperty({ type: 'object', required: false })
    project?: any;

    @ApiProperty({ required: false })
    processingTime?: string;
}

// DTO para adicionar comentário
export class AddCommentDto {
    @ApiProperty({ description: 'URL do projeto no Workfront' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ description: 'Nome da pasta', required: false })
    @IsOptional()
    @IsString()
    folderName?: string;

    @ApiProperty({ description: 'Nome do arquivo' })
    @IsString()
    fileName: string;

    @ApiProperty({ enum: CommentType, description: 'Tipo de comentário', required: false })
    @IsOptional()
    @IsEnum(CommentType)
    commentType?: CommentType = CommentType.ASSET_RELEASE;

    @ApiProperty({ enum: UserTeam, description: 'Equipe para mencionar', required: false })
    @IsOptional()
    @IsEnum(UserTeam)
    selectedUser?: UserTeam = UserTeam.TEST;

    @ApiProperty({ description: 'Executar em modo headless', required: false, default: true })
    @IsOptional()
    @IsBoolean()
    headless?: boolean = true;

    @ApiProperty({ description: 'Modo de comentário: plain (default) ou raw', required: false, enum: ['plain', 'raw'], default: 'plain' })
    @IsOptional()
    @IsEnum(['plain', 'raw'] as any)
    commentMode?: 'plain' | 'raw' = 'plain';

    @ApiProperty({ description: 'HTML bruto do comentário (usado quando commentMode=raw)', required: false })
    @IsOptional()
    @IsString()
    rawHtml?: string;
}

// DTO para resposta de comentário
export class AddCommentResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty()
    commentText: string;

    @ApiProperty()
    mentionedUsers: number;
}

// DTO para preview de comentário
export class CommentPreviewDto {
    @ApiProperty({ enum: CommentType, description: 'Tipo de comentário' })
    @IsEnum(CommentType)
    commentType: CommentType;

    @ApiProperty({ enum: UserTeam, description: 'Equipe selecionada' })
    @IsEnum(UserTeam)
    selectedUser: UserTeam;
}

// DTO para resposta de preview
export class CommentPreviewResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    commentText: string;

    @ApiProperty({ type: 'array', items: { type: 'object' } })
    users: any[];
}

// DTO para download em massa
export class BulkDownloadDto {
    @ApiProperty({ type: [String], description: 'Lista de URLs dos projetos Workfront' })
    @IsArray()
    @IsString({ each: true })
    projectUrls: string[];

    @ApiProperty({ description: 'Caminho personalizado para download', required: false })
    @IsOptional()
    @IsString()
    downloadPath?: string;

    @ApiProperty({ description: 'Executar em modo headless', required: false, default: true })
    @IsOptional()
    @IsBoolean()
    headless?: boolean = true;

    @ApiProperty({ description: 'Continuar processamento mesmo com erro', required: false, default: true })
    @IsOptional()
    @IsBoolean()
    continueOnError?: boolean = true;

    @ApiProperty({ description: 'Manter arquivos após processamento', required: false, default: false })
    @IsOptional()
    @IsBoolean()
    keepFiles?: boolean = false;

    @ApiProperty({ description: 'Organizar downloads por DSID', required: false, default: false })
    @IsOptional()
    @IsBoolean()
    organizeByDSID?: boolean = false;

    @ApiProperty({ description: 'Limite de concorrência para processamento em paralelo', required: false, default: 2 })
    @IsOptional()
    @IsNumber()
    concurrency?: number = 2;

    @ApiProperty({ description: 'Modo de organização de pastas', required: false, enum: ['pm', 'studio'], default: 'pm' })
    @IsOptional()
    @IsEnum(['pm', 'studio'] as any)
    mode?: 'pm' | 'studio' = 'pm';
}

// DTO para resposta de download em massa
export class BulkDownloadResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty()
    total: number;

    @ApiProperty({ type: 'array', items: { type: 'object' } })
    successful: any[];

    @ApiProperty({ type: 'array', items: { type: 'object' } })
    failed: any[];

    @ApiProperty({ type: 'object' })
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

// DTO para preview de download em massa
export class BulkDownloadPreviewResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({ type: 'object' })
    preview: {
        totalProjects: number;
        targetFolder: string;
        downloadPath: string;
        estimatedTime: string;
        projects: Array<{
            number: number;
            url: string;
            status: string;
        }>;
    };
}

// DTO para extração de PDF
export class ExtractPdfDto {
    @ApiProperty({ description: 'Caminho absoluto para o arquivo PDF' })
    @IsString()
    pdfFilePath: string;
}

// DTO para resposta de extração de PDF
export class ExtractPdfResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    fileName: string;

    @ApiProperty({ type: 'object' })
    metadata: {
        title: string;
        author: string;
        pages: number;
    };

    @ApiProperty()
    text: string;

    @ApiProperty()
    textLength: number;

    @ApiProperty()
    hasContent: boolean;
}

// DTO para processamento de PDFs em projeto
export class ProcessPdfsDto {
    @ApiProperty({ description: 'Caminho para a pasta do projeto' })
    @IsString()
    projectPath: string;

    @ApiProperty({ description: 'Nome do projeto', required: false })
    @IsOptional()
    @IsString()
    projectName?: string;
}

// DTO para resposta de processamento de PDFs
export class ProcessPdfsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({ type: 'object' })
    summary: {
        totalPdfs: number;
        successful: number;
        failed: number;
        totalCharacters: number;
    };

    @ApiProperty({ type: 'array', items: { type: 'object' } })
    results: Array<{
        fileName: string;
        hasContent: boolean;
        textLength: number;
    }>;
}

// DTO para busca de dados estruturados
export class StructuredDataQueryDto {
    @ApiProperty({ description: 'Caminho para a pasta do projeto' })
    @IsString()
    projectPath: string;
}

// DTO para resposta de dados estruturados
export class StructuredDataResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({ type: 'array', items: { type: 'object' } })
    data: Array<{
        fileName: string;
        fields: {
            liveDate?: string;
            vf?: string;
            headline?: string;
            copy?: string;
            description?: string;
            cta?: string;
        };
        links: string[];
    }>;
}