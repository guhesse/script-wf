#!/bin/bash

# ============================================
# QUICK RESTART - Reinicia apenas um serviço
# ============================================
# Útil para aplicar mudanças sem rebuild completo

set -e

SERVICE=${1:-backend}

echo "🔄 Restart rápido: $SERVICE"
echo "================================"

cd /var/www/script-wf

echo "⏹️  Parando $SERVICE..."
docker compose -f docker-compose.prod.yml stop $SERVICE

echo "🚀 Iniciando $SERVICE..."
docker compose -f docker-compose.prod.yml up -d $SERVICE

echo ""
echo "⏳ Aguardando..."
sleep 3

echo ""
echo "📊 Status:"
docker compose -f docker-compose.prod.yml ps $SERVICE

echo ""
echo "✅ Restart concluído!"
echo ""
echo "Logs:"
docker compose -f docker-compose.prod.yml logs --tail=50 $SERVICE
