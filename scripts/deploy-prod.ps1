# PowerShell Deploy Script (Windows) - SSH + Docker Compose (headless)
# Uso:
#   1) Certifique-se de ter o OpenSSH Client instalado (ssh/scp disponíveis no PATH)
#   2) Preencha as variáveis abaixo
#   3) Execute:  ./scripts/deploy-prod.ps1

param(
  [string]$ServerHost = "147.93.68.250",
  [string]$ServerUser = "root",
  [string]$RemoteDir = "/root/script-wf",
  [string]$EnvFileLocalPath = ""
)

function Assert-Command {
  param([string]$name)
  $path = (Get-Command $name -ErrorAction SilentlyContinue).Path
  if (-not $path) { throw "Comando '$name' não encontrado no PATH. Instale/habilite antes de continuar." }
  return $path
}

Write-Host "==== Deploy Produção (headless) ====" -ForegroundColor Cyan

# 0) Pré-checagens
Assert-Command ssh | Out-Null
Assert-Command scp | Out-Null

$repoRoot = (Resolve-Path "$PSScriptRoot\..\").Path
Set-Location $repoRoot

# 1) Compactar repositório (excluindo arquivos/pastas transitórias)
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$archiveName = "script-wf_$timestamp.tar.gz"

Write-Host "[1/6] Gerando pacote $archiveName..." -ForegroundColor Yellow

# Preferir tar (nativo do Windows 10+)
$tarPath = (Get-Command tar -ErrorAction SilentlyContinue).Path
if ($tarPath) {
  & tar --version *> $null
  # Excluir itens comuns que não precisam ir para o servidor
  $excludes = @(
    "--exclude=.git",
    "--exclude=**/node_modules",
    "--exclude=**/dist",
    "--exclude=temp",
    "--exclude=backend/temp",
    "--exclude=backend/Downloads",
    "--exclude=**/.env.local"
  )
  $tarArgs = @("-czf", $archiveName) + $excludes + @(".")
  & $tarPath $tarArgs
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar pacote com tar." }
}
else {
  # Fallback simples com Compress-Archive (pode levar mais tempo e não suporta exclude glob avançado)
  $zipName = "script-wf_$timestamp.zip"
  Write-Host "tar não encontrado; usando Compress-Archive ($zipName)." -ForegroundColor DarkYellow
  if (Test-Path $zipName) { Remove-Item $zipName -Force }
  Compress-Archive -Path * -DestinationPath $zipName -Force
  $archiveName = $zipName
}

# 2) Criar diretório remoto
Write-Host "[2/6] Garantindo diretório remoto $RemoteDir" -ForegroundColor Yellow
& ssh "$ServerUser@$ServerHost" "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { throw "Falha ao criar diretório remoto." }

# 3) Copiar pacote para o servidor
Write-Host "[3/6] Enviando pacote para o servidor..." -ForegroundColor Yellow
& scp "$archiveName" "${ServerUser}@${ServerHost}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar pacote via scp." }

# 4) Descompactar e preparar .env remoto (se fornecido)
Write-Host "[4/6] Extraindo pacote no servidor..." -ForegroundColor Yellow
$remoteArchive = "$RemoteDir/$archiveName"
& ssh "$ServerUser@$ServerHost" "cd $RemoteDir && tar -xzf $remoteArchive && rm -f $remoteArchive"
if ($LASTEXITCODE -ne 0) { throw "Falha ao extrair pacote no servidor." }

if ($EnvFileLocalPath -and (Test-Path $EnvFileLocalPath)) {
  Write-Host "[4b] Enviando .env para o servidor..." -ForegroundColor Yellow
  & scp "$EnvFileLocalPath" "${ServerUser}@${ServerHost}:${RemoteDir}/.env"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar .env." }
}
else {
  Write-Host "[4b] .env não fornecido; certifique-se de criar $RemoteDir/.env no servidor com DATABASE_URL e JWT_SECRET." -ForegroundColor DarkYellow
}

# 5) Subir stack (headless)
Write-Host "[5/6] Subindo Docker Compose em modo detach (-d)..." -ForegroundColor Yellow
& ssh "$ServerUser@$ServerHost" "cd $RemoteDir && docker compose -f docker-compose.prod.yml --env-file .env down && docker compose -f docker-compose.prod.yml --env-file .env up -d --build"
if ($LASTEXITCODE -ne 0) { throw "Falha ao subir docker compose no servidor." }

# 6) Aplicar migrações Prisma
Write-Host "[6/6] Aplicando migrações Prisma..." -ForegroundColor Yellow
& ssh "$ServerUser@$ServerHost" "cd $RemoteDir && docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Aviso: prisma migrate deploy retornou código $LASTEXITCODE. Verifique logs." -ForegroundColor DarkYellow
}

Write-Host "==== Deploy concluído. Verificando status..." -ForegroundColor Green
& ssh "$ServerUser@$ServerHost" "cd $RemoteDir && docker compose -f docker-compose.prod.yml ps && docker compose -f docker-compose.prod.yml logs --tail=50 backend"

Write-Host "Pronto. Stack no ar em modo headless (detached)." -ForegroundColor Green