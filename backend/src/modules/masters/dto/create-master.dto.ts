import { ApiProperty } from '@nestjs/swagger';
import { MasterFileType, MasterEditableType } from '@prisma/client';

export class CreateMasterDto {
    @ApiProperty({ description: 'Título amigável do master' })
    title: string;

    @ApiProperty({ description: 'Nome da marca', required: false })
    brand?: string;

    @ApiProperty({ description: 'Descrição opcional', required: false })
    description?: string;

    @ApiProperty({ description: 'Nome do arquivo original' })
    fileName: string;

    @ApiProperty({ enum: MasterFileType })
    fileType: MasterFileType;

    @ApiProperty({ enum: MasterEditableType })
    editableType: MasterEditableType;

    @ApiProperty({ description: 'Tamanho em bytes' })
    fileSize: number;

    @ApiProperty({ description: 'Quantidade de frames (quando aplicável)', required: false })
    frameCount?: number;

    @ApiProperty({ description: 'Largura em px', required: false })
    width?: number;

    @ApiProperty({ description: 'Altura em px', required: false })
    height?: number;

    @ApiProperty({ description: 'Aspect ratio ex 16:9', required: false })
    aspectRatio?: string;

    @ApiProperty({ description: 'Checksum MD5/SHA', required: false })
    checksum?: string;

    @ApiProperty({ description: 'Caminho relativo no Bunny Storage (ex: masters/brand/file.psd)' })
    bunnyPath: string;

    @ApiProperty({ description: 'URL CDN pública' })
    bunnyCdnUrl: string;

    @ApiProperty({ description: 'URL da imagem de preview', required: false })
    previewImageUrl?: string;

    @ApiProperty({ type: [String], required: false })
    tags?: string[];
}
