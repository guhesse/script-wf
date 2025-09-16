import { Module } from '@nestjs/common';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { BriefingExtractionService } from './briefing-extraction.service';
import { WorkfrontModule } from '../workfront/workfront.module';

@Module({
  imports: [WorkfrontModule],
  controllers: [BriefingController],
  providers: [BriefingService, BriefingExtractionService],
  exports: [BriefingService, BriefingExtractionService],
})
export class BriefingModule { }