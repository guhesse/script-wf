#!/bin/bash
# Script para aplicar migrações Prisma no banco de produção

echo "🔄 Aplicando migrações Prisma no banco de produção..."

# Definir URL temporária para produção (usando nome do container Docker)
export DATABASE_URL="postgresql://scriptwf_prod:Pr0d_ScriptWF_2024!@#\$@db:5432/scriptwf_prod"

# Entrar no diretório backend
cd /var/www/script-wf/backend

# Aplicar migrações
echo "📦 Executando prisma migrate deploy..."
npx prisma migrate deploy

# Gerar client se necessário
echo "⚙️ Gerando Prisma client..."
npx prisma generate

echo "✅ Migrações aplicadas com sucesso!"
echo "🎯 Banco de produção pronto: scriptwf_prod"