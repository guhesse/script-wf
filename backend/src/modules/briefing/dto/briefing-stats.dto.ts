import { ApiProperty } from '@nestjs/swagger';

export class BriefingStatsDto {
    @ApiProperty({
        description: 'Totais de elementos do sistema',
        type: 'object',
        properties: {
            projects: { type: 'number', description: 'Total de projetos' },
            downloads: { type: 'number', description: 'Total de downloads' },
            pdfs: { type: 'number', description: 'Total de PDFs processados' },
        },
    })
    totals: {
        projects: number;
        downloads: number;
        pdfs: number;
    };

    @ApiProperty({
        description: 'Distribuição por status',
        type: 'object',
        additionalProperties: { type: 'number' },
    })
    statusBreakdown: Record<string, number>;
}

export class BriefingStatsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({ required: false })
    data?: BriefingStatsDto;

    @ApiProperty({ required: false })
    error?: string;
}