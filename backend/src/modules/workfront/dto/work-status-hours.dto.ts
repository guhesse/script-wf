import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';

import { IsIn } from 'class-validator';
export enum WorkStatus {
    IN_PROGRESS = 'IN_PROGRESS',
    IN_REVIEW = 'IN_REVIEW',
    COMPLETED = 'COMPLETED',
    APPROVED = 'APPROVED',
    CLOSED = 'CLOSED',
}

export class UpdateWorkStatusDto {
    @ApiProperty({ description: 'URL do projeto Workfront (qualquer aba do project)' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ description: 'Label visível do status (ex: Delivered)' })
    @IsString()
    statusLabel: string;

    @ApiProperty({ required: false, description: 'Nome da tarefa específica (se houver múltiplas). Se omitido, assume tarefa principal.' })
    @IsOptional()
    @IsString()
    taskName?: string;
}

export class UpdateWorkStatusResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;
}

export class LogHoursDto {
    @ApiProperty({ description: 'URL do projeto Workfront', example: 'https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/XXXXXXXXXXXX' })
    @IsString()
    projectUrl: string;

    @ApiProperty({ description: 'Quantidade de horas a lançar', example: 1.5 })
    @IsNumber()
    @Min(0.1)
    hours: number;

    @ApiProperty({ required: false, description: 'Descrição/nota do log de horas' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({ required: false, description: 'Nome da tarefa alvo. Se omitido, tenta principal.' })
    @IsOptional()
    @IsString()
    taskName?: string;

    @ApiProperty({ required: false, description: 'Executar headless', default: false })
    @IsOptional()
    headless?: boolean;
}

export class LogHoursResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty()
    message: string;

    @ApiProperty({ required: false })
    loggedHours?: number;
}
