import { Injectable, Logger } from '@nestjs/common';
import { Page, Locator, Browser } from 'playwright';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { resolveHeadless } from './utils/headless.util';


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

    private ensureOverviewUrl(url: string): string {
        if (/\/overview/.test(url)) return url;
        if (/\/tasks/.test(url)) return url.replace(/\/tasks.*/, '/overview');
        if (/\/documents/.test(url)) return url.replace(/\/documents.*/, '/overview');
        if (/\/project\/[a-f0-9]+$/i.test(url)) return url + '/overview';
        return url;
    }
    // frameLocator e closeSidebar agora via WorkfrontDomHelper

    /**
     * Atualiza custom field "loc | Status" com robustez extra para o novo layout.
     * Aceita somente: Round 1 Review, Round 2 Review, Extra Round Review, Delivered
     */
    async updateDeliverableStatus(params: {
        projectUrl: string;
        deliverableStatus: string;
        headless?: boolean;
        maxAttempts?: number;
        retryDelay?: number;
    }): Promise<{ success: boolean; message: string }> {
        const { projectUrl, headless = resolveHeadless(), maxAttempts = 4, retryDelay = 3500 } = params;
        const deliverableStatus = FORCE_STATUS; // ignora param externo

        if (!ALLOWED_DELIVERABLE_STATUSES.includes(deliverableStatus as AllowedStatus)) {
            return {
                success: false,
                message: `Status inválido: '${deliverableStatus}'. Permitidos: ${ALLOWED_DELIVERABLE_STATUSES.join(', ')}`
            };
        }

        this.logger.log(`📦 Alterando status do Deliverable para '${deliverableStatus}' (forçado)`);
        const url = this.ensureOverviewUrl(projectUrl);
        const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await WorkfrontDomHelper.ensureStateFile(), viewport: { width: 1366, height: 900 } });

        try {
            const page = await context.newPage();
            let attempt = 0; let lastErr: any = null; let frame: any = null; let success = false;
            while (attempt < maxAttempts && !success) {
                attempt++;
                this.logger.log(`⏳ (Status) Tentativa ${attempt}/${maxAttempts} para atualizar status...`);
                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(5500);
                    frame = WorkfrontDomHelper.frameLocator(page);
                    await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);
                    await this.performStatusUpdateCore({ page, frame, deliverableStatus, url });
                    this.logger.log(`✅ Status atualizado para '${deliverableStatus}' (tentativa ${attempt})`);
                    success = true;
                    return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}'` };
                } catch (e: any) {
                    lastErr = e;
                    this.logger.error(`❌ Tentativa ${attempt} falhou: ${e?.message}`);
                    if (attempt < maxAttempts) {
                        this.logger.log(`🔁 Recarregando página e aguardando ${retryDelay}ms antes de nova tentativa...`);
                        await page.waitForTimeout(300);
                        try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch { }
                        await page.waitForTimeout(retryDelay);
                    }
                }
            }
            throw lastErr || new Error('Falha ao alterar status após múltiplas tentativas');
        } catch (e: any) {
            this.logger.error(`❌ Erro ao alterar status: ${e?.message}`);
            return { success: false, message: e?.message || 'Falha ao alterar status' };
        } finally {
            try { await disposeBrowser(undefined, browser as Browser); } catch { }
        }
    }

    // NOVO: método público para uso em sessão já aberta
    async updateDeliverableStatusInSession(params: {
        page: Page;
        frame: any;
        projectUrl: string;
        deliverableStatus: string;
        maxAttempts?: number;
        retryDelay?: number;
    }): Promise<{ success: boolean; message: string }> {
        const { page, frame, projectUrl, maxAttempts = 4, retryDelay = 3000 } = params;
        const deliverableStatus = FORCE_STATUS;

        if (!ALLOWED_DELIVERABLE_STATUSES.includes(deliverableStatus as AllowedStatus)) {
            return {
                success: false,
                message: `Status inválido: '${deliverableStatus}'.`
            };
        }

        const url = this.ensureOverviewUrl(projectUrl);
        let attempt = 0; let lastErr: any = null;
        while (attempt < maxAttempts) {
            attempt++;
            this.logger.log(`⏳ (Status sessão) Tentativa ${attempt}/${maxAttempts}...`);
            try {
                if (!page.url().startsWith(url)) {
                    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => { });
                    await page.waitForTimeout(2500);
                }
                await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);
                await this.performStatusUpdateCore({ page, frame, deliverableStatus, url });
                return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}' (sessão reutilizada)` };
            } catch (e: any) {
                lastErr = e;
                this.logger.error(`❌ Erro in-session tentativa ${attempt}: ${e?.message}`);
                if (attempt < maxAttempts) {
                    this.logger.log(`🔁 (sessão) reload + espera ${retryDelay}ms antes de retry`);
                    try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch { }
                    await page.waitForTimeout(retryDelay);
                }
            }
        }
        return { success: false, message: (lastErr?.message || 'Falha ao alterar status (sessão)') + ' após múltiplas tentativas' };
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
            await input.click({ force: true }).catch(() => { });
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
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(60);
            fastOk = true;
        } catch (e: any) {
            this.logger.warn('⚠️ Modo rápido falhou, tentando fallback de digitação: ' + e?.message);
        }

        if (!fastOk) {
            // Fallback antigo (resumido)
            try {
                await input.click({ force: true }).catch(() => { });
                await page.keyboard.press('Control+A').catch(() => { });
                await page.keyboard.press('Delete').catch(() => { });
                await page.waitForTimeout(60);
                await page.keyboard.insertText(deliverableStatus);
                await page.waitForTimeout(200);
                await page.keyboard.press('Escape').catch(() => { });
            } catch (e: any) {
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
        } catch { }
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
            headless: params.headless ?? (process.env.WF_HEADLESS_DEFAULT ?? 'true').toLowerCase() === 'true'
        });
    }
}
