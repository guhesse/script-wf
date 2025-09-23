# Autenticação e Perfis (RBAC)

Este backend agora suporta usuários com papéis (roles):

* ADMIN: acesso total (criar usuários, gerenciar masters, arquivar, consolidar)
* EDITOR: criar / atualizar / upload de masters
* VIEWER: apenas leitura (listar / obter)

## Fluxo inicial

1. Rode migrations e generate (já feito): `npx prisma migrate dev`
2. (Opcional) Verifique o modelo `User` no Prisma Studio: `npx prisma studio`
3. Registre o primeiro usuário via `POST /api/app-auth/register` (não precisa token se for o primeiro; ele vira ADMIN automaticamente). Após existir um usuário, esta rota passa a retornar 403 e novos usuários devem ser criados via `POST /api/users` autenticado como ADMIN:

```json
{
  "name": "Admin Seed",
  "email": "admin@example.com",
  "password": "changeme123"
}
```

1. Guarde o `accessToken` retornado.
2. Para logar depois: `POST /api/app-auth/login` com email/senha.

## Headers

Enviar nos endpoints protegidos:

```text
Authorization: Bearer <token>
```

## Endpoints adicionados

* POST /api/app-auth/register (apenas antes do primeiro usuário)
* POST /api/app-auth/login
* GET  /api/users (ADMIN)
* POST /api/users (ADMIN)

## Proteções aplicadas em `MastersController`

* Criar, upload, update: EDITOR ou ADMIN
* Arquivar, consolidar: ADMIN
* Listar / obter / meta: público (avaliar se precisa restringir no futuro)

## Próximos passos sugeridos

* Restringir leitura a usuários autenticados (se necessário)
* Adicionar refresh token
* Registrar auditoria (quem criou/alterou/arquivou)
* Adicionar recuperação de senha / troca de senha
* Implementar rota para promover/demover roles (apenas ADMIN)

## Variáveis de ambiente

Adicionar em `.env` (gerar novo valor forte em produção):

```bash
JWT_SECRET=defina_um_segredo_forte_aqui
```

## Observações

Enquanto o client Prisma não for regenerado, use `npx prisma generate` para garantir que o enum Role e o modelo User estão disponíveis.
