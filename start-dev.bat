@echo off
cd /d "%~dp0"
echo Iniciando backend...
cd backend
start cmd /k "node server.js"
echo Iniciando frontend...
cd ..
cd frontend
start cmd /k "npm run dev"
echo Ambos os servidores foram iniciados em janelas separadas.
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
pause