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

        // Usar a função importada diretamente com headless=true para extração
        const result = await extractDocuments(projectUrl, true);

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

// API para extrair documentos com feedback em tempo real via SSE
app.get('/api/extract-documents-stream/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const projectUrl = decodeURIComponent(req.query.url);

    if (!projectUrl) {
        return res.status(400).json({
            success: false,
            message: 'URL do projeto é obrigatória'
        });
    }

    // Configurar Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendProgress = (step, message, progress = 0, data = null) => {
        const eventData = {
            step,
            message,
            progress,
            timestamp: new Date().toISOString(),
            data
        };
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    try {
        console.log('📁 Iniciando extração com feedback:', projectUrl);

        // Usar a função melhorada que enviará callbacks de progresso
        const result = await extractDocumentsWithProgress(projectUrl, sendProgress);

        // Enviar resultado final
        sendProgress('completed', 'Todos os documentos encontrados com sucesso!', 100, result);
        res.write('event: close\ndata: {}\n\n');
        res.end();

    } catch (error) {
        console.error('❌ Erro na extração:', error.message);
        sendProgress('error', `Erro: ${error.message}`, 0, { error: error.message });
        res.write('event: close\ndata: {}\n\n');
        res.end();
    }
});

// API para compartilhar documentos selecionados
app.post('/api/share-documents', async (req, res) => {
    try {
        const { projectUrl, selections, users, selectedUser = 'carol' } = req.body;

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
        console.log('Equipe selecionada:', selectedUser);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Para cada documento selecionado
        for (const selection of selections) {
            try {
                console.log(`\n📋 Compartilhando: ${selection.folder}/${selection.fileName}`);

                // Usar a função shareDocument importada com folder, fileName, selectedUser e headless=false (visível)
                await shareDocument(projectUrl, selection.folder, selection.fileName, selectedUser, false);

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

// Função para extrair documentos com feedback de progresso
async function extractDocumentsWithProgress(projectUrl, onProgress) {
    const startTime = Date.now();
    console.log("📂 === EXTRAINDO DOCUMENTOS COM PROGRESSO ===");

    onProgress('connecting', 'Acessando o Workfront...', 5);

    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({
            storageState: 'wf_state.json',
            viewport: null
        });

        const page = await context.newPage();

        onProgress('loading', 'Carregando projeto...', 15);
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        onProgress('finding-frame', 'Encontrando interface do Workfront...', 25);
        const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
        await page.waitForTimeout(2000);

        const folders = [];
        const targetFolders = ['Asset Release', 'Final Materials'];
        const progressPerFolder = 30; // 60% total dividido entre as 2 pastas

        for (let folderIndex = 0; folderIndex < targetFolders.length; folderIndex++) {
            const folderName = targetFolders[folderIndex];
            const baseProgress = 30 + (folderIndex * progressPerFolder);

            onProgress('accessing-folder', `Acessando ${folderName}...`, baseProgress);

            try {
                const folderButton = frameLocator.getByRole('button', { name: new RegExp(folderName, 'i') })
                    .or(frameLocator.getByText(folderName))
                    .first();

                await folderButton.waitFor({ timeout: 5000 });
                await folderButton.click();
                await page.waitForTimeout(3000);

                onProgress('scanning-files', `Verificando arquivos em ${folderName}...`, baseProgress + 10);

                // Extrair arquivos usando a mesma lógica do extractFilesFromFolder
                const files = await extractFilesFromFolderWithProgress(frameLocator, folderName, onProgress, baseProgress + 15);

                if (files.length > 0) {
                    folders.push({
                        name: folderName,
                        files: files
                    });
                    onProgress('folder-complete', `${files.length} documentos encontrados em ${folderName}`, baseProgress + 25);
                } else {
                    onProgress('folder-empty', `Nenhum documento encontrado em ${folderName}`, baseProgress + 25);
                }

            } catch (error) {
                console.log(`❌ Erro ao processar "${folderName}": ${error.message}`);
                onProgress('folder-error', `Erro ao acessar ${folderName}: ${error.message}`, baseProgress + 25);
            }
        }

        const endTime = Date.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(2);
        const totalFiles = folders.reduce((sum, folder) => sum + folder.files.length, 0);

        const result = {
            success: true,
            folders: folders,
            totalFolders: folders.length,
            totalFiles: totalFiles,
            processingTime: {
                totalSeconds: parseFloat(totalTime),
                startedAt: new Date(startTime).toISOString(),
                completedAt: new Date(endTime).toISOString()
            }
        };

        return result;

    } catch (error) {
        console.log(`❌ Erro durante extração: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

// Função auxiliar para extrair arquivos com progresso
async function extractFilesFromFolderWithProgress(frameLocator, folderName, onProgress, baseProgress) {
    const files = [];

    try {
        await frameLocator.locator('body').waitFor({ timeout: 3000 });

        // Estratégia 1: Procurar por containers de documentos específicos
        const documentContainers = frameLocator.locator('[data-testid="standard-item-container"]');
        const containerCount = await documentContainers.count();

        if (containerCount > 0) {
            for (let i = 0; i < containerCount; i++) {
                try {
                    const container = documentContainers.nth(i);
                    const link = container.locator('a.doc-item-link').first();

                    if (await link.isVisible()) {
                        const fileName = await link.textContent();
                        const href = await link.getAttribute('href');

                        if (fileName && fileName.trim()) {
                            const fileType = getFileTypeFromName(fileName.trim());
                            files.push({
                                name: fileName.trim(),
                                type: fileType,
                                url: href || 'N/A',
                                source: 'standard-container'
                            });
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ Erro no container ${i}: ${e.message}`);
                }
            }
        }

        // Estratégia 2: Fallback - procurar por qualquer link de documento
        if (files.length === 0) {
            const allLinks = frameLocator.locator('a[href*="document"], a.doc-item-link');
            const linkCount = await allLinks.count();

            for (let i = 0; i < linkCount; i++) {
                try {
                    const link = allLinks.nth(i);
                    const text = await link.textContent();
                    const href = await link.getAttribute('href');

                    if (text && text.includes('.') && text.length > 5) {
                        const fileType = getFileTypeFromName(text.trim());
                        files.push({
                            name: text.trim(),
                            type: fileType,
                            url: href || 'N/A',
                            source: 'fallback'
                        });
                    }
                } catch (e) {
                    continue;
                }
            }
        }

    } catch (error) {
        console.log(`❌ Erro ao extrair arquivos: ${error.message}`);
    }

    return files;
}

// Função auxiliar para detectar tipo de arquivo
function getFileTypeFromName(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const typeMap = {
        'pdf': 'PDF',
        'jpg': 'Image', 'jpeg': 'Image', 'png': 'Image', 'gif': 'Image',
        'doc': 'Document', 'docx': 'Document',
        'xls': 'Spreadsheet', 'xlsx': 'Spreadsheet',
        'ppt': 'Presentation', 'pptx': 'Presentation',
        'zip': 'Archive', 'rar': 'Archive',
        'mp4': 'Video', 'avi': 'Video', 'mov': 'Video'
    };
    return typeMap[extension] || 'Document';
}