FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Dependências de build para canvas e geração do prisma client
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpng-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
COPY backend/prisma ./prisma

# Instala deps e gera client ANTES de compilar (para que enums/@prisma/client existam no build TS)
# Usa uma DATABASE_URL dummy apenas para geração (substituída em runtime)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
RUN npm ci && npx prisma generate

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY backend/ .

# Já temos prisma client gerado; apenas compilar
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Instala dependências runtime necessárias (versões menores que no build) incluindo OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 libpng16-16 libfreetype6 \
        openssl \
    && rm -rf /var/lib/apt/lists/*
# Copiar artefatos finais
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
CMD ["node", "dist/main.js"]