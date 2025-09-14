// src/app.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import workfrontRoutes from './routes/workfrontRoutes.js';
import { requestLogger, errorHandler } from './middleware/logger.js';
import { swaggerUi, swaggerSpec } from './config/swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware global
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Workfront Sharing API',
    customfavIcon: '/favicon.ico'
}));

// Rota para servir o JSON do Swagger
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Servir arquivos estáticos do frontend
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
} else {
    // Em desenvolvimento, servir a versão antiga
    app.use(express.static(path.join(__dirname, '..', 'public')));
}

// Rotas da API
app.use('/api', workfrontRoutes);

// Rota para servir o frontend (SPA)
app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

export default app;
