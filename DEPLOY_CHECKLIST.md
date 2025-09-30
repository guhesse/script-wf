# 🚀 CHECKLIST DE DEPLOY - Upload CDN System

## ✅ **Pré-Deploy (Concluído)**
- [x] Commit realizado: `feat: implementar upload 100% CDN com sistema de limpeza automática`
- [x] Push para repositório feito
- [x] Todas as alterações estão na branch `prod`

## 🔧 **Configurações Necessárias**

### **1. Variáveis de Ambiente (.env)**
Verificar se estão configuradas na VPS:
```bash
# Bunny CDN (obrigatório)
BUNNY_STORAGE_ZONE=vml-workfront
BUNNY_CDN_BASE_URL=https://vml-workfront.b-cdn.net
BUNNY_STORAGE_HOST=storage.bunnycdn.com
BUNNY_API_KEY=6af42dba-3fc3-4d12-9c7dd787e6cd-6f2b-48ff

# Banco de dados
DATABASE_URL=postgresql://scriptwf_prod:[PASSWORD]@localhost:5432/scriptwf_prod

# JWT
JWT_SECRET=[SECRET_PROD]
```

### **2. Pasta temp no Bunny CDN**
- [x] Pasta `temp` já criada no Bunny CDN
- [x] Subpasta `staging` será criada automaticamente

## 🚀 **Executar Deploy**

### **Comando de Deploy:**
```bash
# Na VPS, executar:
cd /path/to/script-wf
./scripts/deploy-prod.sh
```

### **O que o script fará:**
1. ✅ Verificar branch prod
2. ✅ Pull das alterações
3. ✅ Parar containers atuais  
4. ✅ Rebuild com novas imagens
5. ✅ Subir containers atualizados
6. ✅ Aplicar migrações do Prisma (tabela temp_uploads)
7. ✅ Verificar status

## 🧪 **Pós-Deploy - Testes**

### **1. Verificar Sistema**
```bash
# Verificar containers rodando
docker-compose -f docker-compose.prod.yml ps

# Verificar logs do backend
docker-compose -f docker-compose.prod.yml logs backend

# Verificar nginx
docker-compose -f docker-compose.prod.yml logs frontend
```

### **2. Testar Upload CDN**
- [ ] Acessar: http://hesse.app.br
- [ ] Fazer login no sistema
- [ ] Testar upload arquivo pequeno (<30MB)
- [ ] Testar upload arquivo grande (>30MB) 
- [ ] Verificar se não há erro 413
- [ ] Confirmar que arquivos vão para Bunny CDN

### **3. Verificar APIs**
```bash
# Verificar health
curl http://hesse.app.br/api/health

# Verificar estatísticas (logado)
curl http://hesse.app.br/api/admin/temp-uploads/stats \
  -H "Authorization: Bearer TOKEN"
```

## 🔍 **Monitoramento**

### **Logs Importantes:**
```bash
# Sistema de limpeza (após 00:00)
docker-compose logs | grep "Limpeza automática"

# Uploads CDN
docker-compose logs | grep "Upload CDN"

# Erros gerais
docker-compose logs | grep ERROR
```

### **Bunny CDN Dashboard:**
- Verificar uso de storage na pasta `temp`
- Monitorar tráfego de uploads
- Confirmar limpeza automática funcionando

## 🎯 **Resultado Esperado**

✅ **Zero erro 413** para qualquer tamanho de arquivo  
✅ **Upload transparente** via Bunny CDN  
✅ **VPS protegida** de sobrecarga  
✅ **Limpeza automática** funcionando  
✅ **Sistema escalável** para arquivos grandes  

---

**Data do Deploy:** ___________  
**Responsável:** ___________  
**Status:** [ ] Sucesso [ ] Falha [ ] Parcial  

## 🆘 **Rollback (se necessário)**
```bash
# Voltar para versão anterior
git checkout [COMMIT_ANTERIOR]
./scripts/deploy-prod.sh
```