import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

const STATE_FILE = 'wf_state.json';

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
     * Atualizar status do Deliverable (loc | Status)
     * Valores aceitos: 'Round 1 Review', 'Round 2 Review', 'Extra Round Review', 'Delivered'
     */
    async updateDeliverableStatus(params: { 
        projectUrl: string; 
        deliverableStatus: string; 
        headless?: boolean 
    }): Promise<{ success: boolean; message: string }> {
        const { projectUrl, deliverableStatus, headless = false } = params;
        this.logger.log(`📦 Alterando status do Deliverable para '${deliverableStatus}'`);
        
        const url = this.ensureOverviewUrl(projectUrl);
        const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        
        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);

            const frame = this.frameLocator(page);
            await this.closeSidebarIfOpen(frame, page);

            // Procurar e abrir accordion "loc | Statuses" se necessário
            const accordionSelectors = [
                'h2.accordion-label-header:has-text("loc | Statuses")',
                'h2:has-text("loc | Statuses")',
                '[data-testid*="accordion"]:has-text("loc | Statuses")'
            ];
            
            let accordionOpened = false;
            for (const sel of accordionSelectors) {
                try {
                    const acc = frame.locator(sel).first();
                    if ((await acc.count()) > 0) {
                        await acc.click({ force: true });
                        await page.waitForTimeout(1200);
                        accordionOpened = true;
                        break;
                    }
                } catch { }
            }
            
            if (!accordionOpened) {
                this.logger.warn('⚠️ Accordion de status não encontrado (talvez já aberto)');
            }

            // Localizar campo "loc | Status"
            const fieldWrapper = frame.locator('[data-testid="field-DE:Loc | Status-content"]').first();
            await fieldWrapper.waitFor({ timeout: 6000 }).catch(() => {
                throw new Error('Campo de status não localizado');
            });

            // Clicar no campo para abrir dropdown
            const viewComponent = fieldWrapper.locator('[data-testid="view-component-wrapper"]').first();
            if ((await viewComponent.count()) > 0) {
                await viewComponent.click({ force: true });
                await page.waitForTimeout(1500);
            } else {
                throw new Error('Wrapper do componente de status não encontrado');
            }

            // Selecionar a opção desejada
            const optionSelectors = [
                `[aria-label="${deliverableStatus}"]`,
                `[data-label="${deliverableStatus}"]`,
                `[role="option"][aria-label="${deliverableStatus}"]`,
                `span[data-label="${deliverableStatus}"]`,
                `li:has-text("${deliverableStatus}")`
            ];
            
            let clicked = false;
            for (const sel of optionSelectors) {
                try {
                    const opt = frame.locator(sel).first();
                    if ((await opt.count()) > 0 && await opt.isVisible()) {
                        await opt.click({ force: true });
                        clicked = true;
                        break;
                    }
                } catch { }
            }
            
            if (!clicked) {
                throw new Error(`Opção de status '${deliverableStatus}' não encontrada`);
            }

            // Salvar mudanças (se houver botão Save Changes)
            const saveBtn = frame.locator('button[data-testid="save-changes-button"]').first();
            if ((await saveBtn.count()) > 0) {
                await saveBtn.click();
                await page.waitForTimeout(2000);
            } else {
                this.logger.warn('⚠️ Botão Save Changes não encontrado (pode ser auto-save)');
            }

            return { success: true, message: `Status do Deliverable alterado para '${deliverableStatus}'` };
        } catch (e: any) {
            this.logger.error(`❌ Erro ao alterar status: ${e?.message}`);
            return { success: false, message: e?.message || 'Falha ao alterar status' };
        } finally {
            try { await browser.close(); } catch { }
        }
    }

    // Mantém o método antigo para compatibilidade mas redireciona para o novo
    async updateWorkStatus(params: { projectUrl: string; statusLabel: string; headless?: boolean }): Promise<{ success: boolean; message: string }> {
        return this.updateDeliverableStatus({
            projectUrl: params.projectUrl,
            deliverableStatus: params.statusLabel,
            headless: params.headless
        });
    }
}
