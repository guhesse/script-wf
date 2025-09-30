FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Dependências de build para canvas, prisma client e instalação dos browsers (playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config unzip \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpng-dev \
    libfreetype6-dev \
    # libs necessárias para chromium headless + gtk stack
    libnss3 libnspr4 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libasound2 libxshmfence1 libgbm1 libatspi2.0-0 \
    libx11-xcb1 libx11-6 libxext6 libxss1 libxrender1 fonts-liberation \
    libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libglib2.0-0 libdbus-1-3 libxtst6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
COPY backend/prisma ./prisma

# Instala deps e gera client (DATABASE_URL dummy apenas para generate)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
RUN npm ci && npx prisma generate

# Instala browsers Playwright dentro de node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
# Assim não precisamos copiar /root/.cache/ms-playwright entre stages
ENV PLAYWRIGHT_BROWSERS_PATH=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN set -eux; \
    node -v; npm -v; \
    npx playwright --version; \
    npx playwright install chromium --with-deps || { echo 'Playwright browser install failed'; exit 1; }; \
    ls -al node_modules/playwright-core || true; \
    find node_modules/playwright-core -maxdepth 4 -type f -name chrome -o -name headless_shell || true

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY backend/ .

# Já temos prisma client gerado; apenas compilar
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Instala dependências runtime (canvas + chromium libs) e OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 libpng16-16 libfreetype6 \
    libnss3 libnspr4 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libasound2 libxshmfence1 libgbm1 libatspi2.0-0 \
    libx11-xcb1 libx11-6 libxext6 libxss1 libxrender1 fonts-liberation \
    libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libglib2.0-0 libdbus-1-3 libxtst6 \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Copiar artefatos finais (node_modules já contém browsers em .cache/ms-playwright)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
# Ajuste opcional: desativar sandbox se necessário (pasta /tmp sem perms):
# ENV PLAYWRIGHT_CHROMIUM_DISABLE_SANDBOX=1
CMD ["node", "dist/main.js"]