# Refatoração da Timeline - Sistema de Cards Multi-Upload

## 📋 Visão Geral

Refatoração completa do `TimelineSection.tsx` para suportar **múltiplas instâncias de upload** através de um sistema de cards individuais. O backend processará em lotes de 3 em 3 usando múltiplas instâncias do Playwright.

## ✨ Principais Funcionalidades

### 1. **Sistema de Cards Ilimitados**
- ✅ Adicionar/remover cards dinamicamente
- ✅ Cada card representa uma instância de upload independente
- ✅ Numeração automática (#1, #2, #3...)
- ✅ Execução individual ou em lote

### 2. **Campo de Link do Workfront**
- ✅ Input para URL do projeto Workfront
- ✅ Validação visual (obrigatório para execução)

### 3. **Área de Upload Unificada**
- ✅ Drag & Drop para múltiplos tipos de arquivo:
  - 📦 ZIP (Asset Release)
  - 📄 PDF (Final Materials)
  - 🖼️ PNG/JPG (Imagens)
  - 🎬 MP4/MOV (Vídeos)
- ✅ Preview compacto com ícones coloridos
- ✅ Exibição de nome e tamanho do arquivo
- ✅ Remover arquivos individualmente
- ✅ Evita duplicatas automaticamente

### 4. **Seleção de Equipe via Badge + Popover**
- ✅ Interface elegante com Popover
- ✅ Mostra equipe atual com badge de contagem
- ✅ Opções:
  - 👥 Equipe Carolina (3 pessoas)
  - 👥 Equipe Giovana (2 pessoas)
  - 👤 Teste - Gustavo (1 pessoa)

### 5. **Configuração Individual de Passos**
- ✅ Modo avançado (expandir/ocultar)
- ✅ Checkboxes para cada passo de automação:
  - 📤 Upload ZIP para Asset Release
  - 🔗 Compartilhar ZIP
  - 💬 Comentário Asset Release
  - 📤 Upload Finais (PDF, PNG, MP4)
  - 💬 Comentário PDF Final
  - 📊 Atualizar Status
  - ⏱️ Lançar Horas
- ✅ Presets rápidos:
  - Completo (todos menos status/horas)
  - Asset Only
  - Finals Only
  - Status Only

### 6. **Timeline de Progresso Individual**
- ✅ Barra de progresso por card
- ✅ Percentual em tempo real
- ✅ Estado visual (executando/concluído)
- ✅ Feedback visual com border colorido

### 7. **Execução em Lote**
- ✅ Botão "Executar Todas" no header
- ✅ Backend processará em lotes de 3
- ✅ Contador de instâncias configuradas
- ✅ Validação antes de executar

## 🎨 Interface

### Header Global
```
┌─────────────────────────────────────────────────────────────┐
│ ⚙️ Timeline de Automação - Multi-Upload                     │
│                                    [Configurar] [+ Adicionar]│
│ 3 instância(s) configurada(s)      [▶️ Executar Todas (3)]  │
└─────────────────────────────────────────────────────────────┘
```

### Card Individual
```
┌─────────────────────────────────────────────────────────────┐
│ #1  [URL do projeto Workfront__________________]        [🗑️] │
├─────────────────────────────────────────────────────────────┤
│ Equipe: [👤 Equipe Carolina ▼]  2 pessoa(s)                 │
│                                                              │
│ Arquivos (ZIP, PDF, PNG, MP4):                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📤 Arraste arquivos aqui ou clique para selecionar      │ │
│ │                  [Selecionar Arquivos]                  │ │
│ │                                                          │ │
│ │ 📦 projeto_assets.zip (15.2 MB)                     [×] │ │
│ │ 📄 final_material.pdf (2.3 MB)                      [×] │ │
│ │ 🖼️ preview.png (0.8 MB)                             [×] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Passos de Automação:     [Completo][Asset][Finals][Status]  │
│ ☑️ 📤 Upload ZIP para Asset Release                          │
│ ☑️ 🔗 Compartilhar ZIP                                       │
│ ☑️ 💬 Comentário Asset Release                               │
│ ☐ 📤 Upload Finais (PDF, PNG, MP4)                          │
│                                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 45%                 │
│ Executando...                                            45% │
│                                                              │
│ 3 passo(s) selecionado(s) • 3 arquivo(s)     [▶️ Executar] │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Estrutura de Dados

### UploadInstance
```typescript
interface UploadInstance {
    id: string;              // ID único
    projectUrl: string;      // URL do Workfront
    selectedUser: TeamKey;   // 'carol' | 'giovana' | 'test'
    files: File[];           // Arquivos unificados
    steps: WorkflowStep[];   // Passos configurados
    executing: boolean;      // Em execução?
    progress: number;        // 0-100
}
```

### WorkflowStep
```typescript
interface WorkflowStep {
    action: WorkflowAction;
    enabled: boolean;
    description?: string;
}
```

## 🔄 Fluxo de Uso

1. **Adicionar Instâncias**
   - Clicar em "+ Adicionar Instância"
   - Pode adicionar quantas quiser

2. **Configurar Cada Card**
   - Inserir URL do Workfront
   - Selecionar equipe via popover
   - Arrastar/selecionar arquivos
   - Marcar passos desejados (modo avançado)

3. **Executar**
   - Individual: botão "Executar" em cada card
   - Todas: botão "Executar Todas" no header
   - Backend processa em lotes de 3 simultaneamente

4. **Acompanhar**
   - Barra de progresso individual
   - Visual feedback em tempo real
   - Estado de execução por card

## 🚀 Próximos Passos (Backend)

### 1. API Endpoint para Multi-Upload
```typescript
POST /api/workflow/execute-batch
{
  instances: [
    {
      projectUrl: "...",
      selectedUser: "carol",
      files: [...], // FormData
      steps: [...]
    }
  ]
}
```

### 2. Processamento em Lotes
- Receber todas as instâncias
- Processar em grupos de 3 simultaneamente
- Usar múltiplas instâncias do Playwright
- Fila: processar próximos 3 quando um lote terminar

### 3. Progress Tracking
- WebSocket ou SSE para cada instância
- Atualizar progresso individual
- Estado: pending → running → completed/failed

## 📝 Notas Técnicas

- ✅ TypeScript com tipos completos
- ✅ React Hooks (useState, useEffect, useRef)
- ✅ Componentes shadcn/ui
- ✅ Drag & Drop nativo
- ✅ Validação de arquivos por extensão
- ✅ Prevenção de duplicatas
- ✅ Responsivo e acessível

## 🎯 Benefícios

1. **Escalabilidade**: Adicione quantas instâncias precisar
2. **Flexibilidade**: Configure cada upload independentemente
3. **Eficiência**: Backend processa em paralelo (lotes de 3)
4. **UX**: Interface clara e intuitiva
5. **Reusabilidade**: Cards independentes e reutilizáveis

## 📦 Arquivos Modificados

- ✅ `frontend/src/components/TimelineSection.tsx` - Refatorado completamente
- ✅ `frontend/src/components/UploadSection.tsx` - Atualizado para nova interface
- 📄 `frontend/src/components/TimelineSection.old.tsx` - Backup do original

---

**Data**: 10 de outubro de 2025  
**Status**: ✅ Implementação Frontend Completa  
**Próximo**: Integração Backend (processamento em lotes de 3)
