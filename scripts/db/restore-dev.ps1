param(
  [string]$BackupFile
)

if (-not $BackupFile) { throw 'Informe -BackupFile caminho para dump (sql)' }
if (-not (Test-Path $BackupFile)) { throw "Arquivo nao encontrado: $BackupFile" }

$ErrorActionPreference = 'Stop'

Write-Host "[RESTORE DEV] Carregando $BackupFile" -ForegroundColor Yellow

$HOST='localhost'
$PORT=5432
$DB='scriptwf_dev'
$USER='scriptwfdev'
$ENV:PGPASSWORD='ChangeMeDev!'

psql -h $HOST -p $PORT -U $USER -d $DB -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
psql -h $HOST -p $PORT -U $USER -d $DB -f $BackupFile

if ($LASTEXITCODE -ne 0) { throw "Falha no restore ($LASTEXITCODE)" }

Write-Host "[RESTORE DEV] Concluido" -ForegroundColor Green
