import { Module } from '@nestjs/common';
import { MastersService } from './masters.service';
import { MastersController } from './masters.controller';
import { BunnyStorageService } from '../../services/bunny-storage.service';

@Module({
  controllers: [MastersController],
  providers: [MastersService, BunnyStorageService],
  exports: [MastersService],
})
export class MastersModule {}
