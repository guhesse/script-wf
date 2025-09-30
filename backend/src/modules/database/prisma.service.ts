import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Fallback mínimo e isolado para desenvolvimento
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const current = process.env.DATABASE_URL;
      const looksPostgres = current && /^postgres(?:ql)?:\/\//i.test(current);
      if (!looksPostgres) {
        // Usa LOCAL_DATABASE_URL se definida, senão uma padrão local
        const local = process.env.LOCAL_DATABASE_URL || 'postgresql://scriptwf:L4r01EC4DAXA7UwG@localhost:5432/scriptwf?schema=public';
        process.env.DATABASE_URL = local;
        // Não usamos this.logger antes de super, então console direto.
        // eslint-disable-next-line no-console
        console.log('[PrismaService] (dev fallback) DATABASE_URL substituída por configuração local.');
      }
    }

    super({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conectado ao banco de dados PostgreSQL');

      // Test connection with a simple query
      await this.$queryRaw`SELECT 1`;
      this.logger.log('✅ Teste de conexão com banco de dados bem-sucedido');
    } catch (error) {
      this.logger.error('❌ Erro ao conectar com o banco de dados:', error);
      this.logger.log('💡 Para desenvolvimento, a URL pode estar hardcoded no schema.prisma');
      this.logger.log('⚠️ Continuando sem conexão com banco...');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🛑 Desconectado do banco de dados');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}