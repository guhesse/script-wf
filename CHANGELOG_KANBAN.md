# 📝 Changelog - Kanban Board

Todas as mudanças notáveis no sistema Kanban serão documentadas neste arquivo.

---

## [1.2.0] - 2025-10-09

### 🎉 Added
- **Importação de dados CSV/JSON**
  - Script completo em `backend/src/scripts/import-kanban-data.ts`
  - Suporte a 1980 registros importados com sucesso
  - Logging a cada 10 registros com totais acumulados
  - Relatório de erros detalhado
  - Documentação em `backend/src/scripts/README.md`

- **Enum WorkfrontFrente simplificado**
  - Reduzido de 7 para 4 valores: OOH, SOCIAL, EMAIL, BANNER
  - Removidos: DISPLAY, LANDING_PAGE, PRINT, OTHER
  - Migração manual SQL para converter dados existentes

### 🔧 Fixed
- **Field mapping no import**
  - Corrigido para uppercase (ATIVIDADE, STATUS, DSID, etc.)
  - Evita skip de todos os registros

- **Prisma Client enum sync**
  - DTOs atualizados com enum correto (4 valores)
  - Resolvido erro de incompatibilidade de tipos

### 🎨 Changed
- **Default frente:** SOCIAL → OOH
- **Logging:** Verbose reduzido, path mostrado no início

---

## [1.1.0] - 2025-10-08

### 🎉 Added
- **Personalização de cores**
  - Painel ColorCustomizationPanel com tabs (Status | Studio)
  - 19 cores na paleta (Slate, Gray, Red, Orange, Amber, etc.)
  - Preview em tempo real
  - Salvar/restaurar no localStorage
  - Sincronização via eventos customizados

- **Badge editável de Studio**
  - StudioBadge inline no card
  - Popover com 4 opções (Sem Studio, Rô, Tay, Gus)
  - Cores customizáveis
  - Update sem refresh

- **Layout melhorias**
  - Menu lateral colapsável (botão Menu/X)
  - Seletor de data no header
  - Toggle "Mostrar/Ocultar colunas vazias"
  - Scroll horizontal corrigido (max-w-[100vw])

### 🔧 Fixed
- **Erro de hidratação:** Removido duplicate overflow-y-auto
- **Toast spam:** Apenas erros exibidos, sem toast de sucesso trivial
- **ScrollArea orientation:** Explícito horizontal no board, vertical nas colunas

---

## [1.0.0] - 2025-10-07

### 🎉 Added
- **Kanban Board completo**
  - 7 colunas de status (Backlog → Completed)
  - Drag & Drop com @dnd-kit
  - Scroll horizontal no board (h-[calc(100vh-230px)])
  - Scroll vertical nas colunas (min-h-[400px])
  - Largura fixa de 320px por coluna

- **Cards do Kanban**
  - Badge de Status colorido
  - Badge de Round editável (R1-R12) via popover
  - Badge BI
  - Metadados: DSID, cliente, brand, tipo asset
  - Barras de progresso (% VML vs Dell)
  - Opacidade 30% durante drag

- **Formulário de Criação/Edição**
  - Modal com 4 tabs organizadas (Básico, Cliente, Config, Datas)
  - Validação de campos obrigatórios
  - Dropdowns com opções pré-definidas
  - Datas para R1-R4 (entregas VML + feedbacks Dell)

- **Filtros e Estatísticas**
  - Painel de filtros (Week, Quarter, Cliente, Brand)
  - Estatísticas agregadas (total, por status, por frente, top clientes)
  - Botão "Limpar Filtros"

- **Backend API**
  - CRUD completo de cards
  - Endpoint /move para drag & drop
  - Cálculo automático de % dias VML vs Dell
  - Filtros avançados
  - Auditoria (createdBy, updatedBy)

### 🎨 Changed
- **Status atualizados:**
  - PENDING → BACKLOG
  - IN_PROGRESS → FILES_TO_STUDIO
  - REVIEW → REVIEW_DELL
  - Adicionados: REVISAO_TEXTO, FINAL_MATERIAL, ASSET_RELEASE, COMPLETED

- **Campo Round:** Adicionado (1-12)

---

## 📋 Template de Entrada

Ao adicionar novos logs, use o formato:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### 🎉 Added
- Feature nova

### 🔧 Fixed
- Bug corrigido

### 🎨 Changed
- Mudança de comportamento

### 🗑️ Removed
- Feature removida

### ⚠️ Deprecated
- Feature marcada para remoção
```

---

## 🏷️ Versioning

Seguimos [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0): Mudanças incompatíveis
- **MINOR** (x.Y.0): Funcionalidades novas compatíveis
- **PATCH** (x.y.Z): Correções de bugs

---

## 📊 Estatísticas do Projeto

- **Total de cards importados:** 1980
- **Total de features implementadas:** 30+
- **Total de componentes React:** 10
- **Total de endpoints backend:** 7
- **Tempo de desenvolvimento:** 3 dias
