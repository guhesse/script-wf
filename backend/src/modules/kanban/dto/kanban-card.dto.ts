import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsInt, IsEnum, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum KanbanStatus {
  BACKLOG = 'BACKLOG',
  FILES_TO_STUDIO = 'FILES_TO_STUDIO',
  REVISAO_TEXTO = 'REVISAO_TEXTO',
  REVIEW_DELL = 'REVIEW_DELL',
  FINAL_MATERIAL = 'FINAL_MATERIAL',
  ASSET_RELEASE = 'ASSET_RELEASE',
  COMPLETED = 'COMPLETED',
}

export enum VFType {
  NO_VF = 'NO_VF',
  MICROSOFT_JMA_CS = 'MICROSOFT_JMA_CS',
  OTHER = 'OTHER',
}

export enum AssetType {
  ESTATICO = 'ESTATICO',
  VIDEO = 'VIDEO',
  WIREFRAME = 'WIREFRAME',
  GIF = 'GIF',
  STORY = 'STORY',
  MOLDURA = 'MOLDURA',
  AW_STORY = 'AW_STORY',
  HTML = 'HTML',
  OTHER = 'OTHER',
}

export enum WorkfrontFrente {
  OOH = 'OOH',
  SOCIAL = 'SOCIAL',
  EMAIL = 'EMAIL',
  BANNER = 'BANNER',
}

export enum FiscalYear {
  FY25 = 'FY25',
  FY26 = 'FY26',
  FY27 = 'FY27',
  FY28 = 'FY28',
}

export class CreateKanbanCardDto {
  @ApiProperty({ description: 'Se está incluído no BI', default: true })
  @IsBoolean()
  @IsOptional()
  bi?: boolean = true;

  @ApiPropertyOptional({ description: 'Round atual (1-12)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  round?: number;

  @ApiPropertyOptional({ description: 'Anotações sobre o card' })
  @IsString()
  @IsOptional()
  anotacoes?: string;

  @ApiPropertyOptional({ description: 'Data de início' })
  @IsDateString()
  @IsOptional()
  start?: string;

  @ApiPropertyOptional({ description: 'Data de entrega real' })
  @IsDateString()
  @IsOptional()
  realDeliv?: string;

  @ApiPropertyOptional({ description: 'Data prevista de entrega' })
  @IsDateString()
  @IsOptional()
  prevDeliv?: string;

  @ApiPropertyOptional({ description: 'DSID - ID do projeto' })
  @IsString()
  @IsOptional()
  dsid?: string;

  @ApiProperty({ description: 'Nome/descrição da atividade' })
  @IsString()
  atividade: string;

  @ApiProperty({ enum: KanbanStatus, default: KanbanStatus.BACKLOG })
  @IsEnum(KanbanStatus)
  @IsOptional()
  status?: KanbanStatus = KanbanStatus.BACKLOG;

  @ApiPropertyOptional({ description: 'Nome do estúdio/designer' })
  @IsString()
  @IsOptional()
  studio?: string;

  @ApiPropertyOptional({ enum: VFType, default: VFType.NO_VF })
  @IsEnum(VFType)
  @IsOptional()
  vf?: VFType = VFType.NO_VF;

  @ApiProperty({ enum: AssetType, default: AssetType.OTHER })
  @IsEnum(AssetType)
  @IsOptional()
  tipoAsset?: AssetType = AssetType.OTHER;

  @ApiProperty({ description: 'Número de assets', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  numeroAssets?: number = 1;

  @ApiPropertyOptional({ description: 'Nome do cliente' })
  @IsString()
  @IsOptional()
  cliente?: string;

  @ApiPropertyOptional({ description: 'Nome da marca' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ description: 'Semana (ex: W1, W3, W7)' })
  @IsString()
  @IsOptional()
  week?: string;

  @ApiPropertyOptional({ description: 'Quarter (ex: Q3)' })
  @IsString()
  @IsOptional()
  quarter?: string;

  @ApiProperty({ enum: WorkfrontFrente, default: WorkfrontFrente.OOH })
  @IsEnum(WorkfrontFrente)
  @IsOptional()
  frente?: WorkfrontFrente = WorkfrontFrente.OOH;

  @ApiPropertyOptional({ enum: FiscalYear })
  @IsEnum(FiscalYear)
  @IsOptional()
  fy?: FiscalYear;

  // Datas de entregas e feedbacks
  @ApiPropertyOptional({ description: 'Data de entrega R1 VML' })
  @IsDateString()
  @IsOptional()
  entregaR1VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R1 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR1Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R2 VML' })
  @IsDateString()
  @IsOptional()
  entregaR2VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R2 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR2Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R3 VML' })
  @IsDateString()
  @IsOptional()
  entregaR3VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R3 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR3Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R4 VML' })
  @IsDateString()
  @IsOptional()
  entregaR4VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R4 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR4Dell?: string;

  // Posição no board
  @ApiPropertyOptional({ description: 'Posição do card na coluna', default: 0 })
  @IsInt()
  @IsOptional()
  position?: number = 0;

  @ApiPropertyOptional({ description: 'ID da coluna onde está o card' })
  @IsString()
  @IsOptional()
  columnId?: string;
}

export class UpdateKanbanCardDto {
  @ApiPropertyOptional({ description: 'Se está incluído no BI' })
  @IsBoolean()
  @IsOptional()
  bi?: boolean;

  @ApiPropertyOptional({ description: 'Round atual (1-12)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  round?: number;

  @ApiPropertyOptional({ description: 'Anotações sobre o card' })
  @IsString()
  @IsOptional()
  anotacoes?: string;

  @ApiPropertyOptional({ description: 'Data de início' })
  @IsDateString()
  @IsOptional()
  start?: string;

  @ApiPropertyOptional({ description: 'Data de entrega real' })
  @IsDateString()
  @IsOptional()
  realDeliv?: string;

  @ApiPropertyOptional({ description: 'Data prevista de entrega' })
  @IsDateString()
  @IsOptional()
  prevDeliv?: string;

  @ApiPropertyOptional({ description: 'DSID - ID do projeto' })
  @IsString()
  @IsOptional()
  dsid?: string;

  @ApiPropertyOptional({ description: 'Nome/descrição da atividade' })
  @IsString()
  @IsOptional()
  atividade?: string;

  @ApiPropertyOptional({ enum: KanbanStatus })
  @IsEnum(KanbanStatus)
  @IsOptional()
  status?: KanbanStatus;

  @ApiPropertyOptional({ description: 'Nome do estúdio/designer' })
  @IsString()
  @IsOptional()
  studio?: string;

  @ApiPropertyOptional({ enum: VFType })
  @IsEnum(VFType)
  @IsOptional()
  vf?: VFType;

  @ApiPropertyOptional({ enum: AssetType })
  @IsEnum(AssetType)
  @IsOptional()
  tipoAsset?: AssetType;

  @ApiPropertyOptional({ description: 'Número de assets' })
  @IsInt()
  @Min(1)
  @IsOptional()
  numeroAssets?: number;

  @ApiPropertyOptional({ description: 'Nome do cliente' })
  @IsString()
  @IsOptional()
  cliente?: string;

  @ApiPropertyOptional({ description: 'Nome da marca' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ description: 'Semana (ex: W1, W3, W7)' })
  @IsString()
  @IsOptional()
  week?: string;

  @ApiPropertyOptional({ description: 'Quarter (ex: Q3)' })
  @IsString()
  @IsOptional()
  quarter?: string;

  @ApiPropertyOptional({ enum: WorkfrontFrente })
  @IsEnum(WorkfrontFrente)
  @IsOptional()
  frente?: WorkfrontFrente;

  @ApiPropertyOptional({ enum: FiscalYear })
  @IsEnum(FiscalYear)
  @IsOptional()
  fy?: FiscalYear;

  @ApiPropertyOptional({ description: 'Data de entrega R1 VML' })
  @IsDateString()
  @IsOptional()
  entregaR1VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R1 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR1Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R2 VML' })
  @IsDateString()
  @IsOptional()
  entregaR2VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R2 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR2Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R3 VML' })
  @IsDateString()
  @IsOptional()
  entregaR3VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R3 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR3Dell?: string;

  @ApiPropertyOptional({ description: 'Data de entrega R4 VML' })
  @IsDateString()
  @IsOptional()
  entregaR4VML?: string;

  @ApiPropertyOptional({ description: 'Data de feedback R4 Dell' })
  @IsDateString()
  @IsOptional()
  feedbackR4Dell?: string;

  @ApiPropertyOptional({ description: 'Posição do card na coluna' })
  @IsInt()
  @IsOptional()
  position?: number;

  @ApiPropertyOptional({ description: 'ID da coluna onde está o card' })
  @IsString()
  @IsOptional()
  columnId?: string;
}

export class MoveKanbanCardDto {
  @ApiProperty({ description: 'ID da nova coluna' })
  @IsString()
  columnId: string;

  @ApiProperty({ description: 'Nova posição na coluna' })
  @IsInt()
  @Min(0)
  position: number;

  @ApiPropertyOptional({ enum: KanbanStatus, description: 'Novo status (opcional)' })
  @IsEnum(KanbanStatus)
  @IsOptional()
  status?: KanbanStatus;
}

export class KanbanCardResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bi: boolean;

  @ApiPropertyOptional()
  round?: number;

  @ApiPropertyOptional()
  anotacoes?: string;

  @ApiPropertyOptional()
  start?: Date;

  @ApiPropertyOptional()
  realDeliv?: Date;

  @ApiPropertyOptional()
  prevDeliv?: Date;

  @ApiPropertyOptional()
  dsid?: string;

  @ApiProperty()
  atividade: string;

  @ApiProperty({ enum: KanbanStatus })
  status: KanbanStatus;

  @ApiPropertyOptional()
  studio?: string;

  @ApiPropertyOptional({ enum: VFType })
  vf?: VFType;

  @ApiProperty({ enum: AssetType })
  tipoAsset: AssetType;

  @ApiProperty()
  numeroAssets: number;

  @ApiPropertyOptional()
  cliente?: string;

  @ApiPropertyOptional()
  brand?: string;

  @ApiPropertyOptional()
  week?: string;

  @ApiPropertyOptional()
  quarter?: string;

  @ApiProperty({ enum: WorkfrontFrente })
  frente: WorkfrontFrente;

  @ApiPropertyOptional({ enum: FiscalYear })
  fy?: FiscalYear;

  @ApiPropertyOptional()
  entregaR1VML?: Date;

  @ApiPropertyOptional()
  feedbackR1Dell?: Date;

  @ApiPropertyOptional()
  entregaR2VML?: Date;

  @ApiPropertyOptional()
  feedbackR2Dell?: Date;

  @ApiPropertyOptional()
  entregaR3VML?: Date;

  @ApiPropertyOptional()
  feedbackR3Dell?: Date;

  @ApiPropertyOptional()
  entregaR4VML?: Date;

  @ApiPropertyOptional()
  feedbackR4Dell?: Date;

  @ApiPropertyOptional()
  diasStartR1VML?: number;

  @ApiPropertyOptional()
  diasR1VMLR1Dell?: number;

  @ApiPropertyOptional()
  diasR1DellR2VML?: number;

  @ApiPropertyOptional()
  diasR2VMLR2Dell?: number;

  @ApiPropertyOptional()
  diasR2DellR3VML?: number;

  @ApiPropertyOptional()
  diasR3VMLR3Dell?: number;

  @ApiPropertyOptional()
  diasR3DellR4VML?: number;

  @ApiPropertyOptional()
  diasR4VMLR4Dell?: number;

  @ApiPropertyOptional()
  diasNaVMLPercent?: number;

  @ApiPropertyOptional()
  diasNaDellPercent?: number;

  @ApiProperty()
  position: number;

  @ApiPropertyOptional()
  columnId?: string;

  @ApiPropertyOptional()
  createdBy?: string;

  @ApiPropertyOptional()
  updatedBy?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
