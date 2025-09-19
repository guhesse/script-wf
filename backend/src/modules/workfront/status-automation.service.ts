import { Injectable, Logger } from '@nestjs/common';
import { chromium, Page, Locator } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

const STATE_FILE = 'wf_state.json';

// Novos status permitidos
const ALLOWED_DELIVERABLE_STATUSES = [
    'Round 1 Review',
    'Round 2 Review',
    'Extra Round Review',
    'Delivered'
] as const;
const FORCE_STATUS: AllowedStatus = 'Delivered'; // <-- manter forçado
type AllowedStatus = typeof ALLOWED_DELIVERABLE_STATUSES[number];

@Injectable()
export class StatusAutomationService {
    private readonly logger = new Logger(StatusAutomationService.name);

    private async ensureStateFile(): Promise<string> {
        const statePath = path.resolve(process.cwd(), STATE_FILE);
        try { await fs.access(statePath); return statePath; } catch { throw new Error('Sessão não encontrada. Faça login em /api/login'); }
    }

    private ensureOverviewUrl(url: string): string {
        if (/\/overview/.test(url)) return url;
        if (/\/tasks/.test(url)) return url.replace(/\/tasks.*/, '/overview');
        if (/\/documents/.test(url)) return url.replace(/\/documents.*/, '/overview');
        if (/\/project\/[a-f0-9]+$/i.test(url)) return url + '/overview';
        return url;
    }

    private frameLocator(page: any) { return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first(); }
    private async closeSidebarIfOpen(frameLocator: any, page: any) { try { const sb = frameLocator.locator('#page-sidebar [data-testid="minix-container"]').first(); if ((await sb.count()) > 0 && await sb.isVisible()) { const closeBtn = frameLocator.locator('button[data-testid="minix-header-close-btn"]').first(); if ((await closeBtn.count()) > 0) { await closeBtn.click(); await page.waitForTimeout(600); } } } catch { } }

    /**
     * Atualiza custom field "loc | Status" com robustez extra para o novo layout.
     * Aceita somente: Round 1 Review, Round 2 Review, Extra Round Review, Delivered
     */
    async updateDeliverableStatus(params: {
        projectUrl: string;
        deliverableStatus: string;
        headless?: boolean;
    }): Promise<{ success: boolean; message: string }> {
        const { projectUrl, headless = false } = params;
        const deliverableStatus = FORCE_STATUS; // ignora param externo

        if (!ALLOWED_DELIVERABLE_STATUSES.includes(deliverableStatus as AllowedStatus)) {
            return {
                success: false,
                message: `Status inválido: '${deliverableStatus}'. Permitidos: ${ALLOWED_DELIVERABLE_STATUSES.join(', ')}`
            };
        }

        this.logger.log(`📦 Alterando status do Deliverable para '${deliverableStatus}' (forçado)`);
        const url = this.ensureOverviewUrl(projectUrl);
        const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });

        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(7000);

            const frame = this.frameLocator(page);
            await this.closeSidebarIfOpen(frame, page);

            // NOVO: reutiliza método central
            await this.performStatusUpdateCore({ page, frame, deliverableStatus, url });

            this.logger.log(`✅ Status atualizado para '${deliverableStatus}'`);
            return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}'` };
        } catch (e: any) {
            this.logger.error(`❌ Erro ao alterar status: ${e?.message}`);
            return { success: false, message: e?.message || 'Falha ao alterar status' };
        } finally {
            try { await browser.close(); } catch { }
        }
    }

    // NOVO: método público para uso em sessão já aberta
    async updateDeliverableStatusInSession(params: {
        page: Page;
        frame: any;
        projectUrl: string;
        deliverableStatus: string;
    }): Promise<{ success: boolean; message: string }> {
        const { page, frame, projectUrl } = params;
        const deliverableStatus = FORCE_STATUS;

        if (!ALLOWED_DELIVERABLE_STATUSES.includes(deliverableStatus as AllowedStatus)) {
            return {
                success: false,
                message: `Status inválido: '${deliverableStatus}'.`
            };
        }

        const url = this.ensureOverviewUrl(projectUrl);
        try {
            // Garante que estamos na página correta (caso esteja em outra aba de documentos)
            if (!page.url().startsWith(url)) {
                await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => { });
                await page.waitForTimeout(2500);
            }
            await this.closeSidebarIfOpen(frame, page);
            await this.performStatusUpdateCore({ page, frame, deliverableStatus, url });
            return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}' (sessão reutilizada)` };
        } catch (e: any) {
            this.logger.error(`❌ Erro in-session: ${e?.message}`);
            return { success: false, message: e?.message || 'Falha ao alterar status (sessão)' };
        }
    }

    // NOVO: lógica central compartilhada
    private async performStatusUpdateCore(params: {
        page: Page;
        frame: any;
        deliverableStatus: string;
        url: string;
    }) {
        const { page, frame, deliverableStatus } = params;

        await this.openStatusAccordion(frame, page);
        const input = await this.enterStatusEditMode(frame, page);
        await this.ensureEditFocus(frame, page, input);

        // ===== NOVO MODO RÁPIDO =====
        let fastOk = false;
        try {
            this.logger.log('⚡ Aplicando modo rápido: setValue + eventos + salvar direto');
            await input.click({ force: true }).catch(() => {});
            // Limpa e preenche usando API de alto nível
            await input.fill('');
            await input.fill(deliverableStatus);
            // Ref ref: garantir eventos (alguns frameworks exigem)
            await input.evaluate((el, value) => {
                (el as HTMLInputElement).value = value as string;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }, deliverableStatus);
            await page.waitForTimeout(80);
            // Fecha dropdowns / sugestões que possam bloquear Save
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(60);
            fastOk = true;
        } catch (e:any) {
            this.logger.warn('⚠️ Modo rápido falhou, tentando fallback de digitação: ' + e?.message);
        }

        if (!fastOk) {
            // Fallback antigo (resumido)
            try {
                await input.click({ force: true }).catch(() => {});
                await page.keyboard.press('Control+A').catch(() => {});
                await page.keyboard.press('Delete').catch(() => {});
                await page.waitForTimeout(60);
                await page.keyboard.insertText(deliverableStatus);
                await page.waitForTimeout(200);
                await page.keyboard.press('Escape').catch(() => {});
            } catch (e:any) {
                this.logger.warn('⚠️ Fallback de digitação também falhou: ' + e?.message);
            }
        }

        // Salvar imediatamente (sem esperar Enter)
        await this.saveIfRequired(frame, page);

        // Verificação pós-salvamento
        try {
            const currentVal = (await input.inputValue().catch(() => ''))?.trim();
            if (currentVal && currentVal !== deliverableStatus) {
                this.logger.warn(`⚠️ Valor no input pós-save difere: '${currentVal}' (esperado '${deliverableStatus}')`);
            }
        } catch {}
    }

    // === Auxiliares novos ===

    private async openStatusAccordion(frame: any, page: Page) {
        this.logger.log('🔎 Abrindo accordion "loc | Statuses"...');
        // Primeiro tenta localizar pelo botão do accordion
        const headerButton = frame.locator('button[aria-controls*="accordion-"]:has-text("loc | Statuses")').first();
        if ((await headerButton.count()) > 0) {
            const expanded = await headerButton.getAttribute('aria-expanded');
            if (expanded === 'false') {
                await headerButton.click({ force: true }).catch(() => { });
                await page.waitForTimeout(1200);
            }
            return;
        }
        // Fallback pelo h2
        const h2 = frame.locator('h2:has-text("loc | Statuses")').first();
        if ((await h2.count()) > 0) {
            await h2.click({ force: true }).catch(() => { });
            await page.waitForTimeout(1000);
        } else {
            this.logger.warn('⚠️ Accordion "loc | Statuses" não localizado (pode já estar expandido)');
        }
    }

    private async enterStatusEditMode(frame: any, page: Page): Promise<Locator> {
        this.logger.log('📝 Entrando em modo de edição do campo "loc | Status"...');

        // Wrapper principal (view mode)
        const viewWrapper = frame.locator('[data-testid="field-DE:Loc | Status"] [data-testid="view-component-wrapper"]').first();
        const contentWrapper = frame.locator('[data-testid="field-DE:Loc | Status-content"]').first();

        // Espera base por qualquer container
        await Promise.race([
            viewWrapper.waitFor({ timeout: 5000 }).catch(() => null),
            contentWrapper.waitFor({ timeout: 5000 }).catch(() => null),
            page.waitForTimeout(1200)
        ]);

        // Se já existe input (edit mode), retorna
        const existingInput = frame.locator('[data-testid="DE:Loc | Status-input"]').first();
        if ((await existingInput.count()) > 0) {
            this.logger.log('✳️ Já em modo de edição (input disponível)');
            // Força um clique extra para casos onde não entra no estado ativo
            await existingInput.click({ force: true }).catch(() => { });
            await page.waitForTimeout(150);
            return existingInput;
        }

        // Tentar clicar no view wrapper
        if ((await viewWrapper.count()) > 0) {
            await viewWrapper.click({ force: true }).catch(() => { });
            await page.waitForTimeout(800);
        } else if ((await contentWrapper.count()) > 0) {
            await contentWrapper.click({ force: true }).catch(() => { });
            await page.waitForTimeout(800);
        } else {
            throw new Error('Campo de status não localizado (view wrapper ausente)');
        }

        // Aguardar input aparecer
        await existingInput.waitFor({ timeout: 4000 }).catch(() => {
            throw new Error('Input de edição do status não apareceu');
        });

        return existingInput;
    }

    // NOVO: força efetivamente o modo edição e foco real no input
    private async ensureEditFocus(frame: any, page: Page, input: Locator) {
        try {
            const isActive = await input.evaluate(el => document.activeElement === el);
            if (!isActive) {
                await input.click({ force: true }).catch(() => { });
                await page.waitForTimeout(120);
            }

            // Se ainda não ativo, clicar no wrapper de view e depois no input
            const stillInactive = !(await input.evaluate(el => document.activeElement === el));
            if (stillInactive) {
                const wrapper = frame.locator('[data-testid="field-DE:Loc | Status"] [data-testid="view-component-wrapper"]').first();
                if ((await wrapper.count()) > 0) {
                    await wrapper.click({ force: true }).catch(() => { });
                    await page.waitForTimeout(350);
                    await input.click({ force: true }).catch(() => { });
                    await page.waitForTimeout(350);
                }
            }

            // Confirmar novamente
            const finalActive = await input.evaluate(el => document.activeElement === el);
            if (!finalActive) {
                this.logger.warn('⚠️ Input não ficou ativo após tentativas – prosseguindo assim mesmo.');
            } else {
                this.logger.log('🎯 Input focado e pronto para digitação.');
            }
        } catch {
            this.logger.warn('⚠️ Falha ao assegurar foco no input – prosseguindo.');
        }
    }

    private async saveIfRequired(frame: any, page: Page) {
        // Força sempre clicar Save se existir (mesmo se achar que é auto-save)
        const saveBtn = frame.locator('button[data-testid="save-changes-button"]').first();
        if ((await saveBtn.count()) > 0 && await saveBtn.isVisible()) {
            this.logger.log('💾 Salvando alterações (force)...');
            await saveBtn.click().catch(() => { });
            await page.waitForTimeout(1800);
        } else {
            this.logger.log('ℹ️ Botão "Save Changes" não presente – assumindo auto-save.');
        }
        // Confirma em view
        try {
            const finalView = frame.locator('[data-testid="field-DE:Loc | Status"] [data-testid="view-component-wrapper"] span:has-text("Delivered")').first();
            if ((await finalView.count()) > 0) {
                this.logger.log('🔍 View final confirma "Delivered".');
            } else {
                this.logger.warn('⚠️ View final não confirmou "Delivered".');
            }
        } catch { }
    }

    // Mantém compatibilidade antiga
    async updateWorkStatus(params: { projectUrl: string; statusLabel: string; headless?: boolean }) {
        return this.updateDeliverableStatus({
            projectUrl: params.projectUrl,
            deliverableStatus: params.statusLabel,
            headless: params.headless
        });
    }
}
