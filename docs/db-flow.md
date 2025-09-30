# Fluxo de Bancos & Migrações

## Objetivo

Manter um único banco local para desenvolvimento (isolado) e aplicar migrações de forma segura antes de enviar para produção.

## Ambientes

- Produção (remota): controlada via `DATABASE_URL` no deploy.
- Desenvolvimento Local: container único `db` (porta 5432) + PGAdmin opcional.

## Ordem de Trabalho

1. Alterar modelos em `prisma/schema.prisma`.
2. Executar: `npx prisma migrate dev` (gera/aplica migração no banco local dev).
3. Validar funcionamento / seeds / testes.
4. Commitar migrações geradas.
5. Em deploy: usar `npx prisma migrate deploy` para aplicar em produção.

## Seeds

- Manter somente dados essenciais (roles, admin). Evitar massa grande.
- Colocar script em `prisma/seed.ts` (quando necessário) e rodar em dev.

## Anonimização (Snapshot Ocasional)

Quando precisar inspecionar dados reais:

1. Fazer dump da produção (servidor remoto).
2. Rodar script de anonimização (futuro) localmente.
3. Subir container efêmero ou restaurar em schema separado para análise.
4. Derrubar após uso.

## Backup & Restore (Dev)

Scripts em `scripts/db/`:

- `backup-dev.ps1` -> Dump do banco dev.
- `restore-dev.ps1 -BackupFile <arquivo>` -> Restaura dump sobrescrevendo schema public.

## Variáveis Principais (.env)

- `DEV_DATABASE_URL` -> URL local para desenvolvimento.
- `DATABASE_URL` -> Produção/Staging (fallback usa DEV em ambiente local).
- `LOCAL_DATABASE_URL` -> Alias de compatibilidade (apontando para dev).

## Boas Práticas

- Nunca rodar `migrate dev` apontando para produção.
- Em produção, sempre `migrate deploy` (não gera novas migrações).
- Revisar diffs antes de commitar.
- Evitar mudanças destrutivas sem plano de migração manual (renames grandes, drops diretos).

## Próximos Passos (Sugestões)

- Criar script de anonimização.
- Agendar backup dev (opcional) se dados forem valiosos.
- Adicionar testes de integridade (ex: script que checa se todas migrações foram aplicadas).

