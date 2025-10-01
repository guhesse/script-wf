# syntax=docker/dockerfile:1.4

# ============================================
# DOCKERFILE OTIMIZADO PARA PRODUÇÃO
# Rebuild rápido: ~30-60s (vs 3-5min antes)
# ============================================

FROM node:18-slim AS base

WORKDIR /app

# Instalar dependências do sistema (CACHE LAYER)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# Stage 1: DEPENDENCIES (HEAVY - cache longo)
# ============================================
FROM base AS dependencies

# Copiar apenas package.json (CACHE se não mudar)
COPY package*.json ./

# Instalar dependências (CACHE)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# Instalar Playwright (CACHE)
RUN --mount=type=cache,target=/root/.cache/ms-playwright \
    npx playwright install chromium --with-deps

# ============================================
# Stage 2: BUILDER (LIGHT - muda frequente)
# ============================================
FROM dependencies AS builder

# Copiar Prisma schema (para generate)
COPY prisma ./prisma

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte (muda frequente)
COPY tsconfig.json nest-cli.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: PRODUCTION (final)
# ============================================
FROM base AS production

# Copiar node_modules do stage dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /root/.cache/ms-playwright /root/.cache/ms-playwright

# Copiar build do stage builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copiar package.json
COPY package*.json ./

# Criar diretórios necessários
RUN mkdir -p /app/temp /app/uploads /app/state

EXPOSE 3000

CMD ["node", "dist/main"]
