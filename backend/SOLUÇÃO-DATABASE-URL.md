# SOLUÇÃO PARA PROBLEMA DE DATABASE_URL no Windows

## Problema
O Prisma não consegue ler a DATABASE_URL do arquivo .env devido a conflitos com variáveis de ambiente globais do sistema.

## Soluções (em ordem de preferência):

### 1. URL direta no schema (desenvolvimento)
```prisma
datasource db {
  provider = "postgresql"
  url      = "sua_url_aqui"
}
```

### 2. Arquivo .env específico com dotenv-cli
```bash
npm install --save-dev dotenv-cli
```

Criar `.env.prisma`:
```
DATABASE_URL="sua_url_aqui"
```

Scripts no package.json:
```json
{
  "db:push": "dotenv -e .env.prisma -- prisma db push",
  "db:generate": "dotenv -e .env.prisma -- prisma generate"
}
```

### 3. Verificar variáveis globais do sistema
```bash
# PowerShell - verificar se existe DATABASE_URL global
Get-ChildItem Env:DATABASE_URL

# CMD
echo %DATABASE_URL%
```

### 4. Usar .env.local
O Prisma às vezes lê .env.local com mais prioridade.

### 5. Para produção
Use variáveis de ambiente do sistema/deployment platform.