import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Configuração em desenvolvimento: não sobrescrever com credenciais hardcoded.
    // Se DATABASE_URL não estiver definida ou inválida, tentar usar LOCAL_DATABASE_URL ou DEV_DATABASE_URL.
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const current = process.env.DATABASE_URL;
      const isPg = current && /^postgres(?:ql)?:\/\//i.test(current);
      if (!isPg) {
        const candidate = process.env.LOCAL_DATABASE_URL || process.env.DEV_DATABASE_URL;
        if (candidate && /^postgres(?:ql)?:\/\//i.test(candidate)) {
          process.env.DATABASE_URL = candidate;
          // eslint-disable-next-line no-console
          console.log('[PrismaService] (dev) DATABASE_URL não definida/válida; usando LOCAL/DEV_DATABASE_URL.');
        } else {
          // eslint-disable-next-line no-console
          console.warn('[PrismaService] (dev) DATABASE_URL ausente e sem LOCAL/DEV disponível; configure o .env.');
        }
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