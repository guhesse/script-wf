#!/bin/bash

# ============================================
# REBUILD RÁPIDO EM PRODUÇÃO
# ============================================
# Este script otimiza o rebuild usando BuildKit e cache
# Tempo esperado: 30-60 segundos (vs 3-5min antes)

set -e

echo "🚀 Rebuild Rápido em Produção"
echo "================================"
echo ""

# Habilita BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Verifica se está no diretório correto
if [ ! -f "docker compose.prod.yml" ]; then
    echo "❌ Erro: docker compose.prod.yml não encontrado"
    echo "Execute este script na raiz do projeto"
    exit 1
fi

echo "📦 Fazendo pull das mudanças..."
git pull

echo ""
echo "🔧 Rebuild com cache otimizado..."
docker compose -f docker-compose.prod.yml build --build-arg BUILDKIT_INLINE_CACHE=1

echo ""
echo "🔄 Recriando containers..."
docker compose -f docker-compose.prod.yml up -d --force-recreate

echo ""
echo "⏳ Aguardando containers iniciarem..."
sleep 5

echo ""
echo "📊 Status dos containers:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Rebuild concluído!"
echo ""
echo "Para ver logs:"
echo "  docker compose -f docker-compose.prod.yml logs -f backend"
