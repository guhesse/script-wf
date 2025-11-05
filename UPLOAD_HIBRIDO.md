# Sistema de Upload Híbrido - Bunny CDN + VPS

## Resumo da Implementação

Implementamos um sistema híbrido de upload que resolve o problema do erro 413 (Request Entity Too Large) usando duas estratégias:

### 1. Configurações de Servidor (Solução para arquivos médios)
- **nginx.conf**: `client_max_body_size 100M` + timeouts otimizados
- **NestJS main.ts**: Limites do express aumentados para 100MB
- **Multer**: Configurado para aceitar até 100MB por arquivo

### 2. Upload Direto CDN (Solução para arquivos grandes)
- **Limite automático**: Arquivos > 30MB são redirecionados para upload direto
- **Bunny CDN**: Pasta `temp` já criada para armazenamento temporário
- **Limpeza automática**: Sistema de limpeza às 00h diariamente

## Estrutura dos Arquivos

### Backend
```
backend/src/
├── services/
│   ├── bunny-upload-url.service.ts     # Gera URLs assinadas do CDN
│   └── cleanup-scheduler.service.ts    # Limpeza automática diária
├── modules/workfront/
│   └── workfront.controller.ts         # Rotas híbridas de upload
└── prisma/schema.prisma                # Tabela temp_uploads
```

### Frontend
```
frontend/src/
├── hooks/
│   └── useDirectUpload.ts              # Hook para upload direto CDN
└── components/
    └── UploadSection.tsx               # Interface híbrida com indicadores
```

## Como Funciona

### Fluxo Automático
1. **Arquivo ≤ 30MB**: Upload tradicional via servidor (multipart/form-data)
2. **Arquivo > 30MB**: 
   - Frontend solicita URL assinada do CDN
   - Upload direto para Bunny CDN
   - Arquivo marcado como "usado" após sucesso
   - Limpeza automática após 24h de uso

### Indicadores Visuais
- Badge "Upload CDN" aparece automaticamente para arquivos grandes
- Tamanho do arquivo exibido em MB
- Aviso "Arquivos > 30MB usam upload direto CDN"

## Endpoints da API

### Upload Tradicional (≤ 30MB)
```
POST /api/upload/prepare
- Multipart form-data
- Salva em Downloads/staging local
```

### Upload Direto CDN (> 30MB)
```
POST /api/upload/generate-direct-url
- Gera URL assinada do Bunny CDN
- Retorna uploadId, uploadUrl, headers

POST /api/upload/mark-used/:uploadId
- Marca arquivo como utilizado após upload
```

### Administração
```
GET /api/admin/temp-uploads/stats
- Estatísticas de uploads temporários

POST /api/admin/temp-uploads/cleanup
- Limpeza manual (para testes)
```

## Sistema de Limpeza

### Automática (Produção)
- **Horário**: Diariamente às 00:00
- **Critérios**: 
  - Arquivos expirados (> 2 horas sem uso)
  - Arquivos utilizados com > 24 horas

### Manual (Desenvolvimento)
```bash
# Via API
curl -X POST /api/admin/temp-uploads/cleanup \
  -H "Authorization: Bearer TOKEN"
```

## Para Testar

### 1. Deploy das Configurações
```bash
# Backend - aplicar mudanças
cd backend
docker-compose up -d --build

# Verificar nginx
docker exec -it script-wf-frontend-1 nginx -t
```

### 2. Testar Upload Pequeno (< 30MB)
- Subir arquivo ZIP < 30MB
- Deve aparecer sem badge "Upload CDN"
- Upload via servidor tradicional

### 3. Testar Upload Grande (> 30MB)
- Subir arquivo ZIP > 30MB  
- Deve aparecer badge "Upload CDN"
- Upload direto para Bunny CDN
- Verificar no painel Bunny: pasta `temp/staging/`

### 4. Verificar Limpeza
```bash
# Estatísticas
curl /api/admin/temp-uploads/stats

# Limpeza manual
curl -X POST /api/admin/temp-uploads/cleanup
```

## Benefícios

1. **Reduz carga da VPS**: Arquivos grandes vão direto para CDN
2. **Resolve erro 413**: Sem limite de tamanho no upload direto
3. **Transparente**: Usuário não precisa escolher método
4. **Automático**: Limpeza sem intervenção manual
5. **Eficiente**: CDN global do Bunny para velocidade

## Monitoramento

- Logs do sistema mostram uploads diretos
- Estatísticas via API administrativa  
- Painel Bunny CDN mostra uso de storage
- Limpeza automática registrada nos logs

O sistema está pronto para produção e deve resolver completamente o problema de uploads grandes que causavam erro 413.