// server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { login, extractDocuments, shareDocument } from './wf_share_const.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend em produção
if (process.env.NODE_ENV === 'production') {
    app.use(express.static('frontend/dist'));
} else {
    // Em desenvolvimento, servir a versão antiga
    app.use(express.static('public'));
}

// Serve a UI
app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// API para fazer login no Workfront
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔑 Iniciando processo de login...');
        
        // Usar a função importada diretamente
        await login();
        
        console.log('✅ Login concluído com sucesso');
        res.json({ 
            success: true, 
            message: 'Login realizado com sucesso! Você pode fechar a janela do browser.' 
        });
        
    } catch (error) {
        console.error('❌ Erro no login:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API para verificar se está logado
app.get('/api/login-status', async (req, res) => {
    try {
        await fs.access('wf_state.json');
        const stats = await fs.stat('wf_state.json');
        const now = new Date();
        const fileAge = now - stats.mtime;
        const hoursAge = fileAge / (1000 * 60 * 60);
        
        // Considera válido se o arquivo foi criado nas últimas 8 horas
        const isValid = hoursAge < 8;
        
        res.json({ 
            loggedIn: isValid,
            lastLogin: stats.mtime,
            hoursAge: Math.round(hoursAge * 10) / 10
        });
    } catch (error) {
        res.json({ 
            loggedIn: false,
            error: 'Arquivo de sessão não encontrado'
        });
    }
});

// API para extrair informações de documentos de uma URL do projeto
app.post('/api/extract-documents', async (req, res) => {
    try {
        const { projectUrl } = req.body;
        
        if (!projectUrl) {
            return res.status(400).json({ 
                success: false, 
                message: 'URL do projeto é obrigatória' 
            });
        }

        console.log('📁 Extraindo documentos de:', projectUrl);

        // Usar a função importada diretamente
        const result = await extractDocuments(projectUrl);
        
        console.log('📊 JSON extraído com sucesso:', result);
        console.log('✅ Documentos extraídos com sucesso:', result);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ Erro na extração:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API para compartilhar documentos selecionados
app.post('/api/share-documents', async (req, res) => {
    try {
        const { projectUrl, selections, users } = req.body;
        
        if (!projectUrl || !selections || !users) {
            return res.status(400).json({
                success: false,
                message: 'URL do projeto, seleções e usuários são obrigatórios'
            });
        }

        console.log('📤 Compartilhando documentos selecionados...');
        console.log('URL:', projectUrl);
        console.log('Seleções:', selections);
        console.log('Usuários:', users.length);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Para cada documento selecionado
        for (const selection of selections) {
            try {
                console.log(`\n📋 Compartilhando: ${selection.folder}/${selection.fileName}`);
                
                // Usar a função shareDocument importada com folder e fileName
                await shareDocument(projectUrl, selection.folder, selection.fileName);
                
                results.push({
                    folder: selection.folder,
                    fileName: selection.fileName,
                    success: true,
                    message: 'Compartilhado com sucesso'
                });
                
                successCount++;
                console.log(`✅ ${selection.fileName} compartilhado com sucesso!`);
                
            } catch (shareError) {
                console.error(`❌ Erro ao compartilhar ${selection.fileName}:`, shareError.message);
                
                results.push({
                    folder: selection.folder,
                    fileName: selection.fileName,
                    success: false,
                    error: shareError.message
                });
                
                errorCount++;
            }
        }

        const responseData = {
            success: errorCount === 0,
            message: `Compartilhamento concluído: ${successCount} sucessos, ${errorCount} erros`,
            results: results,
            summary: {
                total: selections.length,
                success: successCount,
                errors: errorCount
            }
        };

        console.log('📊 Resultado final do compartilhamento:', responseData);
        
        res.json(responseData);

    } catch (error) {
        console.error('❌ Erro durante compartilhamento:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno durante compartilhamento',
            error: error.message 
        });
    }
});

// API para limpar cache do navegador (deleta o arquivo de sessão)
app.post('/api/clear-cache', async (req, res) => {
    try {
        console.log('🧹 Limpando cache do navegador...');
        
        // Deletar o arquivo de estado da sessão
        await fs.unlink('wf_state.json');
        
        console.log('✅ Cache limpo com sucesso');
        res.json({ 
            success: true, 
            message: 'Cache do navegador limpo com sucesso. Faça login novamente.' 
        });
        
    } catch (error) {
        // Se o arquivo não existir, considera sucesso
        if (error.code === 'ENOENT') {
            console.log('ℹ️ Cache já estava limpo (arquivo não encontrado)');
            res.json({ 
                success: true, 
                message: 'Cache já estava limpo.' 
            });
        } else {
            console.error('❌ Erro ao limpar cache:', error.message);
            res.status(500).json({ 
                success: false, 
                message: 'Erro ao limpar cache',
                error: error.message 
            });
        }
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Acesse a interface web em seu navegador`);
    console.log(`🔧 Modo desenvolvimento: npm run dev`);
});