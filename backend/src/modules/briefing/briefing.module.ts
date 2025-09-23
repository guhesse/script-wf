import { Module, forwardRef } from '@nestjs/common';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { BriefingExtractionService } from './briefing-extraction.service';
import { BriefingPptService } from './briefing-ppt.service';
import { WorkfrontModule } from '../workfront/workfront.module';

@Module({
  imports: [forwardRef(() => WorkfrontModule)],
  controllers: [BriefingController],
  providers: [BriefingService, BriefingExtractionService, BriefingPptService],
  exports: [BriefingService, BriefingExtractionService, BriefingPptService],
})
export class BriefingModule { }