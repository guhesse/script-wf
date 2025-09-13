# Workfront Sharing Backend - Nova Arquitetura

Backend moderno com Prisma e PostgreSQL para gerenciar histórico de projetos do Workfront.

## 🗄️ Configuração do Banco de Dados

### Opção 1: Supabase (Recomendado para produção)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto
3. Vá em Settings > Database > Connection string
4. Copie a connection string e substitua no `.env`:

```env
DATABASE_URL="postgresql://postgres.[SEU-REF]:[SUA-SENHA]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?schema=public"
```

### Opção 2: PostgreSQL Local

1. Instale PostgreSQL localmente
2. Crie um banco chamado `workfront_links`
3. Use a URL no `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workfront_links?schema=public"
```

### Opção 3: Docker (Desenvolvimento)

```bash
docker run --name postgres-workfront -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=workfront_links -p 5432:5432 -d postgres:15
```

## 🚀 Configuração Inicial

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar variáveis de ambiente:**
```bash
# Edite o .env com sua DATABASE_URL
```

3. **Sincronizar banco de dados:**
```bash
npm run db:push
```

4. **Gerar cliente Prisma:**
```bash
npm run db:generate
```

5. **Iniciar servidor:**
```bash
npm run dev
```

## 📜 Scripts Disponíveis

- `npm run dev` - Servidor em desenvolvimento (nodemon)
- `npm run start` - Servidor em produção
- `npm run db:generate` - Gerar cliente Prisma
- `npm run db:push` - Sincronizar schema com banco
- `npm run db:migrate` - Criar nova migração
- `npm run db:studio` - Abrir Prisma Studio (interface visual)
- `npm run db:reset` - Resetar banco (CUIDADO!)

## 🏗️ Arquitetura

```
src/
├── controllers/     # Controladores das rotas
├── services/        # Lógica de negócio
├── repositories/    # Acesso a dados (Prisma)
├── routes/          # Definição das rotas
├── middleware/      # Middlewares personalizados
├── database/        # Configuração do Prisma
└── app.js          # Configuração do Express
```

## 📊 Banco de Dados

### Modelos:

- **WorkfrontProject**: Armazena URLs e informações dos projetos
- **AccessSession**: Histórico de acessos aos projetos

### Funcionalidades:

- ✅ Histórico de projetos acessados
- ✅ Rastreamento de sessões de acesso
- ✅ Estatísticas de uso
- ✅ Paginação e filtros
- ✅ Status de projetos (ACTIVE, ARCHIVED, ERROR)

## 🔌 API Endpoints

### Autenticação
- `POST /api/login` - Login no Workfront
- `GET /api/login-status` - Status do login
- `POST /api/clear-cache` - Limpar cache

### Projetos
- `POST /api/extract-documents` - Extrair documentos
- `POST /api/share-documents` - Compartilhar documentos
- `GET /api/projects` - Listar histórico
- `GET /api/projects/:id` - Buscar por ID
- `GET /api/project-by-url` - Buscar por URL
- `DELETE /api/projects/:id` - Deletar projeto

### Dashboard
- `GET /api/dashboard/stats` - Estatísticas do dashboard