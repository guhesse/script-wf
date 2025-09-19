import { Module, forwardRef } from '@nestjs/common';
import { WorkfrontController } from './workfront.controller';
import { WorkfrontService } from './workfront.service';
import { WorkfrontRepository } from './workfront.repository';
import { PdfModule } from '../pdf/pdf.module';
import { ShareAutomationService } from './share-automation.service';
import { StatusAutomationService } from './status-automation.service';
import { HoursAutomationService } from './hours-automation.service';
import { UploadAutomationService } from './upload-automation.service';
import { TimelineService } from './timeline.service';

@Module({
  imports: [forwardRef(() => PdfModule)],
  controllers: [WorkfrontController],
  providers: [WorkfrontService, WorkfrontRepository, ShareAutomationService, StatusAutomationService, HoursAutomationService, UploadAutomationService, TimelineService],
  exports: [WorkfrontService, WorkfrontRepository, ShareAutomationService, StatusAutomationService, HoursAutomationService, UploadAutomationService, TimelineService],
})
export class WorkfrontModule {}