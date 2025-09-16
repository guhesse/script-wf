// src/services/documentExtractionService.js
import { chromium } from '@playwright/test';

const STATE_FILE = 'wf_state.json';

export class DocumentExtractionService {
    /**
     * Extrair documentos de um projeto Workfront
     */
    async extractDocuments(projectUrl, options = {}) {
        try {
            const {
                headless = true,
                userAgent,
                ipAddress,
                onProgress
            } = options;

            console.log('📁 Iniciando extração de documentos...');
            console.log(`🔗 URL: ${projectUrl}`);
            console.log(`👁️ Modo: ${headless ? 'Headless' : 'Visível'}`);

            // Callback para progresso se fornecido
            if (onProgress) {
                onProgress('starting', 'Conectando ao Workfront...', 10);
            }

            // Implementar extração diretamente com Playwright
            const extractionResult = await this.performDocumentExtraction(projectUrl, headless, onProgress);

            // Verificar se a extração foi bem-sucedida
            if (!extractionResult || !extractionResult.success) {
                throw new Error(extractionResult?.error || 'Falha na extração de documentos');
            }

            if (onProgress) {
                onProgress('parsing', 'Processando documentos encontrados...', 70);
            }

            // Processar e validar resultado
            const processedResult = this.processExtractionResult(extractionResult);

            if (onProgress) {
                onProgress('completed', 'Extração concluída com sucesso', 100, processedResult);
            }

            console.log('✅ Extração concluída com sucesso');
            console.log(`📊 Resultado: ${processedResult.totalFiles} arquivos em ${processedResult.totalFolders} pastas`);

            return processedResult;

        } catch (error) {
            console.error('❌ Erro na extração de documentos:', error.message);

            if (options.onProgress) {
                options.onProgress('error', `Erro na extração: ${error.message}`, 0);
            }

            throw new Error(`Falha na extração: ${error.message}`);
        }
    }

    /**
     * Realizar extração de documentos usando Playwright
     */
    async performDocumentExtraction(projectUrl, headless = true, onProgress = null) {
        const startTime = Date.now();
        console.log('📂 === EXTRAINDO DOCUMENTOS DO PROJETO ===');
        console.log(`🔗 URL: ${projectUrl}`);
        console.log(`⏱️ Iniciado em: ${new Date().toLocaleTimeString()}`);
        console.log(`👁️ Modo: ${headless ? 'Headless (invisível)' : 'Visível'}`);

        const browser = await chromium.launch({
            headless: headless,
            args: headless ? [] : ['--start-maximized']
        });

        try {
            const context = await browser.newContext({
                storageState: STATE_FILE,
                viewport: null
            });

            const page = await context.newPage();

            console.log('🌍 Carregando projeto...');
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            if (onProgress) {
                onProgress('loading', 'Carregando interface do Workfront...', 30);
            }

            console.log('🔍 Encontrando frame do Workfront...');
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

            // Aguardar interface carregar
            await page.waitForTimeout(2000);

            const folders = [];
            const targetFolders = ['Asset Release', 'Final Materials'];

            console.log(`🎯 Procurando pastas: ${targetFolders.join(', ')}`);

            if (onProgress) {
                onProgress('extracting', 'Extraindo documentos das pastas...', 50);
            }

            for (const folderName of targetFolders) {
                console.log(`\n📁 Processando pasta: ${folderName}`);

                try {
                    // Usar getByRole e getByText para encontrar pasta
                    const folderButton = frameLocator.getByRole('button', { name: new RegExp(folderName, 'i') })
                        .or(frameLocator.getByText(folderName))
                        .first();

                    // Verificar se pasta existe
                    try {
                        await folderButton.waitFor({ timeout: 5000 });
                        console.log(`✅ Pasta "${folderName}" encontrada`);

                        await folderButton.click();
                        console.log(`🖱️ Clicado na pasta "${folderName}"`);
                        await page.waitForTimeout(3000);

                        // Extrair arquivos da pasta
                        const files = await this.extractFilesFromFolder(frameLocator);

                        if (files.length > 0) {
                            folders.push({
                                name: folderName,
                                files: files
                            });

                            console.log(`✅ ${files.length} arquivos encontrados em "${folderName}"`);
                            files.forEach((file, i) => {
                                console.log(`  ${i + 1}. ${file.name} (${file.type})`);
                            });
                        } else {
                            console.log(`⚠️ Nenhum arquivo encontrado em "${folderName}"`);
                        }

                    } catch (e) {
                        console.log(`❌ Pasta "${folderName}" não encontrada: ${e.message}`);
                    }

                } catch (error) {
                    console.log(`❌ Erro ao processar "${folderName}": ${error.message}`);
                }
            }

            const endTime = Date.now();
            const totalTime = ((endTime - startTime) / 1000).toFixed(2);
            const totalFiles = folders.reduce((sum, folder) => sum + folder.files.length, 0);

            console.log('\n' + '='.repeat(50));
            console.log(`⏱️ TEMPO TOTAL: ${totalTime}s`);
            console.log(`📊 RESULTADO: ${totalFiles} arquivos em ${folders.length} pastas`);
            console.log(`🏁 Concluído em: ${new Date().toLocaleTimeString()}`);
            console.log('='.repeat(50));

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

            console.log(`EXTRACT_RESULT:${JSON.stringify(result)}`);
            return result;

        } catch (error) {
            console.log(`❌ Erro durante extração: ${error.message}`);
            return {
                success: false,
                error: error.message,
                folders: [],
                totalFolders: 0,
                totalFiles: 0
            };
        } finally {
            await browser.close();
        }
    }

    /**
     * Extrair arquivos de uma pasta específica
     */
    async extractFilesFromFolder(frameLocator) {
        const files = [];

        try {
            console.log('🔍 Analisando arquivos na pasta...');
            await frameLocator.locator('body').waitFor({ timeout: 3000 });

            // Estratégia 1: Procurar por containers de documentos específicos
            const documentContainers = frameLocator.locator('[data-testid="standard-item-container"]');
            const containerCount = await documentContainers.count();

            console.log(`📋 Encontrados ${containerCount} containers de documentos`);

            if (containerCount > 0) {
                for (let i = 0; i < containerCount; i++) {
                    try {
                        const container = documentContainers.nth(i);
                        const link = container.locator('a.doc-item-link').first();

                        if (await link.isVisible()) {
                            const fileName = await link.textContent();
                            const href = await link.getAttribute('href');

                            if (fileName && fileName.trim()) {
                                const fileType = this.getFileTypeFromName(fileName.trim());
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
                console.log('🔄 Usando estratégia fallback...');

                const allLinks = frameLocator.locator('a[href*="document"], a.doc-item-link');
                const linkCount = await allLinks.count();

                for (let i = 0; i < linkCount; i++) {
                    try {
                        const link = allLinks.nth(i);
                        const text = await link.textContent();
                        const href = await link.getAttribute('href');

                        if (text && text.includes('.') && text.length > 5) {
                            const fileType = this.getFileTypeFromName(text.trim());
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

    /**
     * Determinar tipo de arquivo baseado no nome
     */
    getFileTypeFromName(fileName) {
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

    /**
     * Processar e validar resultado da extração
     */
    processExtractionResult(rawResult) {
        try {
            // Garantir estrutura mínima
            const result = {
                success: true,
                folders: rawResult.folders || [],
                totalFolders: rawResult.totalFolders || 0,
                totalFiles: rawResult.totalFiles || 0,
                processingTime: rawResult.processingTime || {},
                projectTitle: this.extractProjectTitle(rawResult)
            };

            // Validar e limpar dados das pastas
            result.folders = result.folders.map(folder => ({
                name: folder.name || 'Pasta sem nome',
                files: (folder.files || []).map(file => ({
                    name: file.name || 'Arquivo sem nome',
                    type: file.type || 'Desconhecido',
                    size: file.size || 'N/A',
                    url: file.url || null,
                    addedInfo: file.addedInfo || null
                }))
            }));

            // Recalcular totais se necessário
            if (!result.totalFolders) {
                result.totalFolders = result.folders.length;
            }

            if (!result.totalFiles) {
                result.totalFiles = result.folders.reduce((sum, folder) => sum + folder.files.length, 0);
            }

            return result;

        } catch (error) {
            console.error('❌ Erro ao processar resultado:', error.message);
            return {
                success: false,
                error: error.message,
                folders: [],
                totalFolders: 0,
                totalFiles: 0
            };
        }
    }

    /**
     * Extrair título do projeto do resultado
     */
    extractProjectTitle(result) {
        // Tentar extrair título de várias fontes possíveis
        if (result.projectTitle) return result.projectTitle;
        if (result.title) return result.title;

        // Se não encontrou, tentar extrair de metadados
        if (result.metadata && result.metadata.title) {
            return result.metadata.title;
        }

        // Fallback: gerar título baseado nos arquivos encontrados
        const totalFiles = result.totalFiles || 0;
        return `Projeto Workfront - ${totalFiles} arquivos`;
    }

    /**
     * Validar URL do projeto
     */
    isValidWorkfrontUrl(url) {
        try {
            const validPatterns = [
                /experience\.adobe\.com.*workfront.*project/i,
                /workfront\.com.*project/i
            ];

            return validPatterns.some(pattern => pattern.test(url));
        } catch (error) {
            return false;
        }
    }

    /**
     * Extrair informações do projeto da URL
     */
    extractProjectInfo(projectUrl) {
        try {
            const url = new URL(projectUrl);

            // Extrair ID do projeto da URL
            const projectIdMatch = url.pathname.match(/\/project\/([a-f0-9]+)/i);
            const projectId = projectIdMatch ? projectIdMatch[1] : null;

            return {
                projectId,
                host: url.host,
                pathname: url.pathname,
                isWorkfront: this.isValidWorkfrontUrl(projectUrl)
            };

        } catch (error) {
            console.warn('Não foi possível extrair informações da URL:', projectUrl);
            return {
                projectId: null,
                host: null,
                pathname: null,
                isWorkfront: false
            };
        }
    }
}

export default new DocumentExtractionService();
