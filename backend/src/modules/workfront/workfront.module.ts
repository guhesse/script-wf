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
import { ProgressService } from './progress.service';
import { WorkflowProgressController } from './progress.controller';
import { UploadJobsService } from './upload-jobs.service';
import { BunnyUploadUrlService } from '../../services/bunny-upload-url.service';
import { CleanupSchedulerService } from '../../services/cleanup-scheduler.service';

@Module({
  imports: [forwardRef(() => PdfModule)],
  controllers: [WorkfrontController, WorkflowProgressController],
  providers: [WorkfrontService, WorkfrontRepository, ShareAutomationService, StatusAutomationService, HoursAutomationService, UploadAutomationService, TimelineService, ProgressService, UploadJobsService, BunnyUploadUrlService, CleanupSchedulerService],
  exports: [WorkfrontService, WorkfrontRepository, ShareAutomationService, StatusAutomationService, HoursAutomationService, UploadAutomationService, TimelineService, ProgressService, UploadJobsService, BunnyUploadUrlService, CleanupSchedulerService],
})
export class WorkfrontModule { }