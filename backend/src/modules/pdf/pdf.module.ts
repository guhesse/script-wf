import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PdfService } from './pdf.service';
import { CommentService } from './comment.service';
import { ExtractionService } from './extraction.service';
import { AIProcessingService } from './ai-processing.service';
import { CommentEnhancementService } from './comment-enhancement.service';
import { PdfAIController } from './pdf-ai.controller';
import { WorkfrontModule } from '../workfront/workfront.module';
import { DocumentBulkDownloadService } from '../../download/document-bulk-download.service';
import { FolderOrganizationService } from '../../download/folder-organization.service';
import { BriefingModule } from '../briefing/briefing.module';
import { BulkProgressService } from './bulk-progress.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => WorkfrontModule), 
    forwardRef(() => BriefingModule)
  ],
  controllers: [PdfAIController],
  providers: [
    PdfService, 
    CommentService, 
    ExtractionService,
    AIProcessingService,
    CommentEnhancementService,
    DocumentBulkDownloadService, 
    FolderOrganizationService, 
    BulkProgressService
  ],
  exports: [
    PdfService, 
    CommentService, 
    ExtractionService,
    AIProcessingService,
    CommentEnhancementService,
    DocumentBulkDownloadService, 
    FolderOrganizationService, 
    BulkProgressService
  ],
})
export class PdfModule {}