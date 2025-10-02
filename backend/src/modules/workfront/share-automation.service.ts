import { Injectable, Logger } from '@nestjs/common';
import { Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { resolveHeadless } from './utils/headless.util';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';

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

    // (Retries migraram para WorkfrontDomHelper – manter apenas se precisarmos overrides futuros)

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
                            
                            // Tenta clicar com força (ignora elementos sobrepostos)
                            await btn.click({ force: true }).catch(async () => {
                                // Fallback: scroll até o elemento e clica
                                await btn.scrollIntoViewIfNeeded();
                                await page.waitForTimeout(300);
                                await btn.click();
                            });
                            
                            // IMPORTANTE: Aguarda o underlay aparecer (confirma que modal abriu)
                            this.logger.log('⏳ Aguardando underlay aparecer...');
                            try {
                                await frameLocator.locator('[data-testid="underlay"]').first().waitFor({ 
                                    state: 'visible', 
                                    timeout: 2000 
                                });
                                this.logger.log('✅ Underlay apareceu - modal está aberto!');
                                
                                // Remove underlay para liberar acesso aos elementos
                                await frameLocator.locator('[data-testid="underlay"]').first().evaluate((el: HTMLElement) => {
                                    el.remove();
                                });
                                this.logger.log('🗑️ Underlay removido');
                                
                                // Aguarda animação do modal completar
                                await page.waitForTimeout(1500);
                                
                                // Verifica se o input está acessível (validação pragmática)
                                const input = frameLocator.locator('input[role="combobox"][aria-autocomplete="list"]').first();
                                if ((await input.count()) > 0) {
                                    this.logger.log('✅ Input de compartilhamento detectado - modal pronto!');
                                    return;
                                } else {
                                    this.logger.warn('⚠️ Input não encontrado após remover underlay');
                                }
                            } catch {
                                this.logger.warn('⚠️ Underlay não detectado, continuando...');
                            }
                        } else {
                            this.logger.warn(`⚠️ Botão encontrado mas não está visível: ${sel}`);
                        }
                    }
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro ao tentar seletor ${sel}: ${e?.message}`);
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
                                    await parentBtn.click({ force: true });
                                    await page.waitForTimeout(2500);
                                    
                                    if (await this.verifyShareModal(frameLocator)) {
                                        this.logger.log('✅ Modal aberto via SVG pai!');
                                        return;
                                    }
                                }
                            }
                        } catch { }
                    }
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro na busca por SVG: ${e?.message}`);
                }
            }
            
            // Espera entre tentativas
            if (attempt < 3) {
                this.logger.log('⏳ Aguardando 1.5s antes de nova tentativa...');
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
        
        throw new Error('Modal de compartilhamento não abriu após 3 tentativas');
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
                    // Navega para pasta se necessário
                    if (folder && folder !== 'root') {
                        this.logger.log(`📁 Navegando para pasta: ${folder}`);
                        await this.navigateToFolder(frame, page, folder);
                        await page.waitForTimeout(800); // Espera adicional após navegação
                    }
                    
                    // Seleciona documento
                    this.logger.log(`📄 Selecionando documento: ${fileName}`);
                    await this.selectDocument(frame, page, fileName);
                    
                    // Espera adicional crucial para garantir que o documento está selecionado e a UI atualizou
                    await page.waitForTimeout(1200);
                    
                    // Fecha sidebar se estiver aberta (pode bloquear o botão Share)
                    await this.closeSidebarIfOpen(frame, page);
                    
                    // Tenta abrir modal de share
                    await this.openShareModal(frame, page, { ensureFresh: attempt > 1 });
                    
                    // Adiciona usuários
                    await this.addUsersToShare(frame, page, this.getTeamUsers(selectedUser));
                    
                    // Salva
                    await this.saveShare(frame, page);
                    
                    results.push({ folder, fileName, success: true, message: `Compartilhado (tentativa ${attempt})` });
                    success++; shared = true; break;
                } catch (e: any) {
                    lastErr = e;
                    this.logger.warn(`⚠️ Share tentativa ${attempt} falhou para ${fileName}: ${e?.message}`);
                    
                    if (attempt < maxAttempts) {
                        this.logger.log(`🔄 Tentando novamente... (${attempt + 1}/${maxAttempts})`);
                        
                        // Tenta fechar qualquer modal que possa estar aberto
                        try {
                            await page.keyboard.press('Escape');
                            await page.waitForTimeout(300);
                        } catch { }
                        
                        // Pequeno reload suave do frame (scroll) + pausa
                        try { 
                            await frame.locator('body').evaluate(() => window.scrollBy(0, 300)); 
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
