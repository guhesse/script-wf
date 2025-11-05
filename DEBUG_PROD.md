# ============================================
# GUIA RÁPIDO - DEBUG EM PRODUÇÃO
# ============================================

## 🚀 Rebuild Rápido (30-60s)

```bash
# No servidor
cd /var/www/script-wf
./scripts/rebuild-prod-fast.sh
```

**O que faz:**
1. Git pull
2. Rebuild otimizado com cache (30-60s)
3. Recria containers
4. Mostra status

---

## 🔄 Restart Rápido (sem rebuild)

```bash
# Restart apenas backend
./scripts/quick-restart.sh backend

# Restart apenas frontend
./scripts/quick-restart.sh frontend
```

**Quando usar:**
- Mudanças em variáveis de ambiente
- Problemas de conexão
- Container travado

---

## 📝 Ver Logs em Tempo Real

```bash
# Logs do backend
./scripts/debug-logs.sh backend

# Logs do frontend
./scripts/debug-logs.sh frontend

# Todos os logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🐚 Acessar Shell do Container

```bash
# Entrar no backend
./scripts/shell.sh backend

# Comandos úteis dentro do container:
node --version
npm list
ls -la dist/
cat .env
```

---

## ⚡ Comandos Rápidos

```bash
# Status dos containers
docker-compose -f docker-compose.prod.yml ps

# Parar tudo
docker-compose -f docker-compose.prod.yml down

# Iniciar tudo
docker-compose -f docker-compose.prod.yml up -d

# Ver uso de recursos
docker stats

# Limpar cache (cuidado!)
docker system prune -f
```

---

## 🔧 Workflow de Debug

```bash
# 1. Ver logs para identificar problema
./scripts/debug-logs.sh backend

# 2. Fazer mudanças no código local e push
git add .
git commit -m "fix: corrige problema X"
git push

# 3. Rebuild rápido no servidor
ssh root@147.93.68.250
cd /var/www/script-wf
./scripts/rebuild-prod-fast.sh

# 4. Acompanhar logs
./scripts/debug-logs.sh backend
```

---

## 🐛 Troubleshooting

### Container não inicia?
```bash
# Ver logs completos
docker-compose -f docker-compose.prod.yml logs backend

# Verificar erros
docker-compose -f docker-compose.prod.yml ps
```

### Rebuild ainda está lento?
```bash
# Verifica se BuildKit está ativo
docker buildx version

# Limpa cache antigo (última opção)
docker builder prune -f
```

### Prisma não funcionando?
```bash
# Entra no container
./scripts/shell.sh backend

# Roda migrate
npx prisma migrate deploy

# Gera client
npx prisma generate
```

---

## 📊 Performance Esperada

| Operação | Tempo |
|----------|-------|
| Rebuild completo | 30-60s |
| Restart serviço | 5-10s |
| Ver logs | instantâneo |
| Git pull + rebuild | 40-70s |

---

**Antes: 3-5min de rebuild 🐌**  
**Agora: 30-60s de rebuild 🚀**
