import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CommentService } from '../pdf/comment.service';
import { CommentType, AddCommentDto } from '../pdf/dto/pdf.dto';

const STATE_FILE = 'wf_state.json';

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

    constructor(
        private readonly commentService: CommentService,
    ) { }

    async shareDocuments(
        projectUrl: string,
        selections: ShareSelection[],
        selectedUser: TeamKey = 'carol',
        headless = false,
    ): Promise<{ results: ShareResult[]; summary: { total: number; success: number; errors: number } }> {
        this.validateShareInputs(projectUrl, selections);

        const results: ShareResult[] = [];
        let successCount = 0;
        let errorCount = 0;

        // Executa cada compartilhamento em sequência para reduzir flakiness
        for (let i = 0; i < selections.length; i++) {
            const { folder, fileName } = selections[i];
            this.logger.log(`📄 [${i + 1}/${selections.length}] Compartilhando: ${fileName} (📁 ${folder})`);
            try {
                const shareResult = await this.performDocumentShare(projectUrl, folder, fileName, selectedUser, headless);

                if (shareResult?.success) {
                    results.push({ folder, fileName, success: true, message: shareResult.message || 'Compartilhado com sucesso' });
                    successCount++;
                } else {
                    throw new Error(shareResult?.message || 'Falha no compartilhamento');
                }
            } catch (err: any) {
                this.logger.error(`❌ Erro ao compartilhar ${fileName}: ${err?.message}`);
                results.push({ folder, fileName, success: false, error: err?.message || String(err) });
                errorCount++;
            }

            if (i < selections.length - 1) await this.delay(1000);
        }

        return {
            results,
            summary: { total: selections.length, success: successCount, errors: errorCount },
        };
    }

    // Executa share e mantém a página aberta, retornando handlers para ações subsequentes
    async openProjectAndSelectDocument(
        projectUrl: string,
        folderName: string,
        fileName: string,
        headless = false,
    ): Promise<{ browser: Browser; page: Page; frame: any }> {
        const browser: Browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        const statePath = await this.ensureStateFile();
        const context = await browser.newContext({ storageState: statePath, viewport: null });
        const page = await context.newPage();

        this.logger.log('🌍 Abrindo projeto...');
        await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        this.logger.log('🔍 Encontrando frame do Workfront...');
        // Aguarda iframe do Workfront estar presente
        try {
            await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"]', { timeout: 30000 });
        } catch { }
        const frameLocator = this.frameLocator(page);
        await this.closeSidebarIfOpen(frameLocator, page);

        if (folderName && folderName !== 'root') {
            this.logger.log(`📁 Navegando para a pasta: ${folderName}`);
            await page.waitForTimeout(2000);
            const strategies = [
                `button:has-text("13. ${folderName}")`,
                `button:has-text("14. ${folderName}")`,
                `button:has-text("${folderName}")`,
                `a:has-text("${folderName}")`,
                `[role="button"]:has-text("${folderName}")`,
                `*[data-testid*="item"]:has-text("${folderName}")`,
            ];
            let ok = false;
            for (const sel of strategies) {
                try {
                    const el = frameLocator.locator(sel).first();
                    if ((await el.count()) > 0) { await el.click(); await page.waitForTimeout(4000); ok = true; break; }
                } catch { }
            }
            if (!ok) throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
            this.logger.log(`📁 Pasta aberta: ${folderName}`);
        }

        // Selecionar documento
        this.logger.log(`📄 Selecionando documento: ${fileName}`);
        await this.closeSidebarIfOpen(frameLocator, page);
        await page.waitForTimeout(3000);
        const docCandidates = await frameLocator.locator('body').evaluate((body, target: string) => {
            const found: any[] = [];
            const els = body.querySelectorAll('.doc-detail-view');
            els.forEach((el: any, idx: number) => {
                const aria = el.getAttribute('aria-label') || '';
                const txt = (el.textContent || '').toLowerCase();
                if (aria.includes(target) || txt.includes(target.toLowerCase())) {
                    found.push({ index: idx, ariaLabel: aria, isVisible: (el.offsetWidth > 0 && el.offsetHeight > 0) });
                }
            });
            return found;
        }, fileName);
        if (!docCandidates || docCandidates.length === 0) throw new Error(`Documento não encontrado: ${fileName}`);
        const target = docCandidates.find((d: any) => d.isVisible) || docCandidates[0];
        if (target?.ariaLabel) {
            await frameLocator.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
        } else {
            await frameLocator.locator(`.doc-detail-view:nth-of-type(${(target.index || 0) + 1})`).click();
        }
        await page.waitForTimeout(1500);
        this.logger.log(`📄 Documento selecionado: ${fileName}`);

        return { browser, page, frame: frameLocator };
    }

    async shareUsingOpenPage(frameLocator: any, page: Page, selectedUser: TeamKey): Promise<void> {
        // abrir modal
        const shareStrategies = [
            'button[data-testid="share"]',
            'button:has-text("Share")',
            'button:has-text("Compartilhar")',
            'button[aria-label*="share" i]',
            'button[title*="share" i]',
            '*[data-testid*="share"]',
        ];
        let shareOpened = false;
        for (const sel of shareStrategies) {
            try {
                const btn = frameLocator.locator(sel).first();
                if ((await btn.count()) > 0 && (await btn.isVisible())) {
                    await btn.click();
                    await page.waitForTimeout(2500);
                    const ok = await this.verifyShareModal(frameLocator);
                    if (ok) { shareOpened = true; break; }
                }
            } catch { }
        }
        if (!shareOpened) throw new Error('Botão de compartilhar não encontrado/ modal não abriu');

        const USERS = this.getTeamUsers(selectedUser);
        // input
        const inputSelectors = [
            'input[role="combobox"]',
            'input[aria-autocomplete="list"]',
            'input[type="text"]:not([readonly])',
            'input[id*="react-aria"]',
            '.spectrum-Textfield-input',
            'input.spectrum-Textfield-input',
        ];
        let emailInput = null as any;
        for (const sel of inputSelectors) {
            try {
                const inp = frameLocator.locator(sel).first();
                if ((await inp.count()) > 0 && (await inp.isVisible())) {
                    const ro = await inp.getAttribute('readonly');
                    if (!ro) { emailInput = inp; break; }
                }
            } catch { }
        }
        if (!emailInput) throw new Error('Campo de entrada de usuários não encontrado');

        for (const user of USERS) {
            try {
                await emailInput.click();
                await page.waitForTimeout(250);
                await emailInput.fill('');
                await page.waitForTimeout(150);
                await emailInput.fill(user.email);
                await page.waitForTimeout(900);

                const option = frameLocator
                    .getByRole('option', { name: new RegExp(user.email, 'i') })
                    .or(frameLocator.locator(`[role="option"]:has-text("${user.email}")`))
                    .first();

                if ((await option.count()) > 0) {
                    await option.click();
                } else {
                    await emailInput.press('Enter');
                }

                await page.waitForTimeout(300);
                await this.setUserPermission(frameLocator, page, user.email, 'MANAGE');
            } catch (e: any) {
                this.logger.warn(`⚠️ Erro ao adicionar ${user.email}: ${e?.message}`);
            }
        }

        const saveBtn = frameLocator.getByRole('button', { name: /save|share|send/i }).first();
        try {
            if ((await saveBtn.count()) > 0) await saveBtn.click();
            await page.waitForTimeout(1200);
        } catch { }
    }

    private getTeamUsers(selectedUser: TeamKey) {
        if (selectedUser === 'carol') return CAROL_TEAM;
        if (selectedUser === 'giovana') return GIOVANA_TEAM;
        return TEST_TEAM;
    }

    private validateShareInputs(projectUrl: string, selections: ShareSelection[]) {
        if (!projectUrl || typeof projectUrl !== 'string') {
            throw new Error('URL do projeto é obrigatória e deve ser uma string');
        }
        if (!Array.isArray(selections) || selections.length === 0) {
            throw new Error('Seleções devem ser um array não vazio');
        }
        for (const s of selections) {
            if (!s.folder || !s.fileName) throw new Error('Cada seleção deve ter folder e fileName');
        }
        const validPatterns = [/experience\.adobe\.com.*workfront.*project/i, /workfront\.com.*project/i];
        const isValid = validPatterns.some((p) => p.test(projectUrl));
        if (!isValid) throw new Error('URL deve ser de um projeto do Workfront válido');
    }

    private async delay(ms: number) {
        return new Promise((r) => setTimeout(r, ms));
    }

    private async ensureStateFile() {
        const statePath = path.resolve(process.cwd(), STATE_FILE);
        try {
            await fs.access(statePath);
            return statePath;
        } catch {
            throw new Error(`Arquivo de sessão não encontrado: ${statePath}. Faça login primeiro em /api/login.`);
        }
    }

    private frameLocator(page: Page) {
        // Helper que retorna um FrameLocator-like via locator no primeiro iframe relevante
        return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
    }

    private async closeSidebarIfOpen(frameLocator: any, page: Page) {
        try {
            const sidebar = frameLocator.locator('#page-sidebar [data-testid="minix-container"]').first();
            if ((await sidebar.count()) > 0 && (await sidebar.isVisible())) {
                const closeBtn = frameLocator.locator('button[data-testid="minix-header-close-btn"]').first();
                if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible())) {
                    await closeBtn.click();
                    await page.waitForTimeout(600);
                }
            }
        } catch { }
    }

    private async debugShot(page: Page, name: string) {
        try {
            const dir = path.resolve(process.cwd(), 'automation_debug');
            await fs.mkdir(dir, { recursive: true });
            const file = path.resolve(dir, `${Date.now()}_${name}.png`);
            await page.screenshot({ path: file, fullPage: true });
            this.logger.log(`🖼️ Debug screenshot salvo: ${file}`);
        } catch (e: any) {
            this.logger.warn(`Não foi possível salvar screenshot: ${e?.message}`);
        }
    }

    // Helper: selecionar documento na lista atual (não abre novas instâncias)
    private async selectDocumentInPage(frameLocator: any, page: Page, fileName: string): Promise<boolean> {
        try {
            await this.closeSidebarIfOpen(frameLocator, page);
            await page.waitForTimeout(800);
            const docCandidates = await frameLocator.locator('body').evaluate((body, target: string) => {
                const found: any[] = [];
                const els = (body as any).querySelectorAll('.doc-detail-view');
                els.forEach((el: any, idx: number) => {
                    const aria = el.getAttribute('aria-label') || '';
                    const txt = (el.textContent || '').toLowerCase();
                    if (aria.includes(target) || txt.includes(target.toLowerCase())) {
                        found.push({ index: idx, ariaLabel: aria, isVisible: (el.offsetWidth > 0 && el.offsetHeight > 0) });
                    }
                });
                return found;
            }, fileName);

            if (!docCandidates || docCandidates.length === 0) return false;
            const target = docCandidates.find((d: any) => d.isVisible) || docCandidates[0];
            if (target?.ariaLabel) {
                await frameLocator.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
            } else {
                await frameLocator.locator(`.doc-detail-view:nth-of-type(${(target.index || 0) + 1})`).click();
            }
            await page.waitForTimeout(1000);
            return true;
        } catch {
            return false;
        }
    }

    private async performDocumentShare(
        projectUrl: string,
        folderName: string,
        fileName: string,
        selectedUser: TeamKey = 'carol',
        headless = false,
    ): Promise<{ success: boolean; message?: string }> {
        this.logger.log('🔗 === COMPARTILHANDO DOCUMENTO ===');
        this.logger.log(`📁 Pasta: ${folderName}`);
        this.logger.log(`📄 Arquivo: ${fileName}`);
        this.logger.log(`👥 Equipe: ${selectedUser}`);
        this.logger.log(`👁️ Modo: ${headless ? 'Headless' : 'Visível'}`);

        const USERS = this.getTeamUsers(selectedUser);
        const browser: Browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });

        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();

            this.logger.log('🌍 Abrindo projeto...');
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            this.logger.log('🔍 Encontrando frame do Workfront...');
            const frameLocator = this.frameLocator(page);
            await this.closeSidebarIfOpen(frameLocator, page);

            // 1) navegar até a pasta
            if (folderName && folderName !== 'root') {
                await page.waitForTimeout(2000);
                const strategies = [
                    `button:has-text("13. ${folderName}")`,
                    `button:has-text("14. ${folderName}")`,
                    `button:has-text("${folderName}")`,
                    `a:has-text("${folderName}")`,
                    `[role="button"]:has-text("${folderName}")`,
                    `*[data-testid*="item"]:has-text("${folderName}")`,
                ];
                let ok = false;
                for (let i = 0; i < strategies.length; i++) {
                    const sel = strategies[i];
                    try {
                        const el = frameLocator.locator(sel).first();
                        if ((await el.count()) > 0) {
                            await el.click();
                            await page.waitForTimeout(4000);
                            ok = true;
                            break;
                        }
                    } catch { }
                }
                if (!ok) throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
                await this.debugShot(page, 'after_open_folder');
            }

            // 2) selecionar documento
            await this.closeSidebarIfOpen(frameLocator, page);
            await page.waitForTimeout(3000);
            const docCandidates = await frameLocator.locator('body').evaluate((body, target: string) => {
                const found: any[] = [];
                const els = body.querySelectorAll('.doc-detail-view');
                els.forEach((el: any, idx: number) => {
                    const aria = el.getAttribute('aria-label') || '';
                    const txt = (el.textContent || '').toLowerCase();
                    if (aria.includes(target) || txt.includes(target.toLowerCase())) {
                        found.push({ index: idx, ariaLabel: aria, isVisible: (el.offsetWidth > 0 && el.offsetHeight > 0) });
                    }
                });
                return found;
            }, fileName);
            await this.debugShot(page, 'after_select_document');

            if (!docCandidates || docCandidates.length === 0) {
                throw new Error(`Documento não encontrado: ${fileName}`);
            }
            const target = docCandidates.find((d: any) => d.isVisible) || docCandidates[0];
            if (target?.ariaLabel) {
                await frameLocator.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
            } else {
                await frameLocator.locator(`.doc-detail-view:nth-of-type(${(target.index || 0) + 1})`).click();
            }
            await page.waitForTimeout(1500);

            // 3) abrir modal de share
            await this.closeSidebarIfOpen(frameLocator, page);
            const shareStrategies = [
                'button[data-testid="share"]',
                'button:has-text("Share")',
                'button:has-text("Compartilhar")',
                'button[aria-label*="share" i]',
                'button[title*="share" i]',
                '*[data-testid*="share"]',
            ];
            let shareOpened = false;
            for (const sel of shareStrategies) {
                try {
                    const btn = frameLocator.locator(sel).first();
                    if ((await btn.count()) > 0 && (await btn.isVisible())) {
                        await btn.click();
                        await page.waitForTimeout(2500);
                        const ok = await this.verifyShareModal(frameLocator);
                        if (ok) { shareOpened = true; break; }
                    }
                } catch { }
            }
            if (!shareOpened) throw new Error('Botão de compartilhar não encontrado/ modal não abriu');

            // 4) adicionar usuários
            const inputSelectors = [
                'input[role="combobox"]',
                'input[aria-autocomplete="list"]',
                'input[type="text"]:not([readonly])',
                'input[id*="react-aria"]',
                '.spectrum-Textfield-input',
                'input.spectrum-Textfield-input',
            ];
            let emailInput = null as any;
            for (const sel of inputSelectors) {
                try {
                    const inp = frameLocator.locator(sel).first();
                    if ((await inp.count()) > 0 && (await inp.isVisible())) {
                        const ro = await inp.getAttribute('readonly');
                        if (!ro) { emailInput = inp; break; }
                    }
                } catch { }
            }
            if (!emailInput) throw new Error('Campo de entrada de usuários não encontrado');

            for (const user of USERS) {
                try {
                    await emailInput.click();
                    await page.waitForTimeout(250);
                    await emailInput.fill('');
                    await page.waitForTimeout(150);
                    await emailInput.fill(user.email);
                    await page.waitForTimeout(900);

                    const option = frameLocator
                        .getByRole('option', { name: new RegExp(user.email, 'i') })
                        .or(frameLocator.locator(`[role="option"]:has-text("${user.email}")`))
                        .first();

                    if ((await option.count()) > 0) {
                        await option.click();
                    } else {
                        await emailInput.press('Enter');
                    }

                    await page.waitForTimeout(300);
                    await this.setUserPermission(frameLocator, page, user.email, 'MANAGE');
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro ao adicionar ${user.email}: ${e?.message}`);
                }
            }

            // 5) salvar
            const saveBtn = frameLocator.getByRole('button', { name: /save|share|send/i }).first();
            try {
                if ((await saveBtn.count()) > 0) await saveBtn.click();
                await page.waitForTimeout(1200);
            } catch { }

            return { success: true, message: `Documento "${fileName}" compartilhado com ${USERS.length} usuário(s)` };
        } finally {
            await browser.close();
        }
    }

    private async verifyShareModal(frameLocator: any): Promise<boolean> {
        try {
            const modalSelectors = [
                '[data-testid="unified-share-dialog"]',
                '.unified-share-dialog',
                '[role="dialog"]',
                '.spectrum-Dialog',
            ];
            for (const sel of modalSelectors) {
                try {
                    const m = frameLocator.locator(sel).first();
                    if ((await m.count()) > 0 && (await m.isVisible())) return true;
                } catch { }
            }
            return false;
        } catch {
            return false;
        }
    }

    private async setUserPermission(frameLocator: any, page: Page, userEmail: string, targetPermission: 'MANAGE' | 'VIEW') {
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

    // ===== AUTOMAÇÃO DE UPLOAD =====

    async executeUploadPlan(params: {
        projectUrl: string;
        selectedUser: TeamKey;
        assetZipPath: string;
        finalMaterialPaths: string[];
        headless?: boolean;
    }): Promise<{
        success: boolean;
        message: string;
        results: Array<{
            type: 'asset-release' | 'final-materials';
            fileName: string;
            uploadSuccess: boolean;
            commentSuccess: boolean;
            message?: string;
            error?: string;
        }>;
        summary: { totalFiles: number; uploadSuccesses: number; commentSuccesses: number; errors: number };
    }> {
        const { projectUrl, selectedUser, assetZipPath, finalMaterialPaths, headless = false } = params;

        this.logger.log('🚀 === EXECUTANDO PLANO DE UPLOAD ===');
        this.logger.log(`📁 ZIP: ${path.basename(assetZipPath)}`);
        this.logger.log(`📄 Finals: ${finalMaterialPaths.map(p => path.basename(p)).join(', ')}`);
        this.logger.log(`👥 Equipe: ${selectedUser}`);

        const results: any[] = [];
        let uploadSuccesses = 0;
        let commentSuccesses = 0;
        let errors = 0;

        const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });

        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();

            // Navegar para o projeto uma única vez
            this.logger.log('🌍 Abrindo projeto Workfront...');
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);

            // Aguardar iframe carregar
            this.logger.log('🔍 Aguardando frame do Workfront...');
            await this.waitForWorkfrontFrame(page);
            const frameLocator = this.frameLocator(page);
            await this.closeSidebarIfOpen(frameLocator, page);

            // 1. Upload Asset Release (ZIP)
            this.logger.log('📦 [1/3] Upload Asset Release...');

            // Navegar para pasta Asset Release
            this.logger.log('📁 Navegando para pasta "Asset Release"...');
            const assetFolderResult = await this.navigateToFolder(frameLocator, page, 'Asset Release');
            if (!assetFolderResult) {
                this.logger.warn('⚠️ Pasta "Asset Release" não encontrada, continuando na pasta atual');
            }

            const assetResult = await this.uploadSingleFile(frameLocator, page, assetZipPath, 'asset-release', selectedUser, false);
            results.push({
                type: 'asset-release',
                fileName: path.basename(assetZipPath),
                uploadSuccess: assetResult.uploadSuccess,
                commentSuccess: false,
                message: assetResult.message,
                error: assetResult.error
            });
            if (assetResult.uploadSuccess) uploadSuccesses++;
            // Share do Asset Release e Comentário usando a MESMA página
            if (assetResult.uploadSuccess) {
                const assetFileName = this.getOriginalFileName(assetZipPath);
                this.logger.log('🔗 Compartilhando Asset Release (in-page)...');
                try {
                    // Selecionar documento
                    const selOk = await this.selectDocumentInPage(frameLocator, page, assetFileName);
                    if (!selOk) this.logger.warn('⚠️ Não foi possível selecionar o ZIP para compartilhar');
                    // Abrir modal de share e aplicar permissões
                    await this.shareUsingOpenPage(frameLocator, page, selectedUser);
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro no share in-page do Asset Release: ${e?.message}`);
                    errors++;
                }

                // Comentário do Asset Release via CommentService, com página aberta
                this.logger.log('💬 Comentando Asset Release via CommentService (open page)...');
                try {
                    const commentRes = await this.commentService.addCommentUsingOpenPage({
                        frameLocator,
                        page,
                        folderName: 'Asset Release',
                        fileName: assetFileName,
                        commentType: CommentType.ASSET_RELEASE,
                        selectedUser: selectedUser as any,
                    });
                    if (commentRes?.success) {
                        commentSuccesses++;
                        results[results.length - 1].commentSuccess = true;
                        results[results.length - 1].message = commentRes.message || results[results.length - 1].message;
                    } else {
                        results[results.length - 1].commentSuccess = false;
                        results[results.length - 1].error = (results[results.length - 1].error || '') + ' | Falha no comentário de Asset Release';
                        errors++;
                    }
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro ao comentar Asset Release (open page): ${e?.message}`);
                    results[results.length - 1].commentSuccess = false;
                    results[results.length - 1].error = (results[results.length - 1].error || '') + ` | Comentário AR erro: ${e?.message}`;
                    errors++;
                }
            } else {
                errors++;
            }

            // 2. Upload Final Materials (non-PDF first)
            this.logger.log('📋 [2/3] Upload Final Materials...');

            // Navegar para pasta Final Materials
            this.logger.log('📁 Navegando para pasta "Final Materials"...');
            const finalFolderResult = await this.navigateToFolder(frameLocator, page, 'Final Materials');
            if (!finalFolderResult) {
                this.logger.warn('⚠️ Pasta "Final Materials" não encontrada, continuando na pasta atual');
            }

            // Separar PDFs dos outros arquivos
            const pdfFiles = finalMaterialPaths.filter(p => path.basename(p).toLowerCase().endsWith('.pdf'));
            const nonPdfFiles = finalMaterialPaths.filter(p => !path.basename(p).toLowerCase().endsWith('.pdf'));

            // Upload arquivos não-PDF primeiro (sem comentário)
            for (let i = 0; i < nonPdfFiles.length; i++) {
                const filePath = nonPdfFiles[i];
                const fileName = path.basename(filePath);

                this.logger.log(`📄 [${i + 1}/${nonPdfFiles.length}] Uploading (non-PDF): ${fileName}`);

                const finalResult = await this.uploadSingleFile(
                    frameLocator,
                    page,
                    filePath,
                    'final-materials',
                    selectedUser,
                    false // Apenas upload
                );

                results.push({
                    type: 'final-materials',
                    fileName,
                    uploadSuccess: finalResult.uploadSuccess,
                    commentSuccess: finalResult.commentSuccess,
                    message: finalResult.message,
                    error: finalResult.error
                });

                if (finalResult.uploadSuccess) uploadSuccesses++;
                if (!finalResult.uploadSuccess) errors++;

                // Delay entre uploads
                if (i < nonPdfFiles.length - 1) {
                    await this.delay(2000);
                }
            }

            // 3. Upload PDFs por último (para aparecer como último no Workfront)
            this.logger.log('📄 [3/3] Upload Final Materials (PDFs)...');
            for (let i = 0; i < pdfFiles.length; i++) {
                const filePath = pdfFiles[i];
                const fileName = path.basename(filePath);
                const isLastPdf = i === pdfFiles.length - 1;

                this.logger.log(`📄 [${i + 1}/${pdfFiles.length}] Uploading (PDF): ${fileName}`);

                const finalResult = await this.uploadSingleFile(
                    frameLocator,
                    page,
                    filePath,
                    'final-materials',
                    selectedUser,
                    false // Upload apenas; comentário será feito separado
                );

                results.push({
                    type: 'final-materials',
                    fileName,
                    uploadSuccess: finalResult.uploadSuccess,
                    commentSuccess: finalResult.commentSuccess,
                    message: finalResult.message,
                    error: finalResult.error
                });

                if (finalResult.uploadSuccess) uploadSuccesses++;
                if (!finalResult.uploadSuccess) errors++;

                // Delay entre uploads
                if (i < pdfFiles.length - 1) {
                    await this.delay(2000);
                }
            }

            // Comentário em Final Materials (no último PDF, se houver)
            if (pdfFiles.length > 0) {
                try {
                    const lastPdf = pdfFiles[pdfFiles.length - 1];
                    const lastPdfName = this.getOriginalFileName(lastPdf);
                    this.logger.log('💬 Comentando Final Materials via CommentService (open page)...');
                    const commentRes = await this.commentService.addCommentUsingOpenPage({
                        frameLocator,
                        page,
                        folderName: 'Final Materials',
                        fileName: lastPdfName,
                        commentType: CommentType.FINAL_MATERIALS,
                        selectedUser: selectedUser as any,
                    });
                    // marcar no entry existente do último PDF
                    const idx = results.findIndex(r => r.type === 'final-materials' && r.fileName === lastPdfName);
                    if (idx >= 0) {
                        results[idx].commentSuccess = !!commentRes?.success;
                        results[idx].message = commentRes?.message || results[idx].message;
                        if (!commentRes?.success) {
                            results[idx].error = (results[idx].error || '') + ' | Falha no comentário de Final Materials';
                        }
                    }
                    if (commentRes?.success) commentSuccesses++; else errors++;
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro ao comentar Final Materials: ${e?.message}`);
                    const lastPdfName = this.getOriginalFileName(pdfFiles[pdfFiles.length - 1]);
                    const idx = results.findIndex(r => r.type === 'final-materials' && r.fileName === lastPdfName);
                    if (idx >= 0) {
                        results[idx].commentSuccess = false;
                        results[idx].error = (results[idx].error || '') + ` | Comentário FM erro: ${e?.message}`;
                    }
                    errors++;
                }
            }

            const totalFiles = 1 + finalMaterialPaths.length;
            const success = errors === 0;

            return {
                success,
                message: success
                    ? `Upload completo! ${uploadSuccesses} uploads e ${commentSuccesses} comentários realizados.`
                    : `Upload finalizado com ${errors} erro(s). ${uploadSuccesses} uploads e ${commentSuccesses} comentários realizados.`,
                results,
                summary: { totalFiles, uploadSuccesses, commentSuccesses, errors }
            };

        } catch (error: any) {
            this.logger.error(`❌ Erro no plano de upload: ${error?.message}`);
            return {
                success: false,
                message: `Falha na execução: ${error?.message}`,
                results,
                summary: { totalFiles: results.length, uploadSuccesses, commentSuccesses, errors: errors + 1 }
            };
        } finally {
            await browser.close();
        }
    }

    private getOriginalFileName(filePath: string): string {
        const fileName = path.basename(filePath);
        // Se o arquivo foi staged com prefixo, remover o prefixo
        const match = fileName.match(/^\d+_[a-z0-9]+__(.+)$/);
        return match ? match[1] : fileName;
    }

    private async uploadDocument(frameLocator: any, page: Page, filePath: string): Promise<boolean> {
        // caminho temporário criado para forçar o nome original no upload
        let tempPathToRemove: string | null = null;
        try {
            // Verificar se o arquivo existe
            await fs.access(filePath);

            this.logger.log(`📤 Iniciando upload: ${path.basename(filePath)}`);

            // 1. Procurar e clicar no botão "Add new" dropdown
            const addNewSelectors = [
                'button[data-testid="add-new"]',
                'button.add-new-react-button',
                'button:has-text("Add new")',
                'button[id="add-new-button"]',
            ];

            let addNewClicked = false;
            for (const selector of addNewSelectors) {
                try {
                    const addNewBtn = frameLocator.locator(selector).first();
                    if (await addNewBtn.count() > 0 && await addNewBtn.isVisible()) {
                        this.logger.log('🎯 Clicando "Add new" dropdown...');
                        await addNewBtn.click();
                        await page.waitForTimeout(1500);
                        addNewClicked = true;
                        break;
                    }
                } catch {
                    continue;
                }
            }

            if (!addNewClicked) {
                this.logger.warn('⚠️ Botão "Add new" não encontrado');
                return false;
            }

            // 2. Setup file chooser listener and click Document option
            const documentSelectors = [
                'li[data-test-id="upload-file"]',
                'li.select-files-button',
                'li:has-text("Document")',
                '[role="menuitem"]:has-text("Document")',
                'div.btn:has-text("Document")',
            ];

            // Preparar caminho de upload com nome original (sem prefixos de staging)
            const originalFileName = this.getOriginalFileName(filePath);
            let uploadFilePath = filePath;
            try {
                const currentBase = path.basename(filePath);
                if (currentBase !== originalFileName) {
                    const tmpDir = path.resolve(process.cwd(), 'Downloads', 'staging', '.tmp_uploads');
                    await fs.mkdir(tmpDir, { recursive: true });
                    const candidate = path.resolve(tmpDir, originalFileName);
                    // Se já existir, remove para garantir conteúdo correto
                    try { await fs.unlink(candidate); } catch { }
                    await fs.copyFile(filePath, candidate);
                    uploadFilePath = candidate;
                    tempPathToRemove = candidate;
                    this.logger.log(`🧩 Usando nome original no upload: ${originalFileName}`);
                }
            } catch (e: any) {
                this.logger.warn(`⚠️ Não foi possível preparar arquivo temporário: ${e?.message}`);
                uploadFilePath = filePath; // fallback
            }

            let uploadTriggered = false;
            for (const selector of documentSelectors) {
                try {
                    const documentBtn = frameLocator.locator(selector).first();
                    if (await documentBtn.count() > 0 && await documentBtn.isVisible()) {
                        this.logger.log('📄 Clicando opção "Document"...');

                        // Start waiting for file chooser BEFORE clicking
                        const fileChooserPromise = page.waitForEvent('filechooser');
                        await documentBtn.click();

                        // Wait for file chooser to appear
                        this.logger.log('📂 Aguardando file chooser...');
                        const fileChooser = await fileChooserPromise;

                        // Set the file
                        this.logger.log('📤 Enviando arquivo via file chooser...');
                        await fileChooser.setFiles(uploadFilePath);

                        uploadTriggered = true;
                        break;
                    }
                } catch (error: any) {
                    this.logger.warn(`⚠️ Erro com seletor ${selector}: ${error?.message}`);
                    continue;
                }
            }

            if (!uploadTriggered) {
                this.logger.warn('⚠️ Opção "Document" não encontrada no dropdown');
                return false;
            }

            // 3. Aguardar processamento do upload
            this.logger.log('⏳ Aguardando upload processar...');
            await page.waitForTimeout(4000);

            // 4. Verificar se o arquivo apareceu na lista de documentos
            this.logger.log(`🔍 Procurando arquivo: ${originalFileName}`);

            const fileVerificationSelectors = [
                `text="${originalFileName}"`,
                `[aria-label*="${originalFileName}"]`,
                `.doc-detail-view:has-text("${originalFileName}")`,
                `[title="${originalFileName}"]`,
                `.document-item:has-text("${originalFileName}")`,
                `*:has-text("${originalFileName}")`,
                `span:has-text("${originalFileName}")`,
                `div:has-text("${originalFileName}")`,
            ];

            let fileExists = false;
            for (const selector of fileVerificationSelectors) {
                try {
                    const fileElement = frameLocator.locator(selector).first();
                    if (await fileElement.count() > 0 && await fileElement.isVisible()) {
                        fileExists = true;
                        this.logger.log(`✅ Arquivo encontrado via: ${selector}`);
                        break;
                    }
                } catch (error: any) {
                    this.logger.debug(`Seletor falhou: ${selector} - ${error?.message}`);
                }
            }

            if (!fileExists) {
                // Fallback: aguardar mais um pouco e tentar novamente
                this.logger.log('⏳ Aguardando mais tempo para confirmação...');
                await page.waitForTimeout(3000);

                for (const selector of fileVerificationSelectors) {
                    try {
                        const fileElement = frameLocator.locator(selector).first();
                        if (await fileElement.count() > 0 && await fileElement.isVisible()) {
                            fileExists = true;
                            this.logger.log(`✅ Arquivo encontrado via: ${selector} (fallback)`);
                            break;
                        }
                    } catch (error: any) {
                        this.logger.debug(`Seletor fallback falhou: ${selector} - ${error?.message}`);
                    }
                }
            }

            this.logger.log(fileExists ? '✅ Upload confirmado' : '⚠️ Upload não confirmado na lista');
            return fileExists;

        } catch (error: any) {
            this.logger.error(`❌ Erro no upload: ${error?.message}`);
            return false;
        } finally {
            if (tempPathToRemove) {
                try { await fs.unlink(tempPathToRemove); } catch { }
            }
        }
    }

    // Métodos internos de comentário removidos — usamos CommentService com página aberta

    private async navigateToFolder(frameLocator: any, page: Page, folderName: string): Promise<boolean> {
        try {
            this.logger.log(`📁 Procurando pasta: ${folderName}`);

            await this.closeSidebarIfOpen(frameLocator, page);
            await page.waitForTimeout(1500);

            const folderSelectors = [
                `button:has-text("13. ${folderName}")`,
                `button:has-text("14. ${folderName}")`,
                `button:has-text("15. ${folderName}")`,
                `button:has-text("${folderName}")`,
                `a:has-text("${folderName}")`,
                `[role="button"]:has-text("${folderName}")`,
                `*[data-testid*="item"]:has-text("${folderName}")`,
                `.folder-item:has-text("${folderName}")`,
            ];

            for (const selector of folderSelectors) {
                try {
                    const element = frameLocator.locator(selector).first();
                    if (await element.count() > 0 && await element.isVisible()) {
                        this.logger.log(`🎯 Clicando pasta via seletor: ${selector}`);
                        await element.click();
                        await page.waitForTimeout(3000);
                        this.logger.log(`✅ Pasta "${folderName}" selecionada`);
                        return true;
                    }
                } catch (e: any) {
                    // Continuar tentando próximo seletor
                }
            }

            this.logger.warn(`⚠️ Pasta "${folderName}" não encontrada`);
            return false;
        } catch (error: any) {
            this.logger.error(`❌ Erro ao navegar para pasta ${folderName}: ${error?.message}`);
            return false;
        }
    }

    private async waitForWorkfrontFrame(page: Page): Promise<void> {
        try {
            // Aguardar iframe aparecer
            await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"], iframe', { timeout: 10000 });
            await page.waitForTimeout(3000);

            // Aguardar conteúdo do iframe carregar
            const frameLocator = this.frameLocator(page);
            await frameLocator.locator('body').waitFor({ timeout: 10000 });

            this.logger.log('✅ Frame do Workfront carregado');
        } catch (error: any) {
            this.logger.warn(`⚠️ Timeout aguardando frame: ${error?.message}`);
        }
    }

    private async uploadSingleFile(
        frameLocator: any,
        page: Page,
        filePath: string,
        type: 'asset-release' | 'final-materials',
        selectedUser: TeamKey,
        addComment: boolean = true
    ): Promise<{ uploadSuccess: boolean; commentSuccess: boolean; message?: string; error?: string }> {
        try {
            // Upload do arquivo
            this.logger.log(`📤 Fazendo upload: ${path.basename(filePath)}`);
            const uploadSuccess = await this.uploadDocument(frameLocator, page, filePath);

            if (!uploadSuccess) {
                return { uploadSuccess: false, commentSuccess: false, error: 'Falha no upload' };
            }

            // Aguardar processamento
            await page.waitForTimeout(3000);

            return {
                uploadSuccess: true,
                commentSuccess: false,
                message: `${type} enviado com sucesso`
            };

        } catch (error: any) {
            this.logger.error(`❌ Erro no ${type}: ${error?.message}`);
            return { uploadSuccess: false, commentSuccess: false, error: error?.message };
        }
    }
}
