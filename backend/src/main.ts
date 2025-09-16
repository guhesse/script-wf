import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://your-production-domain.com'] 
      : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false, // Permitir propriedades extras por enquanto
    skipMissingProperties: false,
  }));

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Workfront Sharing API')
    .setDescription('Interface visual para compartilhamento de documentos no Workfront')
    .setVersion('1.0')
    .addTag('Autenticação')
    .addTag('Projetos')
    .addTag('Comentários')
    .addTag('Download em Massa')
    .addTag('Extração de PDF')
    .addTag('Dashboard')
    .addTag('Histórico')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Workfront Sharing API',
    customfavIcon: '/favicon.ico'
  });

  // Serve swagger spec as JSON
  app.getHttpAdapter().get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
  });

  const port = process.env.PORT || 3000;

  await app.listen(port, () => {
    console.log('🚀 ===============================================');
    console.log(`🚀 Servidor Nest.js rodando em http://localhost:${port}`);
    console.log('📱 Acesse a interface web em seu navegador');
    console.log('🗄️ Banco de dados: PostgreSQL (Prisma)');
    console.log(`🔧 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 Documentação: http://localhost:${port}/docs`);
    console.log('🚀 ===============================================');

    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Comandos úteis:');
      console.log('   npm run start:dev    - Executar em modo desenvolvimento');
      console.log('   npm run db:studio    - Abrir Prisma Studio');
      console.log('   npm run db:generate  - Gerar cliente Prisma');
      console.log('   npm run db:push      - Sincronizar schema com banco');
    }
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🛑 Recebido SIGINT, encerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\\n🛑 Recebido SIGTERM, encerrando servidor...');
  process.exit(0);
});

bootstrap();