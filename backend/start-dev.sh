#!/bin/bash
# Script para desenvolvimento no Linux/Mac

echo "Iniciando servidores de desenvolvimento..."

# Inicia o backend em background
echo "Iniciando backend..."
node server.js &

# Inicia o frontend
echo "Iniciando frontend..."
cd frontend
npx vite

# Mata os processos quando o script termina
trap "kill 0" EXIT