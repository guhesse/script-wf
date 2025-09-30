#!/bin/bash

echo "🚀 ==================== SETUP COMPLETO SCRIPT-WF ===================="
echo "📁 Preparando ambiente de produção..."

# 1. Criar usuários e bancos no PostgreSQL
echo "👤 Criando usuários e bancos de dados..."

# Conectar como usuário padrão e criar estrutura
docker exec -i script-wf-db-1 psql -U scriptwfdev -d scriptwf_dev << EOF
-- Criar usuário de produção se não existir
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_user WHERE usename = 'scriptwf_prod') THEN
        CREATE USER scriptwf_prod WITH PASSWORD 'Pr0d_ScriptWF_2024!@#\$';
    END IF;
END
\$\$;

-- Criar banco de produção se não existir
SELECT 'CREATE DATABASE scriptwf_prod OWNER scriptwf_prod'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scriptwf_prod')\gexec

-- Dar permissões
GRANT ALL PRIVILEGES ON DATABASE scriptwf_prod TO scriptwf_prod;

-- Confirmar criação
\l
EOF

echo "✅ Usuários e bancos criados!"

# 2. Aplicar migrações no banco de desenvolvimento
echo "📦 Aplicando migrações no banco de desenvolvimento..."
DATABASE_URL="postgresql://scriptwfdev:AJDO2r7bOcCCKb0Z1Rjw0nq!@localhost:5432/scriptwf_dev" \
  npx prisma migrate deploy --schema=./backend/prisma/schema.prisma

echo "✅ Migrações de desenvolvimento aplicadas!"

# 3. Aplicar migrações no banco de produção
echo "📦 Aplicando migrações no banco de produção..."
DATABASE_URL="postgresql://scriptwf_prod:Pr0d_ScriptWF_2024!@#\$@localhost:5432/scriptwf_prod" \
  npx prisma migrate deploy --schema=./backend/prisma/schema.prisma

echo "✅ Migrações de produção aplicadas!"

# 4. Gerar Prisma Client
echo "⚙️ Gerando Prisma Client..."
cd backend
npx prisma generate
cd ..

echo "🎯 ==================== SETUP COMPLETO! ===================="
echo "📊 Resumo:"
echo "   🔸 Banco DEV: scriptwf_dev (usuário: scriptwfdev)"
echo "   🔸 Banco PROD: scriptwf_prod (usuário: scriptwf_prod)"
echo "   🔸 PGAdmin: http://seu-ip:8081"
echo "   🔸 Frontend: http://seu-ip"
echo "   🔸 Todas as tabelas criadas com Prisma!"
echo ""
echo "🚀 Agora execute: docker compose -f docker-compose.prod.yml up --build -d"