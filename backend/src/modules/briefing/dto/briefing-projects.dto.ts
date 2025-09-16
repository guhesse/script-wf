import { ApiProperty } from '@nestjs/swagger';

export class BriefingDownloadDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    projectName: string;

    @ApiProperty({ required: false })
    dsid?: string;

    @ApiProperty()
    totalFiles: number;

    @ApiProperty()
    totalSize: string;

    @ApiProperty()
    status: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    @ApiProperty()
    fileCount: number;

    @ApiProperty({
        required: false,
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                originalFileName: { type: 'string' },
                originalUrl: { type: 'string', nullable: true },
                fileSize: { type: 'string' },
                pageCount: { type: 'number' },
                hasContent: { type: 'boolean' },
                hasComments: { type: 'boolean' },
                processedAt: { type: 'string', format: 'date-time' },
                createdAt: { type: 'string', format: 'date-time' },
                extractedContent: {
                    type: 'object',
                    nullable: true,
                    properties: {
                        hasText: { type: 'boolean' },
                        hasComments: { type: 'boolean' },
                        fullText: { type: 'string', nullable: true },
                        comments: { type: 'object', nullable: true },
                        links: { type: 'array', items: { type: 'string' } }
                    }
                },
                structuredData: {
                    type: 'object',
                    nullable: true,
                    properties: {
                        liveDate: { type: 'string', nullable: true },
                        vf: { type: 'string', nullable: true },
                        headline: { type: 'string', nullable: true },
                        copy: { type: 'string', nullable: true },
                        description: { type: 'string', nullable: true },
                        cta: { type: 'string', nullable: true },
                        backgroundColor: { type: 'string', nullable: true },
                        copyColor: { type: 'string', nullable: true },
                        // postcopy: { type: 'string', nullable: true },
                        urn: { type: 'string', nullable: true },
                        allocadia: { type: 'string', nullable: true },
                        po: { type: 'string', nullable: true },
                        extractedAt: { type: 'string', format: 'date-time', nullable: true }
                    }
                }
            }
        }
    })
    pdfFiles?: any[];
}

export class BriefingProjectDto {
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

    @ApiProperty()
    status: string;

    @ApiProperty()
    accessedAt: Date;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    @ApiProperty()
    totalDownloads: number;

    @ApiProperty()
    totalAccess: number;

    @ApiProperty({ type: [BriefingDownloadDto] })
    briefingDownloads: BriefingDownloadDto[];
}

export class BriefingProjectsResponseDto {
    @ApiProperty()
    success: boolean;

    @ApiProperty({
        type: 'object',
        properties: {
            projects: {
                type: 'array',
                items: { $ref: '#/components/schemas/BriefingProjectDto' },
            },
        },
        required: false,
    })
    data?: {
        projects: BriefingProjectDto[];
    };

    @ApiProperty({ required: false })
    error?: string;
}