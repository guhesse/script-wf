# Stage 1: Base com dependências (raramente muda)
FROM node:18-slim AS dependencies
WORKDIR /app

# Instalar dependências do sistema para Playwright
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Copiar apenas package*.json para aproveitar cache
COPY package*.json ./

# Instalar dependências
RUN npm ci --legacy-peer-deps

# Instalar browsers do Playwright
RUN npx playwright install chromium

# Stage 2: Build (muda frequentemente)
FROM dependencies AS builder
WORKDIR /app

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Stage 3: Produção (final)
FROM node:18-slim AS production
WORKDIR /app

# Copiar dependências de sistema necessárias
RUN apt-get update && apt-get install -y \
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

# Copiar node_modules e browsers do stage dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /root/.cache /root/.cache

# Copiar build do stage builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Criar diretórios necessários
RUN mkdir -p /app/temp /app/uploads /app/state

EXPOSE 3000

CMD ["node", "dist/main"]
