#!/bin/bash

# Script para configurar SSL para www.hesse.app.br
set -e

echo "🔐 Configurando SSL para www.hesse.app.br"
echo ""

# Verifica se está na raiz do projeto
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Execute este script na raiz do projeto!"
    exit 1
fi

# Cria diretórios necessários
echo "📁 Criando diretórios para certificados..."
mkdir -p certbot/conf
mkdir -p certbot/www

# Inicia os containers
echo "🚀 Iniciando containers..."
docker compose -f docker-compose.prod.yml up -d

# Aguarda nginx iniciar
echo "⏳ Aguardando serviços iniciarem..."
sleep 5

# Obtém o certificado
echo "🔑 Obtendo certificado Let's Encrypt para www.hesse.app.br..."
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d www.hesse.app.br \
  --email gustavo.hesse@vml.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Certificado obtido com sucesso!"
    echo ""
    echo "📝 Próximos passos:"
    echo "1. Atualize docker-compose.prod.yml para usar nginx-ssl.conf"
    echo "2. Reinicie os containers: docker compose -f docker-compose.prod.yml restart"
    echo ""
else
    echo "❌ Erro ao obter certificado!"
    echo "Verifique se:"
    echo "  - O domínio www.hesse.app.br aponta para este servidor"
    echo "  - As portas 80 e 443 estão abertas"
    exit 1
fi
