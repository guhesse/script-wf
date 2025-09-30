# Deploy com Docker (Dev e Produção)

Este documento descreve como rodar a stack com Docker localmente (incluindo Postgres) e em produção usando Supabase como banco.

## Visão Geral

Serviços principais:
- backend (Nest.js + Prisma)
- frontend (Vite/React servido via Nginx e atuando também como reverse proxy /api)
- db (apenas em `docker-compose.dev.yml` para ambiente local)

Em produção NÃO subimos o serviço `db`; usamos a instância gerenciada do Supabase (Postgres).

## Banco Local vs Supabase

| Ambiente | Fonte do Banco | Compose inclui Postgres? | URL usada em `DATABASE_URL` |
|----------|----------------|---------------------------|-----------------------------|
| Dev local | Container Postgres | Sim | `postgresql://scriptwf:scriptwf@db:5432/scriptwf?schema=public` |
| Produção | Supabase (Gerenciado) | Não | URL fornecida pelo Supabase (com usuário, host, porta, senha e `?schema=public`) |

### Importante sobre Prisma

- Para criar novas migrações: `npx prisma migrate dev` (LOCAL)
- Isso gera arquivos em `prisma/migrations/` que devem ser commitados.
- Em produção: `npx prisma migrate deploy` (aplica somente migrações pendentes, sem gerar novas).

### Supabase Particularidades

- Supabase já vem com schemas adicionais. Use `?schema=public` explicitamente na `DATABASE_URL`.
- Para seeds, criar script separado (`prisma/seed.ts`) e rodar manualmente: `node dist/prisma/seed.js` ou `ts-node prisma/seed.ts` (em build separado).

## Arquivos Principais

- `docker/backend.Dockerfile`
- `docker/frontend.Dockerfile`
- `docker/nginx.conf`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `.dockerignore`

## Rodando em Desenvolvimento

```bash
docker compose -f docker-compose.dev.yml up --build
```

Acesso:
- Frontend: http://localhost
- API (via proxy do Nginx no container frontend): http://localhost/api
- API direta (debug): http://localhost:3000
- Postgres: localhost:5432 (user: scriptwf / pass: scriptwf)

Logs:
```bash
docker compose -f docker-compose.dev.yml logs -f backend
```

Parar:
```bash
docker compose -f docker-compose.dev.yml down
```

## Rodando em Produção (VPS)

O `docker-compose.prod.yml` agora espera a variável `DATABASE_URL`. Ela é convertida internamente para `DATABASE_URL` no container do backend.

1. Criar arquivo `.env` na raiz com:
```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>?schema=public
JWT_SECRET=coloque_um_valor_forte
```

2. Baixar imagens (se usar pipeline com GHCR) e subir stack:
```bash
docker pull ghcr.io/<owner>/script-wf-backend:latest
docker pull ghcr.io/<owner>/script-wf-frontend:latest
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

3. Aplicar migrações (caso necessário):
```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

4. Ver logs:
```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

## Migrações - Fluxo Recomendado

1. Desenvolver localmente: modificar schema.prisma
2. Rodar: `npx prisma migrate dev --name <descricao>`
3. Testar
4. Commitar mudanças (incluindo pasta `prisma/migrations`)
5. Deploy: subir nova imagem backend
6. Executar: `npx prisma migrate deploy` em produção

## Seeds

Adicionar em `package.json`:
```json
"prisma": { "seed": "ts-node prisma/seed.ts" }
```
Rodar local: `npx prisma db seed`
Produção: usar container backend com script manual (não rodar seeds automaticamente sempre).

## Rollback Simples

Se migração quebrar:
- Restaurar backup (ideal fazer dump antes de migrações críticas)
- Ou criar nova migração corrigindo estado

## Acesso Supabase Seguro

- Não expor `DATABASE_URL` em imagens docker (usar variáveis no runtime)
- Usar secrets do orquestrador (ou arquivo `.env` com permissões restritas)

## Nginx / SSL

Para HTTPS na VPS, você pode:

1. Usar Nginx no host (recomendado) fazendo proxy para a porta 80 do container frontend.
2. Usar Traefik ou Caddy como container adicional para TLS automático.
3. Terminar TLS em um load balancer externo (caso futuro).

Exemplo (host Nginx) upstream:
```
server {
  listen 443 ssl;
  server_name seu-dominio.com;
  # ssl_certificate ...; ssl_certificate_key ...;
  location / { proxy_pass http://127.0.0.1:80; }
}
```

## Próximos Passos

- Adicionar healthcheck no backend
- Implementar script de deploy automatizado via GitHub Actions
- Adicionar camada de observabilidade (futuro)

---

Qualquer dúvida sobre diferenciação entre local e Supabase, consulte a seção "Banco Local vs Supabase" acima.
