# Habilitar BuildKit
$env:DOCKER_BUILDKIT=1
$env:COMPOSE_DOCKER_CLI_BUILD=1

# Detectar comando docker compose
$dockerComposeCmd = $null
if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    $composeTest = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerComposeCmd = "docker", "compose"
        Write-Host "✅ Usando: docker compose (versão nova)" -ForegroundColor Green
    }
}
if (-not $dockerComposeCmd -and (Get-Command "docker-compose" -ErrorAction SilentlyContinue)) {
    $dockerComposeCmd = "docker-compose"
    Write-Host "✅ Usando: docker-compose (versão antiga)" -ForegroundColor Green
}
if (-not $dockerComposeCmd) {
    Write-Host "❌ Erro: Nem 'docker compose' nem 'docker-compose' encontrado!" -ForegroundColor Red
    exit 1
}

function Invoke-DockerCompose {
    param([string[]]$Arguments)
    if ($dockerComposeCmd -is [array]) {
        & $dockerComposeCmd[0] $dockerComposeCmd[1] @Arguments
    } else {
        & $dockerComposeCmd @Arguments
    }
}

function Build-Full {
    Write-Host "🏗️ Build completo (com dependências)..." -ForegroundColor Yellow
    Invoke-DockerCompose build --no-cache
    $backendId = Invoke-DockerCompose images -q backend
    if ($backendId) {
        docker tag $backendId script-wf-backend-deps:latest
        Write-Host "✅ Tagged dependencies layer para cache" -ForegroundColor Green
    }
}

function Build-Fast {
    Write-Host "⚡ Build rápido (sem reinstalar dependências)..." -ForegroundColor Green
    Invoke-DockerCompose build
}

function Rebuild-And-Run {
    Build-Fast
    Write-Host "🔄 Reiniciando containers..." -ForegroundColor Cyan
    Invoke-DockerCompose up -d
    Write-Host "📋 Logs (Ctrl+C para sair):" -ForegroundColor Blue
    Invoke-DockerCompose logs -f backend
}

function Show-CacheInfo {
    Write-Host "📊 Informações de cache:" -ForegroundColor Blue
    docker system df -v
}

function Clean-Cache {
    Write-Host "🧹 Limpando cache de build..." -ForegroundColor Red
    docker builder prune -f
    Write-Host "✅ Cache limpo!" -ForegroundColor Green
}

function Stop-Containers {
    Write-Host "🛑 Parando containers..." -ForegroundColor Yellow
    Invoke-DockerCompose down
}

function Show-Logs {
    Write-Host "📋 Logs do backend:" -ForegroundColor Blue
    Invoke-DockerCompose logs -f backend
}

function Show-Status {
    Write-Host "📊 Status dos containers:" -ForegroundColor Cyan
    Invoke-DockerCompose ps
}

# Menu
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('full','fast','rebuild','cache-info','cache-clean','stop','logs','status')]
    [string]$Action
)

switch ($Action) {
    'full' { Build-Full }
    'fast' { Build-Fast }
    'rebuild' { Rebuild-And-Run }
    'cache-info' { Show-CacheInfo }
    'cache-clean' { Clean-Cache }
    'stop' { Stop-Containers }
    'logs' { Show-Logs }
    'status' { Show-Status }
}
