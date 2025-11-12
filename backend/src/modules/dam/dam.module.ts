import { Module } from '@nestjs/common';
import { DamController } from './dam.controller';
import { DamAuthService } from './dam-auth.service';
import { DamDownloadService } from './dam-download.service';

@Module({
    controllers: [DamController],
    providers: [DamAuthService, DamDownloadService],
    exports: [DamAuthService, DamDownloadService],
})
export class DamModule { }
