import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BunnyUploadUrlService } from './bunny-upload-url.service';

@Injectable()
export class CleanupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CleanupSchedulerService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly bunnyUploadService: BunnyUploadUrlService) {}

  onModuleInit() {
    // Iniciar limpeza automática apenas em produção
    if (process.env.NODE_ENV === 'production') {
      this.startAutomaticCleanup();
    } else {
      this.logger.log('Limpeza automática desabilitada em desenvolvimento');
    }
  }

  /**
   * Iniciar limpeza automática diária às 00:00
   */
  startAutomaticCleanup() {
    // Calcular tempo até próxima meia-noite
    const now = new Date();
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0); // Próxima meia-noite
    
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

    this.logger.log(`Limpeza automática iniciará em ${Math.round(timeUntilMidnight / 1000 / 60)} minutos (à meia-noite)`);

    // Agendar primeira execução à meia-noite
    setTimeout(() => {
      this.performCleanup();
      
      // Depois executar a cada 24 horas
      this.cleanupInterval = setInterval(() => {
        this.performCleanup();
      }, 24 * 60 * 60 * 1000); // 24 horas
      
    }, timeUntilMidnight);
  }

  /**
   * Parar limpeza automática
   */
  stopAutomaticCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('Limpeza automática parada');
    }
  }

  /**
   * Executar limpeza completa
   */
  async performCleanup(): Promise<{
    expiredFiles: { deletedCount: number; failedCount: number; errors: string[] };
    usedFiles: { deletedCount: number; failedCount: number; errors: string[] };
    stats: any;
  }> {
    this.logger.log('🧹 Iniciando limpeza automática de arquivos temporários...');

    try {
      // Estatísticas antes da limpeza
      const statsBefore = await this.bunnyUploadService.getStats();
      this.logger.log(`Estatísticas antes da limpeza: ${JSON.stringify(statsBefore)}`);

      // Limpar arquivos expirados
      const expiredResult = await this.bunnyUploadService.cleanupExpiredFiles();
      this.logger.log(`Arquivos expirados: ${expiredResult.deletedCount} removidos, ${expiredResult.failedCount} falharam`);

      // Limpar arquivos utilizados com mais de 24 horas
      const usedResult = await this.bunnyUploadService.cleanupUsedFiles(24);
      this.logger.log(`Arquivos utilizados antigos: ${usedResult.deletedCount} removidos, ${usedResult.failedCount} falharam`);

      // Estatísticas após a limpeza
      const statsAfter = await this.bunnyUploadService.getStats();
      this.logger.log(`Estatísticas após a limpeza: ${JSON.stringify(statsAfter)}`);

      const totalDeleted = expiredResult.deletedCount + usedResult.deletedCount;
      const totalFailed = expiredResult.failedCount + usedResult.failedCount;

      this.logger.log(`✅ Limpeza concluída: ${totalDeleted} arquivos removidos, ${totalFailed} falharam`);

      return {
        expiredFiles: expiredResult,
        usedFiles: usedResult,
        stats: {
          before: statsBefore,
          after: statsAfter,
          totalDeleted,
          totalFailed
        }
      };
    } catch (error) {
      this.logger.error('❌ Erro na limpeza automática:', error.message);
      throw error;
    }
  }

  /**
   * Limpeza manual (para testes ou uso administrativo)
   */
  async manualCleanup(options?: {
    includeUsedFiles?: boolean;
    usedFilesOlderThanHours?: number;
  }): Promise<any> {
    this.logger.log('🧹 Executando limpeza manual...');

    try {
      // Sempre limpar arquivos expirados
      const expiredResult = await this.bunnyUploadService.cleanupExpiredFiles();

      let usedResult = { deletedCount: 0, failedCount: 0, errors: [] };
      
      // Opcionalmente limpar arquivos utilizados
      if (options?.includeUsedFiles) {
        const hoursOld = options.usedFilesOlderThanHours || 1;
        usedResult = await this.bunnyUploadService.cleanupUsedFiles(hoursOld);
      }

      const stats = await this.bunnyUploadService.getStats();

      return {
        expiredFiles: expiredResult,
        usedFiles: usedResult,
        currentStats: stats,
        totalDeleted: expiredResult.deletedCount + usedResult.deletedCount,
        totalFailed: expiredResult.failedCount + usedResult.failedCount
      };
    } catch (error) {
      this.logger.error('Erro na limpeza manual:', error.message);
      throw error;
    }
  }
}