import { Injectable, Logger } from '@nestjs/common';
import { Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { resolveHeadless } from './utils/headless.util';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { ProgressService } from './progress.service';

const STATE_FILE = 'wf_state.json';

// Diretório para screenshots de debug
const DEBUG_SCREENSHOTS_DIR = path.join(process.cwd(), 'automation_debug', 'share_modal');

type TeamKey = 'carol' | 'giovana' | 'test';

interface ShareSelection {
    folder: string;
    fileName: string;
}

interface ShareResult {
    folder: string;
    fileName: string;
    success: boolean;
    message?: string;
    error?: string;
}

const CAROL_TEAM = [
    { email: 'yasmin.lahm@dell.com', role: 'MANAGE' },
    { email: 'gabriela.vargas1@dell.com', role: 'MANAGE' },
    { email: 'eduarda.ulrich@dell.com', role: 'MANAGE' },
    { email: 'evili.borges@dell.com', role: 'MANAGE' },
    { email: 'giovanna.deparis@dell.com', role: 'MANAGE' },
    { email: 'natascha.batista@dell.com', role: 'MANAGE' },
    { email: 'carolina.lipinski@dell.com', role: 'MANAGE' },
];

const GIOVANA_TEAM = [
    { email: 'luiza.schmidt@dell.com', role: 'MANAGE' },
    { email: 'gislaine.orico@dell.com', role: 'MANAGE' },
    { email: 'giovana.jockyman@dell.com', role: 'MANAGE' },
];

const TEST_TEAM = [
    { email: 'gustavo.hesse@vml.com', role: 'MANAGE' },
];

@Injectable()
export class ShareAutomationService {
    private readonly logger = new Logger(ShareAutomationService.name);
    private debugMode = false; // Ativar via método público para debug
    private screenshotCounter = 0;

    constructor(private readonly progress: ProgressService) {}

    /**
     * Ativa modo debug com screenshots e logs detalhados
     */
    public enableDebugMode(enabled = true) {
        this.debugMode = enabled;
        this.logger.log(`🐛 Modo debug ${enabled ? 'ATIVADO' : 'DESATIVADO'}`);
    }

    /**
     * Captura screenshot com timestamp e contexto
     */
    private async captureDebugScreenshot(page: Page, context: string): Promise<string | null> {
        if (!this.debugMode) return null;

        try {
            await fs.mkdir(DEBUG_SCREENSHOTS_DIR, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.screenshotCounter++;
            const filename = `${this.screenshotCounter.toString().padStart(3, '0')}_${timestamp}_${context}.png`;
            const filepath = path.join(DEBUG_SCREENSHOTS_DIR, filename);
            
            await page.screenshot({ path: filepath, fullPage: true });
            this.logger.log(`📸 Screenshot salvo: ${filename}`);
            
            return filepath;
        } catch (err: any) {
            this.logger.warn(`⚠️ Erro ao capturar screenshot: ${err?.message}`);
            return null;
        }
    }

    /**
     * Captura logs do console do browser
     */
    private setupConsoleCapture(page: Page): void {
        if (!this.debugMode) return;

        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            
            if (type === 'error') {
                this.logger.error(`🔴 [Browser Console Error] ${text}`);
            } else if (type === 'warning') {
                this.logger.warn(`🟡 [Browser Console Warning] ${text}`);
            } else if (this.debugMode) {
                this.logger.debug(`🔵 [Browser Console] ${text}`);
            }
        });

        page.on('pageerror', err => {
            this.logger.error(`🔴 [Page Error] ${err.message}`);
        });
    }

    // (Retries migraram para WorkfrontDomHelper – manter apenas se precisarmos overrides futuros)

    /**
     * Modo DEBUG INTENSIVO: Testa múltiplas estratégias de abertura de modal com reload entre tentativas
     * Use apenas para diagnóstico - cria sessão isolada do browser
     */
    async debugShareModalStrategies(
        projectUrl: string,
        folderName: string,
        fileName: string,
        headless = true, // Forçar visível para debug
    ): Promise<{ results: Array<{ strategy: string; success: boolean; error?: string; screenshots: string[] }> }> {
        this.enableDebugMode(true);
        this.screenshotCounter = 0;

        this.logger.log('🐛🐛🐛 INICIANDO DEBUG INTENSIVO DO MODAL DE COMPARTILHAMENTO 🐛🐛🐛');
        
        // Limpa diretório de screenshots
        try {
            await fs.rm(DEBUG_SCREENSHOTS_DIR, { recursive: true, force: true });
            await fs.mkdir(DEBUG_SCREENSHOTS_DIR, { recursive: true });
        } catch { }

        const strategies = [
            {
                name: 'baseline',
                description: 'Estratégia padrão atual',
                modifications: async (page: Page, frame: any) => {
                    // Sem modificações - usa código atual
                }
            },
            {
                name: 'wait_longer',
                description: 'Aguarda mais tempo após seleção de documento',
                modifications: async (page: Page, frame: any) => {
                    this.logger.log('⏰ Aguardando 3s extras após seleção...');
                    await page.waitForTimeout(3000);
                }
            },
            {
                name: 'close_all_modals',
                description: 'Fecha todos os modais/overlays antes de abrir share',
                modifications: async (page: Page, frame: any) => {
                    this.logger.log('🚪 Tentando fechar todos os modais/overlays...');
                    try {
                        // Pressiona ESC múltiplas vezes
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(300);
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(300);
                        
                        // Remove todos os underlays
                        await frame.locator('[data-testid="underlay"]').evaluateAll((els: HTMLElement[]) => {
                            els.forEach(el => el.remove());
                        });
                    } catch { }
                }
            },
            {
                name: 'disable_animations',
                description: 'Desabilita animações CSS',
                modifications: async (page: Page, frame: any) => {
                    this.logger.log('🎬 Desabilitando animações...');
                    await page.addStyleTag({
                        content: `
                            *, *::before, *::after {
                                animation-duration: 0s !important;
                                animation-delay: 0s !important;
                                transition-duration: 0s !important;
                                transition-delay: 0s !important;
                            }
                        `
                    });
                }
            },
            {
                name: 'force_visibility',
                description: 'Remove z-index e overlays que podem estar bloqueando',
                modifications: async (page: Page, frame: any) => {
                    this.logger.log('👁️ Forçando visibilidade de elementos...');
                    await frame.evaluate(() => {
                        // Remove underlays
                        document.querySelectorAll('[data-testid="underlay"]').forEach(el => el.remove());
                        
                        // Remove overlays genéricos
                        document.querySelectorAll('[class*="overlay"], [class*="Overlay"]').forEach((el: any) => {
                            if (el.style) el.style.display = 'none';
                        });
                    });
                }
            },
            {
                name: 'click_with_js',
                description: 'Clica no botão usando JavaScript direto',
                modifications: async (page: Page, frame: any) => {
                    this.logger.log('🖱️ Tentando clicar via JavaScript...');
                    try {
                        await frame.evaluate(() => {
                            const shareBtn = document.querySelector('button[data-testid="share"]') as HTMLButtonElement;
                            if (shareBtn) {
                                shareBtn.click();
                                return true;
                            }
                            return false;
                        });
                        await page.waitForTimeout(2000);
                    } catch { }
                }
            },
        ];

        const results: Array<{ strategy: string; success: boolean; error?: string; screenshots: string[] }> = [];

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            const screenshots: string[] = [];

            this.logger.log(`\n${'='.repeat(80)}`);
            this.logger.log(`🧪 TESTANDO ESTRATÉGIA ${i + 1}/${strategies.length}: ${strategy.name}`);
            this.logger.log(`📝 ${strategy.description}`);
            this.logger.log('='.repeat(80));

            // Cria nova instância do browser para cada teste (isolamento total)
            const { browser, context } = await createOptimizedContext({
                headless,
                storageStatePath: await this.ensureStateFile(),
                viewport: { width: 1366, height: 900 }
            });

            try {
                const page = await context.newPage();
                
                // Configura captura de console
                this.setupConsoleCapture(page);

                // Injeta script para capturar erros da página
                await page.addInitScript(() => {
                    (window as any).__pageErrors = [];
                    window.addEventListener('error', (e) => {
                        (window as any).__pageErrors.push({
                            message: e.message,
                            filename: e.filename,
                            lineno: e.lineno,
                            colno: e.colno
                        });
                    });
                });

                this.logger.log('🌍 Abrindo projeto...');
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                let screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_01_initial_load`);
                if (screenshot) screenshots.push(screenshot);

                const frame = this.frameLocator(page);
                await this.closeSidebarIfOpen(frame, page);

                screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_02_after_close_sidebar`);
                if (screenshot) screenshots.push(screenshot);

                // Navega para pasta se necessário
                if (folderName && folderName !== 'root') {
                    this.logger.log(`📁 Navegando para pasta: ${folderName}`);
                    await this.navigateToFolder(frame, page, folderName);
                    
                    screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_03_after_folder_nav`);
                    if (screenshot) screenshots.push(screenshot);
                }

                // Seleciona documento
                this.logger.log(`📄 Selecionando documento: ${fileName}`);
                await this.selectDocument(frame, page, fileName);
                
                screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_04_after_select_doc`);
                if (screenshot) screenshots.push(screenshot);

                // Aplica modificações específicas da estratégia
                await strategy.modifications(page, frame);

                screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_05_after_modifications`);
                if (screenshot) screenshots.push(screenshot);

                // Tenta abrir modal
                this.logger.log('🔓 Tentando abrir modal...');
                await this.openShareModal(frame, page, { ensureFresh: true });

                screenshot = await this.captureDebugScreenshot(page, `${strategy.name}_06_modal_opened`);
                if (screenshot) screenshots.push(screenshot);

                // Verifica se modal realmente abriu
                const modalOpen = await this.verifyShareModal(frame);

                if (modalOpen) {
                    this.logger.log(`✅ SUCESSO! Estratégia "${strategy.name}" funcionou!`);
                    results.push({
                        strategy: strategy.name,
                        success: true,
                        screenshots
                    });
                } else {
                    throw new Error('Modal não foi aberto ou verificação falhou');
                }

            } catch (err: any) {
                this.logger.error(`❌ FALHA na estratégia "${strategy.name}": ${err?.message}`);
                
                const screenshot = await this.captureDebugScreenshot(
                    (await context.pages())[0],
                    `${strategy.name}_99_error`
                );
                if (screenshot) screenshots.push(screenshot);

                results.push({
                    strategy: strategy.name,
                    success: false,
                    error: err?.message || String(err),
                    screenshots
                });
            } finally {
                // Fecha browser (reload completo para próxima estratégia)
                try {
                    await disposeBrowser(undefined, browser as Browser);
                } catch { }
            }

            // Pausa entre estratégias
            if (i < strategies.length - 1) {
                this.logger.log('⏸️ Aguardando 2s antes da próxima estratégia...\n');
                await this.delay(2000);
            }
        }

        // Relatório final
        this.logger.log('\n' + '='.repeat(80));
        this.logger.log('📊 RELATÓRIO FINAL DE DEBUG');
        this.logger.log('='.repeat(80));

        const successCount = results.filter(r => r.success).length;
        this.logger.log(`✅ Estratégias bem-sucedidas: ${successCount}/${results.length}`);

        results.forEach((result, idx) => {
            const status = result.success ? '✅' : '❌';
            this.logger.log(`${status} ${idx + 1}. ${result.strategy}: ${result.success ? 'SUCESSO' : result.error}`);
            this.logger.log(`   Screenshots: ${result.screenshots.length} capturados`);
        });

        this.logger.log(`\n📁 Screenshots salvos em: ${DEBUG_SCREENSHOTS_DIR}`);
        this.logger.log('='.repeat(80) + '\n');

        return { results };
    }

    /**
     * Compartilhar documentos selecionados
     */
    async shareDocuments(
        projectUrl: string,
        selections: ShareSelection[],
        selectedUser: TeamKey = 'carol',
        headless = resolveHeadless(),
    ): Promise<{ results: ShareResult[]; summary: { total: number; success: number; errors: number } }> {
        this.validateShareInputs(projectUrl, selections);
        const statePath = await this.ensureStateFile();
        const { browser, context } = await createOptimizedContext({ headless, storageStatePath: statePath, viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();
        const results: ShareResult[] = [];
        let successCount = 0; let errorCount = 0;

        try {
            this.logger.log('🌍 Abrindo projeto uma única vez para compartilhamento em lote...');
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            const frame = this.frameLocator(page);
            await this.closeSidebarIfOpen(frame, page);

            for (let i = 0; i < selections.length; i++) {
                const { folder, fileName } = selections[i];
                this.logger.log(`📄 [${i + 1}/${selections.length}] Compartilhando: ${fileName} (📁 ${folder})`);
                try {
                    // Navega para pasta apenas se diferente da anterior para reduzir cliques
                    if (folder && folder !== 'root') {
                        await this.navigateToFolder(frame, page, folder);
                    }
                    await this.selectDocument(frame, page, fileName);
                    await this.openShareModal(frame, page, { ensureFresh: true });
                    await this.addUsersToShare(frame, page, this.getTeamUsers(selectedUser), projectUrl);
                    await this.saveShare(frame, page);
                    results.push({ folder, fileName, success: true, message: 'Compartilhado com sucesso' });
                    successCount++;
                } catch (err: any) {
                    this.logger.error(`❌ Erro ao compartilhar ${fileName}: ${err?.message}`);
                    results.push({ folder, fileName, success: false, error: err?.message || String(err) });
                    errorCount++;
                }
                await page.waitForTimeout(800);
            }
            return { results, summary: { total: selections.length, success: successCount, errors: errorCount } };
        } finally {
            try { await disposeBrowser(undefined, browser as Browser); } catch { }
        }
    }

    /**
     * Abrir projeto e selecionar documento (mantém navegador aberto para reutilização)
     */
    async openProjectAndSelectDocument(
        projectUrl: string,
        folderName: string,
        fileName: string,
        headless = resolveHeadless(),
    ): Promise<{ browser: Browser; page: Page; frame: any }> {
        const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await this.ensureStateFile(), viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();

        // Configura captura de console se debug ativado
        this.setupConsoleCapture(page);

        this.logger.log('🌍 Abrindo projeto...');
        await this.captureDebugScreenshot(page, 'open_project_start');
        
        await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        await this.captureDebugScreenshot(page, 'project_loaded');

        this.logger.log('🔍 Encontrando frame do Workfront...');
        // Aguarda iframe do Workfront estar presente
        try {
            await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"]', { timeout: 30000 });
        } catch { }
        const frameLocator = this.frameLocator(page);
        await this.closeSidebarIfOpen(frameLocator, page);

        await this.captureDebugScreenshot(page, 'sidebar_closed');

        if (folderName && folderName !== 'root') {
            this.logger.log(`📁 Navegando para a pasta: ${folderName}`);
            await this.navigateToFolder(frameLocator, page, folderName);
            this.logger.log(`📁 Pasta aberta: ${folderName}`);
            
            await this.captureDebugScreenshot(page, 'folder_opened');
        }

        // Selecionar documento
        this.logger.log(`📄 Selecionando documento: ${fileName}`);
        await this.selectDocument(frameLocator, page, fileName);
        this.logger.log(`📄 Documento selecionado: ${fileName}`);

        await this.captureDebugScreenshot(page, 'document_selected');

        return { browser, page, frame: frameLocator };
    }

    /**
     * Compartilhar usando página já aberta
     */
    async shareUsingOpenPage(frameLocator: any, page: Page, selectedUser: TeamKey): Promise<void> {
        await this.openShareModal(frameLocator, page);
        await this.addUsersToShare(frameLocator, page, this.getTeamUsers(selectedUser));
        await this.saveShare(frameLocator, page);
    }

    private async performDocumentShare(
        projectUrl: string,
        folderName: string,
        fileName: string,
        selectedUser: TeamKey = 'carol',
        headless = resolveHeadless(),
    ): Promise<{ success: boolean; message?: string }> {
        const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await this.ensureStateFile(), viewport: { width: 1366, height: 900 } });

        try {
            const page = await context.newPage();

            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            const frameLocator = this.frameLocator(page);
            await this.closeSidebarIfOpen(frameLocator, page);

            if (folderName && folderName !== 'root') {
                await this.navigateToFolder(frameLocator, page, folderName);
            }

            await this.selectDocument(frameLocator, page, fileName);
            await this.openShareModal(frameLocator, page);
            await this.addUsersToShare(frameLocator, page, this.getTeamUsers(selectedUser));
            await this.saveShare(frameLocator, page);

            return { success: true, message: `Documento "${fileName}" compartilhado com sucesso` };
        } finally { try { await disposeBrowser(undefined, browser as Browser); } catch { } }
    }

    public async navigateToFolder(frameLocator: any, page: Page, folderName: string): Promise<void> {
        return WorkfrontDomHelper.navigateToFolder(frameLocator, page, folderName);
    }

    public async selectDocument(frameLocator: any, page: Page, fileName: string): Promise<void> {
        return WorkfrontDomHelper.selectDocument(frameLocator, page, fileName);
    }

    public async openShareModal(frameLocator: any, page: Page, opts: { ensureFresh?: boolean } = {}): Promise<void> {
        this.logger.log('🔓 Tentando abrir modal de compartilhamento...');

        // Screenshot ANTES de tentar abrir modal
        await this.captureDebugScreenshot(page, 'before_open_share_modal');

        if (opts.ensureFresh) {
            // Fecha modal antigo se estiver aberto para evitar sobreposição
            try {
                const closeOld = frameLocator.locator('[data-testid="unified-share-dialog"] button:has-text("Close")').first();
                if ((await closeOld.count()) > 0 && await closeOld.isVisible()) {
                    this.logger.log('🚪 Fechando modal antigo...');
                    await closeOld.click();
                    await page.waitForTimeout(500);
                }
            } catch { }
        }

        // Estratégias otimizadas - focando no botão real com SVG de share
        const shareStrategies = [
            // 1. Prioridade máxima: o botão exato do Workfront
            'button[data-testid="share"]',
            'button.css-ikvpst[data-testid="share"]',

            // 2. Busca por botão com SVG de share específico
            'button:has(svg[title="Share"])',
            'button:has(svg path[d*="M7.67 14.42"])', // Path único do ícone de share

            // 3. Busca por tooltip de share
            'button:has([data-testid="share-tooltip"])',
        ];

        let lastError: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            this.logger.log(`🔍 Tentativa ${attempt}/3 de abrir modal...`);

            for (const sel of shareStrategies) {
                try {
                    const btn = frameLocator.locator(sel).first();
                    const count = await btn.count();

                    if (count > 0) {
                        const isVisible = await btn.isVisible().catch(() => false);

                        if (isVisible) {
                            // Verifica se o botão está realmente clicável (não coberto por outro elemento)
                            const isEnabled = await btn.isEnabled().catch(() => true);

                            if (!isEnabled) {
                                this.logger.warn(`⚠️ Botão encontrado mas está desabilitado: ${sel}`);
                                continue;
                            }

                            this.logger.log(`✅ Botão Share encontrado com seletor: ${sel}`);

                            // Screenshot do botão encontrado
                            await this.captureDebugScreenshot(page, `share_button_found_${sel.substring(0, 20)}`);

                            // Captura erros de console ANTES de clicar
                            const consoleErrors: string[] = [];
                            page.on('console', msg => {
                                if (msg.type() === 'error') {
                                    consoleErrors.push(msg.text());
                                }
                            });
                            
                            // Captura erros de página ANTES de clicar
                            const pageErrors: any[] = [];
                            page.on('pageerror', error => {
                                pageErrors.push({
                                    message: error.message,
                                    stack: error.stack,
                                });
                            });

                            // AGUARDA um pouco para garantir que JS está pronto
                            this.logger.log('⏳ Aguardando 500ms para garantir JS pronto...');
                            await page.waitForTimeout(500);

                            // Tenta clicar com força (ignora elementos sobrepostos)
                            this.logger.log('🖱️ Clicando no botão Share...');
                            await btn.click({ force: true }).catch(async () => {
                                // Fallback: scroll até o elemento e clica
                                await btn.scrollIntoViewIfNeeded();
                                await page.waitForTimeout(300);
                                await btn.click();
                            });

                            // Screenshot APÓS clicar
                            await this.captureDebugScreenshot(page, 'after_click_share_button');
                            
                            // Log de erros capturados
                            if (consoleErrors.length > 0) {
                                this.logger.error(`🔴 ERROS DE CONSOLE detectados após clicar: ${JSON.stringify(consoleErrors)}`);
                            }
                            if (pageErrors.length > 0) {
                                this.logger.error(`🔴 ERROS DE PÁGINA detectados após clicar: ${JSON.stringify(pageErrors)}`);
                            }

                            // IMPORTANTE: Aguarda o underlay aparecer (confirma que modal abriu)
                            this.logger.log('⏳ Aguardando underlay aparecer...');
                            try {
                                await frameLocator.locator('[data-testid="underlay"]').first().waitFor({
                                    state: 'visible',
                                    timeout: 2000
                                });
                                this.logger.log('✅ Underlay apareceu - modal está aberto!');
                                
                                // Log de erros após underlay aparecer
                                if (consoleErrors.length > 0) {
                                    this.logger.error(`🔴 TOTAL DE ${consoleErrors.length} ERROS DE CONSOLE`);
                                }
                                if (pageErrors.length > 0) {
                                    this.logger.error(`🔴 TOTAL DE ${pageErrors.length} ERROS DE PÁGINA`);
                                }

                                // Screenshot do modal aberto COM underlay
                                await this.captureDebugScreenshot(page, 'modal_01_opened_with_underlay');
                                
                                // ⚠️ CRÍTICO: NÃO REMOVER O UNDERLAY!
                                // Aguardar ele desaparecer naturalmente ou ignorá-lo
                                this.logger.log('⏳ Aguardando 300ms após underlay aparecer...');
                                await page.waitForTimeout(300);
                                await this.captureDebugScreenshot(page, 'modal_02_after_300ms');
                                
                                // Mais 300ms
                                this.logger.log('⏳ Aguardando mais 300ms...');
                                await page.waitForTimeout(300);
                                await this.captureDebugScreenshot(page, 'modal_03_after_600ms');
                                
                                // Mais 500ms
                                this.logger.log('⏳ Aguardando mais 500ms...');
                                await page.waitForTimeout(500);
                                await this.captureDebugScreenshot(page, 'modal_04_after_1100ms');
                                
                                // Verifica se houve erro no modal
                                this.logger.log('🔍 Verificando se modal tem erro...');
                                try {
                                    const hasError = await frameLocator.locator('text=/An error has occurred/i').first().isVisible().catch(() => false);
                                    if (hasError) {
                                        this.logger.error('❌ MODAL MOSTRANDO ERRO: "An error has occurred"');
                                        await this.captureDebugScreenshot(page, 'modal_ERROR_detected');
                                        throw new Error('Modal mostrou erro interno do Workfront');
                                    }
                                } catch (checkErr: any) {
                                    if (checkErr.message.includes('Modal mostrou erro')) throw checkErr;
                                }
                                
                                // Mais 400ms (total 1500ms)
                                this.logger.log('⏳ Aguardando mais 400ms (total 1500ms)...');
                                await page.waitForTimeout(400);
                                await this.captureDebugScreenshot(page, 'modal_05_after_1500ms_READY');
                                
                                // Verifica novamente se modal ainda está OK
                                const stillHasError = await frameLocator.locator('text=/An error has occurred/i').first().isVisible().catch(() => false);
                                if (stillHasError) {
                                    this.logger.error('❌ MODAL CONTINUA COM ERRO após 1.5s');
                                    await this.captureDebugScreenshot(page, 'modal_ERROR_still_present');
                                    throw new Error('Modal continua mostrando erro após aguardar');
                                }

                                this.logger.log('✅ Modal pronto sem erros - retornando sucesso!');
                                return;
                            } catch (underlayErr: any) {
                                lastError = underlayErr;
                                this.logger.warn(`⚠️ Underlay não detectado: ${underlayErr?.message}`);
                                
                                // Screenshot do erro
                                await this.captureDebugScreenshot(page, 'underlay_not_detected');

                                // Captura erros da página
                                if (this.debugMode) {
                                    try {
                                        const pageErrors = await page.evaluate(() => {
                                            return (window as any).__pageErrors || [];
                                        });
                                        if (pageErrors.length > 0) {
                                            this.logger.error(`🔴 Erros da página: ${JSON.stringify(pageErrors)}`);
                                        }
                                    } catch { }
                                }
                            }
                        } else {
                            this.logger.warn(`⚠️ Botão encontrado mas não está visível: ${sel}`);
                        }
                    }
                } catch (e: any) {
                    lastError = e;
                    this.logger.warn(`⚠️ Erro ao tentar seletor ${sel}: ${e?.message}`);
                    await this.captureDebugScreenshot(page, `error_${sel.substring(0, 20)}`);
                }
            }

            // Estratégia alternativa na segunda tentativa: buscar SVG específico do share
            if (attempt === 2) {
                this.logger.log('🔎 Procurando por SVG de share específico...');
                try {
                    // Busca todos os SVGs com title="Share"
                    const shareSvgs = await frameLocator.locator('svg[title="Share"]').all();
                    this.logger.log(`📊 SVGs de Share encontrados: ${shareSvgs.length}`);

                    for (const svg of shareSvgs) {
                        try {
                            // Pega o botão pai do SVG
                            const parentBtn = svg.locator('xpath=ancestor::button[1]');

                            if ((await parentBtn.count()) > 0) {
                                const isVisible = await parentBtn.isVisible();
                                if (isVisible) {
                                    this.logger.log(`✅ Botão Share encontrado via SVG pai`);
                                    await this.captureDebugScreenshot(page, 'svg_parent_button_found');
                                    
                                    await parentBtn.click({ force: true });
                                    await page.waitForTimeout(2500);

                                    await this.captureDebugScreenshot(page, 'after_svg_parent_click');

                                    if (await this.verifyShareModal(frameLocator)) {
                                        this.logger.log('✅ Modal aberto via SVG pai!');
                                        await this.captureDebugScreenshot(page, 'modal_opened_via_svg');
                                        return;
                                    }
                                }
                            }
                        } catch { }
                    }
                } catch (e: any) {
                    lastError = e;
                    this.logger.warn(`⚠️ Erro na busca por SVG: ${e?.message}`);
                }
            }

            // Espera entre tentativas
            if (attempt < 3) {
                this.logger.log('⏳ Aguardando 1.5s antes de nova tentativa...');
                await this.captureDebugScreenshot(page, `before_retry_${attempt + 1}`);
                await page.waitForTimeout(1500);
            }
        }

        // Log final para debug - busca todos os data-testid disponíveis
        try {
            const allTestIds = await frameLocator.locator('[data-testid]').evaluateAll((els: Element[]) =>
                els.map(el => el.getAttribute('data-testid')).filter(Boolean).slice(0, 30)
            );
            this.logger.error(`❌ data-testid disponíveis: ${JSON.stringify(allTestIds)}`);
        } catch { }

        // Screenshot final do erro
        await this.captureDebugScreenshot(page, 'final_error_state');

        throw new Error(`Modal de compartilhamento não abriu após 3 tentativas. Último erro: ${lastError?.message || 'Desconhecido'}`);
    }

    public async addUsersToShare(frameLocator: any, page: Page, users: { email: string; role: string }[], projectUrl?: string): Promise<void> {
        // Screenshot ANTES de procurar o campo
        await this.captureDebugScreenshot(page, 'before_search_email_field');
        
        // Log COMPLETO da estrutura do modal
        this.logger.log('🔍 ANALISANDO ESTRUTURA COMPLETA DO MODAL...');
        try {
            // Busca TODOS os elementos interativos no frame
            const allInteractive = await frameLocator
                .locator('input, textarea, button, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="button"], [data-testid], [aria-label]')
                .evaluateAll((els: Element[]) =>
                    els.slice(0, 50).map((el: Element) => {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName,
                            type: (el as HTMLInputElement).type || null,
                            role: el.getAttribute('role'),
                            'aria-label': el.getAttribute('aria-label'),
                            'data-testid': el.getAttribute('data-testid'),
                            placeholder: (el as HTMLInputElement).placeholder || null,
                            contenteditable: el.getAttribute('contenteditable'),
                            visible: rect.width > 0 && rect.height > 0,
                            className: el.className?.substring(0, 50) || null,
                        };
                    })
                );
            this.logger.log(`🔍 ELEMENTOS INTERATIVOS NO MODAL (frame): ${JSON.stringify(allInteractive, null, 2)}`);
        } catch (err) {
            this.logger.warn(`⚠️ Erro ao analisar elementos: ${(err as Error)?.message}`);
        }
        
        const inputSelectors = [
            'input[role="combobox"][aria-autocomplete="list"]',
            'input[aria-controls*="token"]',
            'input[data-testid*="token"]',
            'input[type="text"]',
            'input[placeholder*="Add"]',
            '[data-testid*="token"] input',
            'div[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"][aria-autocomplete="list"]',
            '[data-testid*="token"] div[contenteditable="true"]',
            '[role="combobox"][contenteditable="true"]',
            '[role="textbox"][contenteditable="true"]',
        ];

        const scopes: Array<{
            name: 'frame' | 'page';
            locate: (selector: string) => ReturnType<Page['locator']>;
        }> = [];

        if (frameLocator?.locator) {
            scopes.push({
                name: 'frame',
                locate: (selector: string) => frameLocator.locator(selector),
            });
        }

        scopes.push({
            name: 'page',
            locate: (selector: string) => page.locator(selector),
        });

        let emailInput: any = null;
        let inputIsContentEditable = false;
        let matchedSelector: string | null = null;
        let matchedScope: 'frame' | 'page' | null = null;

        for (const scope of scopes) {
            for (const sel of inputSelectors) {
                try {
                    const candidate = scope.locate(sel).first();
                    if ((await candidate.count()) === 0) continue;
                    const isVisible = await candidate.isVisible().catch(() => false);
                    if (!isVisible) continue;

                    inputIsContentEditable = await candidate.evaluate((el: Element) => {
                        const element = el as HTMLElement;
                        return element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false';
                    }).catch(() => false);

                    emailInput = candidate;
                    matchedSelector = sel;
                    matchedScope = scope.name;
                    this.logger.log(`✅ Campo de compartilhamento localizado (${scope.name}) via seletor: ${sel}`);
                    break;
                } catch (err) {
                    this.logger.debug(`Falha ao testar seletor ${sel} (${scope.name}): ${(err as Error)?.message}`);
                }
            }
            if (emailInput) break;
        }

        if (!emailInput) {
            // Screenshot do estado quando não encontra o campo
            await this.captureDebugScreenshot(page, 'email_field_not_found');
            
            for (const scope of scopes) {
                try {
                    const availableInputs = await scope
                        .locate('input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"]')
                        .evaluateAll((els: Element[]) =>
                            els.slice(0, 15).map((el: Element) => ({
                                tag: el.tagName,
                                attrs: Array.from(el.attributes).reduce((acc: Record<string, string>, attr) => {
                                    acc[attr.name] = attr.value;
                                    return acc;
                                }, {}),
                            }))
                        );
                    if (availableInputs.length > 0) {
                        this.logger.warn(`⚠️ Inputs disponíveis no modal (${scope.name}): ${JSON.stringify(availableInputs)}`);
                    }
                } catch { }
            }
            throw new Error('Campo de email não encontrado');
        }

        this.logger.log(`✅ Campo de email encontrado! (${matchedScope}) - Tirando screenshot...`);
        await this.captureDebugScreenshot(page, 'email_field_found');

        const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const userName = user.email
                .split('@')[0]
                .split('.')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');

            if (projectUrl) {
                this.progress.publish({
                    projectUrl,
                    phase: 'info',
                    message: `Compartilhando com ${userName}`,
                    subStepIndex: i + 1,
                    subStepsTotal: users.length,
                });
            }

            try {
                await emailInput.click({ force: true });
                await page.waitForTimeout(150);

                if (inputIsContentEditable) {
                    await page.keyboard.press(selectAllShortcut);
                    await page.keyboard.press('Delete');
                } else {
                    await emailInput.press(selectAllShortcut).catch(async () => {
                        await page.keyboard.press(selectAllShortcut);
                    });
                    await emailInput.press('Delete').catch(async () => {
                        await page.keyboard.press('Delete');
                    });
                }

                await page.waitForTimeout(50);

                if (inputIsContentEditable) {
                    await page.keyboard.type(user.email, { delay: 20 });
                } else {
                    await emailInput.type(user.email, { delay: 20 });
                }

                await page.waitForTimeout(600);

                const option = frameLocator.locator(`[role="option"]:has-text("${user.email}")`).first();
                if ((await option.count()) > 0) {
                    await option.click({ force: true });
                } else if (inputIsContentEditable) {
                    await page.keyboard.press('Enter');
                } else {
                    await emailInput.press('Enter');
                }

                await page.waitForTimeout(250);
                const desiredRole = user.role === 'VIEW' ? 'VIEW' : 'MANAGE';
                await this.setUserPermission(frameLocator, page, user.email, desiredRole);
            } catch (e: any) {
                this.logger.warn(`Não conseguiu adicionar usuário ${user.email} (scope=${matchedScope}, input=${matchedSelector}, contentEditable=${inputIsContentEditable}): ${e?.message}`);
            }
        }
    }

    public async saveShare(frameLocator: any, page: Page): Promise<void> {
        const saveBtn = frameLocator.getByRole('button', { name: /save|share|send/i }).first();
        if ((await saveBtn.count()) > 0) {
            await saveBtn.click();
            await page.waitForTimeout(1200);
        }
    }

    public async verifyShareModal(frameLocator: any): Promise<boolean> {
        // Estratégia pragmática: se o INPUT de compartilhamento está acessível, o modal está aberto!
        this.logger.log('🔍 Verificando input de compartilhamento...');

        try {
            // Busca direta pelo input que vamos usar
            const input = frameLocator.locator('input[role="combobox"][aria-autocomplete="list"]').first();

            if ((await input.count()) > 0) {
                const isVisible = await input.isVisible().catch(() => false);
                if (isVisible) {
                    this.logger.log('✅ Input de compartilhamento encontrado e visível!');
                    return true;
                }
            }
        } catch { }

        this.logger.warn('⚠️ Input de compartilhamento não encontrado');
        return false;
    }

    public async setUserPermission(frameLocator: any, page: Page, userEmail: string, targetPermission: 'MANAGE' | 'VIEW'): Promise<boolean> {
        // Versão robusta (baseada na função fornecida pelo usuário) + retentativas
        for (let attempt = 1; attempt <= 3; attempt++) {
            const ok = await this._setUserPermissionOnce(frameLocator, page, userEmail, targetPermission);
            if (ok) {
                this.logger.log(`🔐 Permissão '${targetPermission}' aplicada para ${userEmail} (tentativa ${attempt})`);
                return true;
            }
            this.logger.warn(`⚠️ Não conseguiu aplicar '${targetPermission}' para ${userEmail} tentativa ${attempt}`);
            await page.waitForTimeout(300);
        }
        return false;
    }

    private async _setUserPermissionOnce(frameLocator: any, page: Page, userEmail: string, targetPermission: 'MANAGE' | 'VIEW') {
        try {
            await page.waitForTimeout(300);
            const rowSelectors = [
                `[data-testid="access-rule-row"]:has-text("${userEmail}")`,
                `[data-testid="access-rule"]:has-text("${userEmail}")`,
                `.access-rule:has-text("${userEmail}")`,
                `div:has-text("${userEmail}")`,
            ];
            let row = null as any;
            for (const sel of rowSelectors) {
                try {
                    const r = frameLocator.locator(sel).first();
                    if ((await r.count()) > 0 && (await r.isVisible())) { row = r; break; }
                } catch { }
            }
            if (!row) return false;

            const btnSelectors = [
                'button:has-text("View")',
                'button:has-text("Manage")',
                'button[aria-expanded="false"]:has(svg)',
                '.o7Xu8a_spectrum-ActionButton:has-text("View")',
                '.o7Xu8a_spectrum-ActionButton:has-text("Manage")',
                'button[data-variant]',
            ];
            let btn = null as any;
            for (const sel of btnSelectors) {
                try {
                    const b = row.locator(sel).first();
                    if ((await b.count()) > 0 && (await b.isVisible())) { btn = b; break; }
                } catch { }
            }
            if (!btn) return false;
            const txt = (await btn.textContent()) || '';
            if (targetPermission === 'MANAGE' && txt.includes('Manage')) return true;
            if (txt && !txt.includes('View')) return false;
            await btn.click();
            await page.waitForTimeout(300);

            const manageSelectors = [
                '[role="menuitemradio"]:has-text("Manage")',
                '[data-key="EDIT"]',
                '.dIo7iW_spectrum-Menu-item:has-text("Manage")',
                'div[role="menuitemradio"] span:has-text("Manage")',
                '[role="option"]:has-text("Manage")',
            ];

            for (const sel of manageSelectors) {
                try {
                    const opt = frameLocator.locator(sel).first();
                    if ((await opt.count()) > 0 && (await opt.isVisible())) {
                        await opt.click();
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(200);
                        return true;
                    }
                } catch { }
            }
            await page.keyboard.press('Escape');
            return false;
        } catch {
            try { await page.keyboard.press('Escape'); } catch { }
            return false;
        }
    }

    public getTeamUsers(selectedUser: TeamKey) {
        if (selectedUser === 'carol') return CAROL_TEAM;
        if (selectedUser === 'giovana') return GIOVANA_TEAM;
        return TEST_TEAM;
    }

    private validateShareInputs(projectUrl: string, selections: ShareSelection[]) {
        if (!projectUrl) throw new Error('URL do projeto é obrigatória');
        if (!selections || selections.length === 0) throw new Error('Seleções são obrigatórias');
    }

    private async delay(ms: number) {
        return new Promise(r => setTimeout(r, ms));
    }

    // Delegações para manter compatibilidade
    private async ensureStateFile() { return WorkfrontDomHelper.ensureStateFile(); }
    private frameLocator(page: Page) { return WorkfrontDomHelper.frameLocator(page); }
    private async closeSidebarIfOpen(frameLocator: any, page: Page) { return WorkfrontDomHelper.closeSidebarIfOpen(frameLocator, page); }

    /**
     * Reutiliza página e frame já abertos para compartilhar vários arquivos (sem abrir novo browser)
     */
    async shareSelectionsInOpenSession(params: {
        page: Page;
        frame: any;
        projectUrl: string;
        selections: ShareSelection[];
        selectedUser: TeamKey;
        headless?: boolean;
    }): Promise<{ results: ShareResult[]; summary: { total: number; success: number; errors: number } }> {
        // ATIVAR DEBUG MODE PARA CAPTURAR SCREENSHOTS
        this.enableDebugMode(true);
        this.screenshotCounter = 0;
        this.logger.log('📸 DEBUG MODE ATIVADO - Screenshots serão capturados');
        
        const { page, frame, selections, selectedUser } = params;
        const results: ShareResult[] = [];
        let success = 0; let errors = 0;
        for (let i = 0; i < selections.length; i++) {
            const { folder, fileName } = selections[i];
            this.logger.log(`📄 [SESSION][${i + 1}/${selections.length}] Share: ${fileName} (${folder})`);
            let attempt = 0; const maxAttempts = 5; let shared = false; let lastErr: any = null;
            while (attempt < maxAttempts && !shared) {
                attempt++;
                try {
                    this.logger.log(`📸 Capturando screenshot inicial da tentativa ${attempt}...`);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_01_start`);
                    
                    // Navega para pasta se necessário
                    if (folder && folder !== 'root') {
                        this.logger.log(`📁 Navegando para pasta: ${folder}`);
                        await this.navigateToFolder(frame, page, folder);
                        await page.waitForTimeout(800); // Espera adicional após navegação
                        await this.captureDebugScreenshot(page, `attempt_${attempt}_02_after_folder_nav`);
                    }

                    // Seleciona documento
                    this.logger.log(`📄 Selecionando documento: ${fileName}`);
                    await this.selectDocument(frame, page, fileName);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_03_after_doc_select`);

                    // Espera adicional crucial para garantir que o documento está selecionado e a UI atualizou
                    await page.waitForTimeout(1200);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_04_after_wait_ui_update`);

                    // Fecha sidebar se estiver aberta (pode bloquear o botão Share)
                    await this.closeSidebarIfOpen(frame, page);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_05_after_close_sidebar`);

                    // Tenta abrir modal de share
                    this.logger.log(`📸 ANTES de abrir modal (tentativa ${attempt})...`);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_06_BEFORE_open_modal`);
                    
                    await this.openShareModal(frame, page, { ensureFresh: attempt > 1 });
                    
                    this.logger.log(`📸 DEPOIS de abrir modal (tentativa ${attempt})...`);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_07_AFTER_open_modal`);

                    // Adiciona usuários
                    this.logger.log(`📸 ANTES de adicionar usuários (tentativa ${attempt})...`);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_08_BEFORE_add_users`);
                    
                    await this.addUsersToShare(frame, page, this.getTeamUsers(selectedUser));
                    
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_09_AFTER_add_users`);

                    // Salva
                    await this.saveShare(frame, page);
                    await this.captureDebugScreenshot(page, `attempt_${attempt}_10_AFTER_save`);

                    results.push({ folder, fileName, success: true, message: `Compartilhado (tentativa ${attempt})` });
                    success++; shared = true; break;
                } catch (e: any) {
                    lastErr = e;
                    this.logger.warn(`⚠️ Share tentativa ${attempt} falhou para ${fileName}: ${e?.message}`);

                    // Captura screenshot do erro
                    await this.captureDebugScreenshot(page, `share_error_attempt_${attempt}_${fileName.substring(0, 30)}`);

                    if (attempt < maxAttempts) {
                        this.logger.log(`🔄 Tentando novamente... (${attempt + 1}/${maxAttempts})`);

                        // Tenta fechar qualquer modal que possa estar aberto
                        try {
                            await page.keyboard.press('Escape');
                            await page.waitForTimeout(500);
                            await page.keyboard.press('Escape'); // Duas vezes para garantir
                            await page.waitForTimeout(300);
                        } catch { }

                        // Força deselecionar o documento clicando fora
                        try {
                            await page.locator('body').click({ position: { x: 10, y: 10 } });
                            await page.waitForTimeout(300);
                        } catch { }

                        await page.waitForTimeout(1500); // Aumentado o delay entre tentativas
                    }
                }
            }
            if (!shared) { results.push({ folder, fileName, success: false, error: lastErr?.message || 'Erro' }); errors++; }
            await page.waitForTimeout(350);
        }
        return { results, summary: { total: selections.length, success, errors } };
    }
}
