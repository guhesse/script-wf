param(
  [string]$BackupFile
)

if (-not $BackupFile) { throw 'Informe -BackupFile caminho para dump local_prod (sql)' }
if (-not (Test-Path $BackupFile)) { throw "Arquivo nao encontrado: $BackupFile" }

$ErrorActionPreference = 'Stop'

Write-Host "[RESTORE] Carregando $BackupFile para banco DEV" -ForegroundColor Yellow

$DEV_HOST='localhost'
$DEV_PORT=5434
$DEV_DB='scriptwf_dev'
$DEV_USER='scriptwfdev'
$ENV:PGPASSWORD='ChangeMeDev!'

# Drop + recreate schema public (opcional) - cuidado se tiver extensões custom
psql -h $DEV_HOST -p $DEV_PORT -U $DEV_USER -d $DEV_DB -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Restore
psql -h $DEV_HOST -p $DEV_PORT -U $DEV_USER -d $DEV_DB -f $BackupFile

if ($LASTEXITCODE -ne 0) { throw "Falha no restore ($LASTEXITCODE)" }

Write-Host "[RESTORE] Concluido com sucesso" -ForegroundColor Green
