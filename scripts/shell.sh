#!/bin/bash

# ============================================
# ACESSO SHELL AO CONTAINER
# ============================================
# Entra no container para debug

set -e

SERVICE=${1:-backend}

echo "🐚 Acessando shell: $SERVICE"
echo "================================"

cd /var/www/script-wf

docker compose -f docker-compose.prod.yml exec $SERVICE sh
