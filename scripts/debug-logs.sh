#!/bin/bash

# ============================================
# DEBUG LOGS EM PRODUÇÃO
# ============================================
# Facilita visualização de logs para debug

set -e

SERVICE=${1:-backend}

echo "📝 Logs do serviço: $SERVICE"
echo "================================"
echo ""
echo "Pressione Ctrl+C para sair"
echo ""

cd /var/www/script-wf

docker-compose -f docker-compose.prod.yml logs -f --tail=100 $SERVICE
