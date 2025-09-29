# Multi-stage build para backend Nest.js + Prisma
FROM node:20-alpine AS deps
WORKDIR /app
# Instalar libs necessárias para canvas/playwright (parcial) - pode ser ajustado conforme erro em produção
RUN apk add --no-cache python3 make g++ libc6-compat
COPY backend/package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .
RUN npm run build && npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copiar apenas o necessário
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
# Healthcheck pode ser adicionado no compose
CMD ["node", "dist/main.js"]
