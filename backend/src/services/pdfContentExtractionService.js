// src/services/pdfContentExtractionService.js

import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import os from 'os';
import prisma from '../database/prisma.js';
import documentBulkDownloadService from './documentBulkDownloadService.js';

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

export class PdfContentExtractionService {
    constructor() {
        // Usar diretório temporário do sistema
        this.tempDownloadPath = path.join(os.tmpdir(), 'workfront-pdf-temp');
    }

    /**
     * Processar PDFs de múltiplos projetos - extração de conteúdo apenas
     */
    async processProjectsBriefings(projectUrls, options = {}) {
        try {
            console.log('📋 === PROCESSAMENTO DE CONTEÚDO DE BRIEFINGS ===');
            console.log(`🔗 ${projectUrls.length} projetos para processar`);

            // Validar entradas
            this.validateInputs(projectUrls);

            // Configurações
            const { headless = false, continueOnError = true } = options;

            // Criar diretório temporário
            await this.ensureTempDirectory();

            // Processar projetos usando Playwright
            const results = await this.performContentExtraction(
                projectUrls,
                { headless, continueOnError }
            );

            // Limpar diretório temporário
            await this.cleanupTempDirectory();

            console.log('✅ Processamento de conteúdo concluído!');
            return results;

        } catch (error) {
            console.error('❌ Erro no processamento de conteúdo:', error.message);
            // Garantir limpeza mesmo em caso de erro
            await this.cleanupTempDirectory().catch(() => { });
            throw error;
        }
    }

    /**
     * Validar entradas
     */
    validateInputs(projectUrls) {
        if (!Array.isArray(projectUrls) || projectUrls.length === 0) {
            throw new Error('Lista de URLs de projetos é obrigatória e deve conter pelo menos um item');
        }

        projectUrls.forEach((url, index) => {
            if (!url || typeof url !== 'string') {
                throw new Error(`URL ${index + 1} é inválida ou vazia`);
            }

            if (!url.includes('workfront') && !url.includes('experience.adobe.com')) {
                throw new Error(`URL ${index + 1} não parece ser um link válido do Workfront`);
            }
        });

        console.log('✅ Validação das URLs concluída com sucesso');
    }

    /**
     * Verificar se um arquivo é um PDF de briefing baseado em padrões de nome
     */
    isBriefingPdf(fileName) {
        const name = fileName.toLowerCase();
        
        // Padrões que indicam que é um briefing
        const briefingPatterns = [
            'brief',
            'briefing',
            // Padrões específicos encontrados nos nomes de arquivo
            '_smv_', // Social Media Video
            '_gam_', // Gaming
            '_csg_', // Consumer Segment
            'award-winning',
            'innovation',
            'tier-1',
            'tier-2',
            // Padrões de campanhas
            'fy26q',
            'fy25q',
            'campaign',
            'promo',
            // Outros indicadores
            'creative',
            'copy',
            'headline'
        ];
        
        // Verificar se contém algum dos padrões
        return briefingPatterns.some(pattern => name.includes(pattern));
    }

    /**
     * Criar diretório temporário
     */
    async ensureTempDirectory() {
        try {
            await fs.access(this.tempDownloadPath);
            console.log(`📁 Diretório temporário encontrado: ${this.tempDownloadPath}`);
        } catch {
            await fs.mkdir(this.tempDownloadPath, { recursive: true });
            console.log(`📁 Diretório temporário criado: ${this.tempDownloadPath}`);
        }
    }

    /**
     * Limpar diretório temporário
     */
    async cleanupTempDirectory() {
        try {
            await fs.rm(this.tempDownloadPath, { recursive: true, force: true });
            console.log('🧹 Diretório temporário limpo com sucesso');
        } catch (error) {
            console.warn('⚠️ Erro ao limpar diretório temporário:', error.message);
        }
    }

    /**
     * Executar extração de conteúdo usando Playwright
     */
    async performContentExtraction(projectUrls, options) {
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
                totalProjects: 0
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
                const projectNumber = i + 1;

                try {
                    console.log(`\n📁 === PROJETO ${projectNumber}/${projectUrls.length} ===`);

                    // Verificar se projeto já existe no banco
                    const existingProject = await this.findOrCreateWorkfrontProject(projectUrl);

                    // Extrair conteúdo do projeto
                    const extractionResult = await this.extractProjectContent(
                        page,
                        projectUrl,
                        projectNumber,
                        existingProject.id
                    );

                    results.successful.push({
                        projectNumber,
                        projectId: existingProject.id,
                        url: projectUrl,
                        ...extractionResult
                    });

                    results.summary.totalFiles += extractionResult.filesProcessed;
                    results.summary.totalProjects++;

                    console.log(`✅ Projeto ${projectNumber} processado com sucesso!`);

                } catch (projectError) {
                    console.error(`❌ Erro no projeto ${projectNumber}:`, projectError.message);

                    results.failed.push({
                        projectNumber,
                        url: projectUrl,
                        error: projectError.message
                    });

                    if (!options.continueOnError) {
                        throw projectError;
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
     * Encontrar ou criar projeto Workfront no banco
     */
    async findOrCreateWorkfrontProject(projectUrl) {
        try {
            // Buscar projeto existente
            let project = await prisma.workfrontProject.findUnique({
                where: { url: projectUrl }
            });

            if (!project) {
                // Criar novo projeto
                project = await prisma.workfrontProject.create({
                    data: {
                        url: projectUrl,
                        status: 'ACTIVE'
                    }
                });
                console.log(`📝 Novo projeto criado no banco: ${project.id}`);
            } else {
                // Atualizar última vez acessado
                project = await prisma.workfrontProject.update({
                    where: { id: project.id },
                    data: { accessedAt: new Date() }
                });
                console.log(`📝 Projeto existente encontrado: ${project.id}`);
            }

            return project;
        } catch (error) {
            console.error('❌ Erro ao buscar/criar projeto:', error.message);
            throw error;
        }
    }

    /**
     * Extrair conteúdo de um projeto específico
     */
    async extractProjectContent(page, projectUrl, projectNumber, projectId) {
        console.log(`📁 Processando projeto ${projectNumber}...`);

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
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
            await page.waitForTimeout(3000);

            // Extrair nome do projeto e DSID
            const projectInfo = await this.extractProjectInfo(frameLocator, projectUrl, projectNumber);
            console.log(`📋 Projeto: ${projectInfo.projectName} | DSID: ${projectInfo.dsid || 'N/A'}`);

            // Atualizar informações do projeto no banco
            await this.updateProjectInfo(projectId, projectInfo);

            // Navegar para a pasta "05. Briefing"
            await this.navigateToBriefingFolder(frameLocator, page);

            // Criar registro de download no banco
            const briefingDownload = await this.createBriefingDownload(projectId, projectInfo);

            // Processar PDFs temporariamente
            const processingResult = await this.processTemporaryPdfs(
                frameLocator,
                page,
                briefingDownload.id
            );

            // Atualizar status do download
            await this.updateBriefingDownloadStatus(briefingDownload.id, processingResult);

            return {
                projectName: projectInfo.projectName,
                dsid: projectInfo.dsid,
                filesProcessed: processingResult.filesCount,
                downloadId: briefingDownload.id
            };

        } catch (error) {
            console.log(`❌ Erro no projeto ${projectNumber}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extrair informações do projeto (nome e DSID)
     */
    async extractProjectInfo(frameLocator, projectUrl, projectNumber) {
        let projectName = `projeto_${projectNumber}`;
        let dsid = null;

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
                    const element = frameLocator.locator(selector).first();
                    await element.waitFor({ timeout: 3000 });
                    const text = await element.textContent();

                    if (text && text.trim().length > 0) {
                        projectName = text.trim();
                        console.log(`📋 Nome extraído da página: ${projectName}`);
                        break;
                    }
                } catch (_e) {
                    // Continuar tentando outros seletores
                }
            }
        } catch (_e) {
            console.log('⚠️ Não foi possível extrair nome do projeto da página');
        }

        // Extrair DSID do nome do projeto
        dsid = this.extractDSIDFromTitle(projectName);

        // Fallback: extrair da URL
        if (!dsid) {
            try {
                const urlMatch = projectUrl.match(/\/project\/([^/]+)/);
                if (urlMatch) {
                    dsid = urlMatch[1];
                }
            } catch (_e) {
                // Ignore
            }
        }

        return { projectName, dsid };
    }

    /**
     * Extrair DSID do título do projeto
     */
    extractDSIDFromTitle(title) {
        try {
            if (!title) return null;

            // Buscar padrão: sequência de 7 dígitos precedida por underscore
            const match = title.match(/_(\d{7})_/);
            if (match) {
                return match[1];
            }

            // Fallback: buscar qualquer sequência de 7 dígitos
            const fallbackMatch = title.match(/(\d{7})/);
            if (fallbackMatch) {
                return fallbackMatch[1];
            }

            return null;
        } catch (error) {
            console.warn('❌ Erro ao extrair DSID do título:', title, error.message);
            return null;
        }
    }

    /**
     * Atualizar informações do projeto no banco
     */
    async updateProjectInfo(projectId, projectInfo) {
        try {
            await prisma.workfrontProject.update({
                where: { id: projectId },
                data: {
                    title: projectInfo.projectName,
                    dsid: projectInfo.dsid
                }
            });
            console.log('📝 Informações do projeto atualizadas no banco');
        } catch (error) {
            console.error('❌ Erro ao atualizar projeto:', error.message);
        }
    }

    /**
     * Criar registro de download de briefing
     */
    async createBriefingDownload(projectId, projectInfo) {
        try {
            const briefingDownload = await prisma.briefingDownload.create({
                data: {
                    projectId: projectId,
                    projectName: projectInfo.projectName,
                    dsid: projectInfo.dsid,
                    status: 'PROCESSING'
                }
            });
            console.log(`📋 Registro de download criado: ${briefingDownload.id}`);
            return briefingDownload;
        } catch (error) {
            console.error('❌ Erro ao criar registro de download:', error.message);
            throw error;
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
            'button:has-text("05. Briefing")',
            'a:has-text("05. Briefing")',
            'button:has-text("05 - Briefing")',
            'button:has-text("05-Briefing")',
            'button:has-text("Briefing")',
            'a:has-text("05 - Briefing")',
            'a:has-text("05-Briefing")',
            'a:has-text("Briefing")',
            '[role="button"]:has-text("05. Briefing")',
            '[role="button"]:has-text("Briefing")',
            '*[data-testid*="item"]:has-text("05. Briefing")',
            '*[data-testid*="item"]:has-text("Briefing")',
            '*:has-text("05. Briefing")',
            '*[title*="Briefing"]',
            '*[aria-label*="Briefing"]'
        ];

        // Tentar aguardar pelo menos um elemento aparecer
        console.log('⏳ Aguardando elementos de pasta carregarem...');
        try {
            await frameLocator.locator('[role="button"], button, a, *[data-testid*="item"]').first().waitFor({ timeout: 10000 });
            // eslint-disable-next-line no-unused-vars
        } catch (_e) {
            console.log('⚠️ Timeout aguardando elementos - continuando...');
        }

        let navigationSuccess = false;
        for (const selector of folderSelectors) {
            try {
                const element = frameLocator.locator(selector).first();

                const isVisible = await element.isVisible({ timeout: 2000 });
                if (isVisible) {
                    console.log(`🎯 Encontrado elemento: ${selector}`);
                    await element.click({ timeout: 5000 });
                    await page.waitForTimeout(3000);

                    console.log('✅ Clique realizado - aguardando navegação...');
                    navigationSuccess = true;
                    break;
                }
            } catch (e) {
                console.log(`⚠️ Elemento não encontrado: ${selector}`);
                continue;
            }
        }

        if (!navigationSuccess) {
            throw new Error('Pasta "05. Briefing" não encontrada no projeto. Verifique se a pasta existe e tem o nome correto.');
        }

        console.log('✅ Navegação para Briefing concluída!');
    }

    /**
     * Processar PDFs temporariamente - usando EXATAMENTE a lógica do BulkDownload
     */
    async processTemporaryPdfs(frameLocator, page, downloadId) {
        console.log('📥 Identificando PDFs para processamento...');

        // Usar a lógica já testada do BulkDownload para encontrar arquivos
        const fileElements = await documentBulkDownloadService.findAllDownloadableFiles(frameLocator);

        if (fileElements.length === 0) {
            console.log('⚠️ Nenhum arquivo encontrado na pasta Briefing');
            return { filesCount: 0, totalSize: 0 };
        }

        // OTIMIZAÇÃO: Filtrar em duas etapas para melhor performance
        console.log('🔍 Filtrando PDFs de briefing pelo nome...');
        const allPdfs = fileElements.filter(file => {
            const fileName = file.name.toLowerCase();
            return fileName.includes('.pdf');
        });

        const briefPdfs = allPdfs.filter(file => {
            return this.isBriefingPdf(file.name);
        });

        // Log estatísticas de filtragem
        console.log(`📊 Estatísticas de filtragem:`);
        console.log(`   📄 Total de arquivos encontrados: ${fileElements.length}`);
        console.log(`   📄 Total de PDFs encontrados: ${allPdfs.length}`);
        console.log(`   ✅ PDFs de briefing identificados: ${briefPdfs.length}`);
        console.log(`   ❌ PDFs descartados: ${allPdfs.length - briefPdfs.length}`);

        if (briefPdfs.length === 0) {
            console.log('⚠️ Nenhum PDF de briefing encontrado (verificando padrões: brief, _smv_, _gam_, _csg_, award-winning, etc.)');
            return { filesCount: 0, totalSize: 0 };
        }

        console.log(`📋 ${briefPdfs.length} PDFs de briefing encontrados para processamento`);
        briefPdfs.forEach((pdf, index) => {
            console.log(`   ${index + 1}. ${pdf.name}`);
        });

        // Criar diretório temporário
        const tempDir = path.join(this.tempDownloadPath, 'temp_' + Date.now());
        await fs.mkdir(tempDir, { recursive: true });

        try {
            // Selecionar apenas os PDFs de briefing
            console.log('✅ Selecionando PDFs de briefing...');
            for (let i = 0; i < briefPdfs.length; i++) {
                const pdfInfo = briefPdfs[i];
                console.log(`📄 Selecionando PDF ${i + 1}/${briefPdfs.length}: ${pdfInfo.name}`);
                try {
                    await pdfInfo.element.click();
                    await page.waitForTimeout(300);
                } catch (error) {
                    console.error(`❌ Erro ao selecionar ${pdfInfo.name}: ${error.message}`);
                }
            }

            // Aguardar seleções serem processadas
            await page.waitForTimeout(1000);

            // Usar o método já funcionando do BulkDownload
            console.log('🔽 Baixando arquivos selecionados usando BulkDownload...');
            
            // Configurar listener para capturar URLs de download
            const downloadedUrls = new Map();
            
            // Escutar requests de download
            page.on('response', async (response) => {
                const url = response.url();
                const status = response.status();
                
                // Verificar se é um response de download de PDF
                if (status === 200 && url.includes('.pdf') && 
                    (url.includes('dam.dell.com') || url.includes('workfront') || url.includes('adobe'))) {
                    
                    const contentType = response.headers()['content-type'] || '';
                    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
                        console.log(`📥 URL de download capturada: ${url.substring(0, 100)}...`);
                        
                        // Tentar extrair nome do arquivo da URL
                        const urlFileName = url.split('/').pop()?.split('?')[0];
                        if (urlFileName) {
                            downloadedUrls.set(urlFileName, url);
                        }
                    }
                }
            });

            const downloadedFiles = await documentBulkDownloadService.downloadSelectedFiles(
                frameLocator, 
                page, 
                tempDir
            );

            console.log(`📥 ${downloadedFiles.length} arquivos baixados com sucesso`);

            // Debug: mostrar estrutura dos arquivos baixados
            console.log('🐛 DEBUG - Arquivos baixados:');
            downloadedFiles.forEach((file, index) => {
                console.log(`  ${index + 1}. fileName: "${file.fileName}"`);
                console.log(`     filePath: "${file.filePath}"`);
                console.log(`     fileType: "${file.fileType}"`);
                console.log(`     size: ${file.size}`);
            });

            let processedCount = 0;
            let totalSize = 0;

            // Processar cada arquivo baixado
            for (const downloadedFile of downloadedFiles) {
                console.log(`🔍 Verificando arquivo: ${downloadedFile.fileName}`);
                console.log(`   - Tem filePath: ${!!downloadedFile.filePath}`);
                console.log(`   - Tem fileName: ${!!downloadedFile.fileName}`);
                console.log(`   - É PDF: ${downloadedFile.fileName && downloadedFile.fileName.toLowerCase().includes('.pdf')}`);
                
                if (downloadedFile.filePath && downloadedFile.fileName && downloadedFile.fileName.toLowerCase().includes('.pdf')) {
                    console.log(`🔍 Processando: ${downloadedFile.fileName}`);
                    
                    try {
                        // Extrair conteúdo do PDF
                        const content = await this.extractPdfContent(downloadedFile.filePath);
                        
                        // Buscar URL original nas URLs capturadas
                        let originalUrl = '';
                        
                        // Tentar diferentes estratégias para encontrar a URL
                        for (const [capturedName, capturedUrl] of downloadedUrls.entries()) {
                            if (downloadedFile.fileName.includes(capturedName) || 
                                capturedName.includes(downloadedFile.fileName.replace('.pdf', ''))) {
                                originalUrl = capturedUrl;
                                console.log(`✅ URL original encontrada para ${downloadedFile.fileName}: ${originalUrl.substring(0, 100)}...`);
                                break;
                            }
                        }
                        
                        if (!originalUrl) {
                            console.log(`⚠️ URL original não encontrada para: ${downloadedFile.fileName}`);
                        }
                        
                        // Adicionar URL original ao downloadedFile
                        const fileInfoWithUrl = {
                            ...downloadedFile,
                            originalUrl: originalUrl
                        };
                        
                        // Salvar no banco de dados
                        await this.savePdfContent(downloadId, fileInfoWithUrl, content);
                        
                        processedCount++;
                        totalSize += downloadedFile.size || 0;
                        
                        // Remover arquivo temporário
                        try {
                            await fs.unlink(downloadedFile.filePath);
                            console.log(`🗑️ Arquivo temporário removido: ${downloadedFile.fileName}`);
                        } catch (unlinkError) {
                            console.warn(`⚠️ Erro ao remover arquivo temporário: ${unlinkError.message}`);
                        }
                        
                    } catch (error) {
                        console.error(`❌ Erro ao processar ${downloadedFile.fileName}:`, error.message);
                    }
                }
            }

            return { filesCount: processedCount, totalSize };

        } finally {
            // Limpar diretório temporário
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
                console.log('🧹 Diretório temporário limpo');
            } catch (cleanupError) {
                console.warn('⚠️ Erro ao limpar diretório temporário:', cleanupError.message);
            }
        }
    }

    /**
     * Encontrar arquivos PDF na pasta
     */
    async findPdfFiles(frameLocator) {
        console.log('🔍 Procurando arquivos PDF...');

        // Aguardar um pouco para pasta carregar
        await new Promise(resolve => setTimeout(resolve, 3000));

        const fileSelectors = [
            // Seletores mais específicos primeiro
            'button[role="checkbox"]:has-text(".pdf")',
            'div[role="checkbox"]:has-text(".pdf")',
            '[data-testid*="file"]:has-text(".pdf")',
            '[data-testid*="document"]:has-text(".pdf")',

            // Seletores gerais
            'input[type="checkbox"]',
            '[role="checkbox"]',
            'button[role="checkbox"]',
            'div[role="checkbox"]',
            '.file-item',
            '.document-item',
            '[data-testid*="file"]',
            '[data-testid*="document"]',

            // Seletores mais amplos
            'button:has-text(".pdf")',
            'div:has-text(".pdf")',
            '*:has-text(".pdf")'
        ];

        const pdfs = [];

        for (const selector of fileSelectors) {
            try {
                console.log(`🔍 Tentando seletor: ${selector}`);
                const elements = await frameLocator.locator(selector).all();
                console.log(`📄 Encontrados ${elements.length} elementos com seletor: ${selector}`);

                for (const element of elements) {
                    try {
                        // Buscar texto relacionado ao arquivo - tentar múltiplas estratégias
                        let textContent = '';

                        // Estratégia 1: Texto do próprio elemento
                        try {
                            textContent = await element.textContent({ timeout: 1000 });
                        } catch (e) {
                            // Estratégia 2: Texto do parent
                            try {
                                const parent = element.locator('xpath=..');
                                textContent = await parent.textContent({ timeout: 1000 });
                                // eslint-disable-next-line no-unused-vars
                            } catch (e2) {
                                // Estratégia 3: Texto de elementos próximos
                                try {
                                    const container = element.locator('xpath=..//..');
                                    textContent = await container.textContent({ timeout: 1000 });
                                    // eslint-disable-next-line no-unused-vars
                                } catch (e3) {
                                    continue;
                                }
                            }
                        }

                        if (textContent && textContent.toLowerCase().includes('.pdf')) {
                            const fileName = this.extractFileName(textContent);
                            console.log(`📄 Arquivo encontrado: "${fileName}" no texto: "${textContent.substring(0, 100)}..."`);

                            if (fileName && fileName.toLowerCase().endsWith('.pdf')) {
                                // Filtrar apenas PDFs que são de briefing
                                const isBriefingPdf = this.isBriefingPdf(fileName);
                                if (isBriefingPdf) {
                                    // Verificar se já não foi adicionado
                                    const duplicate = pdfs.find(pdf => pdf.name === fileName);
                                    if (!duplicate) {
                                        pdfs.push({
                                            element,
                                            name: fileName,
                                            fullText: textContent
                                        });
                                        console.log(`✅ PDF de briefing adicionado: ${fileName}`);
                                    }
                                } else {
                                    console.log(`⏭️ PDF ignorado (não é briefing): ${fileName}`);
                                }
                            }
                        }
                        // eslint-disable-next-line no-unused-vars
                    } catch (_e) {
                        // Ignorar elementos que não podem ser processados
                    }
                }

                if (pdfs.length > 0) {
                    console.log(`✅ Encontrados ${pdfs.length} PDFs com seletor: ${selector}`);
                    break; // Encontrou PDFs, não precisa tentar outros seletores
                }
                // eslint-disable-next-line no-unused-vars
            } catch (__e) {
                continue;
            }
        }

        // Se não encontrou PDFs, tentar listar todos os elementos disponíveis para debug
        if (pdfs.length === 0) {
            console.log('🔍 DIAGNÓSTICO - Nenhum PDF encontrado. Listando elementos disponíveis:');
            try {
                const allElements = await frameLocator.locator('*').all();
                console.log(`📋 Total de elementos na página: ${allElements.length}`);

                // Procurar elementos que contenham texto com extensões de arquivo
                const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
                for (const ext of fileExtensions) {
                    try {
                        const elementsWithExt = await frameLocator.locator(`*:has-text("${ext}")`).all();
                        if (elementsWithExt.length > 0) {
                            console.log(`📄 Encontrados ${elementsWithExt.length} elementos com extensão ${ext}`);

                            // Listar primeiros 3 elementos para debug
                            for (let i = 0; i < Math.min(3, elementsWithExt.length); i++) {
                                try {
                                    const text = await elementsWithExt[i].textContent({ timeout: 1000 });
                                    console.log(`   ${i + 1}. "${text.substring(0, 100)}..."`);
                                } catch (e) {
                                    console.log(`   ${i + 1}. [Erro ao obter texto]`);
                                }
                            }
                        }
                    } catch (e) {
                        // Ignorar erros na busca por extensão
                    }
                }
            } catch (e) {
                console.log('❌ Erro no diagnóstico:', e.message);
            }
        }

        console.log(`📋 ${pdfs.length} PDFs identificados`);
        return pdfs;
    }

    /**
     * Extrair nome do arquivo do texto
     */
    extractFileName(text) {
        if (!text) return null;

        console.log(`🔍 Extraindo nome do arquivo de: "${text.substring(0, 200)}..."`);

        // Procurar por padrões de nome de arquivo PDF - múltiplas estratégias
        const patterns = [
            // Padrão 1: Nome completo com extensão .pdf
            /([A-Za-z0-9._\-\s]+\.pdf)/gi,
            // Padrão 2: Arquivos que terminam com .pdf (mais restritivo)
            /([^\\/\n\r\t]{1,100}\.pdf)/gi,
            // Padrão 3: Padrão específico para nomes de briefing
            /(\d{4}G\d{4}_\d{4}_\d{7}[^.]*\.pdf)/gi,
            // Padrão 4: Qualquer sequência de caracteres válidos seguida de .pdf
            /([A-Za-z0-9_\-\s()]+\.pdf)/gi
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                // Pegar a primeira correspondência válida
                for (const match of matches) {
                    const cleanName = match.trim();
                    if (cleanName.length > 4 && cleanName.toLowerCase().endsWith('.pdf')) {
                        console.log(`✅ Nome extraído: "${cleanName}"`);
                        return cleanName;
                    }
                }
            }
        }

        // Fallback: procurar por .pdf e tentar extrair contexto
        const pdfIndex = text.toLowerCase().indexOf('.pdf');
        if (pdfIndex !== -1) {
            // Tentar extrair 50 caracteres antes do .pdf
            const start = Math.max(0, pdfIndex - 50);
            const end = pdfIndex + 4; // incluir .pdf
            const fragment = text.substring(start, end).trim();

            // Procurar por quebras de linha ou caracteres especiais para delimitar o nome
            const nameMatch = fragment.match(/([A-Za-z0-9._\-\s]+\.pdf)$/i);
            if (nameMatch) {
                const extractedName = nameMatch[1].trim();
                console.log(`✅ Nome extraído (fallback): "${extractedName}"`);
                return extractedName;
            }
        }

        console.log('❌ Não foi possível extrair nome do arquivo');
        return null;
    }

    /**
     * Processar um único PDF usando a lógica do BulkDownload
     */
    async processSinglePdf(frameLocator, page, fileInfo, downloadId) {
        try {
            console.log(`� Baixando temporariamente: ${fileInfo.name}`);

            // Criar diretório temporário se não existir
            const tempDir = path.join(this.downloadDir, 'temp');
            await fs.mkdir(tempDir, { recursive: true });

            // Configurar listener para download
            const downloadPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error(`⏰ Timeout no download de ${fileInfo.name} após 60 segundos`);
                    reject(new Error('Timeout no download'));
                }, 60000);

                const downloadHandler = async (download) => {
                    clearTimeout(timeout);
                    console.log(`📥 Evento de download capturado para: ${fileInfo.name}`);
                    
                    try {
                        const fileName = download.suggestedFilename() || fileInfo.name;
                        console.log(`📝 Nome sugerido pelo download: ${fileName}`);
                        
                        const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${sanitizedName}`);
                        
                        console.log(`💾 Tentando salvar arquivo em: ${tempFilePath}`);
                        await download.saveAs(tempFilePath);
                        
                        console.log(`📥 Download concluído com sucesso: ${tempFilePath}`);
                        page.off('download', downloadHandler); // Remove o listener após uso
                        resolve(tempFilePath);
                    } catch (error) {
                        console.error(`❌ Erro no handler de download: ${error.message}`);
                        page.off('download', downloadHandler);
                        reject(error);
                    }
                };

                page.on('download', downloadHandler);
            });

            // Tentar fazer o download com múltiplas estratégias
            console.log(`🖱️ Tentando download de: ${fileInfo.name}`);
            
            let downloadTriggered = false;
            
            // Estratégia 1: Clique simples
            try {
                console.log('🎯 Estratégia 1: Clique simples');
                await fileInfo.element.click();
                await page.waitForTimeout(2000); // Aguardar um pouco para ver se o download inicia
                downloadTriggered = true;
            } catch (clickError) {
                console.warn(`⚠️ Clique simples falhou: ${clickError.message}`);
            }
            
            // Estratégia 2: Duplo clique se o simples não funcionou
            if (!downloadTriggered) {
                try {
                    console.log('🎯 Estratégia 2: Duplo clique');
                    await fileInfo.element.dblclick();
                    await page.waitForTimeout(2000);
                    downloadTriggered = true;
                } catch (dblClickError) {
                    console.warn(`⚠️ Duplo clique falhou: ${dblClickError.message}`);
                }
            }
            
            // Estratégia 3: Clique forçado
            if (!downloadTriggered) {
                try {
                    console.log('🎯 Estratégia 3: Clique forçado');
                    await fileInfo.element.click({ force: true });
                    await page.waitForTimeout(2000);
                    downloadTriggered = true;
                } catch (forceClickError) {
                    console.warn(`⚠️ Clique forçado falhou: ${forceClickError.message}`);
                }
            }
            
            if (!downloadTriggered) {
                throw new Error('Todas as estratégias de clique falharam');
            }

            // Aguardar download
            console.log(`⏳ [DEBUG] Aguardando downloadPromise resolver...`);
            const filePath = await downloadPromise;
            console.log(`📁 [DEBUG] downloadPromise resolvido com:`, { filePath, type: typeof filePath });
            
            // Validar se o download foi bem-sucedido
            if (!filePath || typeof filePath !== 'string') {
                console.error(`❌ [DEBUG] Download falhou - path inválido:`, { filePath, type: typeof filePath });
                throw new Error(`Download falhou - path inválido: ${filePath}`);
            }
            
            console.log(`✅ Download concluído: ${filePath}`);

            // Verificar se o arquivo realmente existe
            try {
                await fs.access(filePath);
            } catch (accessError) {
                throw new Error(`Arquivo não encontrado após download: ${filePath} - ${accessError.message}`);
            }

            // Extrair conteúdo do PDF
            const content = await this.extractPdfContent(filePath);

            // Salvar no banco de dados
            await this.savePdfContent(downloadId, fileInfo, content);

            // Remover arquivo temporário
            try {
                await fs.unlink(filePath);
                console.log(`�️ Arquivo temporário removido: ${fileInfo.name}`);
            } catch (unlinkError) {
                console.warn(`⚠️ Erro ao remover arquivo temporário: ${unlinkError.message}`);
            }

            return {
                success: true,
                fileName: fileInfo.name,
                fileSize: content.fileSize || 0,
                contentLength: content.text?.length || 0
            };

        } catch (error) {
            console.error(`❌ Erro ao processar ${fileInfo.name}:`, error.message);
            return {
                success: false,
                fileName: fileInfo.name,
                error: error.message
            };
        }
    }

    /**
     * Extrair conteúdo de um arquivo PDF
     */
    async extractPdfContent(pdfFilePath) {
        try {
            await initPdfParse();

            console.log(`🔍 Extraindo conteúdo do PDF: ${path.basename(pdfFilePath)}`);

            const pdfBuffer = await fs.readFile(pdfFilePath);
            const stats = await fs.stat(pdfFilePath);

            // Extrair texto básico usando pdf-parse
            const pdfData = await pdfParse(pdfBuffer);

            // Extrair comentários usando pdfjs-dist (método mais avançado)
            const commentsData = await this.extractPdfComments(pdfBuffer);

            const hasContent = !!(pdfData.text && pdfData.text.trim().length > 0);
            const hasComments = !!(commentsData && commentsData.comments && commentsData.comments.length > 0);

            console.log(`📄 Conteúdo extraído - Texto: ${hasContent ? 'Sim' : 'Não'}, Comentários: ${hasComments ? 'Sim' : 'Não'}`);
            console.log(`📊 Estatísticas - Páginas: ${pdfData.numpages || 0}, Caracteres: ${pdfData.text ? pdfData.text.length : 0}`);
            if (hasContent) {
                console.log(`📝 Prévia do texto: "${pdfData.text.substring(0, 150)}..."`);
            }

            return {
                fileSize: stats.size,
                pageCount: pdfData.numpages || 0,
                text: pdfData.text || null,
                hasContent,
                hasComments,
                comments: commentsData?.comments || [],
                links: commentsData?.links || [],
                metadata: { fileSize: stats.size, pageCount: pdfData.numpages || 0 }
            };

        } catch (error) {
            console.error('❌ Erro ao extrair conteúdo do PDF:', error.message);
            return {
                fileSize: 0,
                pageCount: 0,
                text: null,
                hasContent: false,
                hasComments: false,
                comments: [],
                links: [],
                metadata: { fileSize: 0, pageCount: 0 }
            };
        }
    }
    /**
     * Salvar conteúdo do PDF no banco de dados
     */
    async savePdfContent(downloadId, fileInfo, extractionResult) {
        try {
            console.log(`💾 Salvando conteúdo no banco: ${fileInfo?.fileName || fileInfo?.name || 'arquivo desconhecido'}`);

            // Verificar se fileInfo tem propriedades necessárias
            if (!fileInfo || (!fileInfo.fileName && !fileInfo.name)) {
                console.error('❌ FileInfo inválido:', fileInfo);
                return;
            }

            // Usar fileName ou name como fallback
            const fileName = fileInfo.fileName || fileInfo.name;
            const originalUrl = fileInfo.originalUrl || null;

            // Criar arquivo PDF no banco
            const pdfFile = await prisma.pdfFile.create({
                data: {
                    downloadId: downloadId,
                    originalFileName: fileName,
                    originalUrl: originalUrl, // Salvar URL original
                    hasContent: extractionResult.hasContent,
                    hasComments: extractionResult.hasComments,
                    fileSize: extractionResult.fileSize || 0,
                    pageCount: extractionResult.pageCount || 0
                }
            });

            // Salvar conteúdo extraído (sempre, mesmo se vazio)
            const _extractedContent = await prisma.pdfExtractedContent.create({
                data: {
                    pdfFileId: pdfFile.id,
                    fullText: extractionResult.text || null,
                    comments: extractionResult.comments ? JSON.stringify(extractionResult.comments) : null,
                    links: extractionResult.links || []
                }
            });

            // Processar dados estruturados dos comentários se houver
            let _structuredData = null;
            if (extractionResult.comments?.length > 0) {
                // Processar comentários e extrair dados estruturados
                const processedData = this.processAndDeduplicateComments(extractionResult.comments);
                
                if (processedData.structuredData && Object.values(processedData.structuredData).some(v => v !== null)) {
                    _structuredData = await prisma.pdfStructuredData.create({
                        data: {
                            pdfFileId: pdfFile.id,
                            liveDate: processedData.structuredData.liveDate,
                            vf: processedData.structuredData.vf,
                            headlineCopy: processedData.structuredData.headlineCopy,
                            copy: processedData.structuredData.copy,
                            description: processedData.structuredData.description,
                            cta: processedData.structuredData.cta,
                            background: processedData.structuredData.background,
                            colorCopy: processedData.structuredData.colorCopy,
                            postcopy: processedData.structuredData.postcopy,
                            urn: processedData.structuredData.urn,
                            allocadia: processedData.structuredData.allocadia,
                            po: processedData.structuredData.po
                        }
                    });
                }
            }

            console.log(`✅ Conteúdo salvo no banco com sucesso: ${fileInfo.name}`);
            return pdfFile;

        } catch (error) {
            console.error(`❌ Erro ao salvar conteúdo no banco: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extrair comentários/anotações de um PDF usando pdfjs-dist
     * (Método copiado do documentBulkDownloadService.js)
     */
    async extractPdfComments(pdfBuffer) {
        try {
            const pdfjsLib = await this.loadPdfJsLib();

            // Converter Buffer para Uint8Array se necessário
            const pdfData = pdfBuffer instanceof Buffer ? new Uint8Array(pdfBuffer) : pdfBuffer;

            const loadingTask = pdfjsLib.getDocument({
                data: pdfData,
                verbosity: 0 // Reduzir logs
            });

            const pdfDoc = await loadingTask.promise;
            const numPages = pdfDoc.numPages;

            console.log(`📄 PDF carregado - ${numPages} páginas`);

            const allComments = [];
            const allLinks = new Set();

            // Processar cada página
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                try {
                    const page = await pdfDoc.getPage(pageNum);
                    const annotations = await page.getAnnotations();

                    for (const annotation of annotations) {
                        if (annotation.subtype === 'Text' ||
                            annotation.subtype === 'Note' ||
                            annotation.subtype === 'FreeText' ||
                            annotation.subtype === 'Highlight' ||
                            annotation.contents) {

                            let content = annotation.contents || '';

                            // Extrair rich text se disponível
                            if (annotation.richText) {
                                const richContent = this.extractRichTextContent(annotation.richText);
                                if (richContent) {
                                    content = richContent;
                                }
                            }

                            if (content.trim()) {
                                allComments.push({
                                    page: pageNum,
                                    type: this.getAnnotationType(annotation.subtype),
                                    author: annotation.title || 'Anônimo',
                                    content: content.trim(),
                                    creationDate: annotation.creationDate || null,
                                    modificationDate: annotation.modificationDate || null
                                });

                                // Extrair links do conteúdo
                                const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
                                const matches = content.match(urlRegex);
                                if (matches) {
                                    matches.forEach(url => allLinks.add(url));
                                }
                            }
                        }
                    }
                } catch (pageError) {
                    console.warn(`⚠️ Erro ao processar página ${pageNum}:`, pageError.message);
                }
            }

            await pdfDoc.destroy();

            console.log(`📝 ${allComments.length} comentários extraídos`);
            console.log(`🔗 ${allLinks.size} links únicos encontrados`);

            // Processar e estruturar dados
            const processedData = this.processAndDeduplicateComments(allComments);

            return {
                comments: allComments,
                links: Array.from(allLinks),
                structuredData: processedData.structuredData,
                commentsByAuthor: processedData.commentsByAuthor
            };

        } catch (error) {
            console.error('❌ Erro ao extrair comentários do PDF:', error.message);
            return {
                comments: [],
                links: [],
                structuredData: {},
                commentsByAuthor: new Map()
            };
        }
    }

    // Métodos auxiliares copiados do documentBulkDownloadService.js
    async loadPdfJsLib() {
        try {
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                const pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
                pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
            }

            return pdfjsLib;
        } catch (error) {
            console.error('❌ Erro ao carregar pdfjs-dist:', error.message);
            throw new Error('Biblioteca pdfjs-dist não disponível. Execute: npm install pdfjs-dist');
        }
    }

    extractRichTextContent(richText) {
        if (!richText) return null;

        try {
            if (typeof richText === 'string') {
                return richText.replace(/<[^>]*>/g, '').trim();
            }

            if (Array.isArray(richText)) {
                return richText.map(item => {
                    if (typeof item === 'string') {
                        return item.replace(/<[^>]*>/g, '').trim();
                    } else if (item && typeof item === 'object') {
                        if (item.str) return item.str;
                        if (item.text) return item.text;
                        if (item.content) return item.content;
                        return JSON.stringify(item);
                    }
                    return '';
                }).filter(text => text.length > 0).join(' ').trim();
            }

            if (typeof richText === 'object' && richText !== null) {
                if (richText.str) return richText.str;
                if (richText.text) return richText.text;
                if (richText.content) return richText.content;
                return JSON.stringify(richText);
            }

            return richText.toString();
        } catch (error) {
            console.warn('⚠️ Erro ao processar rich text:', error.message);
            return null;
        }
    }

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

    processAndDeduplicateComments(comments) {
        const textMap = new Map();
        const extractedLinks = new Set();
        const commentsByAuthor = new Map();
        const structuredData = {
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
            const text = comment.content;
            const textKey = text.toLowerCase().trim();

            if (!textMap.has(textKey)) {
                textMap.set(textKey, comment);

                // Agrupar por autor
                if (!commentsByAuthor.has(comment.author)) {
                    commentsByAuthor.set(comment.author, []);
                }
                commentsByAuthor.get(comment.author).push(comment);

                // Extrair links
                const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
                const matches = text.match(urlRegex);
                if (matches) {
                    matches.forEach(url => extractedLinks.add(url));
                }

                // Extrair campos estruturados
                this.extractStructuredFields(text, structuredData);
            }
        }

        return {
            commentsByAuthor: commentsByAuthor,
            links: Array.from(extractedLinks).sort(),
            structuredData: structuredData
        };
    }

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
            structuredData.postcopy = text.trim();
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
     * Salvar conteúdo extraído no banco de dados
     */
    async savePdfContentToDatabase(pdfFileId, extractionResult) {
        try {
            // Atualizar informações do arquivo PDF
            await prisma.pdfFile.update({
                where: { id: pdfFileId },
                data: {
                    fileSize: extractionResult.fileSize,
                    pageCount: extractionResult.pageCount,
                    hasContent: extractionResult.hasContent,
                    hasComments: extractionResult.hasComments,
                    processedAt: new Date()
                }
            });

            // Salvar conteúdo extraído
            if (extractionResult.hasContent || extractionResult.hasComments) {
                await prisma.pdfExtractedContent.create({
                    data: {
                        pdfFileId: pdfFileId,
                        fullText: extractionResult.fullText,
                        comments: extractionResult.commentsByAuthor ?
                            Object.fromEntries(extractionResult.commentsByAuthor) : null,
                        links: extractionResult.links || []
                    }
                });
            }

            // Salvar dados estruturados
            if (extractionResult.structuredData && Object.values(extractionResult.structuredData).some(v => v !== null)) {
                await prisma.pdfStructuredData.create({
                    data: {
                        pdfFileId: pdfFileId,
                        ...extractionResult.structuredData
                    }
                });
            }

            console.log(`✅ Conteúdo salvo no banco para PDF: ${pdfFileId}`);

        } catch (error) {
            console.error('❌ Erro ao salvar conteúdo no banco:', error.message);
            throw error;
        }
    }

    /**
     * Atualizar status do download de briefing
     */
    async updateBriefingDownloadStatus(downloadId, processingResult) {
        try {
            await prisma.briefingDownload.update({
                where: { id: downloadId },
                data: {
                    totalFiles: processingResult.filesCount,
                    totalSize: processingResult.totalSize,
                    status: processingResult.filesCount > 0 ? 'COMPLETED' : 'FAILED',
                    updatedAt: new Date()
                }
            });
            console.log(`✅ Status do download atualizado: ${downloadId}`);
        } catch (error) {
            console.error('❌ Erro ao atualizar status do download:', error.message);
        }
    }

    /**
     * Validar sessão salva
     */
    async validateSession() {
        try {
            await fs.access(STATE_FILE);
            console.log('✅ Arquivo de sessão encontrado');

            const sessionData = await fs.readFile(STATE_FILE, 'utf8');
            const session = JSON.parse(sessionData);

            if (!session.cookies || session.cookies.length === 0) {
                throw new Error('Sessão não contém cookies válidos');
            }

            console.log('✅ Sessão validada com sucesso');
        } catch (error) {
            console.error('❌ Erro na validação da sessão:', error.message);
            throw new Error(
                'Sessão do Workfront não encontrada ou inválida. ' +
                'Execute o login primeiro usando o endpoint /api/auth/login'
            );
        }
    }
}

export default new PdfContentExtractionService();
