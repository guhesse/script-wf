param(
  [string]$OutputDir = "backups/local_prod"
)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$filename = "local_prod_${ts}.sql"
$fullPath = Join-Path $OutputDir $filename

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "[LOCAL PROD BACKUP] Gerando dump para $fullPath"

$HOST='localhost'
$PORT=5432
$DB='scriptwf'
$USER='scriptwf'
$ENV:PGPASSWORD='ChangeMeStrong!'

pg_dump --clean --if-exists -h $HOST -p $PORT -U $USER -d $DB -F p -f $fullPath

if ($LASTEXITCODE -ne 0) { throw "Falha no pg_dump ($LASTEXITCODE)" }

Write-Host "[LOCAL PROD BACKUP] OK => $fullPath" -ForegroundColor Green
