#!/bin/bash

set -euo pipefail

# Deploy robusto para produção, tolerante a histórico reescrito
# Uso: ./scripts/deploy-prod.sh [branch]
# Padrão da branch: prod

BRANCH="${1:-prod}"

echo "🚀 ==================== DEPLOY PRODUÇÃO (${BRANCH}) ===================="
echo "📡 Atualizando código no servidor local (pull seguro)..."

# Garantir que estamos dentro do diretório raiz do repo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Verificar branch atual e realinhar com origem evitando merges interactivos
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "🔀 Trocando para a branch $BRANCH..."
    # Cria/atualiza local branch para acompanhar origin/BRANCH
    git fetch --all --prune --tags
    git checkout -B "$BRANCH" "origin/$BRANCH"
else
    echo "📥 Buscando atualizações e realizando reset hard para origin/$BRANCH..."
    git fetch --all --prune --tags
    # Backup de mudanças locais (inclui untracked) antes do reset, por segurança
    if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
        STASH_REF="pre-reset-$(date +%Y%m%d-%H%M%S)"
        echo "� Alterações locais detectadas. Fazendo backup em stash: $STASH_REF"
        git stash push -u -m "$STASH_REF" || true
    fi
    git reset --hard "origin/$BRANCH"
fi

# Detectar comando docker compose disponível (v2 vs v1)
if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    DC="docker compose"
elif command -v docker-compose &>/dev/null; then
    DC="docker-compose"
else
    echo "❌ Nem 'docker compose' nem 'docker-compose' foram encontrados no PATH." >&2
    exit 1
fi

echo "� Verificando arquivo .env.production..."
if [ ! -f .env.production ]; then
    echo "❌ Erro: Arquivo .env.production não encontrado!"
    exit 1
fi

if grep -q "db:5432" .env.production; then
    echo "✅ DATABASE_URL configurada corretamente (db:5432)"
else
    echo "⚠️  Aviso: DATABASE_URL pode não estar configurada corretamente"
fi

echo "🔧 Verificando/criando rede Docker..."
if ! docker network ls | grep -q "script-wf_default"; then
    docker network create script-wf_default
    echo "✅ Rede script-wf_default criada"
else
    echo "✅ Rede script-wf_default já existe"
fi

echo "🗄️  Verificando banco de dados..."
if $DC -f docker-compose.multi-db.yml ps | grep -q "db.*Up"; then
    echo "✅ Banco de dados está rodando"
else
    echo "🚀 Iniciando banco de dados..."
    $DC -f docker-compose.multi-db.yml up -d
    echo "⏳ Aguardando banco inicializar (15s)..."
    sleep 15
fi

echo "🔍 Verificando banco de produção..."
DB_CONTAINER=$($DC -f docker-compose.multi-db.yml ps -q db)
PROD_DB_EXISTS=$(docker exec "$DB_CONTAINER" psql -U scriptwfdev -tAc "SELECT 1 FROM pg_database WHERE datname='scriptwf_prod'" 2>/dev/null || echo "0")

if [ "$PROD_DB_EXISTS" != "1" ]; then
    echo "📦 Criando banco de produção..."
    docker exec -i "$DB_CONTAINER" psql -U scriptwfdev -d scriptwf_dev <<-EOSQL
        CREATE USER scriptwf_prod WITH PASSWORD 'Prod2024ScriptWF9x7K';
        CREATE DATABASE scriptwf_prod OWNER scriptwf_prod;
        GRANT ALL PRIVILEGES ON DATABASE scriptwf_prod TO scriptwf_prod;
EOSQL
    echo "✅ Banco de produção criado"
else
    echo "✅ Banco de produção já existe"
fi

echo "�🛑 Parando containers atuais..."
$DC -f docker-compose.prod.yml down || true

echo "🔨 Fazendo rebuild das imagens (no-cache)..."
$DC -f docker-compose.prod.yml build --no-cache

echo "🚀 Subindo containers atualizados..."
$DC -f docker-compose.prod.yml up -d

echo "🔍 Aguardando containers iniciarem..."
sleep 10

echo "📦 Aplicando migrações pendentes..."
$DC -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy || true

echo "📊 Verificando status dos containers..."
$DC -f docker-compose.prod.yml ps

echo "📋 Últimos logs do backend:"
$DC -f docker-compose.prod.yml logs --tail=50 backend || true

echo "✅ ==================== DEPLOY CONCLUÍDO! ===================="
echo "🌐 Acesse: http://hesse.app.br"