import { Module, forwardRef } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { CommentService } from './comment.service';
import { ExtractionService } from './extraction.service';
import { WorkfrontModule } from '../workfront/workfront.module';

@Module({
  imports: [forwardRef(() => WorkfrontModule)],
  providers: [PdfService, CommentService, ExtractionService],
  exports: [PdfService, CommentService, ExtractionService],
})
export class PdfModule {}