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
    'Approved - Final',
    'Delivered'
] as const;
const FORCE_STATUS: AllowedStatus = 'Delivered';
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
        const { projectUrl, headless = resolveHeadless(), maxAttempts = 4, retryDelay = 4500 } = params;
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
        const { page, projectUrl, maxAttempts = 4, retryDelay = 3000 } = params;
        let { frame } = params; // Permitir recaptura do frame
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
                // Sempre recaptura frame no início de cada tentativa
                frame = WorkfrontDomHelper.frameLocator(page);
                
                if (!page.url().startsWith(url)) {
                    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => { });
                    await page.waitForTimeout(3000);
                    // Recaptura frame após navigate
                    frame = WorkfrontDomHelper.frameLocator(page);
                }
                
                // Aguarda um pouco para garantir que o conteúdo carregou
                await page.waitForTimeout(1500);
                
                await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);
                await this.performStatusUpdateCore({ page, frame, deliverableStatus, url });
                return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}' (sessão reutilizada)` };
            } catch (e: any) {
                lastErr = e;
                this.logger.error(`❌ Erro in-session tentativa ${attempt}: ${e?.message}`);
                if (attempt < maxAttempts) {
                    this.logger.log(`🔁 (sessão) reload + espera ${retryDelay}ms antes de retry`);
                    try { 
                        await page.reload({ waitUntil: 'domcontentloaded' }); 
                        await page.waitForTimeout(retryDelay);
                        // CRÍTICO: Recapturar frame após reload e espera!
                        frame = WorkfrontDomHelper.frameLocator(page);
                    } catch { }
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

        // Digita o novo status
        this.logger.log(`⌨️ Digitando status: "${deliverableStatus}"`);
        await input.click({ force: true });
        await page.waitForTimeout(300);
        
        // Limpa o input e digita o novo valor
        await input.fill(''); // Limpa completamente o campo
        await page.waitForTimeout(200);
        await input.fill(deliverableStatus); // Preenche com o novo valor
        await page.waitForTimeout(400);
        
        // Verifica o que foi digitado no input
        const inputValue = await input.inputValue();
        this.logger.log(`📝 Valor no input após digitação: "${inputValue}" (esperado: "${deliverableStatus}")`);
        
        // Verifica onde está o foco antes do Tab
        const focusBeforeTab = await page.evaluate(() => {
            const el = document.activeElement;
            return {
                tag: el?.tagName,
                id: el?.id,
                testId: el?.getAttribute('data-testid'),
                value: (el as HTMLInputElement)?.value
            };
        });
        this.logger.log(`🎯 Foco antes do Tab: ${JSON.stringify(focusBeforeTab)}`);
        
        // Tab 2x para ir ao botão Save Changes + Enter para salvar
        this.logger.log('⏭️ Tab → Tab → Enter (navega para Save e salva)');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250);
        
        const focusAfterTab1 = await page.evaluate(() => {
            const el = document.activeElement;
            return {
                tag: el?.tagName,
                testId: el?.getAttribute('data-testid'),
                text: el?.textContent?.trim()
            };
        });
        this.logger.log(`🎯 Foco após 1º Tab: ${JSON.stringify(focusAfterTab1)}`);
        
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250);
        
        const focusAfterTab2 = await page.evaluate(() => {
            const el = document.activeElement;
            return {
                tag: el?.tagName,
                testId: el?.getAttribute('data-testid'),
                text: el?.textContent?.trim()
            };
        });
        this.logger.log(`🎯 Foco após 2º Tab: ${JSON.stringify(focusAfterTab2)}`);
        
        await page.keyboard.press('Enter');
        await page.waitForTimeout(7000);
        
        // Aguarda o indicador "Editing" desaparecer
        this.logger.log('⏳ Aguardando salvamento...');
        const editingIndicator = frame.locator('.css-gbkrod:has(h2:has-text("loc | Statuses")) .css-nn4pdh:has-text("Editing")').first();
        try {
            await editingIndicator.waitFor({ state: 'hidden', timeout: 5000 });
            this.logger.log('✅ Status salvo com sucesso!');
        } catch {
            this.logger.warn('⚠️ Indicador "Editing" ainda presente - salvamento pode ter falhado');
        }
    }

    // === Auxiliares novos ===

    private async openStatusAccordion(frame: any, page: Page) {
        this.logger.log('🔎 Abrindo accordion "loc | Statuses"...');

        // Busca o header do accordion pela estrutura específica
        const accordionHeader = frame.locator('h2.accordion-label-header:has-text("loc | Statuses")').first();

        if ((await accordionHeader.count()) === 0) {
            this.logger.warn('⚠️ Header do accordion "loc | Statuses" não encontrado');
            throw new Error('Accordion "loc | Statuses" não encontrado');
        }

        // Pega o ID do accordion do aria-labelledby do content
        const accordionWrapper = frame.locator('.css-gbkrod:has(h2:has-text("loc | Statuses"))').first();

        // Verifica se o content está com display: none (fechado)
        const contentRegion = accordionWrapper.locator('.. >> [role="region"]').first();

        if ((await contentRegion.count()) > 0) {
            const displayStyle = await contentRegion.evaluate((el: HTMLElement) =>
                window.getComputedStyle(el).display
            ).catch(() => 'none');

            if (displayStyle === 'none') {
                this.logger.log('📂 Accordion está fechado, abrindo...');
                await accordionHeader.click({ force: true });
                await page.waitForTimeout(1500);

                // Verifica se abriu
                const newDisplay = await contentRegion.evaluate((el: HTMLElement) =>
                    window.getComputedStyle(el).display
                ).catch(() => 'none');

                if (newDisplay === 'none') {
                    this.logger.warn('⚠️ Accordion não abriu após clique, tentando novamente...');
                    await accordionHeader.click({ force: true });
                    await page.waitForTimeout(1200);
                }
            } else {
                this.logger.log('✅ Accordion já está aberto');
            }
        } else {
            // Se não encontrou o content, tenta clicar no header mesmo assim
            await accordionHeader.click({ force: true });
            await page.waitForTimeout(1000);
        }
    }

    private async enterStatusEditMode(frame: any, page: Page): Promise<Locator> {
        this.logger.log('📝 Entrando em modo de edição do campo "loc | Status"...');

        // Verifica se já está em modo de edição pelo indicador "Editing" no header
        const editingIndicator = frame.locator('.css-gbkrod:has(h2:has-text("loc | Statuses")) .css-nn4pdh:has-text("Editing")').first();
        const isEditing = (await editingIndicator.count()) > 0;

        if (isEditing) {
            this.logger.log('✅ Accordion já está em modo de edição');
        }

        // Busca o input - pode estar em edit-mode-container ou view-mode-container
        const input = frame.locator('input[data-testid="DE:Loc | Status-input"]').first();

        // Se input já existe e está visível, retorna
        if ((await input.count()) > 0) {
            const isVisible = await input.isVisible().catch(() => false);
            if (isVisible) {
                this.logger.log('✳️ Input já está visível e acessível');
                await input.click({ force: true }).catch(() => { });
                await page.waitForTimeout(150);
                return input;
            }
        }

        // Precisa ativar o modo de edição - clica no view component
        this.logger.log('🔄 Ativando modo de edição...');
        const viewWrapper = frame.locator('[data-testid="field-DE:Loc | Status"] [data-testid="view-component-wrapper"]').first();

        if ((await viewWrapper.count()) > 0) {
            await viewWrapper.click({ force: true });
            await page.waitForTimeout(1000);
        } else {
            throw new Error('View wrapper do campo Status não encontrado');
        }

        // Aguarda o input aparecer após ativar edição
        await input.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {
            throw new Error('Input de edição não apareceu após clicar no campo');
        });

        this.logger.log('✅ Modo de edição ativado com sucesso');
        return input;
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
