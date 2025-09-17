import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ShareSelectionDto } from './workfront.dto';
import { CommentType, UserTeam } from '../../pdf/dto/pdf.dto';

export class ShareAndCommentBatchItemDto {
    @ApiProperty({ description: 'URL do projeto Workfront' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ type: [ShareSelectionDto], description: 'Arquivos a processar neste projeto' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ShareSelectionDto)
    selections: ShareSelectionDto[];
}

export class ShareAndCommentDto {
    @ApiProperty({ description: 'URL do projeto (modo simples)', required: false })
    @IsOptional()
    @IsString()
    projectUrl?: string;

    @ApiProperty({ type: [ShareSelectionDto], description: 'Seleções (modo simples)', required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ShareSelectionDto)
    selections?: ShareSelectionDto[];

    @ApiProperty({
        type: [ShareAndCommentBatchItemDto],
        description: 'Itens em lote (permite múltiplas URLs com seleções distintas)',
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ShareAndCommentBatchItemDto)
    items?: ShareAndCommentBatchItemDto[];

    @ApiProperty({ enum: UserTeam, description: 'Equipe para compartilhar e mencionar', required: false, default: UserTeam.CAROL })
    @IsOptional()
    @IsEnum(UserTeam)
    selectedUser?: UserTeam = UserTeam.CAROL;

    @ApiProperty({ enum: CommentType, description: 'Tipo do comentário', required: false, default: CommentType.ASSET_RELEASE })
    @IsOptional()
    @IsEnum(CommentType)
    commentType?: CommentType = CommentType.ASSET_RELEASE;

    @ApiProperty({ description: 'Executar navegador em modo headless', required: false, default: false })
    @IsOptional()
    @IsBoolean()
    headless?: boolean = false;
}

export class SharePhaseResultDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({ required: false })
    message?: string;

    @ApiProperty({ required: false })
    error?: string;
}

export class ShareAndCommentItemResultDto {
    @ApiProperty()
    folder: string;

    @ApiProperty()
    fileName: string;

    @ApiProperty({ type: SharePhaseResultDto })
    share: SharePhaseResultDto;

    @ApiProperty({ type: SharePhaseResultDto })
    comment: SharePhaseResultDto;
}

export class ShareAndCommentProjectResultDto {
    @ApiProperty()
    projectUrl: string;

    @ApiProperty({ type: [ShareAndCommentItemResultDto] })
    items: ShareAndCommentItemResultDto[];

    @ApiProperty({
        type: 'object',
        properties: { total: { type: 'number' }, success: { type: 'number' }, errors: { type: 'number' } },
    })
    summary: { total: number; success: number; errors: number };
}

export class ShareAndCommentResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty({ type: [ShareAndCommentProjectResultDto] })
    results: ShareAndCommentProjectResultDto[];

    @ApiProperty({
        type: 'object',
        properties: { totalProjects: { type: 'number' }, totalFiles: { type: 'number' }, success: { type: 'number' }, errors: { type: 'number' } },
    })
    summary: {
        totalProjects: number;
        totalFiles: number;
        success: number;
        errors: number;
    };
}
