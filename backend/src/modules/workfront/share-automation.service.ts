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
    ): Promise<{ browser: Browser; page: Page; frame: any }>
    {
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
        } catch {}
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
                } catch {}
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
            } catch {}
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
            } catch {}
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
        } catch {}
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
        } catch {}
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
}
