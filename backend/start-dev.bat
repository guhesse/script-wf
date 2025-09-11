@echo off
cd /d "%~dp0"
echo Iniciando backend...
start cmd /k "node server.js"
echo Iniciando frontend...
cd frontend
start cmd /k "npx vite"
echo Ambos os servidores foram iniciados em janelas separadas.
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
pause