#!/usr/bin/env sh
set -e

# Executa migrações (apenas se schema.prisma existir)
if [ -f ./prisma/schema.prisma ]; then
  echo "[entrypoint] Rodando prisma migrate deploy"
  npx prisma migrate deploy
fi

# Gera client caso não exista
npx prisma generate || true

exec "$@"
