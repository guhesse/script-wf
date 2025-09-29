# Deploy com Docker (Dev e Produção)

Este documento descreve como rodar a stack com Docker localmente (incluindo Postgres) e em produção usando Supabase como banco.

## Visão Geral

Serviços principais:
- backend (Nest.js + Prisma)
- frontend (Vite/React, servido via Nginx)
- proxy (Nginx reverse proxy + entrega do frontend)
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
- Frontend: http://localhost (via proxy) ou http://localhost:5173 (se exposto)
- API: http://localhost/api (proxy) ou http://localhost:3000 direto
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

1. Criar arquivo `.env` na raiz com:
```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>?schema=public
JWT_SECRET=coloque_um_valor_forte
```

2. Build e subir:
```bash
docker compose -f docker-compose.prod.yml build
# Opcional: usar --pull para atualizar bases
DATABASE_URL=... JWT_SECRET=... docker compose -f docker-compose.prod.yml up -d
```

3. Aplicar migrações (se não adicionarmos entrypoint automatizado):
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

Para HTTPS na VPS, recomenda-se colocar um Nginx externo (host) com Certbot e apontar para `proxy:80` ou substituir o container proxy por uma solução com certificados montados em volume.

Exemplo (host Nginx) upstream:
```
location / {
  proxy_pass http://127.0.0.1:8080; # mapear porta do container proxy
}
```

## Próximos Passos

- Adicionar healthcheck no backend
- Implementar script de deploy automatizado via GitHub Actions
- Adicionar camada de observabilidade (futuro)

---

Qualquer dúvida sobre diferenciação entre local e Supabase, consulte a seção "Banco Local vs Supabase" acima.
