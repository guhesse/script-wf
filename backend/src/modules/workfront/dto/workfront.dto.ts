// DTOs para workfront
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, IsNumber } from 'class-validator';
import { LinkStatus } from '@prisma/client';

export { LinkStatus } from '@prisma/client';

export class CreateProjectDto {
    @ApiProperty({ description: 'URL do projeto no Workfront' })
    @IsString()
    url: string;

    @ApiProperty({ description: 'Título do projeto', required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ description: 'Descrição do projeto', required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'ID do projeto no Workfront', required: false })
    @IsOptional()
    @IsString()
    projectId?: string;

    @ApiProperty({ description: 'DSID extraído do nome', required: false })
    @IsOptional()
    @IsString()
    dsid?: string;

    @ApiProperty({ description: 'User Agent', required: false })
    @IsOptional()
    @IsString()
    userAgent?: string;

    @ApiProperty({ description: 'Endereço IP', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;
}

export class ProjectResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    url: string;

    @ApiProperty({ required: false })
    title?: string;

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty({ required: false })
    projectId?: string;

    @ApiProperty({ required: false })
    dsid?: string;

    @ApiProperty({ enum: LinkStatus })
    status: LinkStatus;

    @ApiProperty()
    accessedAt: string;

    @ApiProperty()
    createdAt: string;

    @ApiProperty()
    updatedAt: string;

    @ApiProperty({ required: false })
    accessCount?: number;
}

export class ProjectHistoryQueryDto {
    @ApiProperty({ required: false, default: 1 })
    @IsOptional()
    @IsNumber()
    page?: number = 1;

    @ApiProperty({ required: false, default: 20 })
    @IsOptional()
    @IsNumber()
    limit?: number = 20;

    @ApiProperty({ required: false, enum: LinkStatus })
    @IsOptional()
    @IsEnum(() => LinkStatus)
    status?: LinkStatus;
}

export class ProjectHistoryResponseDto {
    @ApiProperty({ type: [ProjectResponseDto] })
    projects: ProjectResponseDto[];

    @ApiProperty({
        type: 'object',
        properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
        },
    })
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export class ShareSelectionDto {
    @ApiProperty({ description: 'Nome da pasta' })
    @IsString()
    folder: string;

    @ApiProperty({ description: 'Nome do arquivo' })
    @IsString()
    fileName: string;
}

export class ShareDocumentsDto {
    @ApiProperty({ description: 'URL do projeto' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ type: [ShareSelectionDto], description: 'Seleções para compartilhar' })
    @IsArray()
    selections: ShareSelectionDto[];

    @ApiProperty({ description: 'Usuário selecionado', required: false, default: 'carol' })
    @IsOptional()
    @IsString()
    selectedUser?: string;

    @ApiProperty({ description: 'User Agent', required: false })
    @IsOptional()
    @IsString()
    userAgent?: string;

    @ApiProperty({ description: 'Endereço IP', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiProperty({ description: 'Executar em modo headless', required: false, default: false })
    @IsOptional()
    headless?: boolean;
}

export class ShareResultDto {
    @ApiProperty()
    folder: string;

    @ApiProperty()
    fileName: string;

    @ApiProperty()
    success: boolean;

    @ApiProperty({ required: false })
    message?: string;

    @ApiProperty({ required: false })
    error?: string;
}

export class ShareDocumentsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty({ type: ProjectResponseDto })
    project: ProjectResponseDto;

    @ApiProperty({ type: [ShareResultDto] })
    results: ShareResultDto[];

    @ApiProperty({
        type: 'object',
        properties: {
            total: { type: 'number' },
            success: { type: 'number' },
            errors: { type: 'number' },
        },
    })
    summary: {
        total: number;
        success: number;
        errors: number;
    };
}

export class DashboardStatsDto {
    @ApiProperty()
    totalProjects: number;

    @ApiProperty()
    activeProjects: number;

    @ApiProperty()
    totalAccesses: number;

    @ApiProperty()
    recentAccesses: number;

    @ApiProperty({ type: [ProjectResponseDto] })
    mostAccessed: ProjectResponseDto[];
}