#!/bin/bash

# ============================================
# GUIA RÁPIDO - COMANDOS NO SERVIDOR
# ============================================

cat << 'EOF'

🚀 COMANDOS RÁPIDOS - SERVIDOR PRODUÇÃO
========================================

1. REBUILD RÁPIDO (30-60s)
   cd /var/www/script-wf
   ./scripts/rebuild-prod-fast.sh

2. VER LOGS
   ./scripts/debug-logs.sh backend

3. RESTART RÁPIDO
   ./scripts/quick-restart.sh backend

4. ACESSAR SHELL
   ./scripts/shell.sh backend

5. STATUS
   docker-compose -f docker-compose.prod.yml ps

========================================

📝 WORKFLOW DE DEBUG:
1. Ver logs: ./scripts/debug-logs.sh backend
2. Fazer mudanças locais e push
3. No servidor: ./scripts/rebuild-prod-fast.sh
4. Acompanhar logs

Para mais detalhes: cat DEBUG_PROD.md

EOF
