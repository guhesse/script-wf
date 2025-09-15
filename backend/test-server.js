// Test script para validar as correções

import express from 'express';
import cors from 'cors';
import briefingRoutes from './src/routes/briefingRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor funcionando',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/briefing', briefingRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Servidor de teste rodando na porta ${PORT}`);
    console.log(`📋 Teste: http://localhost:${PORT}/test`);
    console.log(`📊 Briefing stats: http://localhost:${PORT}/api/briefing/stats`);
});

export default app;