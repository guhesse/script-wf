# Fluxo de Autenticação (Aplicação + Workfront)

Este frontend agora possui **duas camadas** de autenticação:

1. **Autenticação da Aplicação (JWT)** – Registro/Login via `/api/app-auth/*`.
2. **Sessão Workfront** – Login automatizado via rota `/api/login` (abre Playwright). Usada apenas para módulos que interagem com Workfront.

## Ordem do fluxo

1. Usuário acessa a aplicação: se não houver token JWT, vê a tela de Registro/Login.
2. Após login da aplicação, caso não esteja conectado ao Workfront, aparece um badge/flutuante no topo direito com botão “Login Workfront”.
3. Depois do login Workfront, todas as seções habilitadas são liberadas.
4. A Biblioteca de Masters (Masters) pode ser exibida mesmo sem Workfront se desejável (gating futuro configurável).

## Componentes principais

* `AuthProvider` (`useAppAuth.tsx`): mantém estado global de usuário + token.
* `AuthScreen`: tela com abas para primeiro registro ou login.
* `App.tsx`: controla transições (app auth vs sessão Workfront).
* `MainApplication.tsx`: interface principal.

## Armazenamento

* Token JWT: `localStorage` (`app_jwt_token`).
* Usuário: `localStorage` (`app_jwt_user`).

## Logout

Botão “Sair” limpa token, usuário e (opcional) cache Workfront.

## Próximos Passos Sugeridos

* Forçar seções Workfront a exibirem placeholder se Workfront não estiver conectado.
* Injetar automaticamente header `Authorization` em fetchs (ainda não necessário para endpoints Workfront).
* Exibir detalhes da sessão Workfront (idade, expiração) em tooltip.
* Adicionar refresh token (backend) se necessário.

## Convenções Rápidas

* Roles disponíveis: `ADMIN`, `EDITOR`, `VIEWER` (ver backend `AUTH_ROLES.md`).
* Primeiro registro vira ADMIN (backend bloqueia novos registros diretos depois).

