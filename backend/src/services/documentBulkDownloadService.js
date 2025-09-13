// src/services/documentBulkDownloadService.js
import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const STATE_FILE = 'wf_state.json';

export class DocumentBulkDownloadService {
    constructor() {
        this.defaultDownloadPath = path.join(process.cwd(), 'downloads');
    }

    /**
     * Download em massa de arquivos da pasta "05. Briefing" de múltiplos projetos
     */
    async bulkDownloadBriefings(projectUrls, options = {}) {
        try {
            console.log('📦 === DOWNLOAD EM MASSA DE BRIEFINGS ===');
            console.log(`🔗 ${projectUrls.length} projetos para processar`);

            // Validar entradas
            this.validateBulkDownloadInputs(projectUrls);

            // Configurações
            const {
                headless = true,
                downloadPath = this.defaultDownloadPath,
                continueOnError = true
            } = options;

            // Garantir que o diretório de download existe
            await this.ensureDownloadDirectory(downloadPath);

            // Executar downloads usando Playwright
            const results = await this.performBulkDownload(
                projectUrls,
                downloadPath,
                { headless, continueOnError }
            );

            console.log('✅ Download em massa concluído!');
            return results;

        } catch (error) {
            console.error('❌ Erro no download em massa:', error.message);
            throw error;
        }
    }

    /**
     * Validar entradas para download em massa
     */
    validateBulkDownloadInputs(projectUrls) {
        if (!Array.isArray(projectUrls) || projectUrls.length === 0) {
            throw new Error('Lista de URLs de projetos é obrigatória e deve conter pelo menos um item');
        }

        projectUrls.forEach((url, index) => {
            if (!url || typeof url !== 'string') {
                throw new Error(`URL inválida na posição ${index + 1}`);
            }

            if (!url.includes('workfront') && !url.includes('experience.adobe.com')) {
                throw new Error(`URL ${index + 1} não parece ser um link válido do Workfront: ${url}`);
            }
        });

        console.log('✅ Validação das URLs concluída com sucesso');
    }

    /**
     * Garantir que o diretório de download existe
     */
    async ensureDownloadDirectory(downloadPath) {
        try {
            await fs.access(downloadPath);
            console.log(`📁 Diretório de download: ${downloadPath}`);
        } catch {
            await fs.mkdir(downloadPath, { recursive: true });
            console.log(`📁 Diretório de download criado: ${downloadPath}`);
        }
    }

    /**
     * Executar download em massa usando Playwright
     */
    async performBulkDownload(projectUrls, downloadPath, options) {
        console.log('🎭 Iniciando automação com Playwright...');

        const browser = await chromium.launch({
            headless: options.headless,
            args: options.headless ? [] : ['--start-maximized']
        });

        const results = {
            total: projectUrls.length,
            successful: [],
            failed: [],
            summary: {
                totalFiles: 0,
                totalSize: 0
            }
        };

        try {
            // Verificar e validar sessão salva
            await this.validateSession();

            const context = await browser.newContext({
                storageState: STATE_FILE,
                viewport: null,
                acceptDownloads: true
            });

            const page = await context.newPage();

            // Processar cada projeto
            for (let i = 0; i < projectUrls.length; i++) {
                const projectUrl = projectUrls[i];
                console.log(`\n🔄 Processando projeto ${i + 1}/${projectUrls.length}`);
                console.log(`🌍 URL: ${projectUrl}`);

                try {
                    const projectResult = await this.downloadProjectBriefing(
                        page,
                        projectUrl,
                        downloadPath,
                        i + 1
                    );

                    results.successful.push({
                        url: projectUrl,
                        projectNumber: i + 1,
                        ...projectResult
                    });

                    results.summary.totalFiles += projectResult.filesDownloaded;
                    results.summary.totalSize += projectResult.totalSize || 0;

                    console.log(`✅ Projeto ${i + 1} concluído com sucesso`);

                } catch (error) {
                    console.error(`❌ Erro no projeto ${i + 1}: ${error.message}`);

                    results.failed.push({
                        url: projectUrl,
                        projectNumber: i + 1,
                        error: error.message
                    });

                    if (!options.continueOnError) {
                        throw error;
                    }
                }

                // Pequena pausa entre projetos
                await page.waitForTimeout(2000);
            }

            return results;

        } catch (error) {
            console.error(`❌ Erro durante automação: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }

    /**
     * Download de briefing de um projeto específico
     */
    async downloadProjectBriefing(page, projectUrl, downloadPath, projectNumber) {
        console.log(`📁 Navegando para projeto ${projectNumber}...`);

        try {
            // Navegar para o projeto
            console.log(`🌍 Acessando URL: ${projectUrl}`);
            await page.goto(projectUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });
            await page.waitForTimeout(5000);

            console.log('🔍 Encontrando frame do Workfront...');

            // Aguardar frame aparecer
            try {
                await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"], iframe', {
                    timeout: 15000
                });
            } catch (frameError) {
                console.log('⚠️ Frame não encontrado com seletores padrão, tentando aguardar qualquer iframe...');
                await page.waitForSelector('iframe', { timeout: 10000 });
            }

            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
            await page.waitForTimeout(3000);

            // Extrair nome do projeto da URL ou página
            const projectName = await this.extractProjectName(frameLocator, projectUrl, projectNumber);
            console.log(`📋 Nome do projeto: ${projectName}`);

            // Navegar para a pasta "05. Briefing"
            await this.navigateToBriefingFolder(frameLocator, page);

            // Baixar todos os arquivos da pasta
            const downloadResult = await this.downloadAllFilesInFolder(
                frameLocator,
                page,
                downloadPath,
                projectName
            );

            return {
                projectName: projectName,
                filesDownloaded: downloadResult.count,
                totalSize: downloadResult.totalSize,
                files: downloadResult.files
            };

        } catch (error) {
            console.log(`❌ Erro no projeto ${projectNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extrair nome do projeto e DSID
     */
    async extractProjectName(frameLocator, projectUrl, projectNumber) {
        try {
            // Tentar extrair da página
            const titleSelectors = [
                'h1',
                '[data-testid*="title"]',
                '.project-title',
                '.project-name'
            ];

            for (const selector of titleSelectors) {
                try {
                    const titleElement = frameLocator.locator(selector).first();
                    const count = await titleElement.count();

                    if (count > 0) {
                        const title = await titleElement.textContent();
                        if (title && title.trim()) {
                            console.log(`📋 Título extraído: ${title.trim()}`);
                            const dsid = this.extractDSIDFromTitle(title.trim());
                            if (dsid) {
                                console.log(`🎯 DSID encontrado: ${dsid}`);
                                return dsid;
                            }
                            return this.sanitizeFileName(title.trim());
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            console.log('⚠️ Não foi possível extrair nome do projeto da página');
        }

        // Fallback: extrair da URL
        try {
            const urlMatch = projectUrl.match(/\/project\/([^\/]+)/);
            if (urlMatch) {
                return `projeto_${urlMatch[1]}`;
            }
        } catch (e) {
            // Ignore
        }

        // Fallback final
        return `projeto_${projectNumber}`;
    }

    /**
     * Extrair DSID do título do projeto
     * Formato: 2601G0179_0051_5372936_br_csg_con_fy26q3w9_smv_jscon_wtn-txl_Award-Winning-Innovation---Tier-1
     * DSID: 5372936 (7 dígitos após o terceiro underscore)
     */
    extractDSIDFromTitle(title) {
        try {
            if (!title) return null;

            // Buscar padrão: sequência de 7 dígitos precedida por underscore
            const match = title.match(/_(\d{7})_/);
            if (match) {
                console.log(`🎯 DSID extraído: ${match[1]}`);
                return match[1];
            }

            // Fallback: buscar qualquer sequência de 7 dígitos
            const fallbackMatch = title.match(/(\d{7})/);
            if (fallbackMatch) {
                console.log(`🎯 DSID extraído (fallback): ${fallbackMatch[1]}`);
                return fallbackMatch[1];
            }

            return null;
        } catch (error) {
            console.warn('❌ Erro ao extrair DSID do título:', title, error.message);
            return null;
        }
    }

    /**
     * Navegar para a pasta "05. Briefing"
     */
    async navigateToBriefingFolder(frameLocator, page) {
        console.log('📁 Navegando para pasta "05. Briefing"...');

        // Aguardar a interface carregar
        await page.waitForTimeout(3000);

        const folderSelectors = [
            // Primeira prioridade - seletores mais específicos
            'button:has-text("05. Briefing")',
            'a:has-text("05. Briefing")',

            // Segunda prioridade - variações de texto
            'button:has-text("05 - Briefing")',
            'button:has-text("05-Briefing")',
            'button:has-text("Briefing")',
            'a:has-text("05 - Briefing")',
            'a:has-text("05-Briefing")',
            'a:has-text("Briefing")',

            // Terceira prioridade - por atributos
            '[role="button"]:has-text("05. Briefing")',
            '[role="button"]:has-text("Briefing")',
            '*[data-testid*="item"]:has-text("05. Briefing")',
            '*[data-testid*="item"]:has-text("Briefing")',

            // Quarta prioridade - seletores mais gerais
            '*:has-text("05. Briefing")',
            '*[title*="Briefing"]',
            '*[aria-label*="Briefing"]'
        ];

        // Tentar aguardar pelo menos um elemento aparecer
        console.log('⏳ Aguardando elementos de pasta carregarem...');
        try {
            await frameLocator.locator('[role="button"], button, a, *[data-testid*="item"]').first().waitFor({ timeout: 10000 });
        } catch (e) {
            console.log('⚠️ Timeout aguardando elementos - continuando...');
        }

        let navigationSuccess = false;
        for (const selector of folderSelectors) {
            try {
                console.log(`🔍 Tentando seletor: ${selector}`);
                const element = frameLocator.locator(selector).first();
                const count = await element.count();

                if (count > 0) {
                    console.log(`📋 Elemento encontrado, verificando visibilidade...`);

                    try {
                        await element.waitFor({ state: 'visible', timeout: 2000 });
                        console.log(`✅ Pasta encontrada e visível: ${selector}`);

                        await element.click();
                        console.log('🖱️ Clicando na pasta Briefing...');

                        // Aguardar navegação
                        await page.waitForTimeout(5000);
                        navigationSuccess = true;
                        break;
                    } catch (visibilityError) {
                        console.log(`❌ Elemento não visível: ${selector}`);
                        continue;
                    }
                }
            } catch (e) {
                console.log(`❌ Erro no seletor ${selector}: ${e.message}`);
                continue;
            }
        }

        if (!navigationSuccess) {
            // Listar todos os elementos disponíveis para debug
            console.log('🔍 DIAGNÓSTICO - Elementos encontrados na página:');
            try {
                const allButtons = frameLocator.locator('button, a, [role="button"], *[data-testid*="item"]');
                const buttonCount = await allButtons.count();
                console.log(`📋 Total de elementos clicáveis encontrados: ${buttonCount}`);

                for (let i = 0; i < Math.min(buttonCount, 10); i++) {
                    const element = allButtons.nth(i);
                    try {
                        const text = await element.textContent();
                        const tagName = await element.evaluate(el => el.tagName);
                        console.log(`   ${i + 1}. ${tagName}: "${text?.trim() || 'sem texto'}"`);
                    } catch (e) {
                        console.log(`   ${i + 1}. Erro ao ler elemento`);
                    }
                }
            } catch (diagError) {
                console.log('❌ Erro no diagnóstico:', diagError.message);
            }

            throw new Error('Pasta "05. Briefing" não encontrada no projeto. Verifique se a pasta existe e tem o nome correto.');
        }

        console.log('✅ Navegação para Briefing concluída!');
    }

    /**
     * Baixar todos os arquivos da pasta atual
     */
    async downloadAllFilesInFolder(frameLocator, page, downloadPath, projectName) {
        console.log('📥 Identificando arquivos para download...');

        // Criar estrutura de pastas organizada por DSID
        const projectDownloadPath = await this.createOrganizedFolderStructure(downloadPath, projectName);

        // Encontrar todos os arquivos na pasta
        const fileElements = await this.findAllDownloadableFiles(frameLocator);

        if (fileElements.length === 0) {
            console.log('⚠️ Nenhum arquivo encontrado na pasta Briefing');
            return { count: 0, totalSize: 0, files: [] };
        }

        console.log(`📋 ${fileElements.length} arquivos encontrados para download`);

        // Selecionar todos os arquivos primeiro
        console.log('✅ Selecionando todos os arquivos...');
        for (let i = 0; i < fileElements.length; i++) {
            const fileInfo = fileElements[i];
            console.log(`📄 Selecionando arquivo ${i + 1}/${fileElements.length}: ${fileInfo.name}`);

            try {
                await fileInfo.element.click();
                await page.waitForTimeout(300); // Pequena pausa entre seleções
            } catch (error) {
                console.error(`❌ Erro ao selecionar ${fileInfo.name}: ${error.message}`);
            }
        }

        // Aguardar seleções serem processadas
        await page.waitForTimeout(1000);

        // Procurar e clicar no botão "Download selected"
        console.log('🔽 Procurando botão "Download selected"...');
        const downloadedFiles = await this.downloadSelectedFiles(frameLocator, page, projectDownloadPath);

        return {
            count: downloadedFiles.length,
            totalSize: downloadedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
            files: downloadedFiles
        };
    }

    /**
     * Criar estrutura organizada de pastas por DSID
     */
    async createOrganizedFolderStructure(downloadPath, projectName) {
        // Usar DSID como nome da pasta principal se disponível
        const mainFolderName = this.sanitizeFileName(projectName);
        const projectDownloadPath = path.join(downloadPath, mainFolderName);

        // Criar pasta principal do projeto
        await this.ensureDownloadDirectory(projectDownloadPath);

        // Criar subpastas organizadas
        const subFolders = ['brief', 'ppt', 'creatives'];
        for (const folder of subFolders) {
            const subFolderPath = path.join(projectDownloadPath, folder);
            await this.ensureDownloadDirectory(subFolderPath);
            console.log(`📁 Pasta criada: ${mainFolderName}/${folder}`);
        }

        // Retornar o caminho da pasta brief (onde os PDFs serão salvos)
        const briefPath = path.join(projectDownloadPath, 'brief');
        console.log(`✅ Estrutura de pastas criada para DSID: ${mainFolderName}`);
        console.log(`📂 Arquivos da pasta Briefing serão salvos em: brief/`);

        return briefPath;
    }

    /**
     * Classificar tipo de arquivo para organização
     */
    classifyFileType(fileName) {
        const extension = fileName.split('.').pop()?.toLowerCase();
        console.log(`🔍 Classificando arquivo: "${fileName}" → Extensão: "${extension}"`);

        // Classificação por extensão
        if (['pdf', 'ppt', 'pptx', 'pps', 'ppsx'].includes(extension)) {
            console.log(`📄 Arquivo classificado como PDF → pasta: brief/`);
            return 'brief';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'tiff', 'psd', 'ai', 'eps', 'mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) {
            console.log(`🎨 Arquivo classificado como Creative → pasta: creatives/`);
            return 'creatives';
        }

        // Classificação por nome do arquivo
        const lowerFileName = fileName.toLowerCase();
        if (lowerFileName.includes('brief') || lowerFileName.includes('briefing')) {
            console.log(`📄 Arquivo classificado por nome (brief) → pasta: brief/`);
            return 'brief';
        } else if (lowerFileName.includes('ppt') || lowerFileName.includes('presentation') || lowerFileName.includes('slide')) {
            console.log(`📊 Arquivo classificado por nome (presentation) → pasta: ppt/`);
            return 'ppt';
        } else if (lowerFileName.includes('creative') || lowerFileName.includes('design') || lowerFileName.includes('art')) {
            console.log(`🎨 Arquivo classificado por nome (creative) → pasta: creatives/`);
            return 'creatives';
        }

        // Default: brief (já que estamos na pasta Briefing)
        console.log(`📄 Arquivo classificado como padrão → pasta: brief/`);
        return 'brief';
    }

    /**
     * Encontrar todos os arquivos baixáveis na pasta
     */
    async findAllDownloadableFiles(frameLocator) {
        console.log('🔍 Procurando arquivos selecionáveis...');

        // Aguardar pasta carregar
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fileSelectors = [
            // Seletores mais específicos para arquivos selecionáveis
            '.doc-detail-view', // Seletor usado em outras partes do sistema
            '.file-item[role="checkbox"]',
            '.document-item[role="checkbox"]',
            '[data-testid*="file"][role="checkbox"]',
            '[data-testid*="document"][role="checkbox"]',
            // Seletores de fallback
            '.file-item',
            '.document-item',
            '[data-testid*="file"]',
            '[data-testid*="document"]',
            // Elementos que podem ser clicáveis para seleção
            '[role="checkbox"]',
            'input[type="checkbox"]',
            // Seletores genéricos
            '.selectable-file',
            '.selectable-document'
        ];

        const files = [];

        for (const selector of fileSelectors) {
            try {
                console.log(`🔄 Tentando seletor: ${selector}`);
                const elements = await frameLocator.locator(selector).all();

                console.log(`📋 Encontrados ${elements.length} elementos com "${selector}"`);

                if (elements.length > 0) {
                    for (let i = 0; i < elements.length; i++) {
                        const element = elements[i];

                        try {
                            // Verificar se o elemento é visível
                            const isVisible = await element.isVisible();
                            if (!isVisible) continue;

                            // Tentar extrair nome do arquivo
                            let fileName = '';

                            // Estratégias para extrair nome do arquivo
                            const nameStrategies = [
                                () => element.getAttribute('aria-label'),
                                () => element.getAttribute('title'),
                                () => element.textContent(),
                                () => element.locator('[aria-label]').first().getAttribute('aria-label'),
                                () => element.locator('[title]').first().getAttribute('title')
                            ];

                            for (const strategy of nameStrategies) {
                                try {
                                    const name = await strategy();
                                    if (name && name.trim() && !name.toLowerCase().includes('folder') && !name.toLowerCase().includes('pasta')) {
                                        fileName = name.trim();
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            if (!fileName) {
                                fileName = `arquivo_${i + 1}`;
                            }

                            // Verificar se não é uma pasta
                            const text = await element.textContent() || '';
                            if (text.toLowerCase().includes('folder') || text.toLowerCase().includes('pasta')) {
                                continue;
                            }

                            files.push({
                                element: element,
                                name: fileName,
                                index: i
                            });

                            console.log(`📄 Arquivo encontrado: ${fileName}`);

                        } catch (e) {
                            console.log(`⚠️ Erro ao processar elemento ${i}: ${e.message}`);
                            continue;
                        }
                    }

                    if (files.length > 0) {
                        console.log(`✅ Total de arquivos encontrados: ${files.length}`);
                        break; // Encontrou arquivos com este seletor, parar busca
                    }
                }
            } catch (e) {
                console.log(`❌ Erro com seletor "${selector}": ${e.message}`);
                continue;
            }
        }

        if (files.length === 0) {
            console.log('❌ Nenhum arquivo selecionável encontrado');

            // Debug: listar elementos disponíveis
            try {
                console.log('🔍 DEBUG: Listando elementos disponíveis...');
                const allElements = await frameLocator.locator('*').all();
                console.log(`📊 Total de elementos na página: ${allElements.length}`);

                // Procurar por qualquer coisa que pareça arquivo
                const possibleFiles = await frameLocator.locator('*').evaluateAll(elements => {
                    return elements
                        .filter(el => {
                            const text = el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '';
                            return text.includes('.pdf') || text.includes('.doc') || text.includes('.xls') ||
                                text.includes('.png') || text.includes('.jpg') || text.includes('.zip');
                        })
                        .slice(0, 5) // Apenas os primeiros 5
                        .map(el => ({
                            tag: el.tagName,
                            class: el.className,
                            text: (el.textContent || '').substring(0, 50),
                            ariaLabel: el.getAttribute('aria-label'),
                            title: el.getAttribute('title')
                        }));
                });

                console.log('📄 Possíveis arquivos encontrados:', possibleFiles);

            } catch (debugError) {
                console.log('❌ Erro no debug:', debugError.message);
            }
        }

        return files;
    }

    /**
     * Baixar arquivos selecionados usando o botão "Download selected"
     */
    async downloadSelectedFiles(frameLocator, page, downloadPath) {
        console.log('🔽 Procurando botão "Download selected"...');

        // Seletores para o botão de download selecionados baseado no HTML fornecido
        const downloadButtonSelectors = [
            'button[data-testid="downloadselected"]', // Seletor específico do HTML
            'button[title="Download selected"]',
            'button:has([title="Download selected"])',
            'button.css-ikvpst[data-testid="downloadselected"]',
            'button:has(svg):has([title="Download selected"])',
            '[data-testid="downloadselected"]'
        ];

        let downloadButton = null;
        for (const selector of downloadButtonSelectors) {
            try {
                const button = frameLocator.locator(selector).first();
                const count = await button.count();

                if (count > 0 && await button.isVisible()) {
                    console.log(`✅ Botão "Download selected" encontrado: ${selector}`);
                    downloadButton = button;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!downloadButton) {
            throw new Error('Botão "Download selected" não encontrado. Verifique se os arquivos estão selecionados.');
        }

        // Configurar listener para múltiplos downloads
        const downloads = [];
        let downloadCount = 0;

        // Listener para capturar downloads
        page.on('download', async (download) => {
            downloadCount++;
            console.log(`📥 Download ${downloadCount} iniciado: ${download.suggestedFilename()}`);

            try {
                const fileName = download.suggestedFilename();

                // Classificar arquivo e determinar pasta de destino
                const fileType = this.classifyFileType(fileName);
                const targetFolder = path.dirname(downloadPath); // Pasta principal do projeto
                const typeFolderPath = path.join(targetFolder, fileType);

                // Garantir que a pasta de destino existe
                await this.ensureDownloadDirectory(typeFolderPath);

                // Preservar extensão original e aplicar regras de nomenclatura
                const sanitizedFileName = this.sanitizeFileNameWithExtension(fileName);
                const filePath = path.join(typeFolderPath, sanitizedFileName);

                await download.saveAs(filePath);

                // Obter tamanho do arquivo
                const stats = await fs.stat(filePath);

                downloads.push({
                    fileName: fileName,
                    filePath: filePath,
                    fileType: fileType,
                    size: stats.size
                });

                console.log(`✅ Download ${downloadCount} concluído:`);
                console.log(`   📄 Nome original: ${fileName}`);
                console.log(`   📄 Nome final: ${sanitizedFileName}`);
                console.log(`   📁 Pasta: ${fileType}/`);
                console.log(`   💾 Tamanho: ${this.formatFileSize(stats.size)}`);
            } catch (error) {
                console.error(`❌ Erro no download ${downloadCount}: ${error.message}`);
                downloads.push({
                    fileName: download.suggestedFilename() || `arquivo_${downloadCount}`,
                    error: error.message,
                    size: 0
                });
            }
        });

        // Clicar no botão de download
        console.log('🖱️ Clicando no botão "Download selected"...');
        try {
            await downloadButton.click();
        } catch (clickError) {
            console.log('⚠️ Clique normal falhou, tentando clique forçado...');
            await downloadButton.click({ force: true });
        }

        // Aguardar downloads serem iniciados e concluídos
        console.log('⏳ Aguardando downloads serem processados...');
        await page.waitForTimeout(3000); // Aguardar downloads iniciarem

        // Aguardar todos os downloads terminarem (com timeout)
        const maxWaitTime = 120000; // 2 minutos máximo
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            // Verificar se ainda há downloads em progresso
            try {
                // Se não há downloads em progresso, podemos continuar
                await page.waitForTimeout(2000);

                // Verificar se algum download foi iniciado
                if (downloads.length > 0) {
                    console.log(`✅ Downloads concluídos: ${downloads.length} arquivos`);
                    break;
                }

                // Se passou muito tempo sem downloads, assumir que não há arquivos para baixar
                if (Date.now() - startTime > 10000) {
                    console.log('⚠️ Nenhum download detectado após 10 segundos');
                    break;
                }
            } catch (e) {
                // Continuar aguardando
                await page.waitForTimeout(1000);
            }
        }

        // Remover listener
        page.removeAllListeners('download');

        if (downloads.length === 0) {
            console.log('⚠️ Nenhum download foi processado');
        } else {
            // Relatório de organização por tipo
            const filesByType = {};
            downloads.forEach(file => {
                const type = file.fileType || 'unknown';
                if (!filesByType[type]) filesByType[type] = [];
                filesByType[type].push(file.fileName);
            });

            console.log('\n📋 ORGANIZAÇÃO DOS ARQUIVOS:');
            Object.keys(filesByType).forEach(type => {
                console.log(`  📁 ${type}/: ${filesByType[type].length} arquivos`);
                filesByType[type].forEach(fileName => {
                    console.log(`    - ${fileName}`);
                });
            });
            console.log('');
        }

        return downloads;
    }

    /**
     * Formatar tamanho de arquivo para exibição
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Sanitizar nome de arquivo com regras específicas
     */
    sanitizeFileName(fileName) {
        if (!fileName) return 'arquivo_sem_nome';

        // Aplicar regras de nomenclatura específicas
        let cleanName = fileName
            // Substituir três traços por um traço
            .replace(/---/g, '-')
            // Substituir Tier-X por TX
            .replace(/Tier-1/gi, 'T1')
            .replace(/Tier-2/gi, 'T2')
            .replace(/Tier-3/gi, 'T3')
            // Remover "Brief" ou "Briefing" do final (opcional)
            .replace(/[_-]?brief(ing)?$/gi, '')
            // Remover caracteres inválidos para nomes de arquivo
            .replace(/[<>:"/\\|?*]/g, '_')
            // Manter espaços, apenas limpar espaços duplos
            .replace(/\s{2,}/g, ' ')
            // Limpar traços/underscores duplos
            .replace(/[_-]{2,}/g, '_')
            .trim();

        // Garantir que não seja muito longo (máximo 200 caracteres)
        if (cleanName.length > 200) {
            const ext = path.extname(cleanName);
            const baseName = path.basename(cleanName, ext);
            cleanName = baseName.substring(0, 200 - ext.length) + ext;
        }

        return cleanName || 'arquivo_sem_nome';
    }

    /**
     * Sanitizar nome de arquivo preservando a extensão original
     */
    sanitizeFileNameWithExtension(fileName) {
        if (!fileName) return 'arquivo_sem_nome';

        // Separar nome e extensão
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);

        // Aplicar regras de nomenclatura ao nome base
        let cleanBaseName = baseName
            // Substituir três traços por um traço
            .replace(/---/g, '-')
            // Substituir Tier-X por TX
            .replace(/Tier-1/gi, 'T1')
            .replace(/Tier-2/gi, 'T2')
            .replace(/Tier-3/gi, 'T3')
            // Remover "Brief" ou "Briefing" do final (opcional)
            .replace(/[_-]?brief(ing)?$/gi, '')
            // Remover caracteres inválidos para nomes de arquivo
            .replace(/[<>:"/\\|?*]/g, '_')
            // Manter espaços, apenas limpar espaços duplos
            .replace(/\s{2,}/g, ' ')
            // Limpar traços/underscores duplos
            .replace(/[_-]{2,}/g, '_')
            .trim();

        // Garantir que não seja muito longo
        const maxLength = 200 - ext.length;
        if (cleanBaseName.length > maxLength) {
            cleanBaseName = cleanBaseName.substring(0, maxLength);
        }

        // Reconectar nome e extensão
        const finalName = (cleanBaseName || 'arquivo_sem_nome') + ext;

        console.log(`📝 Arquivo sanitizado: "${fileName}" → "${finalName}"`);
        return finalName;
    }

    /**
     * Obter preview do download em massa
     */
    getDownloadPreview(projectUrls) {
        return {
            totalProjects: projectUrls.length,
            targetFolder: '05. Briefing',
            downloadPath: this.defaultDownloadPath,
            folderStructure: {
                description: 'Arquivos organizados por DSID em subpastas',
                structure: {
                    '[DSID]/': 'Pasta principal com o DSID do projeto',
                    '[DSID]/brief/': 'PDFs e documentos de briefing',
                    '[DSID]/ppt/': 'Apresentações PowerPoint',
                    '[DSID]/creatives/': 'Imagens, vídeos e criativos'
                }
            },
            estimatedTime: `${projectUrls.length * 2}-${projectUrls.length * 5} minutos`,
            projects: projectUrls.map((url, index) => ({
                number: index + 1,
                url: url,
                status: 'pending',
                expectedDSID: 'Será extraído automaticamente do nome do projeto'
            }))
        };
    }

    /**
     * Validar sessão salva
     */
    async validateSession() {
        try {
            // Verificar se arquivo de sessão existe
            await fs.access(STATE_FILE);

            // Ler conteúdo do arquivo
            const sessionContent = await fs.readFile(STATE_FILE, 'utf8');
            const sessionData = JSON.parse(sessionContent);

            // Verificar se tem dados de sessão válidos
            if (!sessionData || (!sessionData.cookies && !sessionData.origins)) {
                throw new Error('Arquivo de sessão está vazio ou inválido');
            }

            // Verificar se arquivo é muito antigo (mais de 8 horas)
            const stats = await fs.stat(STATE_FILE);
            const now = new Date();
            const fileAge = now - stats.mtime;
            const hoursAge = fileAge / (1000 * 60 * 60);

            if (hoursAge > 8) {
                throw new Error(`Sessão expirada (${Math.round(hoursAge)} horas). Faça login novamente.`);
            }

            console.log('✅ Sessão válida encontrada');
            console.log(`🕒 Idade da sessão: ${Math.round(hoursAge * 10) / 10} horas`);

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Arquivo de sessão não encontrado: ${STATE_FILE}. Execute o login primeiro.`);
            }
            throw new Error(`Erro na validação da sessão: ${error.message}`);
        }
    }
}

export default new DocumentBulkDownloadService();