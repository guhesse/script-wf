import { ApiProperty } from '@nestjs/swagger';
import { MasterEditableType, MasterFileType } from '@prisma/client';

export class UpdateMasterDto {
  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  brand?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ enum: MasterFileType, required: false })
  fileType?: MasterFileType;

  @ApiProperty({ enum: MasterEditableType, required: false })
  editableType?: MasterEditableType;

  @ApiProperty({ required: false })
  frameCount?: number;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  aspectRatio?: string;

  @ApiProperty({ required: false })
  checksum?: string;

  @ApiProperty({ required: false })
  bunnyPath?: string;

  @ApiProperty({ required: false })
  bunnyCdnUrl?: string;

  @ApiProperty({ required: false })
  previewImageUrl?: string;

  @ApiProperty({ type: [String], required: false })
  tags?: string[];

  @ApiProperty({ required: false })
  isActive?: boolean;
}

export class ListMastersQueryDto {
  @ApiProperty({ required: false, description: 'Busca textual em título, filename e brand' })
  search?: string;

  @ApiProperty({ required: false })
  brand?: string;

  @ApiProperty({ enum: MasterFileType, required: false })
  fileType?: MasterFileType;

  @ApiProperty({ enum: MasterEditableType, required: false })
  editableType?: MasterEditableType;

  @ApiProperty({ required: false, description: 'Tag única para filtrar' })
  tag?: string;

  @ApiProperty({ required: false, description: 'Lista de tags separadas por vírgula (match qualquer)' })
  tagsAny?: string;

  @ApiProperty({ required: false, description: 'Lista de tags separadas por vírgula (precisa conter todas)' })
  tagsAll?: string;

  @ApiProperty({ required: false, description: 'Página (1-based)' })
  page?: number;

  @ApiProperty({ required: false, description: 'Itens por página (default 20)' })
  pageSize?: number;
}
