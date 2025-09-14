// server.js
import app from './src/app.js';
import prisma from './src/database/prisma.js';

const PORT = process.env.PORT || 3000;

// Verificar conexão com banco de dados
async function checkDatabaseConnection() {
    try {
    // Tentar uma query simples para testar conexão
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Conectado ao banco de dados PostgreSQL');
    } catch (error) {
        console.error('❌ Erro ao conectar com o banco de dados:', error.message);
        console.log('💡 Para desenvolvimento, a URL pode estar hardcoded no schema.prisma');
        console.log('⚠️ Continuando sem conexão com banco...');
    }
}

// Inicializar servidor
async function startServer() {
    try {
    // Verificar banco de dados
        await checkDatabaseConnection();

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log('🚀 ===============================================');
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
            console.log('📱 Acesse a interface web em seu navegador');
            console.log('🗄️ Banco de dados: PostgreSQL (Prisma)');
            console.log(`🔧 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('🚀 ===============================================');

            if (process.env.NODE_ENV === 'development') {
                console.log('🔧 Comandos úteis:');
                console.log('   npm run dev         - Executar em modo desenvolvimento');
                console.log('   npm run db:studio   - Abrir Prisma Studio');
                console.log('   npm run db:generate - Gerar cliente Prisma');
                console.log('   npm run db:push     - Sincronizar schema com banco');
            }
        });

    } catch (error) {
        console.error('❌ Erro ao inicializar servidor:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Recebido SIGINT, encerrando servidor...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Recebido SIGTERM, encerrando servidor...');
    await prisma.$disconnect();
    process.exit(0);
});

// Inicializar
startServer();
