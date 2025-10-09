import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkfrontModule } from './modules/workfront/workfront.module';
import { BriefingModule } from './modules/briefing/briefing.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { MastersModule } from './modules/masters/masters.module';
import { KanbanModule } from './modules/kanban/kanban.module';

@Module({
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Serve static files (frontend)
    ServeStaticModule.forRoot({
      rootPath: process.env.NODE_ENV === 'production'
        ? join(__dirname, '..', '..', 'frontend', 'dist')
        : join(__dirname, '..', '..', 'backend', 'public'),
      serveRoot: '/',
    }),

    // Database module
    DatabaseModule,

    // Feature modules
    AuthModule,
    WorkfrontModule,
    BriefingModule,
    PdfModule,
    MastersModule,
    KanbanModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }