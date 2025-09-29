FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Instalar dependências de build para canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpng-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .
RUN npm run build && npx prisma generate

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copiar só o necessário
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
CMD ["node", "dist/main.js"]