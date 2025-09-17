import { Injectable, Logger } from '@nestjs/common';
import { canonicalizeColorName, getColorMeta } from '../../common/colors/dell-colors';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontService } from '../workfront/workfront.service';
import { chromium, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as os from 'os';

// Importar bibliotecas para processamento de PDF
let pdfParse: any = null;

// Função para carregar pdf-parse
async function initPdfParse() {
    if (!pdfParse) {
        try {
            const mod: any = await import('pdf-parse');
            // Suportar diferentes esquemas de export
            const candidate = mod?.default || mod;
            if (typeof candidate !== 'function') {
                // Tentar require síncrono como fallback (CommonJS)
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const reqMod = require('pdf-parse');
                    pdfParse = reqMod?.default || reqMod;
                } catch {
                    pdfParse = candidate; // manter para log de erro abaixo
                }
            } else {
                pdfParse = candidate;
            }
            if (typeof pdfParse !== 'function') {
                console.error('❌ pdf-parse carregado mas não é função. Tipo recebido:', typeof pdfParse, 'Chaves:', Object.keys(mod || {}));
                throw new Error('Formato inesperado de export em pdf-parse');
            }
            console.log('✅ Biblioteca pdf-parse carregada com sucesso (tipo função)');
        } catch (error) {
            console.error('❌ Erro ao carregar pdf-parse:', error.message);
            throw new Error('Biblioteca pdf-parse não disponível. Execute: npm install pdf-parse');
        }
    }
    return pdfParse;
}

const STATE_FILE = 'wf_state.json';

interface ExtractionResult {
    success: boolean;
    folders?: any[];
    totalFolders?: number;
    totalFiles?: number;
    processingTime?: any;
    projectTitle?: string;
    dsid?: string;
    error?: string;
}

@Injectable()
export class BriefingExtractionService {
    private readonly logger = new Logger(BriefingExtractionService.name);
    private readonly tempDownloadPath: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly workfrontService: WorkfrontService,
    ) {
        // Usar diretório temporário do sistema
        this.tempDownloadPath = path.join(os.tmpdir(), 'workfront-briefing-temp');
    }

    /**
     * Processar PDFs de briefings de múltiplos projetos
     */
    async processProjectsBriefings(projectUrls: string[], options: any = {}) {
        try {
            this.logger.log(`📋 Iniciando processamento de ${projectUrls.length} projetos (pipeline interno)...`);
            const progress = options.progress as undefined | ((ev: { type: string; data?: any }) => void);
            const operationId = options.operationId as string | undefined;

            const results = {
                total: projectUrls.length,
                successful: 0,
                failed: 0,
                summary: {
                    totalFiles: 0,
                    totalExtractions: 0,
                    pdfProcessing: {
                        totalPdfs: 0,
                        successfulExtractions: 0,
                        totalCharactersExtracted: 0
                    }
                },
                results: { processedProjects: [] },
                downloadResults: { successful: [], failed: [] }
            };

            await this.ensureTempDirectory();

            // Concorrência controlada
            const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 2, 5));
            let inFlight = 0;
            let index = 0;
            const runNext = async (): Promise<void> => {
                if (index >= projectUrls.length) return;
                const currentIndex = index++;
                const url = projectUrls[currentIndex];
                inFlight++;
                this.logger.log(`\n🔄 Projeto ${currentIndex + 1}/${projectUrls.length} (conc=${inFlight}/${concurrency}): ${url}`);
                try {
                    const projectResult = await this.processProjectBriefing(url, currentIndex + 1, options);
                    if (projectResult.success) {
                        results.successful++;
                        results.downloadResults.successful.push(projectResult);
                        const processedProject = await this.processSingleProjectResult(projectResult);
                        results.results.processedProjects.push(processedProject);
                        results.summary.totalFiles += projectResult.filesDownloaded || 0;
                        results.summary.totalExtractions += processedProject.pdfExtractions || 0;
                        if (projectResult.pdfProcessing) {
                            results.summary.pdfProcessing.totalPdfs += projectResult.pdfProcessing.processed || 0;
                            results.summary.pdfProcessing.successfulExtractions += (projectResult.pdfProcessing.results || []).filter(p => p.hasContent).length;
                            results.summary.pdfProcessing.totalCharactersExtracted += (projectResult.pdfProcessing.results || []).reduce((s, p) => s + (p.textLength || 0), 0);
                        }
                    } else {
                        results.failed++;
                        results.downloadResults.failed.push({ url, projectNumber: currentIndex + 1, error: projectResult.error || 'Erro desconhecido' });
                    }
                } catch (err) {
                    results.failed++;
                    results.downloadResults.failed.push({ url, projectNumber: currentIndex + 1, error: err.message });
                    this.logger.error(`❌ Erro no projeto ${currentIndex + 1}: ${err.message}`);
                    if (!options.continueOnError) {
                        inFlight--;
                        return; // sai cedo; as promessas já lançadas continuam
                    }
                }
                inFlight--;
                await runNext();
            };

            progress?.({ type: 'start', data: { total: projectUrls.length, concurrency } });
            const starters = Array.from({ length: Math.min(concurrency, projectUrls.length) }, () => runNext());
            await Promise.all(starters);

            this.logger.log(`✅ Processamento concluído: ${results.successful} sucessos, ${results.failed} falhas`);
            progress?.({ type: 'completed', data: { successful: results.successful, failed: results.failed } });
            return results;
        } catch (error) {
            this.logger.error('❌ Erro no processamento de briefings:', error);
            throw error;
        }
    }

    /**
     * Processar briefing de um projeto específico
     */
    private async processProjectBriefing(projectUrl: string, projectNumber: number, options: any = {}) {
        const progress = options.progress as undefined | ((ev: { type: string; data?: any }) => void);
        const isCanceled = options.isCanceled as undefined | ((projectNumber: number) => boolean);
        const browser = await chromium.launch({
            headless: options.headless !== false,
            args: options.headless !== false ? [] : ['--start-maximized']
        });

        try {
            // Verificar e validar sessão salva
            await this.validateSession();

            const context = await browser.newContext({
                storageState: STATE_FILE,
                viewport: null,
                acceptDownloads: true
            });

            const page = await context.newPage();

            // Navegar para o projeto
            this.logger.log(`🌍 Acessando URL: ${projectUrl}`);
            progress?.({ type: 'project-start', data: { projectNumber, url: projectUrl } });
            // Emitir DSID imediatamente se possível (fallback pelo URL)
            try {
                const urlDsid = this.extractDSIDFromProjectName(projectUrl);
                if (urlDsid) {
                    progress?.({ type: 'project-meta', data: { projectNumber, dsid: urlDsid, provisional: true } });
                }
            } catch { /* noop */ }
            await page.goto(projectUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForTimeout(5000);

            // Extrair nome do projeto
            const projectName = await this.extractProjectName(page, projectUrl, projectNumber);
            this.logger.log(`📋 Nome do projeto: ${projectName}`);
            // Emitir dsid como meta, se existir (a partir do título extraído)
            const dsidMeta = this.extractDSIDFromProjectName(projectName);
            if (dsidMeta) progress?.({ type: 'project-meta', data: { projectNumber, dsid: dsidMeta, provisional: false } });

            if (isCanceled?.(projectNumber)) {
                throw new Error('Operação cancelada pelo usuário');
            }

            // Navegar para a pasta "05. Briefing"
            progress?.({ type: 'stage', data: { projectNumber, stage: 'navigating-briefing-folder' } });
            await this.navigateToBriefingFolder(page);

            // Simular download e processamento (implementação básica)
            progress?.({ type: 'stage', data: { projectNumber, stage: 'downloading-and-extracting' } });
            const downloadResult = await this.realDownloadAndProcessing(page, projectName, options);

            return {
                success: true,
                url: projectUrl,
                projectNumber: projectNumber,
                projectName: projectName,
                filesDownloaded: downloadResult.count,
                totalSize: downloadResult.totalSize,
                files: downloadResult.files,
                pdfProcessing: downloadResult.pdfProcessing,
                downloadDir: (downloadResult as any).downloadDir
            };

        } catch (error) {
            this.logger.error(`❌ Erro no projeto ${projectNumber}: ${error.message}`);
            progress?.({ type: 'project-fail', data: { projectNumber, url: projectUrl, error: error.message } });
            return {
                success: false,
                url: projectUrl,
                projectNumber: projectNumber,
                error: error.message
            };
        } finally {
            await browser.close();
        }
    }

    /**
     * Download e processamento real de PDFs usando Playwright
     */
    private async realDownloadAndProcessing(page: Page, projectName: string, options: any = {}): Promise<any> {
        this.logger.log('📥 Iniciando download e processamento real de PDFs...');

        const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

        // Aguardar pasta carregar
        await page.waitForTimeout(3000);

        // Encontrar todos os arquivos PDF na pasta (metadados)
        let pdfFiles = await this.findAllDownloadableFiles(frameLocator, page, projectName);

        if (pdfFiles.length === 0) {
            this.logger.log('⚠️ Nenhum arquivo PDF encontrado na pasta Briefing');
            return {
                count: 0,
                totalSize: 0,
                files: [],
                pdfProcessing: {
                    processed: 0,
                    results: [],
                    hasTextExtraction: false
                }
            };
        }

        this.logger.log(`📋 ${pdfFiles.length} PDFs encontrados (candidatos) antes da filtragem`);

        // Opção default: selecionar somente o briefing principal
        const singleBriefing = options.singleBriefing !== false; // se não for explicitamente false, aplica
        let selectionInfo: any = { mode: singleBriefing ? 'single' : 'all' };
        if (singleBriefing && pdfFiles.length > 1) {
            const primary = this.selectPrimaryBriefing(pdfFiles, projectName);
            if (primary) {
                selectionInfo.selected = primary.fileName;
                selectionInfo.reason = primary._scoreReason;
                const originalCount = pdfFiles.length;
                pdfFiles = [primary];
                this.logger.log(`🎯 Selecionado briefing principal entre ${originalCount} candidatos: ${primary.fileName}`);
            } else {
                selectionInfo.reason = 'fallback_first_candidate';
                pdfFiles = [pdfFiles[0]];
                this.logger.warn('⚠️ Scoring não determinou briefing principal. Usando primeiro candidato.');
            }
        }
        this.logger.log(`📋 ${pdfFiles.length} PDF(s) após filtragem`);

        // Criar diretório temporário para downloads
        const tempDir = path.join(this.tempDownloadPath, `temp_${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });

        // Realizar download em lote via botão (se possível)
        const batchResult = await this.batchDownloadSelected(frameLocator, page, pdfFiles, tempDir);

        const pdfResults: any[] = [];
        let totalSize = 0;
        for (const file of batchResult.downloaded) {
            try {
                const contentResult = await this.extractPdfContent(file.filePath);
                pdfResults.push({
                    fileName: file.fileName,
                    filePath: file.filePath,
                    metadata: { pages: contentResult.metadata?.pages || 0, fileSize: file.size || 0 },
                    text: contentResult.text || '',
                    textLength: contentResult.text?.length || 0,
                    hasContent: !!(contentResult.text && contentResult.text.length > 0),
                    hasComments: !!(contentResult.comments && contentResult.comments.length > 0),
                    commentsCount: contentResult.comments?.length || 0,
                    comments: contentResult.comments || [],
                    structuredData: contentResult.structuredData || null,
                    links: contentResult.links || []
                });
                totalSize += file.size || 0;
            } catch (e) {
                this.logger.error(`❌ Falha ao extrair conteúdo de ${file.fileName}: ${e.message}`);
            }
        }

        // Limpeza dos arquivos temporários
        // Se keepFiles=true, manter diretório e arquivos para organização posterior
        try {
            if (!options.keepFiles) {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch { }

        return {
            count: pdfFiles.length,
            totalSize: totalSize,
            files: pdfFiles.map(pdf => ({ fileName: pdf.fileName, size: 0 })),
            selection: selectionInfo,
            pdfProcessing: {
                processed: pdfResults.length,
                results: pdfResults,
                hasTextExtraction: pdfResults.length > 0
            },
            downloadDir: options.keepFiles ? tempDir : undefined
        };
    }

    /**
     * Selecionar briefing principal via scoring heurístico
     * Critérios: flag isBriefing, presença de 'briefing'/'brief', overlap com tokens do projeto,
     * tamanho razoável do nome, penalização de underscores excessivos.
     */
    private selectPrimaryBriefing(candidates: any[], projectName: string) {
        if (!candidates || candidates.length === 0) return null;
        const projNorm = (projectName || '').toLowerCase();
        const projectTokens = Array.from(new Set(projNorm.split(/[^a-z0-9]+/).filter(t => t.length > 3)));
        const scored = candidates.map(c => {
            const name = c.fileName.toLowerCase();
            let score = 0;
            const reasons: string[] = [];
            if (c.isBriefing) { score += 120; reasons.push('isBriefingFlag'); }
            if (name.includes('briefing')) { score += 80; reasons.push('contains_briefing'); }
            else if (name.includes('brief')) { score += 60; reasons.push('contains_brief'); }
            // Overlap de tokens
            let tokenHits = 0; for (const t of projectTokens) if (name.includes(t)) tokenHits++;
            if (projectTokens.length) {
                const ratio = tokenHits / projectTokens.length;
                const tokenScore = Math.round(ratio * 50);
                score += tokenScore; reasons.push(`token_overlap_${tokenHits}/${projectTokens.length}`);
            }
            // Penalização por underscores excessivos
            const underscoreCount = (name.match(/_/g) || []).length;
            if (underscoreCount > 6) { score -= (underscoreCount - 6) * 3; reasons.push('underscore_penalty'); }
            // Nome não muito longo
            if (name.length <= 40) { score += 10; reasons.push('length_ok'); }
            c._score = score;
            c._scoreReason = reasons.join('|');
            return c;
        }).sort((a, b) => b._score - a._score);
        this.logger.log('🏅 Ranking de arquivos candidatos:');
        scored.forEach((c, i) => this.logger.log(`  ${i + 1}. ${c.fileName} -> score=${c._score} (${c._scoreReason})`));
        return scored[0];
    }

    /** Selecionar arquivos e disparar botão Download selected capturando múltiplos downloads */
    private async batchDownloadSelected(frameLocator: any, page: Page, pdfFiles: any[], tempDir: string) {
        // Selecionar cada elemento via safeClick (caso possua elemento)
        for (const file of pdfFiles) {
            try { await this.safeClick(file.element); await page.waitForTimeout(300); } catch { }
        }
        await page.waitForTimeout(800);
        const downloadButtonSelectors = [
            'button[data-testid="downloadselected"]',
            'button[title="Download selected"]',
            '[data-testid="downloadselected"]',
            'button:has-text("Download selected")'
        ];
        let button: any = null;
        for (const sel of downloadButtonSelectors) {
            const b = frameLocator.locator(sel).first();
            if (await b.count() > 0 && await b.isVisible()) { button = b; break; }
        }
        if (!button) {
            this.logger.warn('⚠️ Botão Download selected não encontrado – fallback para downloads individuais');
            const downloaded = [] as any[];
            for (const f of pdfFiles) {
                const single = await this.downloadSinglePdf(frameLocator, page, f, tempDir);
                if (single.success) downloaded.push({ fileName: f.fileName, filePath: single.filePath, size: single.fileSize });
            }
            return { downloaded };
        }
        const downloaded: any[] = [];
        const downloadListener = (d: any) => downloaded.push(d);
        page.on('download', downloadListener);
        try {
            await button.click({ timeout: 3000 }).catch(async () => { await button.click({ force: true, timeout: 2000 }); });
            const maxWait = Date.now() + 20000;
            while (Date.now() < maxWait) {
                await page.waitForTimeout(1000);
                // heurística simples: se número de downloads >= número selecionado ou passou 5s sem novos
                if (downloaded.length >= pdfFiles.length) break;
            }
        } catch (e) {
            this.logger.error('❌ Erro ao acionar download em lote: ' + e.message);
        }
        // Salvar cada download
        const finalFiles: any[] = [];
        for (const d of downloaded) {
            try {
                const suggested = d.suggestedFilename();
                const finalName = this.sanitizeFileName(suggested);
                const target = path.join(tempDir, finalName);
                await d.saveAs(target);
                const stat = await fs.stat(target);
                finalFiles.push({ fileName: finalName, filePath: target, size: stat.size });
            } catch (e) {
                this.logger.error('❌ Falha ao salvar download: ' + e.message);
            }
        }
        page.removeListener('download', downloadListener);
        return { downloaded: finalFiles };
    }

    /**
     * Processar resultado de um projeto e salvar no banco
     */
    private async processSingleProjectResult(projectResult: any): Promise<any> {
        try {
            // Extrair DSID do nome do projeto
            const dsid = this.extractDSIDFromProjectName(projectResult.projectName);

            // Criar ou atualizar registro do projeto no Workfront
            const project = await this.workfrontService.saveProjectFromUrl(projectResult.url, {
                title: projectResult.projectName || `Projeto sem nome`,
                description: 'Briefing processado automaticamente',
            });

            // Atualizar projeto com DSID se encontrado
            if (dsid) {
                await this.prisma.workfrontProject.update({
                    where: { id: project.id },
                    data: {
                        dsid: dsid,
                        updatedAt: new Date()
                    }
                });
            }

            // Criar registro de briefing download
            const briefingDownload = await this.prisma.briefingDownload.create({
                data: {
                    projectId: project.id,
                    projectName: projectResult.projectName,
                    dsid: dsid,
                    totalFiles: projectResult.filesDownloaded || 0,
                    totalSize: BigInt(projectResult.totalSize || 0),
                    status: 'COMPLETED',
                },
            });

            // Processar PDFs extraídos
            const pdfExtractions = await this.processPdfExtractions(projectResult, briefingDownload.id);

            return {
                briefingDownloadId: briefingDownload.id,
                projectId: project.id,
                projectName: projectResult.projectName,
                dsid: dsid,
                filesDownloaded: projectResult.filesDownloaded,
                pdfExtractions: pdfExtractions.length,
                extractionDetails: pdfExtractions
            };

        } catch (error) {
            this.logger.error(`❌ Erro ao processar resultado do projeto: ${error.message}`);
            throw error;
        }
    }

    /**
     * Processar extrações de PDF e salvar no banco
     */
    private async processPdfExtractions(projectResult: any, briefingDownloadId: string): Promise<any[]> {
        const extractions = [];

        if (!projectResult.pdfProcessing || !projectResult.pdfProcessing.results) {
            this.logger.log(`⚠️ Nenhum resultado de processamento de PDF para o projeto: ${projectResult.projectName}`);
            return extractions;
        }

        for (const pdfResult of projectResult.pdfProcessing.results) {
            try {
                // Salvar informações do PDF no banco
                const pdfFile = await this.prisma.pdfFile.create({
                    data: {
                        downloadId: briefingDownloadId,
                        originalFileName: pdfResult.fileName,
                        originalUrl: pdfResult.originalUrl || null,
                        fileSize: BigInt(pdfResult.metadata?.fileSize || 0),
                        pageCount: pdfResult.metadata?.pages || 0,
                        hasContent: pdfResult.hasContent || false,
                        hasComments: pdfResult.hasComments || false,
                        processedAt: new Date(),
                    },
                });

                // Salvar conteúdo extraído se existir
                if (pdfResult.hasContent || pdfResult.hasComments) {
                    try {
                        await this.prisma.pdfExtractedContent.create({
                            data: {
                                pdfFileId: pdfFile.id,
                                fullText: pdfResult.text || null,
                                comments: pdfResult.comments && pdfResult.comments.length ? pdfResult.comments : null,
                                links: pdfResult.links || (pdfResult.text ? Array.from(new Set((pdfResult.text.match(/https?:\/\/[^\s)"']+/g) || []))) : []),
                            },
                        });
                    } catch (contentErr) {
                        this.logger.warn(`⚠️ Falha ao salvar conteúdo extraído de ${pdfResult.fileName}: ${contentErr.message}`);
                    }
                }

                if (pdfResult.structuredData) {
                    try {
                        await this.prisma.pdfStructuredData.create({
                            data: {
                                pdfFileId: pdfFile.id,
                                liveDate: pdfResult.structuredData.liveDate || null,
                                vf: pdfResult.structuredData.vf || null,
                                headline: pdfResult.structuredData.headline || null,
                                copy: pdfResult.structuredData.copy || null,
                                description: pdfResult.structuredData.description || null,
                                cta: pdfResult.structuredData.cta || null,
                                backgroundColor: pdfResult.structuredData.backgroundColor || null,
                                copyColor: pdfResult.structuredData.copyColor || null,
                                postcopy: pdfResult.structuredData.postcopy || null,
                                urn: pdfResult.structuredData.urn || null,
                                allocadia: pdfResult.structuredData.allocadia || null,
                                formats: pdfResult.structuredData.formats || null,
                            },
                        });
                    } catch (sdErr) {
                        this.logger.warn(`⚠️ Falha ao salvar structuredData de ${pdfResult.fileName}: ${sdErr.message}`);
                    }
                }

                extractions.push({
                    pdfFileId: pdfFile.id,
                    fileName: pdfResult.fileName,
                    textLength: pdfResult.textLength || 0,
                    hasComments: pdfResult.hasComments || false,
                    commentsCount: pdfResult.commentsCount || 0,
                    pageCount: pdfResult.metadata?.pages || 0
                });

                this.logger.log(`💾 PDF salvo no banco: ${pdfResult.fileName} (${pdfResult.textLength || 0} chars, ${pdfResult.commentsCount || 0} comentários)`);

            } catch (error) {
                this.logger.error(`❌ Erro ao salvar PDF ${pdfResult.fileName}: ${error.message}`);
            }
        }

        return extractions;
    }

    /**
     * Criar diretório temporário
     */
    private async ensureTempDirectory() {
        try {
            await fs.access(this.tempDownloadPath);
            this.logger.log(`📁 Diretório temporário encontrado: ${this.tempDownloadPath}`);
        } catch {
            await fs.mkdir(this.tempDownloadPath, { recursive: true });
            this.logger.log(`📁 Diretório temporário criado: ${this.tempDownloadPath}`);
        }
    }

    /**
     * Validar sessão salva
     */
    private async validateSession() {
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

            this.logger.log('✅ Sessão válida encontrada');

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Arquivo de sessão não encontrado: ${STATE_FILE}. Execute o login primeiro.`);
            }
            throw new Error(`Erro na validação da sessão: ${error.message}`);
        }
    }

    /**
     * Extrair nome do projeto da página
     */
    private async extractProjectName(page: Page, projectUrl: string, projectNumber: number): Promise<string> {
        try {
            // Aguardar a interface carregar
            await page.waitForTimeout(3000);

            // Procurar pelo frame do Workfront
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

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
                            this.logger.log(`📋 Título extraído: ${title.trim()}`);
                            const dsid = this.extractDSIDFromProjectName(title.trim());
                            if (dsid) {
                                this.logger.log(`🎯 DSID encontrado: ${dsid}`);
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
            this.logger.log('⚠️ Não foi possível extrair nome do projeto da página');
        }

        // Fallback final
        return `projeto_${projectNumber}`;
    }

    /**
     * Navegar para a pasta "05. Briefing"
     */
    private async navigateToBriefingFolder(page: Page) {
        this.logger.log('📁 Navegando para pasta "05. Briefing"...');
        await page.waitForTimeout(3000);
        const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

        const folderSelectors = [
            'button:has-text("05. Briefing")',
            'a:has-text("05. Briefing")',
            'button:has-text("05 - Briefing")',
            'a:has-text("05 - Briefing")',
            'button:has-text("05-Briefing")',
            'a:has-text("05-Briefing")',
            'button:has-text("Briefing")',
            'a:has-text("Briefing")',
            '[role="button"]:has-text("05. Briefing")',
            '[role="button"]:has-text("Briefing")',
            '*[data-testid*="item"]:has-text("05. Briefing")',
            '*[data-testid*="item"]:has-text("Briefing")',
            '*:has-text("05. Briefing")',
            '*[title*="Briefing"]',
            '*[aria-label*="Briefing"]'
        ];

        // tentar fechar sidebar antes
        await this.closeSidebarSummary(frameLocator, page).catch(() => { });

        let navigationSuccess = false;
        for (const selector of folderSelectors) {
            try {
                const element = frameLocator.locator(selector).first();
                const count = await element.count();
                if (count === 0) continue;
                await element.waitFor({ state: 'visible', timeout: 2000 }).catch(() => { });
                this.logger.log(`🔍 Tentando abrir com: ${selector}`);
                try {
                    await element.click({ timeout: 2000 });
                } catch {
                    try { await element.click({ force: true, timeout: 1000 }); } catch { }
                }
                await page.waitForTimeout(4000);
                navigationSuccess = true;
                break;
            } catch (e) {
                continue;
            }
        }
        if (!navigationSuccess) throw new Error('Pasta "05. Briefing" não encontrada');
        this.logger.log('✅ Navegação para Briefing concluída!');
    }

    /** Fechar sidebar summary que intercepta cliques (porta do legado) */
    private async closeSidebarSummary(frameLocator: any, page: Page) {
        this.logger.log('🚪 Tentando fechar sidebar summary...');
        try {
            const closeButton = frameLocator.locator('[data-testid="minix-header-close-btn"]').first();
            if (await closeButton.count() > 0) {
                await closeButton.click({ timeout: 2000 }).catch(() => { });
                await frameLocator.locator('[data-testid="minix-container"]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { });
                this.logger.log('✅ Sidebar fechada');
            }
        } catch (e) {
            this.logger.log('⚠️ Não foi possível fechar sidebar');
        }
        await page.waitForTimeout(500);
    }

    /** Clique robusto (porta parcial do legado) */
    private async safeClick(element: any) {
        // Scroll + visibilidade
        try { await element.scrollIntoViewIfNeeded?.({ timeout: 1500 }); } catch { }
        await new Promise(r => setTimeout(r, 200));
        try { await element.waitFor({ state: 'attached', timeout: 1500 }); } catch { }
        try { await element.waitFor({ state: 'visible', timeout: 1500 }); } catch { }

        const strategies: Array<() => Promise<any>> = [
            () => element.click({ timeout: 2000 }),
            async () => { await new Promise(r => setTimeout(r, 300)); return element.click({ timeout: 2000 }); },
            () => element.click({ force: true, timeout: 2000 }),
            async () => { const box = await element.boundingBox(); if (box) { await element.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2); } },
            () => element.dispatchEvent?.('click'),
            () => element.evaluate?.((el: any) => el.click())
        ];
        for (let i = 0; i < strategies.length; i++) {
            try { await strategies[i](); return; } catch (e: any) {
                if (e.message?.includes('intercepts') || e.message?.includes('timeout')) {
                    await new Promise(r => setTimeout(r, 400));
                    continue;
                }
                if (i === strategies.length - 1) throw e;
            }
        }
    }

    /**
     * Extrair DSID do nome do projeto (compatível com o serviço legado)
     */
    private extractDSIDFromProjectName(projectName: string): string | null {
        if (!projectName) return null;

        // Usar a mesma lógica do serviço legado
        try {
            // Buscar padrão: sequência de 7 dígitos precedida por underscore
            const match = projectName.match(/_(\d{7})_/);
            if (match) {
                return match[1];
            }

            // Fallback: buscar qualquer sequência de 7 dígitos
            const fallbackMatch = projectName.match(/(\d{7})/);
            if (fallbackMatch) {
                return fallbackMatch[1];
            }

            return null;
        } catch (error) {
            this.logger.warn('❌ Erro ao extrair DSID:', error.message);
            return null;
        }
    }

    /**
     * Sanitizar nome de arquivo
     */
    private sanitizeFileName(fileName: string): string {
        if (!fileName) return 'arquivo_sem_nome';

        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s{2,}/g, ' ')
            .replace(/[_-]{2,}/g, '_')
            .trim() || 'arquivo_sem_nome';
    }

    /**
     * Encontrar todos os arquivos PDF baixáveis na pasta
     */
    private async findAllDownloadableFiles(frameLocator: any, page: Page, projectName: string): Promise<any[]> {
        try {
            this.logger.log('🔍 Procurando arquivos selecionáveis (modo avançado)...');
            await page.waitForTimeout(2500);

            // Estratégia avançada inspirada no legado
            const fileSelectors = [
                '.doc-detail-view[role="button"]',
                '.doc-detail-view',
                '[role="button"][is-folder="false"]',
                '[role="button"]:not([is-folder="true"])',
                '[data-testid*="file"][role="checkbox"]',
                '[data-testid*="document"][role="checkbox"]',
                '.file-item[role="checkbox"]',
                '.document-item[role="checkbox"]',
                '[data-testid*="file"]',
                '[data-testid*="document"]',
                '.file-item',
                '.document-item'
            ];

            const collected = [] as any[];
            const projectContext = { projectName, dsid: this.extractDSIDFromProjectName(projectName) };

            for (const selector of fileSelectors) {
                let anyFound = false;
                try {
                    const list = frameLocator.locator(selector);
                    const count = await list.count();
                    if (count === 0) continue;
                    anyFound = true;
                    this.logger.log(`� ${count} elementos via ${selector}`);
                    for (let i = 0; i < count; i++) {
                        try {
                            const el = list.nth(i);
                            if (!(await el.isVisible())) continue;
                            // Estratégias de nome
                            const nameStrategies = [
                                () => el.getAttribute('aria-label'),
                                () => el.getAttribute('title'),
                                () => el.locator('[aria-label]').first().getAttribute('aria-label'),
                                () => el.locator('[title]').first().getAttribute('title'),
                                () => el.textContent()
                            ];
                            let fileNameRaw: string | null = null;
                            for (const strat of nameStrategies) {
                                try { const v = await strat(); if (v && v.trim()) { fileNameRaw = v.trim(); break; } } catch { }
                            }
                            if (!fileNameRaw) continue;
                            // ignorar itens que parecem pasta
                            const lower = fileNameRaw.toLowerCase();
                            if (lower.includes('folder') || lower.includes('pasta')) continue;
                            // tentar extrair pdf real
                            let extracted: string | null = null;
                            if (lower.includes('.pdf')) extracted = this.extractFileName(fileNameRaw);
                            if (!extracted && lower.includes('brief')) {
                                extracted = this.sanitizeFileName(`${fileNameRaw.replace(/\s+/g, '_')}.pdf`);
                            }
                            if (!extracted) continue;
                            const isBriefCheck = this.isBriefingFile(extracted, projectName);
                            collected.push({
                                fileName: extracted,
                                element: el,
                                originalLabel: fileNameRaw,
                                isBriefing: isBriefCheck,
                            });
                        } catch (ie) { /* continuar */ }
                    }
                    if (collected.length) break; // parar na primeira lista útil
                } catch { continue; }
                if (anyFound && collected.length) break;
            }

            // Deduplicar
            const unique = collected.filter((f, idx, arr) => arr.findIndex(o => o.fileName === f.fileName) === idx);
            // Priorizar briefings primeiro
            unique.sort((a, b) => Number(b.isBriefing) - Number(a.isBriefing));
            this.logger.log(`📋 ${unique.length} arquivos candidatos (prioridade briefings).`);
            unique.forEach((f, i) => this.logger.log(`  ${i + 1}. ${f.fileName} ${f.isBriefing ? '[brief]' : ''}`));
            return unique;
        } catch (e) {
            this.logger.error('❌ Falha na busca de arquivos: ' + e.message);
            return [];
        }
    }

    /**
     * Extrair nome do arquivo do texto
     */
    private extractFileName(text: string): string | null {
        if (!text) return null;

        this.logger.log(`🔍 Analisando texto do elemento: "${text.substring(0, 200)}..."`);

        // Limpar texto
        const cleanText = text.replace(/\s+/g, ' ').trim();

        // Padrões mais específicos para arquivos PDF
        const patterns = [
            // Padrão específico do Workfront com DSID: 5372048_briefing.pdf
            /(\d{7}_[a-zA-Z_]+\.pdf)/i,
            // Nome de arquivo simples: filename.pdf
            /([a-zA-Z0-9_-]{3,}\.pdf)/i,
            // Qualquer sequência seguida de .pdf
            /([^\s\n\r\/\\]{3,}\.pdf)/i,
            // Nome com espaços e .pdf
            /([^\/\\]{3,}\.pdf)/i
        ];

        for (const pattern of patterns) {
            const match = cleanText.match(pattern);
            if (match) {
                const fileName = match[1].trim();
                this.logger.log(`✅ Nome extraído com padrão ${pattern}: "${fileName}"`);
                return fileName;
            }
        }

        // Estratégia alternativa: procurar por linhas que contenham .pdf
        const lines = cleanText.split(/[\n\r]+/).filter(line => line.trim());
        for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.toLowerCase().includes('.pdf')) {
                // Tentar extrair apenas a parte do nome do arquivo
                const pdfMatch = cleanLine.match(/([^\/\\]*\.pdf)/i);
                if (pdfMatch) {
                    const fileName = pdfMatch[1].trim();
                    this.logger.log(`✅ Nome extraído de linha: "${fileName}"`);
                    return fileName;
                }
            }
        }

        // Última tentativa: se contém .pdf em qualquer lugar
        if (cleanText.toLowerCase().includes('.pdf')) {
            this.logger.log(`⚠️ Texto contém .pdf mas não conseguiu extrair nome específico`);
            // Para debug, vamos simular um nome baseado no contexto
            return null; // Não retornar nada se não conseguir extrair corretamente
        }

        this.logger.log(`❌ Não conseguiu extrair nome de arquivo do texto`);
        return null;
    }

    /**
     * Verificar se arquivo é um briefing baseado no nome
     */
    private isBriefingFile(fileName: string, projectName: string): boolean {
        if (!fileName) return false;
        const name = fileName.toLowerCase();
        if (name.includes('brief')) return true;
        const projNorm = (projectName || '').toLowerCase();
        if (!projNorm) return false;
        const baseFile = name.replace(/\.pdf$/i, '');
        const tokens = Array.from(new Set(projNorm.split(/[^a-z0-9]+/).filter(t => t.length > 3)));
        let hits = 0; for (const t of tokens) if (baseFile.includes(t)) hits++;
        return tokens.length ? (hits / tokens.length) >= 0.5 : false;
    }

    /**
     * Verificar se texto contém padrões indicativos de briefing
     */
    private containsBriefingPatterns(text: string): boolean {
        if (!text) return false;

        const content = text.toLowerCase();

        // Padrões que podem aparecer no conteúdo de briefings
        const contentPatterns = [
            'brief',
            'briefing',
            'creative',
            'campaign',
            'tier',
            'live date',
            'objective',
            'target audience',
            'deliverable',
            'timeline'
        ];

        return contentPatterns.some(pattern => content.includes(pattern));
    }

    /**
     * Simular download de um único PDF (em ambiente real, faria download real)
     */
    private async downloadSinglePdf(frameLocator: any, page: Page, pdfInfo: any, tempDir: string): Promise<any> {
        try {
            this.logger.log(`📥 Baixando: ${pdfInfo.fileName}`);

            // Tentar localizar o elemento clicável associado
            const element = pdfInfo.element as any;
            if (!element) throw new Error('Elemento do arquivo não disponível para clique');

            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 15000 }),
                element.click().catch(() => {/* fallback silencioso */ })
            ]);

            const suggested = download.suggestedFilename();
            const finalName = this.sanitizeFileName(suggested || pdfInfo.fileName);
            const targetPath = path.join(tempDir, finalName);
            await download.saveAs(targetPath);
            const stat = await fs.stat(targetPath);

            return { success: true, filePath: targetPath, fileSize: stat.size };
        } catch (error) {
            this.logger.error(`❌ Erro no download de ${pdfInfo.fileName}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Extrair conteúdo real de um arquivo PDF
     */
    private async extractPdfContent(filePath: string): Promise<any> {
        try {
            this.logger.log(`📖 Extraindo conteúdo de: ${path.basename(filePath)}`);
            if (!existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
            const pdfParseLib = await initPdfParse();
            const buffer = await fs.readFile(filePath);
            const parsed = await pdfParseLib(buffer);

            // Comentários via pdfjs-dist (coletar todos para posterior dedupe)
            let annotations: any[] = [];
            try {
                const { createCanvas } = await import('canvas'); // garante dependência
                const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
                // mocks mínimos de DOMMatrix se necessário
                if (!(globalThis as any).DOMMatrix) { (globalThis as any).DOMMatrix = class { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; }; }
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
                const pdf = await loadingTask.promise;
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const annots = await page.getAnnotations({ intent: 'display' });
                    for (const a of annots) {
                        const parsePdfDate = (d: string | undefined | null): { raw: string | null; iso: string | null } => {
                            if (!d) return { raw: null, iso: null };
                            const raw = d;
                            const m = d.match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
                            if (m) {
                                const [, Y, Mo, Dy, H, Mi, S] = m;
                                try {
                                    const dt = new Date(Date.UTC(Number(Y), (Mo ? Number(Mo) : 1) - 1, Dy ? Number(Dy) : 1, H ? Number(H) : 0, Mi ? Number(Mi) : 0, S ? Number(S) : 0));
                                    if (!isNaN(dt.getTime())) return { raw, iso: dt.toISOString() };
                                } catch { }
                            }
                            const ts = Date.parse(d);
                            return { raw, iso: isNaN(ts) ? null : new Date(ts).toISOString() };
                        };
                        const rawText = (a.richText || a.RC || a.contents || a.Contents || a.subject || a.Subj || '')?.toString();
                        const created = parsePdfDate(a.creationDate || a.CreationDate);
                        const modified = parsePdfDate(a.modificationDate || a.modDate || a.M);
                        const author = a.title || a.T || a.author || a.user || a.name || a.creator || 'Anônimo';
                        annotations.push({
                            page: pageNum,
                            subtype: a.subtype || null,
                            author,
                            subject: a.subject || a.Subj || null,
                            rawContents: a.contents || a.Contents || null,
                            richText: a.richText || a.RC || null,
                            text: rawText ? rawText.trim() : '',
                            creationDateRaw: created.raw,
                            creationDate: created.iso,
                            modificationDateRaw: modified.raw,
                            modificationDate: modified.iso
                        });
                    }
                }
            } catch (annErr) {
                this.logger.warn(`⚠️ Falha ao extrair anotações: ${annErr.message}`);
            }

            // Pós-processar anotações para extrair texto real de richText quando text ficou '[object Object]' ou vazio
            const extractPlainFromRich = (rich: any): string => {
                if (!rich) return '';
                if (typeof rich === 'string') return rich;
                if (rich.str && typeof rich.str === 'string') return rich.str;
                // Estrutura html: { name, children: [...] }
                const collect = (node: any, acc: string[]) => {
                    if (!node) return;
                    if (typeof node === 'string') { acc.push(node); return; }
                    if (node.value && typeof node.value === 'string') acc.push(node.value);
                    if (Array.isArray(node.children)) node.children.forEach(ch => collect(ch, acc));
                };
                const acc: string[] = [];
                if (rich.html) collect(rich.html, acc);
                return acc.join('\n');
            };
            for (const ann of annotations) {
                if (!ann.text || ann.text === '[object Object]') {
                    const candidate = extractPlainFromRich(ann.richText);
                    if (candidate && candidate.trim()) ann.text = candidate.trim();
                }
                if (!ann.author || ann.author === 'object Object' || ann.author === '[object Object]' || ann.author === 'Desconhecido' || ann.author === 'Unknown') {
                    ann.author = 'Anônimo';
                }
                if (ann.text) ann.text = ann.text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
            }
            // Deduplicação avançada de comentários
            const deduplicateComments = (comments: any[]) => {
                const seen = new Set<string>();
                const result: any[] = [];

                for (const c of comments) {
                    const text = (c.text || c.rawContents || '').trim();
                    if (!text || text.length < 3) continue; // ignorar textos muito curtos

                    // Normalizar texto para comparação (remover espaços extras, quebras de linha)
                    const normalizedText = text.replace(/\s+/g, ' ').toLowerCase();

                    // Chave de deduplicação: página + texto normalizado
                    const dedupKey = `${c.page}|${normalizedText}`;

                    // Verificar duplicatas por similaridade (85% de overlap)
                    let isDuplicate = false;
                    for (const existingKey of seen) {
                        const [, existingText] = existingKey.split('|', 2);
                        const similarity = calculateTextSimilarity(normalizedText, existingText);
                        if (similarity > 0.85) {
                            isDuplicate = true;
                            break;
                        }
                    }

                    if (!isDuplicate && !seen.has(dedupKey)) {
                        seen.add(dedupKey);
                        result.push(c);
                    }
                }

                return result;
            };

            // Função auxiliar para calcular similaridade entre textos
            const calculateTextSimilarity = (text1: string, text2: string): number => {
                if (text1 === text2) return 1;
                const len1 = text1.length;
                const len2 = text2.length;
                if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) return 0;

                // Contagem de palavras em comum
                const words1 = new Set(text1.split(/\s+/));
                const words2 = new Set(text2.split(/\s+/));
                const intersection = new Set([...words1].filter(w => words2.has(w)));
                const union = new Set([...words1, ...words2]);

                return intersection.size / union.size;
            };

            annotations = deduplicateComments(annotations);
            // Comentários completos e links do texto total
            const textContent = parsed.text || '';
            const linkRegex = /https?:\/\/[^\s)"']+/g;
            // Função para encurtar link conforme regra (remover segmento secured/assetshare/ ... até 'details.html')
            const shortenLink = (full: string): string => {
                try {
                    // Regra: extrair parte a partir de /content/dam/... mantendo domínio base
                    const damIdx = full.indexOf('/content/dam/');
                    if (damIdx !== -1) return 'https://dam.dell.com' + full.substring(damIdx);
                    // Se houver /details.html/ usar o trecho depois
                    const dtIdx = full.indexOf('/details.html/');
                    if (dtIdx !== -1) {
                        const tail = full.substring(dtIdx + '/details.html'.length);
                        const damTailIdx = tail.indexOf('/content/dam/');
                        if (damTailIdx !== -1) return 'https://dam.dell.com' + tail.substring(damTailIdx);
                    }
                    return full;
                } catch { return full; }
            };

            const allLinksSet = new Set<string>();
            // Links do corpo do texto
            (textContent.match(linkRegex) || []).forEach(l => allLinksSet.add(l));
            // Links dentro dos comentários (raw / richText)
            for (const ann of annotations) {
                const sources = [ann.text, ann.rawContents, ann.subject];
                for (const src of sources) {
                    if (!src || typeof src !== 'string') continue;
                    (src.match(linkRegex) || []).forEach(l => allLinksSet.add(l));
                }
                // RichText html traversal
                const collectRichLinks = (node: any) => {
                    if (!node) return;
                    if (typeof node === 'string') {
                        (node.match(linkRegex) || []).forEach(l => allLinksSet.add(l));
                        return;
                    }
                    if (node.value && typeof node.value === 'string') {
                        (node.value.match(linkRegex) || []).forEach(l => allLinksSet.add(l));
                    }
                    if (Array.isArray(node.children)) node.children.forEach(ch => collectRichLinks(ch));
                };
                if (ann.richText?.html) collectRichLinks(ann.richText.html);
            }
            const linksFull = Array.from(allLinksSet);
            const linksShort = linksFull.map(shortenLink).filter(Boolean);
            const linksDetailed = linksFull.map((full, i) => ({ id: i + 1, full, short: linksShort[i] }));
            const commentsNormalized = annotations; // manter todos

            // Extrair structured fields a partir do TEXTO (base principal)
            const structured: any = { liveDate: null, vf: null, headline: null, copy: null, description: null, cta: null, backgroundColor: null, copyColor: null, postcopy: null, urn: null, allocadia: null, po: null, formats: null };
            const extractField = (label: string, regex: RegExp) => { if (!structured[label]) { const m = textContent.match(regex); if (m) structured[label] = m[1].trim(); } };
            extractField('liveDate', /live\s+dates?:\s*([^\n]+)/i);
            extractField('vf', /(?:vf|visual framework|microsoft jma):\s*([^\n]+)/i);
            
            // Detectar VF baseado em palavras-chave no texto principal
            if (!structured.vf) {
                const vfKeywords = ['microsoft', 'mcafee', 'intel core', 'intel'];
                const textLower = textContent.toLowerCase();
                for (const keyword of vfKeywords) {
                    if (textLower.includes(keyword)) {
                        // Extrair a linha que contém a palavra-chave
                        const lines = textContent.split(/\r?\n/);
                        for (const line of lines) {
                            if (line.toLowerCase().includes(keyword)) {
                                structured.vf = line.trim();
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            
            extractField('headline', /(?:hl|headline(?:\s*copy)?):?\s*([^\n]+)/i);
            extractField('copy', /(?:^|\n)copy:\s*([^\n]+)/i);
            extractField('description', /description:\s*([^\n]+)/i);
            extractField('cta', /cta:\s*([^\n]+)/i);
            // Capturar linha combinada que contenha background e color copy juntos
            const bgCombinedRegex = /background:\s*([^\n]*?)(?:\s+(?:color\s*copy|copy\s*color|text\s*color|copy\s*colour):\s*([^\n]+))?(?:$|\n)/i;
            const bgCombinedMatch = textContent.match(bgCombinedRegex);
            if (bgCombinedMatch) {
                const bgVal = bgCombinedMatch[1]?.trim();
                const ccVal = bgCombinedMatch[2]?.trim();
                if (bgVal && !structured.backgroundColor) structured.backgroundColor = bgVal;
                if (ccVal && !structured.copyColor) structured.copyColor = ccVal;
            }
            extractField('backgroundColor', /background:\s*([^\n]+)/i);
            // color copy variantes
            extractField('copyColor', /(?:color\s*copy|copy\s*color|text\s*color|copy\s*colour):\s*([^\n]+)/i);
            if (textContent.toLowerCase().includes('postcopy')) structured.postcopy = structured.postcopy || 'POSTCOPY';
            extractField('urn', /urn:\s*([^\n]+)/i);
            const alloc = textContent.match(/allocadia\s*([0-9]+)/i); if (alloc && !structured.allocadia) structured.allocadia = alloc[1];
            // Regex muito mais restritiva para PO - capturar apenas códigos válidos
            extractField('po', /(?:^|\n|\s)po[#:\s]*([A-Z0-9]{3,}(?:-[A-Z0-9]+)*)(?=\s|$|\n)/i);
            
            // Extração de formatos de assets
            const extractFormats = (text: string, comments: any[]): any => {
                const formats = {
                    requested: [] as string[],
                    existing: [] as string[],
                    summary: null as string | null
                };
                
                // Padrões para formatos solicitados
                const requestPatterns = [
                    /please create (?:a )?([0-9x, and]+) versions?/gi,
                    /please create (?:a )?([0-9x, and]+) version/gi,
                    /create (?:a )?([0-9x, and]+) versions?/gi,
                    /need (?:a )?([0-9x, and]+) versions?/gi,
                    /fazer (?:uma? )?versões? ([0-9x, e]+)/gi
                ];
                
                // Padrões para formatos existentes em nomes de arquivos
                const existingPatterns = [
                    /([0-9]+x[0-9]+)[-_]source/gi,
                    /[-_]([0-9]+x[0-9]+)[-_]/gi,
                    /[-_]([0-9]+x[0-9]+)\./gi
                ];
                
                // Buscar em texto principal e comentários
                const allText = [text, ...comments.map(c => c.text || '')].join(' ');
                
                // Extrair formatos solicitados
                for (const pattern of requestPatterns) {
                    const matches = allText.matchAll(pattern);
                    for (const match of matches) {
                        const formatStr = match[1];
                        // Parsear formatos como "4x5, 1x1 and 9x16" ou "4x5 and 9x16"
                        const parsedFormats = formatStr
                            .split(/[,and\s]+/)
                            .map(f => f.trim())
                            .filter(f => /^[0-9]+x[0-9]+$/.test(f));
                        
                        formats.requested.push(...parsedFormats);
                    }
                }
                
                // Extrair formatos existentes de nomes de arquivos
                for (const pattern of existingPatterns) {
                    const matches = allText.matchAll(pattern);
                    for (const match of matches) {
                        const format = match[1];
                        if (/^[0-9]+x[0-9]+$/.test(format)) {
                            formats.existing.push(format);
                        }
                    }
                }
                
                // Remover duplicatas
                formats.requested = [...new Set(formats.requested)];
                formats.existing = [...new Set(formats.existing)];
                
                // Criar resumo se houver formatos
                if (formats.requested.length > 0 || formats.existing.length > 0) {
                    const parts = [];
                    if (formats.requested.length > 0) {
                        parts.push(`Solicitados: ${formats.requested.join(', ')}`);
                    }
                    if (formats.existing.length > 0) {
                        parts.push(`Existentes: ${formats.existing.join(', ')}`);
                    }
                    formats.summary = parts.join(' | ');
                }
                
                return formats.summary ? formats : null;
            };
            
            structured.formats = extractFormats(textContent, commentsNormalized);

            // Complementar com dados vindos dos COMENTÁRIOS somente se ainda faltarem campos
            const ensureField = (label: string, matcher: RegExp) => {
                if (structured[label]) return; // já preenchido pelo texto
                for (const c of commentsNormalized) {
                    const txt = c.text || c.richText || c.rawContents || '';
                    if (!txt) continue;
                    const m = txt.match(matcher);
                    if (m) { structured[label] = m[1].trim(); break; }
                }
            };
            ensureField('liveDate', /live\s+dates?:\s*([^\n]+)/i);
            ensureField('vf', /(?:vf|visual framework|microsoft jma):\s*([^\n]+)/i);
            
            // Detectar VF baseado em palavras-chave nos comentários
            if (!structured.vf) {
                const vfKeywords = ['microsoft', 'mcafee', 'intel core', 'intel'];
                for (const c of commentsNormalized) {
                    const text = (c.text || '').toLowerCase();
                    for (const keyword of vfKeywords) {
                        if (text.includes(keyword)) {
                            // Extrair o texto completo do comentário que contém a palavra-chave
                            structured.vf = c.text.trim();
                            break;
                        }
                    }
                    if (structured.vf) break; // Para assim que encontrar o primeiro
                }
            }
            
            // Variações do headline nos comentários
            ensureField('headline', /(?:hl|headline(?:\s*copy)?):?\s*([^\n]+)/i);
            ensureField('copy', /(?:^|\n)copy:\s*([^\n]+)/i);
            ensureField('description', /description:\s*([^\n]+)/i);
            ensureField('cta', /cta:\s*([^\n]+)/i);
            ensureField('backgroundColor', /background:\s*([^\n]+)/i);
            ensureField('copyColor', /(?:color\s*copy|copy\s*color|text\s*color|copy\s*colour):\s*([^\n]+)/i);
            // Se backgroundColor contém 'color copy:' remover essa parte e tentar extrair copyColor
            if (structured.backgroundColor && /(color\s*copy|copy\s*color|text\s*color|copy\s*colour):/i.test(structured.backgroundColor)) {
                const parts = structured.backgroundColor.split(/(?:color\s*copy|copy\s*color|text\s*color|copy\s*colour):/i);
                const left = parts[0].trim();
                const right = parts[1]?.trim();
                structured.backgroundColor = left || structured.backgroundColor;
                if (right && !structured.copyColor) {
                    // remover possíveis prefixos residuais
                    structured.copyColor = right.replace(/^[:\-\s]+/, '').trim();
                }
            }
            // Normalizar capitalização simples para cores conhecidas se vier minúsculo
            const capitalizeColor = (val: string) => {
                if (!val) return val;
                if (val.toLowerCase() === val && val.length <= 15) {
                    return val.charAt(0).toUpperCase() + val.slice(1);
                }
                return val;
            };
            if (structured.backgroundColor) {
                const meta = getColorMeta(structured.backgroundColor) || getColorMeta(canonicalizeColorName(structured.backgroundColor) || undefined);
                if (meta) {
                    structured.backgroundColor = meta.canonical;
                } else {
                    const canon = canonicalizeColorName(structured.backgroundColor);
                    structured.backgroundColor = canon || capitalizeColor(structured.backgroundColor);
                }
            }
            if (structured.copyColor) {
                const metaCC = getColorMeta(structured.copyColor) || getColorMeta(canonicalizeColorName(structured.copyColor) || undefined);
                if (metaCC) {
                    structured.copyColor = metaCC.canonical;
                } else {
                    const canonCC = canonicalizeColorName(structured.copyColor);
                    structured.copyColor = canonCC || capitalizeColor(structured.copyColor);
                }
            }
            if (!structured.postcopy) { for (const c of commentsNormalized) { if ((c.text || '').toLowerCase().includes('postcopy')) { structured.postcopy = c.text.trim(); break; } } }
            ensureField('urn', /urn:\s*([^\n]+)/i);
            if (!structured.allocadia) { for (const c of commentsNormalized) { const m = (c.text || '').match(/allocadia\s*([0-9]+)/i); if (m) { structured.allocadia = m[1].trim(); break; } } }
            // Extração muito mais restritiva de PO para evitar nomes de arquivos e texto quebrado
            if (!structured.po) { 
                for (const c of commentsNormalized) { 
                    const m = (c.text || '').match(/(?:^|\n|\s)po[#:\s]*([A-Z0-9]{3,}(?:-[A-Z0-9]+)*)(?=\s|$|\n)/i); 
                    if (m && m[1].length >= 3 && !/\.(psd|pdf|jpg|png|zip)$/i.test(m[1])) { 
                        structured.po = m[1].trim(); 
                        break; 
                    } 
                } 
            }

            // Enriquecimento de comentários (datas, autor fallback, tipo amigável, ordenação)
            const typeMap: Record<string, string> = {
                Text: 'Sticky Note', Note: 'Nota', Highlight: 'Destaque', Underline: 'Sublinhado',
                StrikeOut: 'Riscado', Squiggly: 'Rabisco', FreeText: 'Texto Livre', Stamp: 'Carimbo',
                Ink: 'Tinta', Line: 'Linha', Square: 'Quadrado', Circle: 'Círculo', Polygon: 'Polígono',
                PolyLine: 'Linha Poligonal', Link: 'Link', Popup: 'Popup'
            };

            const formatBr = (iso?: string | null) => {
                if (!iso) return null;
                try {
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return null;
                    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
                } catch { return null; }
            };

            const enriched = commentsNormalized.map((c: any, idx: number) => {
                // Base dates
                const createdISO = c.creationDate || c.creationDateRaw || c.modificationDate || c.modificationDateRaw || null;
                const modifiedISO = c.modificationDate || c.modificationDateRaw || null;

                // Extração melhorada de autores
                let author = c.author || c.title || c.T || 'Anônimo';

                // Limpar autores inválidos
                if (author === '[object Object]' || author === 'object Object' || author === 'Desconhecido' || author === 'Unknown') {
                    author = 'Anônimo';
                }

                // Fallbacks para extrair autor do conteúdo se ainda for 'Anônimo'
                if (!author || author === 'Anônimo') {
                    const text = c.text || '';

                    // Padrão 1: "Por: Nome" ou "By: Nome" no início
                    const byMatch = text.match(/^(?:por|by|autor|author)\s*[:\-]\s*([^\n,]{2,30})/i);
                    if (byMatch) {
                        author = byMatch[1].trim();
                    }
                    // Padrão 2: "[Nome]" no início
                    else if (text.match(/^\[[^\]]{2,25}\]/)) {
                        const bracket = text.match(/^\[([^\]]{2,25})\]/);
                        if (bracket) author = bracket[1].trim();
                    }
                    // Padrão 3: "- Nome" no início (comum em comentários)
                    else if (text.match(/^-\s*[A-Za-zÀ-ÿ]{2,}/)) {
                        const dashMatch = text.match(/^-\s*([A-Za-zÀ-ÿ\s]{2,20})/);
                        if (dashMatch) author = dashMatch[1].trim();
                    }
                    // Padrão 4: nome seguido de dois pontos
                    else if (text.match(/^[A-Za-zÀ-ÿ\s]{2,20}:/)) {
                        const colonMatch = text.match(/^([A-Za-zÀ-ÿ\s]{2,20}):/);
                        if (colonMatch) author = colonMatch[1].trim();
                    }
                }

                // Normalizar nome do autor
                if (author && author !== 'Anônimo') {
                    author = author.replace(/[\[\]\-"']/g, '').trim();
                    // Capitalizar primeira letra de cada palavra
                    author = author.split(/\s+/).map(word =>
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ');

                    // Validar se parece um nome válido (só letras e espaços, 2-30 chars)
                    if (!/^[A-Za-zÀ-ÿ\s]{2,30}$/.test(author)) {
                        author = 'Anônimo';
                    }
                }

                // Friendly type
                const typeFriendly = typeMap[c.subtype] || c.subtype || 'Comentário';

                // Simplificar ordenação (apenas por página + índice)
                const pageNum = Number(c.page) || 0;
                const sortKey = `${String(pageNum).padStart(4, '0')}_${String(idx).padStart(5, '0')}`;

                // Limpar e validar texto
                let cleanText = (c.text && c.text !== '[object Object]') ? c.text : (c.richText?.str || '');
                if (cleanText) {
                    cleanText = cleanText.trim().replace(/\s+/g, ' '); // normalizar espaços
                }

                return {
                    page: pageNum,
                    author,
                    type: typeFriendly,
                    text: cleanText,
                    sortKey
                };
            }).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));

            return {
                text: textContent,
                metadata: { pages: parsed.numpages || 0, info: parsed.info || {} },
                comments: enriched,
                structuredData: structured,
                links: linksShort,
                linksFull,
                linksDetailed
            };
        } catch (error) {
            this.logger.error(`❌ Erro na extração de conteúdo: ${error.message}`);
            return { text: '', metadata: { pages: 0 }, comments: [], structuredData: null, links: [] };
        }
    }

    /**
     * Método de compatibilidade para o controller existente
     */
    async extractDocuments(projectUrl: string, options: any = {}): Promise<ExtractionResult> {
        try {
            this.logger.log(`📁 Extraindo documentos de projeto único: ${projectUrl}`);

            // Processar apenas um projeto usando o método de múltiplos projetos
            const result = await this.processProjectsBriefings([projectUrl], options);

            if (result.successful > 0) {
                const projectResult = result.results.processedProjects[0];
                return {
                    success: true,
                    folders: [{
                        name: '05. Briefing',
                        files: projectResult?.extractionDetails?.map(extraction => ({
                            name: extraction.fileName,
                            type: 'PDF',
                            size: 'N/A'
                        })) || []
                    }],
                    totalFolders: 1,
                    totalFiles: projectResult?.pdfExtractions || 0,
                    projectTitle: projectResult?.projectName || 'Projeto sem nome',
                    dsid: projectResult?.dsid
                };
            } else {
                return {
                    success: false,
                    error: result.downloadResults?.failed?.[0]?.error || 'Falha na extração',
                    folders: [],
                    totalFolders: 0,
                    totalFiles: 0
                };
            }
        } catch (error) {
            this.logger.error('❌ Erro na extração de documentos:', error);
            return {
                success: false,
                error: error.message,
                folders: [],
                totalFolders: 0,
                totalFiles: 0
            };
        }
    }
}