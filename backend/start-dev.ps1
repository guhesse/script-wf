# Script PowerShell para desenvolvimento
Write-Host "Iniciando servidores de desenvolvimento..." -ForegroundColor Green

# Função para iniciar processo em nova janela
function Start-DevServer {
    param($Name, $Command, $WorkingDirectory = $PWD)
    
    Write-Host "Iniciando $Name..." -ForegroundColor Yellow
    
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = "-NoExit -Command `"Set-Location '$WorkingDirectory'; $Command`""
    $startInfo.UseShellExecute = $true
    $startInfo.WindowStyle = "Normal"
    
    [System.Diagnostics.Process]::Start($startInfo) | Out-Null
}

# Inicia o backend
Start-DevServer -Name "Backend" -Command "node server.js"

# Inicia o frontend
$frontendPath = Join-Path $PWD "frontend"
Start-DevServer -Name "Frontend" -Command "npx vite" -WorkingDirectory $frontendPath

Write-Host ""
Write-Host "Servidores iniciados!" -ForegroundColor Green
Write-Host "Backend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione qualquer tecla para continuar..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")