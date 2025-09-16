import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessProjectsOptionsDto {
    @ApiProperty({ required: false, description: 'Executar em modo headless' })
    @IsOptional()
    @IsBoolean()
    headless?: boolean;

    @ApiProperty({ required: false, description: 'Continuar processamento mesmo com erros' })
    @IsOptional()
    @IsBoolean()
    continueOnError?: boolean;
}

export class ProcessProjectsRequestDto {
    @ApiProperty({
        type: [String],
        description: 'URLs dos projetos para processar',
        example: ['https://workfront.url1', 'https://workfront.url2'],
    })
    @IsArray({ message: 'projectUrls deve ser um array' })
    @IsString({ each: true, message: 'Cada URL deve ser uma string' })
    projectUrls: string[];

    @ApiProperty({
        description: 'Opções de processamento',
        type: ProcessProjectsOptionsDto,
        required: false,
        example: { headless: true, continueOnError: true },
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProcessProjectsOptionsDto)
    options?: ProcessProjectsOptionsDto;
}

export class ProcessProjectsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({
        type: 'object',
        properties: {
            successful: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        projectNumber: { type: 'number' },
                        projectId: { type: 'string' },
                        url: { type: 'string' },
                    },
                },
            },
            failed: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        projectNumber: { type: 'number' },
                        url: { type: 'string' },
                        error: { type: 'string' },
                    },
                },
            },
            summary: {
                type: 'object',
                properties: {
                    totalFiles: { type: 'number' },
                    totalProjects: { type: 'number' },
                },
            },
        },
        required: false,
    })
    data?: {
        successful: Array<{
            projectNumber: number;
            projectId: string;
            url: string;
        }>;
        failed: Array<{
            projectNumber: number;
            url: string;
            error: string;
        }>;
        summary: {
            totalFiles: number;
            totalProjects: number;
        };
    };

    @ApiProperty({ required: false })
    error?: string;
}

export class DeleteDownloadsRequestDto {
    @ApiProperty({
        type: [String],
        description: 'IDs dos downloads para deletar',
    })
    @IsArray()
    @IsString({ each: true })
    downloadIds: string[];
}

export class DeleteDownloadsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({
        type: 'object',
        properties: {
            deletedItems: { type: 'number', description: 'Número de itens deletados' },
        },
        required: false,
    })
    data?: {
        deletedItems: number;
    };

    @ApiProperty({ required: false })
    error?: string;
}