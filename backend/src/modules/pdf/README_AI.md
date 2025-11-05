# 🤖 AI-Enhanced PDF Comment Processing

Este módulo adiciona capacidades de IA para melhorar a extração e processamento de comentários de PDFs, resolvendo o problema de informações que "nem sempre vem corretamente" da extração tradicional.

## 🎯 Problema Resolvido

**Antes:** Extração manual/regex de comentários de PDF → dados inconsistentes, mal formatados, informações perdidas

**Agora:** Extração tradicional + IA/LLM → dados estruturados, filtrados e organizados corretamente

## 🚀 Funcionalidades

### 1. **Processamento Inteligente de Comentários**
- Analisa comentários extraídos usando IA (OpenAI, Anthropic, ou modelo local)
- Extrai informações estruturadas: feedback, ações, status de aprovação, prioridades
- Identifica menções, categorias e contexto

### 2. **Enhancement Automático**
- Avalia qualidade da extração tradicional
- Aplica IA automaticamente quando confiança < threshold
- Mantém fallback para métodos tradicionais

### 3. **Múltiplos Provedores de IA**
- **OpenAI** (GPT-4o-mini, GPT-4)  
- **Anthropic** (Claude-3-haiku, Claude-3-sonnet)
- **Local** (Ollama, modelos self-hosted)

## ⚙️ Configuração

### 1. Variáveis de Ambiente

```bash
# OpenAI (recomendado)
OPENAI_API_KEY=sk-proj-your-key-here

# Anthropic (opcional)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Modelo Local (opcional)
LOCAL_AI_ENDPOINT=http://localhost:11434

# Provider padrão
AI_PROVIDER=openai
```

### 2. Dependências

```bash
# Instalar dependências (se necessário)
npm install @nestjs/config
```

## 📡 API Endpoints

### `GET /pdf/ai/health`
Verifica disponibilidade dos serviços de IA

**Response:**
```json
{
  "service": "pdf-ai",
  "available": true,
  "providers": {
    "openai": true,
    "anthropic": false,
    "local": false
  }
}
```

### `POST /pdf/ai/process-comments`
Processa comentários diretamente com IA

**Request:**
```json
{
  "comments": [
    "Alterar a cor do título para azul",
    "O logo está muito pequeno",
    "Aprovado após as correções"
  ],
  "provider": "openai",
  "model": "gpt-4o-mini",
  "context": "Material de marketing para campanha Dell"
}
```

**Response:**
```json
{
  "success": true,
  "confidence": 0.92,
  "extractedData": {
    "feedback": [
      "Alterar a cor do título para azul",
      "O logo está muito pequeno"
    ],
    "actionItems": [
      "Alterar a cor do título para azul",
      "Aumentar tamanho do logo"
    ],
    "approvalStatus": "needs_changes",
    "priority": "medium",
    "categories": ["design", "cores", "layout"],
    "mentions": []
  },
  "processingTime": 1500
}
```

### `POST /pdf/ai/enhance-extraction`
Melhora extração tradicional usando IA quando necessário

**Request:**
```json
{
  "originalText": "PDF content here...",
  "extractedComments": [
    "comentário mal formatado",
    "texto confuso do pdf"
  ],
  "useAIEnhancement": true,
  "confidenceThreshold": 0.7,
  "documentContext": "Briefing de campanha publicitária"
}
```

**Response:**
```json
{
  "success": true,
  "aiEnhanced": true,
  "originalConfidence": 0.4,
  "finalConfidence": 0.89,
  "extractedData": {
    "feedback": ["Título precisa ser mais chamativo"],
    "actionItems": ["Revisar título principal"],
    "approvalStatus": "needs_changes",
    "priority": "high",
    "categories": ["texto", "criatividade"],
    "mentions": []
  },
  "processingDetails": {
    "originalMethod": "parsing",
    "aiProvider": "openai",
    "triggeredEnhancement": true,
    "reason": "Confiança original baixa: 0.40"
  }
}
```

### `POST /pdf/ai/extract-from-text`
Extrai comentários de texto com IA (exemplo prático)

**Request:**
```json
{
  "text": "Este é o documento... comentário: alterar cor... feedback: melhorar layout...",
  "documentContext": "Material promocional",
  "useAI": true,
  "confidenceThreshold": 0.7
}
```

## 🛠️ Uso Programático

### No seu Service/Controller:

```typescript
import { CommentEnhancementService } from './comment-enhancement.service';
import { AIProcessingService } from './ai-processing.service';

@Injectable()
export class YourService {
  constructor(
    private readonly commentEnhancement: CommentEnhancementService,
    private readonly aiProcessing: AIProcessingService
  ) {}

  async processDocumentComments(pdfText: string) {
    // 1. Extração tradicional
    const basicComments = this.extractBasicComments(pdfText);
    
    // 2. Usar IA se precisar
    const enhanced = await this.commentEnhancement.enhanceExtraction({
      originalText: pdfText,
      extractedComments: basicComments,
      useAIEnhancement: true,
      confidenceThreshold: 0.7
    });

    return enhanced;
  }
}
```

## 🔧 Configuração Avançada

### Personalizar Prompts
Edite `ai-processing.service.ts` → método `buildPrompt()` para ajustar instruções da IA.

### Ajustar Thresholds
- `confidenceThreshold`: 0.5-0.9 (quanto maior, menos vezes usa IA)
- `temperature`: 0.1-0.7 (criatividade da IA)
- `maxTokens`: 500-2000 (tamanho da resposta)

### Fallback Strategy
1. **IA Principal** (OpenAI/Anthropic)
2. **IA Local** (se configurada)  
3. **Extração Tradicional** (regex/parsing)
4. **Dados Vazios** (com erro logged)

## 📊 Monitoramento

### Logs
```
🤖 Processando 5 comentários com openai
✅ Processamento concluído - Confiança: 0.87
🔍 Confiança baixa (0.45), usando IA para melhorar
✅ Extração melhorada com IA - Confiança: 0.45 → 0.89
```

### Métricas
- `processingTime`: Tempo em ms
- `confidence`: 0-1 (qualidade da extração)
- `aiEnhanced`: Se IA foi usada
- `originalMethod`: Método de extração original

## 🎯 Exemplos de Uso

### Caso 1: Comentários Bagunçados
```
Input: "cor azl titulo grande !@#$ melhorar"
Output: {
  feedback: ["Alterar cor do título para azul", "Aumentar tamanho do título"],
  actionItems: ["Ajustar cor do título", "Redimensionar título"],
  categories: ["design", "cores", "tipografia"]
}
```

### Caso 2: Aprovações
```
Input: ["ok pode aprovar", "está bom assim", "publique"]
Output: {
  approvalStatus: "approved",
  priority: "low",
  feedback: ["Material aprovado para publicação"]
}
```

### Caso 3: Críticas Técnicas  
```
Input: ["rgb(255,0,0) muito forte", "padding-left 20px", "font-size menor"]
Output: {
  categories: ["cores", "layout", "tipografia"],
  actionItems: ["Reduzir intensidade da cor vermelha", "Ajustar espaçamento esquerdo", "Diminuir tamanho da fonte"],
  priority: "medium"
}
```

## ⚡ Performance

- **Sem IA**: ~50ms (regex/parsing apenas)
- **Com IA (OpenAI)**: ~800-2000ms 
- **Com IA (Local)**: ~200-1000ms (depende do hardware)
- **Cache**: Comentários similares podem ser cached (TODO)

## 🔐 Segurança

- **API Keys**: Nunca committar no código
- **Rate Limits**: OpenAI/Anthropic têm limites de uso
- **Data Privacy**: Comentários são enviados para APIs externas (considere modelos locais para dados sensíveis)

## 🐛 Troubleshooting

### IA não funciona
```bash
# Verificar configuração
curl -X GET http://localhost:3000/pdf/ai/health

# Verificar logs
docker logs script-wf-backend
```

### Baixa qualidade
- Ajustar `confidenceThreshold` (menor valor = mais IA)
- Melhorar `context` nas requisições
- Usar modelo mais avançado (`gpt-4` vs `gpt-4o-mini`)

### Performance lenta
- Usar modelo local (Ollama)
- Reduzir `maxTokens`
- Implementar cache (TODO)

---

## 📈 Próximos Passos

- [ ] Cache de resultados para comentários similares
- [ ] Batch processing para múltiplos documentos
- [ ] Fine-tuning para domínio específico (marketing/design)
- [ ] Interface web para testar processamentos
- [ ] Métricas e analytics de qualidade
- [ ] Integração com pipeline de PowerPoint

## 🤝 Contribuição

Para adicionar novos providers de IA ou melhorar prompts, edite:
- `ai-processing.service.ts` - Lógica principal
- `ai-processing.dto.ts` - Tipos e interfaces  
- `comment-enhancement.service.ts` - Orquestração