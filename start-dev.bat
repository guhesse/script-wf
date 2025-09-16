@echo off
cd /d "%~dp0"
echo Iniciando backend Nest.js...
cd backend
start cmd /k "npm run start:dev"
echo Iniciando frontend...
cd ..
cd frontend
start cmd /k "npm run dev"
echo Ambos os servidores foram iniciados em janelas separadas.
echo Backend (Nest.js): http://localhost:3000
echo Frontend: http://localhost:5173
echo API Docs (Swagger): http://localhost:3000/docs
pause