import { ApiProperty } from '@nestjs/swagger';

class CommentAuthorStatsDto {
    @ApiProperty() author: string;
    @ApiProperty() count: number;
}

class CommentPageStatsDto {
    @ApiProperty() page: number;
    @ApiProperty() count: number;
}

class KeywordStatDto {
    @ApiProperty() keyword: string;
    @ApiProperty() count: number;
}

class StructuredFieldCoverageDto {
    @ApiProperty() field: string;
    @ApiProperty() filled: boolean;
}

class PdfCommentSummaryDto {
    @ApiProperty() pdfFileId: string;
    @ApiProperty() fileName: string;
    @ApiProperty() comments: number;
    @ApiProperty() pagesWithComments: number;
    @ApiProperty({ required: false }) authors?: string[];
}

class PrimaryBriefingDto {
    @ApiProperty() pdfFileId: string;
    @ApiProperty() fileName: string;
    @ApiProperty({ 
        description: 'Comentários simplificados extraídos do PDF principal (sem datas, com deduplicação)', 
        isArray: true, 
        required: false,
        example: [{ page: 1, type: 'Sticky Note', author: 'João Silva', content: 'Revisar headline' }]
    }) comments?: Array<{
        page: number;
        type: string;
        author: string;
        content: string;
    }>;
}

export class BriefingCommentsAnalysisResponseDto {
    @ApiProperty() success: boolean;

    @ApiProperty({ required: false }) projectId?: string;
    @ApiProperty({ required: false }) downloadId?: string;
    @ApiProperty({ required: false }) dsid?: string | null;

    @ApiProperty() totalPdfs: number;
    @ApiProperty() totalPdfsWithComments: number;
    @ApiProperty() totalComments: number;

    @ApiProperty({ type: [CommentAuthorStatsDto] }) authors: CommentAuthorStatsDto[];
    @ApiProperty({ type: [CommentPageStatsDto] }) pages: CommentPageStatsDto[];
    @ApiProperty({ type: [KeywordStatDto] }) topKeywords: KeywordStatDto[];
    @ApiProperty({ type: [KeywordStatDto] }) mentions: KeywordStatDto[];
    @ApiProperty({ type: [StructuredFieldCoverageDto] }) structuredCoverage: StructuredFieldCoverageDto[];
    @ApiProperty({ type: [PdfCommentSummaryDto] }) pdfs: PdfCommentSummaryDto[];

    @ApiProperty({ required: false, type: PrimaryBriefingDto }) primaryBriefing?: PrimaryBriefingDto;

    @ApiProperty({ required: false }) error?: string;
}
