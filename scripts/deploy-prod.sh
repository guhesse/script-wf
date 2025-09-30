#!/bin/bash

echo "🚀 ==================== DEPLOY PRODUÇÃO ===================="
echo "📡 Fazendo deploy das alterações na VPS..."

# Verificar se estamos na branch prod
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "prod" ]; then
    echo "❌ Você não está na branch prod. Mudando para prod..."
    git checkout prod
fi

echo "📥 Fazendo pull das últimas alterações..."
git pull origin prod

echo "🛑 Parando containers atuais..."
docker-compose -f docker-compose.prod.yml down

echo "🔨 Fazendo rebuild das imagens..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Subindo containers atualizados..."
docker-compose -f docker-compose.prod.yml up -d

echo "🔍 Aguardando containers iniciarem..."
sleep 10

echo "📦 Aplicando migrações pendentes..."
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

echo "📊 Verificando status dos containers..."
docker-compose -f docker-compose.prod.yml ps

echo "📋 Últimos logs do backend:"
docker-compose -f docker-compose.prod.yml logs --tail=20 backend

echo "✅ ==================== DEPLOY CONCLUÍDO! ===================="
echo "🌐 Acesse: http://seu-ip"
echo "📱 Teste o sistema de login atualizado!"