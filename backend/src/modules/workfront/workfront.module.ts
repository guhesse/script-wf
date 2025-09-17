import { Module, forwardRef } from '@nestjs/common';
import { WorkfrontController } from './workfront.controller';
import { WorkfrontService } from './workfront.service';
import { WorkfrontRepository } from './workfront.repository';
import { PdfModule } from '../pdf/pdf.module';
import { ShareAutomationService } from './share-automation.service';

@Module({
  imports: [forwardRef(() => PdfModule)],
  controllers: [WorkfrontController],
  providers: [WorkfrontService, WorkfrontRepository, ShareAutomationService],
  exports: [WorkfrontService, WorkfrontRepository, ShareAutomationService],
})
export class WorkfrontModule {}