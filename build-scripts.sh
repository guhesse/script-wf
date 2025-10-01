#!/bin/bash

# Habilitar BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Detectar comando docker compose (novo) ou docker-compose (antigo)
if command -v docker &> /dev/null && docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
    echo "✅ Usando: docker compose (versão nova)"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "✅ Usando: docker-compose (versão antiga)"
else
    echo "❌ Erro: Nem 'docker compose' nem 'docker-compose' encontrado!"
    exit 1
fi

# Build inicial completo (primeira vez)
build_full() {
    echo "🏗️ Build completo (com dependências)..."
    $DOCKER_COMPOSE build --no-cache
    # Tag do stage dependencies para reuso
    local backend_id=$($DOCKER_COMPOSE images -q backend)
    if [ ! -z "$backend_id" ]; then
        docker tag $backend_id script-wf-backend-deps:latest
        echo "✅ Tagged dependencies layer para cache"
    fi
}

# Build rápido (só código mudou)
build_fast() {
    echo "⚡ Build rápido (sem reinstalar dependências)..."
    $DOCKER_COMPOSE build
}

# Build e restart
rebuild() {
    build_fast
    echo "🔄 Reiniciando containers..."
    $DOCKER_COMPOSE up -d
    echo "📋 Logs (Ctrl+C para sair):"
    $DOCKER_COMPOSE logs -f backend
}

# Ver tamanho de cache
cache_info() {
    echo "📊 Informações de cache:"
    docker system df -v | grep -A 10 "Build Cache"
}

# Limpar cache antigo
cache_clean() {
    echo "🧹 Limpando cache de build..."
    docker builder prune -f
    echo "✅ Cache limpo!"
}

# Parar containers
stop_containers() {
    echo "🛑 Parando containers..."
    $DOCKER_COMPOSE down
}

# Ver logs
show_logs() {
    echo "📋 Logs do backend:"
    $DOCKER_COMPOSE logs -f backend
}

# Status
show_status() {
    echo "📊 Status dos containers:"
    $DOCKER_COMPOSE ps
}

# Menu
case "$1" in
    full)
        build_full
        ;;
    fast)
        build_fast
        ;;
    rebuild)
        rebuild
        ;;
    cache-info)
        cache_info
        ;;
    cache-clean)
        cache_clean
        ;;
    stop)
        stop_containers
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    *)
        echo "Uso: $0 {full|fast|rebuild|cache-info|cache-clean|stop|logs|status}"
        echo ""
        echo "Comandos disponíveis:"
        echo "  full         - Build completo (reinstala tudo)"
        echo "  fast         - Build rápido (só código mudou)"
        echo "  rebuild      - Build rápido + restart containers"
        echo "  cache-info   - Ver informações de cache"
        echo "  cache-clean  - Limpar cache antigo"
        echo "  stop         - Parar containers"
        echo "  logs         - Ver logs do backend"
        echo "  status       - Status dos containers"
        exit 1
        ;;
esac
