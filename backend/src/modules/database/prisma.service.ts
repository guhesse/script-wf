import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
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