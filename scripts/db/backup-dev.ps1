param(
  [string]$OutputDir = "backups/dev"
)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$filename = "dev_${ts}.sql"
$fullPath = Join-Path $OutputDir $filename

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "[DEV BACKUP] Gerando dump para $fullPath"

# Variáveis (ajuste se necessário)
$HOST='localhost'
$PORT=5434
$DB='scriptwf_dev'
$USER='scriptwfdev'
$ENV:PGPASSWORD='ChangeMeDev!'

# Requer pg_dump instalado no PATH
pg_dump --clean --if-exists -h $HOST -p $PORT -U $USER -d $DB -F p -f $fullPath

if ($LASTEXITCODE -ne 0) { throw "Falha no pg_dump ($LASTEXITCODE)" }

Write-Host "[DEV BACKUP] OK => $fullPath" -ForegroundColor Green
