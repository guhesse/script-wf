import { Module, forwardRef } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { CommentService } from './comment.service';
import { ExtractionService } from './extraction.service';
import { WorkfrontModule } from '../workfront/workfront.module';
import { DocumentBulkDownloadService } from '../../download/document-bulk-download.service';
import { FolderOrganizationService } from '../../download/folder-organization.service';
import { BriefingModule } from '../briefing/briefing.module';
import { BulkProgressService } from './bulk-progress.service';

@Module({
  imports: [forwardRef(() => WorkfrontModule), forwardRef(() => BriefingModule)],
  providers: [PdfService, CommentService, ExtractionService, DocumentBulkDownloadService, FolderOrganizationService, BulkProgressService],
  exports: [PdfService, CommentService, ExtractionService, DocumentBulkDownloadService, FolderOrganizationService, BulkProgressService],
})
export class PdfModule {}