# Multi-stage build para frontend Vite/React
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Servir por nginx (mais performático) ou direto por node http-server; aqui usaremos nginx slim
FROM nginx:1.27-alpine AS runner
# nginx.conf está no diretório docker/ no repo raiz
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
