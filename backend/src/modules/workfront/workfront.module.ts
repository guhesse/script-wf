import { Module, forwardRef } from '@nestjs/common';
import { WorkfrontController } from './workfront.controller';
import { WorkfrontService } from './workfront.service';
import { WorkfrontRepository } from './workfront.repository';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [forwardRef(() => PdfModule)],
  controllers: [WorkfrontController],
  providers: [WorkfrontService, WorkfrontRepository],
  exports: [WorkfrontService, WorkfrontRepository],
})
export class WorkfrontModule {}