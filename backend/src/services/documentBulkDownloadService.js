// src/services/documentBulkDownloadService.js
import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const STATE_FILE = 'wf_state.json';

// Import da biblioteca pdf-parse usando require (compatibilidade CommonJS)
let pdfParse = null;

async function initPdfParse() {
    if (!pdfParse) {
        try {
            pdfParse = require('pdf-parse');
            console.log('✅ Biblioteca pdf-parse carregada com sucesso');
        } catch (error) {
            console.error('❌ Erro ao carregar pdf-parse:', error.message);
            throw new Error('Biblioteca pdf-parse não disponível. Execute: npm install pdf-parse');
        }
    }
    return pdfParse;
}

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

                    // Adicionar informações sobre PDFs processados
                    if (projectResult.pdfProcessing) {
                        if (!results.summary.pdfProcessing) {
                            results.summary.pdfProcessing = {
                                totalPdfs: 0,
                                successfulExtractions: 0,
                                totalCharactersExtracted: 0
                            };
                        }

                        results.summary.pdfProcessing.totalPdfs += projectResult.pdfProcessing.processed || 0;
                        results.summary.pdfProcessing.successfulExtractions +=
                            (projectResult.pdfProcessing.results || []).filter(pdf => pdf.hasContent).length;
                        results.summary.pdfProcessing.totalCharactersExtracted +=
                            (projectResult.pdfProcessing.results || []).reduce((sum, pdf) => sum + (pdf.textLength || 0), 0);
                    }

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
                waitUntil: 'domcontentloaded',
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

            // Processar PDFs baixados e extrair conteúdo
            console.log('🔍 Iniciando processamento de PDFs...');
            let pdfResults = [];
            try {
                // Usar o briefPath retornado pelo downloadAllFilesInFolder
                pdfResults = await this.processPdfsInProject(downloadResult.briefPath, projectName);
                console.log(`✅ Processamento de PDFs concluído: ${pdfResults.length} arquivos processados`);
            } catch (pdfError) {
                console.warn(`⚠️ Erro no processamento de PDFs: ${pdfError.message}`);
            }

            return {
                projectName: projectName,
                filesDownloaded: downloadResult.count,
                totalSize: downloadResult.totalSize,
                files: downloadResult.files,
                pdfProcessing: {
                    processed: pdfResults.length,
                    results: pdfResults,
                    hasTextExtraction: pdfResults.some(pdf => pdf.hasContent)
                }
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
                    console.log('📋 Elemento encontrado, verificando visibilidade...');

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
            files: downloadedFiles,
            briefPath: projectDownloadPath
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
        console.log('📂 Arquivos da pasta Briefing serão salvos em: brief/');

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
            console.log('📄 Arquivo classificado como PDF → pasta: brief/');
            return 'brief';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'tiff', 'psd', 'ai', 'eps', 'mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) {
            console.log('🎨 Arquivo classificado como Creative → pasta: creatives/');
            return 'creatives';
        }

        // Classificação por nome do arquivo
        const lowerFileName = fileName.toLowerCase();
        if (lowerFileName.includes('brief') || lowerFileName.includes('briefing')) {
            console.log('📄 Arquivo classificado por nome (brief) → pasta: brief/');
            return 'brief';
        } else if (lowerFileName.includes('ppt') || lowerFileName.includes('presentation') || lowerFileName.includes('slide')) {
            console.log('📊 Arquivo classificado por nome (presentation) → pasta: ppt/');
            return 'ppt';
        } else if (lowerFileName.includes('creative') || lowerFileName.includes('design') || lowerFileName.includes('art')) {
            console.log('🎨 Arquivo classificado por nome (creative) → pasta: creatives/');
            return 'creatives';
        }

        // Default: brief (já que estamos na pasta Briefing)
        console.log('📄 Arquivo classificado como padrão → pasta: brief/');
        return 'brief';
    }

    /**
     * Encontrar todos os arquivos baixáveis na pasta
     */
    async findAllDownloadableFiles(frameLocator) {
        console.log('🔍 Procurando arquivos selecionáveis...');

        // Aguardar pasta carregar com timeout mais curto
        await new Promise(resolve => setTimeout(resolve, 1500));

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

    /**
     * Carregar e inicializar pdfjs-dist (configurado para Node.js)
     */
    async loadPdfJsLib() {
        try {
            // Configurar ambiente Node.js para pdfjs-dist
            const { createCanvas, createImageData } = await import('canvas');
            
            // Configurar globals necessários para pdfjs-dist no Node.js
            if (typeof globalThis.DOMMatrix === 'undefined') {
                // Mock das APIs DOM necessárias
                globalThis.DOMMatrix = class DOMMatrix {
                    constructor() {
                        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
                    }
                };
                
                globalThis.Path2D = class Path2D {};
                globalThis.CanvasGradient = class CanvasGradient {};
                globalThis.CanvasPattern = class CanvasPattern {};
            }
            
            // Usar build legacy para Node.js
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
            console.log('✅ pdfjs-dist carregado com sucesso (configurado para Node.js)');
            return pdfjsLib;
        } catch (error) {
            console.error('❌ Erro detalhado ao carregar pdfjs-dist:', error);
            throw new Error(`Erro ao carregar pdfjs-dist: ${error.message}`);
        }
    }

    /**
     * Extrair comentários/anotações de um PDF usando pdfjs-dist
     */
    async extractPdfComments(pdfBuffer) {
        try {
            console.log('🔍 Iniciando extração de anotações com pdfjs-dist...');

            const pdfjsLib = await this.loadPdfJsLib();

            // Converter Buffer para Uint8Array
            const uint8Array = new Uint8Array(pdfBuffer);
            console.log(`📊 Buffer convertido: ${uint8Array.length} bytes`);

            const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
            const pdf = await loadingTask.promise;

            console.log(`📄 PDF carregado: ${pdf.numPages} páginas`);

            const comments = [];

            // Iterar por todas as páginas
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📖 Processando página ${pageNum}/${pdf.numPages}...`);
                const page = await pdf.getPage(pageNum);

                // Obter anotações da página com diferentes intents
                const displayAnnotations = await page.getAnnotations({ intent: 'display' });
                const printAnnotations = await page.getAnnotations({ intent: 'print' });

                // Combinar todas as anotações
                const allAnnotations = [...displayAnnotations, ...printAnnotations];

                console.log(`📝 Encontradas ${allAnnotations.length} anotações na página ${pageNum}`);

                for (const annotation of allAnnotations) {
                    console.log(`🔎 Processando anotação: ${annotation.subtype || 'Unknown'} - ${annotation.title || 'Sem autor'}`);

                    // Extrair informações relevantes da anotação
                    // Tentar múltiplas propriedades para o autor
                    let author = null;
                    if (annotation.titleObj && annotation.titleObj.str) author = annotation.titleObj.str;
                    else if (annotation.title && annotation.title !== 'Unknown') author = annotation.title;
                    else if (annotation.author) author = annotation.author;
                    else if (annotation.T) author = annotation.T;
                    else if (annotation.contents && annotation.contents.includes('Author:')) {
                        const authorMatch = annotation.contents.match(/Author:\s*([^\n]+)/);
                        if (authorMatch) author = authorMatch[1].trim();
                    }

                    const comment = {
                        page: pageNum,
                        id: annotation.id || null,
                        subtype: annotation.subtype || null,
                        author: author,
                        contents: annotation.contents || annotation.Contents || null,
                        richText: this.extractRichTextContent(annotation.richText || annotation.RC),
                        modificationDate: annotation.modificationDate || annotation.modDate || annotation.M || null,
                        creationDate: annotation.creationDate || annotation.creationDateString || annotation.CreationDate || null,
                        subject: annotation.subject || annotation.Subj || null,
                        rect: annotation.rect || null,
                        color: annotation.color || null,
                        type: 'pdf-annotation',
                        extracted: new Date().toISOString(),
                        annotationType: this.getAnnotationType(annotation.subtype)
                    };

                    // Registrar informações detalhadas para debug
                    console.log('   📋 Detalhes:');
                    console.log(`      - Tipo: ${comment.subtype}`);
                    console.log(`      - Autor: ${comment.author || 'N/A'}`);
                    console.log(`      - Conteúdo: ${comment.contents || 'N/A'}`);
                    console.log(`      - Assunto: ${comment.subject || 'N/A'}`);

                    // Adicionar mesmo que não tenha conteúdo (para debug e capturar sticky notes vazias)
                    comments.push(comment);
                }
            }

            console.log(`✅ Extração concluída: ${comments.length} anotações encontradas`);
            return comments;

        } catch (error) {
            console.error(`❌ Erro ao extrair anotações com pdfjs-dist: ${error.message}`);
            console.error('Stack trace:', error.stack);
            return [];
        }
    }

    /**
     * Extrair conteúdo de rich text de anotações
     */
    extractRichTextContent(richText) {
        if (!richText) return null;

        try {
            // Se for string, retornar diretamente
            if (typeof richText === 'string') {
                return richText;
            }

            // Se for objeto, tentar extrair texto
            if (typeof richText === 'object') {
                // Verificar propriedades comuns de rich text
                if (richText.str) return richText.str;
                if (richText.text) return richText.text;
                if (richText.content) return richText.content;

                // Se for array, juntar os elementos
                if (Array.isArray(richText)) {
                    return richText.map(item => {
                        if (typeof item === 'string') return item;
                        if (item && item.str) return item.str;
                        if (item && item.text) return item.text;
                        return '';
                    }).join(' ').trim();
                }

                // Tentar JSON.stringify como fallback
                try {
                    const jsonStr = JSON.stringify(richText);
                    // Se não for apenas um objeto vazio
                    if (jsonStr !== '{}' && jsonStr !== '[]') {
                        return jsonStr;
                    }
                } catch {
                    // Ignorar erro de JSON
                }
            }

            return null;
        } catch (error) {
            console.warn(`⚠️ Erro ao extrair rich text: ${error.message}`);
            return null;
        }
    }

    /**
     * Determinar tipo de anotação
     */
    getAnnotationType(subtype) {
        const types = {
            'Text': 'Sticky Note',
            'Note': 'Nota',
            'Highlight': 'Destaque',
            'Underline': 'Sublinhado',
            'StrikeOut': 'Riscado',
            'Squiggly': 'Rabisco',
            'FreeText': 'Texto Livre',
            'Stamp': 'Carimbo',
            'Ink': 'Tinta',
            'Line': 'Linha',
            'Square': 'Quadrado',
            'Circle': 'Círculo',
            'Polygon': 'Polígono',
            'PolyLine': 'Linha Poligonal',
            'Link': 'Link',
            'Popup': 'Popup'
        };
        return types[subtype] || subtype || 'Desconhecido';
    }

    /**
     * Processar e deduplicar comentários
     */
    processAndDeduplicateComments(comments) {
        const textMap = new Map(); // Para rastrear textos únicos
        const extractedLinks = new Set(); // Para coletar links completos únicos
        const commentsByAuthor = new Map(); // Para agrupar por autor
        const structuredData = { // Dados estruturados para a aplicação web
            liveDate: null,
            vf: null,
            headlineCopy: null,
            copy: null,
            description: null,
            cta: null,
            background: null,
            colorCopy: null,
            postcopy: null,
            urn: null,
            allocadia: null,
            po: null
        };

        for (const comment of comments) {
            // Extrair texto do comentário (priorizar richText se disponível)
            let text = comment.richText || comment.contents || '';
            text = text.trim();

            // Pular comentários vazios
            if (!text) continue;

            // Extrair URLs completas do texto
            const urlRegex = /https?:\/\/[^\s\n]+/g;
            const urls = text.match(urlRegex);
            if (urls) {
                urls.forEach(url => extractedLinks.add(url.trim()));
            }

            // Verificar se já temos este texto (evitar duplicados Sticky Note vs Popup)
            if (textMap.has(text)) {
                continue; // Pular duplicado
            }

            // Marcar este texto como processado
            textMap.set(text, true);

            // Extrair dados estruturados para campos específicos
            this.extractStructuredFields(text, structuredData);

            // Agrupar por autor APENAS se o comentário NÃO contém links
            if (!urls || urls.length === 0) {
                const author = comment.author || 'Não informado';
                if (!commentsByAuthor.has(author)) {
                    commentsByAuthor.set(author, []);
                }
                commentsByAuthor.get(author).push(text);
            }
        }

        return {
            commentsByAuthor: commentsByAuthor,
            links: Array.from(extractedLinks).sort(),
            structuredData: structuredData
        };
    }

    /**
     * Extrair campos estruturados dos comentários
     */
    extractStructuredFields(text, structuredData) {
        const lowerText = text.toLowerCase();

        // Live Date
        const liveDateMatch = text.match(/live\s+dates?:\s*([^\n]+)/i);
        if (liveDateMatch && !structuredData.liveDate) {
            structuredData.liveDate = liveDateMatch[1].trim();
        }

        // VF (Visual Framework)
        const vfMatch = text.match(/(?:vf|visual framework|microsoft jma):\s*([^\n]+)/i);
        if (vfMatch && !structuredData.vf) {
            structuredData.vf = vfMatch[1].trim();
        }

        // Headline Copy
        const headlineMatch = text.match(/headline\s*(?:copy)?:\s*([^\n]+)/i);
        if (headlineMatch && !structuredData.headlineCopy) {
            structuredData.headlineCopy = headlineMatch[1].trim();
        }

        // Copy principal
        const copyMatch = text.match(/(?:^|\n)copy:\s*([^\n]+)/i);
        if (copyMatch && !structuredData.copy) {
            structuredData.copy = copyMatch[1].trim();
        }

        // Description
        const descMatch = text.match(/description:\s*([^\n]+)/i);
        if (descMatch && !structuredData.description) {
            structuredData.description = descMatch[1].trim();
        }

        // CTA
        const ctaMatch = text.match(/cta:\s*([^\n]+)/i);
        if (ctaMatch && !structuredData.cta) {
            structuredData.cta = ctaMatch[1].trim();
        }

        // Background
        const bgMatch = text.match(/background:\s*([^\n]+)/i);
        if (bgMatch && !structuredData.background) {
            structuredData.background = bgMatch[1].trim();
        }

        // Color Copy
        const colorMatch = text.match(/color\s*copy:\s*([^\n]+)/i);
        if (colorMatch && !structuredData.colorCopy) {
            structuredData.colorCopy = colorMatch[1].trim();
        }

        // Postcopy
        if (lowerText.includes('postcopy') && !structuredData.postcopy) {
            structuredData.postcopy = 'POSTCOPY';
        }

        // URN
        const urnMatch = text.match(/urn:\s*([^\n]+)/i);
        if (urnMatch && !structuredData.urn) {
            structuredData.urn = urnMatch[1].trim();
        }

        // Allocadia
        const allocadiaMatch = text.match(/allocadia\s*([0-9]+)/i);
        if (allocadiaMatch && !structuredData.allocadia) {
            structuredData.allocadia = allocadiaMatch[1].trim();
        }

        // PO (Purchase Order)
        const poMatch = text.match(/po#?\s*([^\n]+)/i);
        if (poMatch && !structuredData.po) {
            structuredData.po = poMatch[1].trim();
        }
    }

    /**
     * Extrair texto e comentários de um arquivo PDF
     */
    async extractPdfContent(pdfFilePath) {
        try {
            console.log(`📄 Extraindo conteúdo do PDF: ${path.basename(pdfFilePath)}`);

            // Verificar se o arquivo existe
            try {
                await fs.access(pdfFilePath);
            } catch (error) {
                throw new Error(`Arquivo PDF não encontrado: ${pdfFilePath}`);
            }

            // Inicializar biblioteca pdf-parse
            const pdfParseLib = await initPdfParse();

            // Ler o arquivo PDF
            const pdfBuffer = await fs.readFile(pdfFilePath);

            // Extrair dados do PDF
            const pdfData = await pdfParseLib(pdfBuffer);

            // Extrair comentários/anotações do PDF
            console.log('💬 Buscando comentários no PDF...');
            const comments = await this.extractPdfComments(pdfBuffer);

            const result = {
                fileName: path.basename(pdfFilePath),
                filePath: pdfFilePath,
                metadata: {
                    title: pdfData.info?.Title || 'Sem título',
                    author: pdfData.info?.Author || 'Autor não informado',
                    subject: pdfData.info?.Subject || 'Assunto não informado',
                    creator: pdfData.info?.Creator || 'Criador não informado',
                    producer: pdfData.info?.Producer || 'Produtor não informado',
                    creationDate: pdfData.info?.CreationDate || 'Data não informada',
                    modificationDate: pdfData.info?.ModDate || 'Data não informada',
                    pages: pdfData.numpages || 0
                },
                text: pdfData.text || '',
                textLength: (pdfData.text || '').length,
                comments: comments,
                commentsCount: comments.length,
                hasContent: !!(pdfData.text && pdfData.text.trim().length > 0),
                hasComments: comments.length > 0
            };

            console.log(`✅ Conteúdo extraído: ${result.textLength} caracteres, ${result.metadata.pages} páginas, ${result.commentsCount} comentários`);

            return result;

        } catch (error) {
            console.error(`❌ Erro ao extrair conteúdo do PDF: ${error.message}`);
            throw new Error(`Falha na extração do PDF: ${error.message}`);
        }
    }

    /**
     * Processar todos os PDFs baixados e extrair seu conteúdo
     */
    async processPdfsInProject(briefPath, projectName) {
        try {
            console.log(`📁 Processando PDFs do projeto: ${projectName}`);
            console.log(`📂 Pasta brief: ${briefPath}`);

            // Verificar se a pasta brief existe
            try {
                await fs.access(briefPath);
            } catch (error) {
                console.log(`⚠️ Pasta brief não encontrada: ${briefPath}`);
                return [];
            }

            // Listar todos os arquivos PDF na pasta brief
            const files = await fs.readdir(briefPath);
            const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');

            if (pdfFiles.length === 0) {
                console.log('ℹ️ Nenhum arquivo PDF encontrado na pasta brief');
                return [];
            }

            console.log(`📋 Encontrados ${pdfFiles.length} arquivos PDF para processar`);

            const results = [];

            // Processar cada PDF
            for (const pdfFile of pdfFiles) {
                const pdfFilePath = path.join(briefPath, pdfFile);

                try {
                    const pdfContent = await this.extractPdfContent(pdfFilePath);
                    results.push(pdfContent);

                    // Criar arquivo de texto com o conteúdo extraído
                    await this.savePdfContentToText(pdfContent, briefPath);

                } catch (error) {
                    console.error(`❌ Erro ao processar ${pdfFile}: ${error.message}`);
                    results.push({
                        fileName: pdfFile,
                        filePath: pdfFilePath,
                        error: error.message,
                        hasContent: false
                    });
                }
            }

            return results;

        } catch (error) {
            console.error(`❌ Erro ao processar PDFs do projeto: ${error.message}`);
            throw error;
        }
    }

    /**
     * Salvar conteúdo extraído do PDF em arquivo de texto
     */
    async savePdfContentToText(pdfContent, outputDir) {
        try {
            const baseName = path.basename(pdfContent.fileName, '.pdf');
            const textFileName = `${baseName}_extracted_content.txt`;
            const textFilePath = path.join(outputDir, textFileName);

            let content = '';
            content += '=====================================\n';
            content += 'CONTEÚDO EXTRAÍDO DO PDF\n';
            content += '=====================================\n\n';
            content += `📄 Arquivo: ${pdfContent.fileName}\n`;
            content += `📅 Data de extração: ${new Date().toLocaleString('pt-BR')}\n\n`;

            content += '📊 METADADOS DO DOCUMENTO:\n';
            content += `   Título: ${pdfContent.metadata.title}\n`;
            content += `   Autor: ${pdfContent.metadata.author}\n`;
            content += `   Assunto: ${pdfContent.metadata.subject}\n`;
            content += `   Criador: ${pdfContent.metadata.creator}\n`;
            content += `   Produtor: ${pdfContent.metadata.producer}\n`;
            content += `   Data de criação: ${pdfContent.metadata.creationDate}\n`;
            content += `   Data de modificação: ${pdfContent.metadata.modificationDate}\n`;
            content += `   Número de páginas: ${pdfContent.metadata.pages}\n`;
            content += `   Tamanho do texto: ${pdfContent.textLength} caracteres\n`;
            content += `   Comentários encontrados: ${pdfContent.commentsCount || 0}\n\n`;

            content += '=====================================\n';
            content += 'TEXTO EXTRAÍDO:\n';
            content += '=====================================\n\n';

            if (pdfContent.hasContent) {
                content += pdfContent.text;
            } else {
                content += '[AVISO] Nenhum texto foi encontrado neste PDF.\n';
                content += 'Possíveis motivos:\n';
                content += '- PDF é composto apenas de imagens\n';
                content += '- PDF está protegido ou criptografado\n';
                content += '- PDF possui formato não suportado\n';
            }

            // Adicionar seção de comentários se existirem
            if (pdfContent.hasComments) {
                // Processar e deduplicar comentários
                const processedData = this.processAndDeduplicateComments(pdfContent.comments);
                const commentsByAuthor = processedData.commentsByAuthor;
                const uniqueLinks = processedData.links;
                const structuredData = processedData.structuredData;

                content += '\n\n=====================================\n';
                content += 'COMENTÁRIOS/ANOTAÇÕES EXTRAÍDOS:\n';
                content += '=====================================\n\n';

                // Ordenar autores alfabeticamente
                const sortedAuthors = Array.from(commentsByAuthor.keys()).sort();
                
                sortedAuthors.forEach(author => {
                    content += `@${author}\n`;
                    const texts = commentsByAuthor.get(author);
                    texts.forEach(text => {
                        content += `${text}\n`;
                    });
                    content += '\n';
                });

                // Links serão adicionados separadamente no final do arquivo
                if (uniqueLinks.length > 0) {
                    content += '\n=====================================\n';
                    content += 'LINKS EXTRAÍDOS:\n';
                    content += '=====================================\n\n';
                    
                    uniqueLinks.forEach((link) => {
                        content += `${link}\n`;
                    });
                }

                // Salvar dados estruturados para aplicação web
                await this.saveStructuredDataToJson(pdfContent.fileName, structuredData, uniqueLinks, outputDir);
            } else {
                content += '\n\n=====================================\n';
                content += 'COMENTÁRIOS/ANOTAÇÕES:\n';
                content += '=====================================\n\n';
                content += '[INFO] Nenhum comentário ou anotação foi encontrado neste PDF.\n';
                content += 'Nota: Este extrator busca por anotações incorporadas no PDF.\n';
                content += 'Comentários feitos em visualizadores externos (Google Drive, etc.)\n';
                content += 'não são salvos no arquivo PDF e não podem ser extraídos.\n';
            }

            content += '\n\n=====================================\n';
            content += 'FIM DO CONTEÚDO EXTRAÍDO\n';
            content += '=====================================\n';

            // Salvar arquivo de texto
            await fs.writeFile(textFilePath, content, 'utf8');

            console.log(`💾 Conteúdo salvo em: ${textFileName}`);
            console.log(`📊 Resumo: ${pdfContent.textLength} caracteres, ${pdfContent.metadata.pages} páginas, ${pdfContent.commentsCount || 0} comentários`);

            return textFilePath;

        } catch (error) {
            console.error(`❌ Erro ao salvar conteúdo em texto: ${error.message}`);
            throw error;
        }
    }

    /**
     * Salvar dados estruturados para aplicação web
     */
    async saveStructuredDataToJson(pdfFileName, structuredData, links, outputDir) {
        try {
            const baseName = path.basename(pdfFileName, '.pdf');
            const jsonFileName = `${baseName}_structured_data.json`;
            const jsonFilePath = path.join(outputDir, jsonFileName);

            const webData = {
                fileName: pdfFileName,
                extractedAt: new Date().toISOString(),
                fields: {
                    liveDate: structuredData.liveDate,
                    vf: structuredData.vf,
                    headlineCopy: structuredData.headlineCopy,
                    copy: structuredData.copy,
                    description: structuredData.description,
                    cta: structuredData.cta,
                    background: structuredData.background,
                    colorCopy: structuredData.colorCopy,
                    postcopy: structuredData.postcopy,
                    urn: structuredData.urn,
                    allocadia: structuredData.allocadia,
                    po: structuredData.po
                },
                links: links
            };

            await fs.writeFile(jsonFilePath, JSON.stringify(webData, null, 2), 'utf8');
            console.log(`📄 Dados estruturados salvos em: ${jsonFileName}`);

        } catch (error) {
            console.warn(`⚠️ Erro ao salvar dados estruturados: ${error.message}`);
        }
    }

    /**
     * Buscar dados estruturados de um projeto
     */
    async getStructuredDataFromProject(projectPath) {
        try {
            console.log(`📁 Buscando dados estruturados em: ${projectPath}`);

            // Verificar se a pasta existe
            try {
                await fs.access(projectPath);
            } catch (error) {
                throw new Error(`Pasta do projeto não encontrada: ${projectPath}`);
            }

            // Buscar recursivamente por arquivos JSON de dados estruturados
            const structuredFiles = [];
            
            async function searchInDirectory(dirPath) {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        await searchInDirectory(fullPath);
                    } else if (entry.name.endsWith('_structured_data.json')) {
                        try {
                            const jsonContent = await fs.readFile(fullPath, 'utf8');
                            const data = JSON.parse(jsonContent);
                            structuredFiles.push({
                                filePath: fullPath,
                                fileName: entry.name,
                                ...data
                            });
                        } catch (parseError) {
                            console.warn(`⚠️ Erro ao ler arquivo JSON ${fullPath}: ${parseError.message}`);
                        }
                    }
                }
            }

            await searchInDirectory(projectPath);

            console.log(`✅ Encontrados ${structuredFiles.length} arquivos de dados estruturados`);
            return structuredFiles;

        } catch (error) {
            console.error(`❌ Erro ao buscar dados estruturados: ${error.message}`);
            throw error;
        }
    }
}

export default new DocumentBulkDownloadService();
