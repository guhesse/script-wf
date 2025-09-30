FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Dependências de build para canvas, prisma client e instalação dos browsers (playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpng-dev \
    libfreetype6-dev \
    # libs necessárias para chromium headless
    libnss3 libnspr4 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libasound2 libxshmfence1 libgbm1 libatspi2.0-0 \
    libx11-xcb1 libx11-6 libxext6 libxss1 libxrender1 fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
COPY backend/prisma ./prisma

# Instala deps, gera client e instala browser Chromium do Playwright
# Usa uma DATABASE_URL dummy apenas para geração (substituída em runtime)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
RUN npm ci \
    && npx prisma generate \
    && npx playwright install --browser=chromium

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
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
# Instala dependências runtime (canvas + chromium) e OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 libpng16-16 libfreetype6 \
        libnss3 libnspr4 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libasound2 libxshmfence1 libgbm1 libatspi2.0-0 \
        libx11-xcb1 libx11-6 libxext6 libxss1 libxrender1 fonts-liberation \
        openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Copiar artefatos finais
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
# Copia browsers Playwright (instalados no stage deps)
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
# Ajuste opcional: se desejar desativar sandbox (caso permissões do host sejam restritas)
# ENV PLAYWRIGHT_CHROMIUM_DISABLE_SANDBOX=1
CMD ["node", "dist/main.js"]