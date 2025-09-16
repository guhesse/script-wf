import { Module, forwardRef } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { CommentService } from './comment.service';
import { ExtractionService } from './extraction.service';
import { WorkfrontModule } from '../workfront/workfront.module';
import { DocumentBulkDownloadService } from '../../download/document-bulk-download.service';
import { FolderOrganizationService } from '../../download/folder-organization.service';
import { BriefingModule } from '../briefing/briefing.module';

@Module({
  imports: [forwardRef(() => WorkfrontModule), forwardRef(() => BriefingModule)],
  providers: [PdfService, CommentService, ExtractionService, DocumentBulkDownloadService, FolderOrganizationService],
  exports: [PdfService, CommentService, ExtractionService, DocumentBulkDownloadService, FolderOrganizationService],
})
export class PdfModule {}