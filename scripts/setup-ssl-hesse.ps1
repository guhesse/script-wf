# Script para configurar SSL para www.hesse.app.br (Windows)

Write-Host "🔐 Configurando SSL para www.hesse.app.br" -ForegroundColor Cyan
Write-Host ""

# Verifica se está na raiz do projeto
if (-not (Test-Path "docker-compose.prod.yml")) {
    Write-Host "❌ Execute este script na raiz do projeto!" -ForegroundColor Red
    exit 1
}

# Cria diretórios necessários
Write-Host "📁 Criando diretórios para certificados..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "certbot\conf" | Out-Null
New-Item -ItemType Directory -Force -Path "certbot\www" | Out-Null

# Inicia os containers
Write-Host "🚀 Iniciando containers..." -ForegroundColor Green
docker compose -f docker-compose.prod.yml up -d

# Aguarda nginx iniciar
Write-Host "⏳ Aguardando serviços iniciarem..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Obtém o certificado
Write-Host "🔑 Obtendo certificado Let's Encrypt para www.hesse.app.br..." -ForegroundColor Green
docker compose -f docker-compose.prod.yml run --rm certbot certonly `
  --webroot `
  -w /var/www/certbot `
  -d www.hesse.app.br `
  --email gustavo.hesse@vml.com `
  --agree-tos `
  --no-eff-email `
  --force-renewal

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Certificado obtido com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
    Write-Host "1. Atualize docker-compose.prod.yml para usar nginx-ssl.conf" -ForegroundColor White
    Write-Host "2. Reinicie os containers: docker compose -f docker-compose.prod.yml restart" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Erro ao obter certificado!" -ForegroundColor Red
    Write-Host "Verifique se:" -ForegroundColor Yellow
    Write-Host "  - O domínio www.hesse.app.br aponta para este servidor" -ForegroundColor White
    Write-Host "  - As portas 80 e 443 estão abertas" -ForegroundColor White
    exit 1
}
