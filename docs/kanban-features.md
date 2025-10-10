# 📋 Kanban Board - Documentação de Features

## 🎯 Visão Geral

Sistema completo de Kanban para gerenciamento de jobs de design, desenvolvido com NestJS (backend) e React + shadcn/ui (frontend).

**Data da última atualização:** 9 de outubro de 2025  
**Status:** ✅ Produção - 1980 registros importados

---

## ✨ Features Implementadas

### 1. **Board Kanban com Drag & Drop**
- ✅ 7 colunas de status (Backlog → Completed)
- ✅ Drag and drop entre colunas com @dnd-kit
- ✅ Feedback visual ao arrastar (rotação 3°, escala 105%, sombra intensa)
- ✅ Área de drop com highlight e placeholder "Solte o card aqui"
- ✅ Scroll horizontal no board (h-[calc(100vh-230px)])
- ✅ Scroll vertical nas colunas com altura mínima de 400px
- ✅ Largura fixa de 320px por coluna

### 2. **Cards do Kanban**
- ✅ Exibição de informações essenciais (atividade, DSID, status, cliente, brand)
- ✅ Badges coloridos para Status (customizáveis)
- ✅ Badge de Round editável inline (R1-R12) via popover
- ✅ Badge de Studio editável inline (Sem Studio, Rô, Tay, Gus) via popover
- ✅ Badge BI para indicar Business Intelligence
- ✅ Metadados: tipo asset, número de assets, datas
- ✅ Barras de progresso para % dias na VML vs Dell
- ✅ Opacidade 30% no card original durante drag

### 3. **Formulário de Criação/Edição**
- ✅ Modal com 4 tabs organizadas:
  - **Básico:** Atividade, DSID, Status, BI, Anotações
  - **Cliente:** Cliente, Brand, Studio, Frente
  - **Config:** VF, Tipo Asset, Número Assets, Week, Quarter, FY
  - **Datas:** Início, Previsão, Real, R1-R4 (entregas VML + feedbacks Dell)
- ✅ Validação obrigatória do campo Atividade
- ✅ Dropdowns com opções pré-definidas
- ✅ Conversão de strings vazias para undefined
- ✅ Toast de sucesso/erro

### 4. **Filtros e Busca**
- ✅ Painel de filtros expansível
- ✅ Filtros disponíveis: Week, Quarter, Cliente, Brand
- ✅ Botão "Limpar Filtros"
- ✅ Aplicação em tempo real

### 5. **Personalização de Cores**
- ✅ Painel de personalização com tabs (Status | Studio)
- ✅ 19 cores disponíveis na paleta (Slate, Gray, Red, Orange, etc.)
- ✅ Preview em tempo real das cores
- ✅ Salvar/restaurar cores no localStorage
- ✅ Sincronização entre tabs via evento customizado
- ✅ Botão "Restaurar" para cores padrão

### 6. **Estatísticas**
- ✅ Total de cards
- ✅ Cards por status (3 primeiros)
- ✅ Cards por frente
- ✅ Top clientes
- ✅ Painel expansível

### 7. **UI/UX Melhorias**
- ✅ Menu lateral colapsável (botão Menu/X)
- ✅ Seletor de data no header (inicia com hoje)
- ✅ Toggle "Mostrar/Ocultar colunas vazias"
- ✅ Layout horizontal com scroll suave
- ✅ Dark theme com backdrop blur
- ✅ Animações e transições suaves
- ✅ Icons do Lucide React
- ✅ Toast notifications (sonner) - apenas erros exibidos

### 8. **Backend Features**
- ✅ CRUD completo de cards
- ✅ Endpoint de movimento (drag & drop)
- ✅ Cálculo automático de % dias VML vs Dell
- ✅ Cálculo de dias entre entregas/feedbacks
- ✅ Filtros avançados
- ✅ Estatísticas agregadas
- ✅ Auditoria (createdBy, updatedBy)

### 9. **Importação de Dados**
- ✅ Script de importação (backend/src/scripts/import-kanban-data.ts)
- ✅ Suporte a CSV/JSON
- ✅ Mapeamento de campos uppercase (ATIVIDADE, STATUS, etc.)
- ✅ Conversão de enums (Status, VF, Asset, Frente, FY)
- ✅ Parse de datas (DD/MM/YYYY e YYYY-MM-DD)
- ✅ Logging a cada 10 registros
- ✅ Relatório de erros
- ✅ **1980 registros importados com sucesso** ✅

---

## 📊 Enums e Tipos

### KanbanStatus (7 valores)
```typescript
BACKLOG | FILES_TO_STUDIO | REVISAO_TEXTO | REVIEW_DELL | 
FINAL_MATERIAL | ASSET_RELEASE | COMPLETED
```

### VFType (3 valores)
```typescript
NO_VF | MICROSOFT_JMA_CS | OTHER
```

### AssetType (9 valores)
```typescript
ESTATICO | VIDEO | WIREFRAME | GIF | STORY | 
MOLDURA | AW_STORY | HTML | OTHER
```

### WorkfrontFrente (4 valores) - **Atualizado!**
```typescript
OOH | SOCIAL | EMAIL | BANNER
```
- **Removidos:** DISPLAY, LANDING_PAGE, PRINT, OTHER
- **Migração:** Dados convertidos automaticamente via SQL manual

### FiscalYear (4 valores)
```typescript
FY25 | FY26 | FY27 | FY28
```

---

## 🎨 Cores Padrão

### Status Colors
- **BACKLOG:** Slate (bg-slate-900/50, border-slate-600/40, text-slate-400)
- **FILES_TO_STUDIO:** Blue (bg-blue-900/50, border-blue-600/40, text-blue-400)
- **REVISAO_TEXTO:** Purple (bg-purple-900/50, border-purple-600/40, text-purple-400)
- **REVIEW_DELL:** Yellow (bg-yellow-900/50, border-yellow-600/40, text-yellow-400)
- **FINAL_MATERIAL:** Orange (bg-orange-900/50, border-orange-600/40, text-orange-400)
- **ASSET_RELEASE:** Cyan (bg-cyan-900/50, border-cyan-600/40, text-cyan-400)
- **COMPLETED:** Green (bg-green-900/50, border-green-600/40, text-green-400)

### Studio Colors
- **Sem Studio:** Gray (bg-gray-700/50, border-gray-600/40, text-gray-400)
- **Rô:** Pink (bg-pink-900/50, border-pink-600/40, text-pink-400)
- **Tay:** Indigo (bg-indigo-900/50, border-indigo-600/40, text-indigo-400)
- **Gus:** Emerald (bg-emerald-900/50, border-emerald-600/40, text-emerald-400)

---

## 🔄 Fluxo de Trabalho Típico

1. **Novo Job chega** → Criar card no Backlog
2. **Files prontos** → Arrastar para "Files to Studio"
3. **Studio designado** → Clicar no badge Studio e selecionar (Rô/Tay/Gus)
4. **Round definido** → Clicar no badge Round e selecionar (R1-R12)
5. **Texto revisado** → Mover para "Revisão de Texto"
6. **Enviado para Dell** → Mover para "Review Dell"
7. **Material finalizado** → Mover para "Final Material"
8. **Assets liberados** → Mover para "Asset Release"
9. **Job concluído** → Mover para "Completed"

---

## 🚀 Comandos Úteis

### Backend
```bash
# Importar dados CSV/JSON
npm run import:kanban

# Iniciar em dev
npm run start:dev

# Build
npm run build

# Prisma Studio (visualizar dados)
npx prisma studio
```

### Frontend
```bash
# Iniciar em dev
npm run dev

# Build para produção
npm run build

# Preview build
npm run preview
```

---

## 📦 Dependências Principais

### Backend
- NestJS 10.x
- Prisma ORM 6.16.2
- PostgreSQL
- class-validator
- class-transformer

### Frontend
- React 18
- TypeScript 5.x
- Vite
- @dnd-kit/core (drag & drop)
- shadcn/ui (componentes)
- TailwindCSS
- Lucide React (icons)
- Sonner (toasts)

---

## 🐛 Problemas Conhecidos e Soluções

### ✅ Resolvido: Enum WorkfrontFrente
- **Problema:** Tinha 7 valores (SOCIAL, DISPLAY, EMAIL, LANDING_PAGE, PRINT, BANNER, OTHER)
- **Solução:** Migração SQL manual para 4 valores (OOH, SOCIAL, EMAIL, BANNER)
- **Data:** 9 de outubro de 2025

### ✅ Resolvido: Import skipping all records
- **Problema:** Script pulava todos os 1980 registros
- **Solução:** Atualizar field mapping para uppercase (ATIVIDADE, STATUS, etc.)
- **Resultado:** 100% importados com sucesso

### ✅ Resolvido: Prisma Client enum mismatch
- **Problema:** DTOs com enum antigo (7 valores) vs Prisma Client novo (4 valores)
- **Solução:** Atualizar kanban-card.dto.ts com WorkfrontFrente correto
- **Resultado:** Backend compila sem erros

---

## 🎯 Próximas Features Sugeridas

### 🔥 Prioridade Alta
1. **Heat Map de Cronograma**
   - Visualização de entregas e feedbacks ao longo do tempo
   - Gráfico de calendário com cores por intensidade
   - Filtros por mês/quarter/FY

2. **Filtro por Data**
   - Integrar seletor de data do header com filtros
   - Mostrar apenas cards com entregas/feedbacks na data selecionada

3. **Busca por DSID/Atividade**
   - Campo de busca no header
   - Autocomplete com suggestions
   - Highlight nos resultados

### 🌟 Prioridade Média
4. **Visualização Timeline**
   - Gantt chart dos jobs
   - Mostrar dependências entre rounds
   - Indicar atrasos em vermelho

5. **Relatórios Exportáveis**
   - Exportar board para PDF/Excel
   - Filtrar por período/cliente/studio
   - Incluir estatísticas e gráficos

6. **Notificações/Alertas**
   - Alertar jobs próximos do deadline
   - Notificar quando Dell demorar >X dias
   - Avisar rounds sem feedback

### 💡 Prioridade Baixa
7. **Templates de Cards**
   - Criar templates para tipos comuns de jobs
   - Pré-preencher campos padrão
   - Salvar/carregar templates customizados

8. **Comentários em Cards**
   - Thread de comentários por card
   - @mentions para notificar membros
   - Histórico de alterações

9. **Integração com Workfront**
   - Sincronização bidirecional
   - Import automático de novos jobs
   - Push de status updates

10. **Dashboard Executivo**
    - Visão macro de todos os jobs
    - KPIs: % on-time, avg rounds, throughput
    - Gráficos de tendências

---

## 🔐 Autenticação

- ✅ JWT tokens com refresh automático
- ✅ Logout automático em 401
- ✅ Interceptor para adicionar token em todas as requisições
- ✅ Headers auth em kanbanService

---

## 📝 Notas de Migração

### Migração Manual WorkfrontFrente (9 out 2025)
```sql
-- Converter valores antigos para temporários
UPDATE kanban_cards SET frente = 'SOCIAL' 
WHERE frente IN ('DISPLAY', 'PRINT', 'OTHER');

UPDATE kanban_cards SET frente = 'EMAIL' 
WHERE frente = 'LANDING_PAGE';

-- Criar novo enum
CREATE TYPE "WorkfrontFrente_new" AS ENUM ('OOH', 'SOCIAL', 'EMAIL', 'BANNER');

-- Migrar coluna
ALTER TABLE kanban_cards 
ALTER COLUMN frente TYPE "WorkfrontFrente_new" 
USING (frente::text::"WorkfrontFrente_new");

-- Limpar
DROP TYPE "WorkfrontFrente";
ALTER TYPE "WorkfrontFrente_new" RENAME TO "WorkfrontFrente";
```

---

## 🎓 Aprendizados

1. **Prisma Enum Changes:** Sempre requer migração manual quando há dados
2. **JSON Field Mapping:** Verificar casing (uppercase vs mixedCase) ao importar
3. **DnD Performance:** Usar `activationConstraint.distance` para evitar drags acidentais
4. **Color Sync:** Eventos customizados + localStorage para sincronizar entre componentes
5. **Toast UX:** Menos é mais - só mostrar toasts de erro, não de sucesso trivial

---

## 📞 Contato e Suporte

Para dúvidas ou problemas:
- Verificar `docs/kanban-features.md` (este arquivo)
- Consultar `backend/src/scripts/README.md` para importação
- Revisar código em `frontend/src/components/Kanban*.tsx`
- Checar schema em `backend/prisma/schema.prisma`
