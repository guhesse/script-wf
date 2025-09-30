# PGAdmin - Recomendações de Segurança (Produção)

## Objetivo

Garantir que a interface de administração não exponha dados sensíveis nem sirva como vetor de ataque ao seu Postgres de produção.

## Princípios Gerais

- Minimizar superfície de ataque.
- Restringir acesso por rede/VPN.
- Segregar credenciais e privilégios.
- Monitorar e auditar acessos.

## Checklist Essencial

1. Rodar PGAdmin atrás de um reverse proxy (Nginx / Caddy / Traefik) com TLS válido (Let's Encrypt).
2. Proteger acesso via Basic Auth adicional ou SSO (opcional) além do login PGAdmin.
3. Limitar origem IP (firewall / security group) somente para IP fixo ou VPN.
4. Usar usuário PGAdmin dedicado (não reutilizar email pessoal).
5. Ativar logs persistentes do container.
6. Fazer backup periódico do volume do PGAdmin (contém armazenados os servidores registrados e preferências).

## Rede / Deploy

- Se usar Docker: não expor porta 80/pgadmin diretamente (bind apenas em rede interna). Expor apenas o proxy.
- Criar rede docker dedicada: `docker network create internal_admin` e conectar containers.
- Evitar rodar PGAdmin no mesmo host público sem proteção.

## Credenciais

- Senha forte (>16 chars, híbrida) para PGADMIN_DEFAULT_PASSWORD.
- Rotacionar senhas a cada 90 dias.
- Desabilitar contas não usadas.

## Acesso ao Postgres

- Criar ROLE administrativa exclusiva para PGAdmin (ex: `pgadmin_admin`) com apenas os privilégios necessários.
- Não usar superuser `postgres` diretamente exceto emergências.
- Implementar política de senhas no Postgres (`password_encryption = scram-sha-256`).

## Logs & Auditoria

- Capturar logs de acesso via proxy (IP, timestamps).
- Ativar parâmetros no Postgres para auditoria mínima:
  - `log_connections = on`
  - `log_disconnections = on`
  - `log_statement = 'ddl'` (ou mais granular se necessário)
- Centralizar logs (ELK / Loki / CloudWatch / etc.) futuramente.

## Backups

- PGAdmin não substitui estratégia de backup.
- Manter dumps automatizados (pg_dump + compressão) e, se possível, base física (pg_basebackup) para DR.
- Testar restore periodicamente.

## TLS

- Forçar HTTPS no proxy: redirect 80 -> 443.
- Usar cabeçalhos de segurança:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'self'` (ajustar conforme necessidade)

## Atualizações

- Manter imagem PGAdmin atualizada (verificar tags). Ex: `dpage/pgadmin4:latest` ou versão fixa e revisar mensalmente.
- Aplicar patches de Postgres conforme CVEs críticas.

## Hardening Opcional

- WAF simples (Cloudflare / Nginx ModSecurity) se exposto publicamente.
- MFA via IdP externo com túnel (ex: Authelia + OIDC) antes do PGAdmin.
- Port knocking / WireGuard para expor só internamente.

## Procedimento de Incidente

1. Revogar credenciais expostas.
2. Forçar rotação de senhas e tokens.
3. Auditar últimas conexões e queries suspeitas.
4. Restaurar backup consistente se necessário.

## Próximos Passos

- Integrar monitoramento básico (uptime + erros 5xx) do proxy.
- Implementar anonimização de dumps antes de circular dados.
- Automatizar rotação de senhas com secret manager.
