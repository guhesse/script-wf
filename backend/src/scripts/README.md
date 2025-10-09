# Scripts de Importação de Dados

## Importar dados do Kanban a partir de CSV/JSON

Este script permite importar dados de cards do Kanban a partir de um arquivo JSON exportado de uma planilha CSV.

### Preparação

1. **Converter CSV para JSON**:
   - Acesse https://csvjson.com/csv2json
   - Faça upload do seu arquivo CSV
   - Baixe o arquivo JSON gerado

2. **Colocar o arquivo no projeto**:
   ```bash
   # Copie o arquivo csvjson.json para a raiz do projeto
   cp ~/Downloads/csvjson.json ./csvjson.json
   ```

### Execução

```bash
# Na pasta backend
npm run import:kanban
```

Ou especificando um caminho customizado:

```bash
npm run import:kanban -- /caminho/para/seu/arquivo.json
```

### Formato esperado do CSV/JSON

O arquivo deve conter as seguintes colunas (nomes exatos, case-sensitive):

- `BI` - "Sim" ou vazio
- `Anotações` - Texto livre
- `Start` - Data no formato DD/MM/YYYY ou YYYY-MM-DD
- `Real Deliv` - Data de entrega real
- `Prev Deliv` - Data prevista de entrega
- `DSID` - ID do projeto
- `Atividade` - Nome/descrição da tarefa (**obrigatório**)
- `Status` - Um dos valores:
  - Backlog
  - Files to Studio
  - Revisão de Texto
  - Review Dell
  - Final Material
  - Asset Release
  - Completed
- `Studio` - Nome do estúdio (ex: Rô, Tay, Gus)
- `VF` - Visual Framework:
  - No VF
  - Microsoft JMA CS
  - Other
- `Tipo Asset`:
  - Estático / Vídeo / Video / Wireframe / GIF / Story / Moldura / AW Story / HTML / Outro
- `Número Assets` - Número (padrão: 1)
- `Cliente` - Nome do cliente
- `Brand` - Nome da marca
- `Week` - Semana (ex: W1, W3, W7)
- `Quarter` - Trimestre (ex: Q3)
- `Frente`:
  - Social / Display / Email / E-mail / Landing Page / Print / Outro
- `FY` - Ano fiscal:
  - FY25 / FY26 / FY27 / FY28
- `Entrega R1 VML` - Data
- `Feedback R1 Dell` - Data
- `Entrega R2 VML` - Data
- `Feedback R2 Dell` - Data
- `Entrega R3 VML` - Data
- `Feedback R3 Dell` - Data
- `Entrega R4 VML` - Data
- `Feedback R4 Dell` - Data
- `Dias start-R1 VML` - Número
- `Dias R1 VML-R1 Dell` - Número
- `Dias R1 Dell-R2 VML` - Número
- `Dias R2 VML-R2 Dell` - Número
- `Dias R2 Dell-R3 VML` - Número
- `Dias R3 VML-R3 Dell` - Número
- `Dias R3 Dell-R4 VML` - Número
- `Dias R4 VML-R4 Dell` - Número
- `Dias na VML %` - Percentual (0-100)
- `Dias na Dell %` - Percentual (0-100)

### Comportamento do script

- ✅ **Validação**: Apenas registros com `Atividade` preenchida serão importados
- 🔄 **Mapeamento automático**: Valores são convertidos automaticamente para os enums do banco
- 📊 **Posição**: Os cards são criados na ordem do arquivo CSV
- 🔢 **Default values**: Campos não preenchidos recebem valores padrão apropriados
- 📝 **Log detalhado**: Mostra progresso e erros durante a importação

### Exemplo de saída

```
🚀 Iniciando importação de dados do Kanban
📂 Arquivo: /path/to/csvjson.json

📂 Lendo arquivo JSON...
📊 Encontrados 150 registros para importar
✅ [1/150] Importado: Dell - Campaign Launch Assets...
✅ [2/150] Importado: Social Media Pack Q3...
⏭️  [3/150] Pulando registro sem atividade
...

📊 Resumo da importação:
   ✅ Importados: 145
   ⏭️  Pulados: 3
   ❌ Erros: 2
   📦 Total processado: 150

✅ Importação concluída com sucesso!
```

### Troubleshooting

**Erro: "Cannot find module '@prisma/client'"**
```bash
npm run db:generate
```

**Erro: "Authentication failed"**
- Verifique se o banco está rodando: `docker compose -f docker-compose.local.yml ps`
- Verifique as credenciais no `.env`

**Registros pulados**
- Verifique se o campo `Atividade` está preenchido
- Confira se os nomes das colunas estão exatamente como documentado (case-sensitive)

**Datas não importadas**
- Use formato DD/MM/YYYY ou YYYY-MM-DD
- Valores vazios ou "-" são aceitos e resultam em `null`
