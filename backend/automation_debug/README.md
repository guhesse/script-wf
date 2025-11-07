# 🐛 Sistema de Debug de Automação

Este diretório contém ferramentas e resultados de debug para a automação do Workfront.

## 📁 Estrutura

```
automation_debug/
├── share_modal/              # Screenshots do debug do modal de compartilhamento
├── debug-share-modal-request.json  # Exemplos de requisições
└── README.md                 # Este arquivo
```

## 🎯 Problema Atual

O modal de compartilhamento funciona perfeitamente em **ambiente local** (sem Docker), mas falha em **ambiente Docker** e **VPS** com erro genérico do Workfront.

## 🔧 Como Usar o Debug

### 1. Via PowerShell Script (Recomendado)

```powershell
cd backend
.\scripts\debug-share-modal.ps1 `
  -ProjectUrl "https://experience.workfront.com/s/pj/SEU_PROJETO_ID/overview" `
  -FileName "seu-arquivo.pdf" `
  -Headless $false
```

### 2. Via cURL

```bash
curl -X POST http://localhost:3000/api/debug-share-modal \
  -H "Content-Type: application/json" \
  -d @automation_debug/debug-share-modal-request.json
```

### 3. Via Postman/Insomnia

Importe o arquivo `debug-share-modal-request.json` e execute.

## 🔍 O Que o Debug Faz

1. **Testa 6 estratégias diferentes** de abertura do modal
2. **Recarrega a página** entre cada estratégia (isolamento total)
3. **Captura screenshots** em cada etapa crítica
4. **Registra logs** detalhados do console do browser
5. **Captura erros** da página
6. **Gera relatório** de qual estratégia funcionou

## 📊 Estratégias Testadas

| # | Nome | Descrição |
|---|------|-----------|
| 1 | `baseline` | Estratégia padrão atual (linha de base) |
| 2 | `wait_longer` | Aguarda 3s extras após seleção do documento |
| 3 | `close_all_modals` | Fecha todos os modais/overlays antes de abrir |
| 4 | `disable_animations` | Desabilita todas as animações CSS |
| 5 | `force_visibility` | Remove z-index e overlays bloqueadores |
| 6 | `click_with_js` | Clica no botão usando JavaScript direto |

## 📸 Screenshots

Os screenshots são salvos com nomes descritivos:

```
001_timestamp_baseline_01_initial_load.png
002_timestamp_baseline_02_after_close_sidebar.png
003_timestamp_baseline_03_after_folder_nav.png
004_timestamp_baseline_04_after_select_doc.png
005_timestamp_baseline_05_after_modifications.png
006_timestamp_baseline_06_modal_opened.png
007_timestamp_wait_longer_01_initial_load.png
...
```

**Convenção de nomenclatura:**
- `XXX` - Número sequencial (001, 002, etc.)
- `timestamp` - Momento da captura
- `strategy_name` - Nome da estratégia sendo testada
- `NN_description` - Passo dentro da estratégia

## 🎯 Analisando os Resultados

### 1. Verifique o Relatório

O endpoint retorna:

```json
{
  "success": true,
  "results": [
    {
      "strategy": "baseline",
      "success": false,
      "error": "Modal não abriu",
      "screenshots": ["..."]
    },
    {
      "strategy": "wait_longer",
      "success": true,
      "screenshots": ["..."]
    }
  ]
}
```

### 2. Analise os Screenshots

- **Verde (✅)**: Estratégia funcionou!
- **Vermelho (❌)**: Estratégia falhou

### 3. Compare Ambientes

Execute o debug em:
1. **Local (sem Docker)** - deve funcionar
2. **Docker local** - deve reproduzir o erro
3. **VPS** - deve reproduzir o erro

Compare os screenshots e logs para identificar diferenças.

## 🔧 Possíveis Causas do Problema

Com base nos screenshots e logs, verifique:

1. **Timing**: Elementos demoram mais para aparecer no Docker?
2. **Overlays**: Algum elemento está bloqueando o botão?
3. **JavaScript**: Erros no console do browser?
4. **DOM**: Estrutura do HTML é diferente?
5. **Network**: Requisições AJAX falhando?
6. **Cookies/Auth**: Sessão está válida?

## 💡 Próximos Passos

Após identificar qual estratégia funciona:

1. Atualize `openShareModal()` com a estratégia vencedora
2. Adicione verificações de ambiente (Docker vs Local)
3. Ajuste timeouts se necessário
4. Remova o código de debug se não for mais necessário

## 🚨 Importante

- Use **`headless: false`** para ver o que está acontecendo
- Cada teste pode levar **5-10 minutos** (múltiplas estratégias)
- **Não use em produção** - apenas para debug
- Screenshots podem ocupar **muito espaço** (limpe periodicamente)

## 📝 Logs

Logs detalhados aparecem no console do backend:

```
🐛 INICIANDO DEBUG INTENSIVO DO MODAL DE COMPARTILHAMENTO
🧪 TESTANDO ESTRATÉGIA 1/6: baseline
🌍 Abrindo projeto...
📸 Screenshot salvo: 001_timestamp_baseline_01_initial_load.png
...
```

## 🗑️ Limpeza

Para limpar screenshots antigos:

```powershell
Remove-Item backend/automation_debug/share_modal/* -Force
```

Ou no Linux/Mac:

```bash
rm -rf backend/automation_debug/share_modal/*
```
