import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsIn } from 'class-validator';

export class ExecuteUploadDto {
    @ApiProperty({ description: 'URL do projeto Workfront (documentos)' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ description: 'Equipe para mencionar nos comentários', enum: ['carol', 'giovana', 'test'] })
    @IsIn(['carol', 'giovana', 'test'])
    selectedUser: 'carol' | 'giovana' | 'test';

    @ApiProperty({ description: 'Caminho do arquivo ZIP (Asset Release)' })
    @IsString()
    assetZipPath: string;

    @ApiProperty({ description: 'Lista de caminhos dos Final Materials' })
    @IsArray()
    @IsString({ each: true })
    finalMaterialPaths: string[];

    @ApiProperty({ description: 'Executar em modo headless', required: false, default: false })
    @IsOptional()
    headless?: boolean;
}

export class UploadExecutionResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty({ required: false })
    results?: Array<{
        type: 'asset-release' | 'final-materials';
        fileName: string;
        uploadSuccess: boolean;
        commentSuccess: boolean;
        message?: string;
        error?: string;
    }>;

    @ApiProperty({ required: false })
    summary?: {
        totalFiles: number;
        uploadSuccesses: number;
        commentSuccesses: number;
        errors: number;
    };
}