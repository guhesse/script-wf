import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

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

    /**
     * Compartilhar documentos selecionados
     */
    async shareDocuments(
        projectUrl: string,
        selections: ShareSelection[],
        selectedUser: TeamKey = 'carol',
        headless = false,
    ): Promise<{ results: ShareResult[]; summary: { total: number; success: number; errors: number } }> {
        this.validateShareInputs(projectUrl, selections);
        const statePath = await this.ensureStateFile();
        const browser: Browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        const context = await browser.newContext({ storageState: statePath, viewport: null });
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
                    await this.addUsersToShare(frame, page, this.getTeamUsers(selectedUser));
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
            try { await browser.close(); } catch { }
        }
    }

    /**
     * Abrir projeto e selecionar documento (mantém navegador aberto para reutilização)
     */
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
            await this.navigateToFolder(frameLocator, page, folderName);
            this.logger.log(`📁 Pasta aberta: ${folderName}`);
        }

        // Selecionar documento
        this.logger.log(`📄 Selecionando documento: ${fileName}`);
        await this.selectDocument(frameLocator, page, fileName);
        this.logger.log(`📄 Documento selecionado: ${fileName}`);

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
        headless = false,
    ): Promise<{ success: boolean; message?: string }> {
        const browser: Browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });

        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
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
        } finally {
            await browser.close();
        }
    }

    public async navigateToFolder(frameLocator: any, page: Page, folderName: string): Promise<void> {
        await page.waitForTimeout(2000);
        const strategies = [
            `button:has-text("13. ${folderName}")`,
            `button:has-text("14. ${folderName}")`,
            `button:has-text("${folderName}")`,
            `a:has-text("${folderName}")`,
            `[role="button"]:has-text("${folderName}")`,
            `*[data-testid*="item"]:has-text("${folderName}")`,
        ];

        for (const sel of strategies) {
            try {
                const el = frameLocator.locator(sel).first();
                if ((await el.count()) > 0) {
                    await el.click();
                    await page.waitForTimeout(4000);
                    return;
                }
            } catch { }
        }
        throw new Error(`Pasta "${folderName}" não encontrada`);
    }

    public async selectDocument(frameLocator: any, page: Page, fileName: string): Promise<void> {
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
    }

    public async openShareModal(frameLocator: any, page: Page, opts: { ensureFresh?: boolean } = {}): Promise<void> {
        if (opts.ensureFresh) {
            // Fecha modal antigo se estiver aberto para evitar sobreposição
            try {
                const closeOld = frameLocator.locator('[data-testid="unified-share-dialog"] button:has-text("Close")').first();
                if ((await closeOld.count()) > 0 && await closeOld.isVisible()) {
                    await closeOld.click();
                    await page.waitForTimeout(500);
                }
            } catch { }
        }
        const shareStrategies = [
            'button[data-testid="share"]',
            'button:has-text("Share")',
            'button:has-text("Compart")',
            '[aria-label*="Share"]'
        ];
        for (const sel of shareStrategies) {
            try {
                const btn = frameLocator.locator(sel).first();
                if ((await btn.count()) > 0 && await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(2000);
                    if (await this.verifyShareModal(frameLocator)) return;
                }
            } catch { }
        }
        throw new Error('Modal de compartilhamento não abriu');
    }

    public async addUsersToShare(frameLocator: any, page: Page, users: { email: string; role: string }[]): Promise<void> {
        const inputSelectors = ['input[role="combobox"]', 'input[aria-autocomplete="list"]', 'input[type="text"]'];
        let emailInput = null as any;
        for (const sel of inputSelectors) {
            try {
                const inp = frameLocator.locator(sel).first();
                if ((await inp.count()) > 0 && await inp.isVisible()) { emailInput = inp; break; }
            } catch { }
        }
        if (!emailInput) throw new Error('Campo de email não encontrado');

        for (const user of users) {
            try {
                await emailInput.click();
                await emailInput.fill('');
                await emailInput.fill(user.email);
                await page.waitForTimeout(600);
                const option = frameLocator.locator(`[role="option"]:has-text("${user.email}")`).first();
                if ((await option.count()) > 0) { await option.click(); }
                else { await emailInput.press('Enter'); }
                await page.waitForTimeout(250);
                const desiredRole = (user.role === 'VIEW' ? 'VIEW' : 'MANAGE');
                await this.setUserPermission(frameLocator, page, user.email, desiredRole);
            } catch (e: any) {
                this.logger.warn(`Não conseguiu adicionar usuário ${user.email}: ${e?.message}`);
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
        const modalSelectors = ['[data-testid="unified-share-dialog"]', '[role="dialog"]'];
        for (const sel of modalSelectors) {
            const m = frameLocator.locator(sel).first();
            if ((await m.count()) > 0 && await m.isVisible()) return true;
        }
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

    private async ensureStateFile() {
        const statePath = path.resolve(process.cwd(), STATE_FILE);
        try {
            await fs.access(statePath);
            return statePath;
        } catch {
            throw new Error('Sessão não encontrada. Faça login primeiro.');
        }
    }

    private frameLocator(page: Page) {
        return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
    }

    private async closeSidebarIfOpen(frameLocator: any, page: Page) {
        try {
            const sidebar = frameLocator.locator('#page-sidebar [data-testid="minix-container"]').first();
            if ((await sidebar.count()) > 0 && await sidebar.isVisible()) {
                const closeBtn = frameLocator.locator('button[data-testid="minix-header-close-btn"]').first();
                if ((await closeBtn.count()) > 0) {
                    await closeBtn.click();
                    await page.waitForTimeout(600);
                }
            }
        } catch { }
    }

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
        const { page, frame, selections, selectedUser } = params;
        const results: ShareResult[] = [];
        let success = 0; let errors = 0;
        for (let i = 0; i < selections.length; i++) {
            const { folder, fileName } = selections[i];
            this.logger.log(`📄 [SESSION][${i + 1}/${selections.length}] Share: ${fileName} (${folder})`);
            try {
                if (folder && folder !== 'root') {
                    await this.navigateToFolder(frame, page, folder);
                }
                await this.selectDocument(frame, page, fileName);
                await this.openShareModal(frame, page, { ensureFresh: true });
                await this.addUsersToShare(frame, page, this.getTeamUsers(selectedUser));
                await this.saveShare(frame, page);
                results.push({ folder, fileName, success: true, message: 'Compartilhado' });
                success++;
            } catch (e: any) {
                this.logger.error(`Share falhou para ${fileName}: ${e?.message}`);
                results.push({ folder, fileName, success: false, error: e?.message || 'Erro' });
                errors++;
            }
            await page.waitForTimeout(500);
        }
        return { results, summary: { total: selections.length, success, errors } };
    }
}
