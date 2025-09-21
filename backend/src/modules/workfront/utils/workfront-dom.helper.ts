import { Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

const STATE_FILE = 'wf_state.json';

/** Helper central de utilidades DOM para Workfront */
export class WorkfrontDomHelper {
    // Parâmetros padrão de tentativas (agora podem ser configurados via ENV)
    static folderAttempts = parseInt(process.env.WF_FOLDER_ATTEMPTS || '4', 10);
    static folderDelayMs = parseInt(process.env.WF_FOLDER_DELAY_MS || '900', 10);
    static docAttempts = parseInt(process.env.WF_DOC_ATTEMPTS || '8', 10);
    static docDelayMs = parseInt(process.env.WF_DOC_DELAY_MS || '700', 10);
    // ENV suportadas:
    //  WF_FOLDER_ATTEMPTS    -> nº máximo de tentativas para encontrar pasta (default 4)
    //  WF_FOLDER_DELAY_MS    -> delay entre tentativas de pasta (default 900)
    //  WF_DOC_ATTEMPTS       -> nº máximo de tentativas para encontrar documento (default 8)
    //  WF_DOC_DELAY_MS       -> delay entre tentativas de documento (default 700)
    //  (Chamar WorkfrontDomHelper.reloadEnvConfig() se alterar dinamicamente em testes)

    /** Força recarregar parâmetros de env (caso alterados em runtime de testes) */
    static reloadEnvConfig() {
        this.folderAttempts = parseInt(process.env.WF_FOLDER_ATTEMPTS || String(this.folderAttempts), 10);
        this.folderDelayMs = parseInt(process.env.WF_FOLDER_DELAY_MS || String(this.folderDelayMs), 10);
        this.docAttempts = parseInt(process.env.WF_DOC_ATTEMPTS || String(this.docAttempts), 10);
        this.docDelayMs = parseInt(process.env.WF_DOC_DELAY_MS || String(this.docDelayMs), 10);
    }
    /** Garante que o storage state existe (login feito) */
    static async ensureStateFile(): Promise<string> {
        const p = path.resolve(process.cwd(), STATE_FILE);
        try { await fs.access(p); return p; } catch { throw new Error('Sessão não encontrada. Faça login em /api/login'); }
    }

    /** Normaliza qualquer URL de projeto para a aba /tasks */
    static ensureTasksUrl(url: string): string {
        if (/\/tasks/.test(url)) return url;
        if (/\/overview/.test(url)) return url.replace(/\/overview.*/, '/tasks');
        if (/\/documents/.test(url)) return url.replace(/\/documents.*/, '/tasks');
        if (/\/project\/[a-f0-9]+$/i.test(url)) return url + '/tasks';
        return url.replace(/\/*$/, '') + '/tasks';
    }

    /** Localizador padrão do iframe principal do Workfront */
    static frameLocator(page: Page) {
        return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
    }

    /** Fecha a sidebar lateral se estiver aberta */
    static async closeSidebarIfOpen(frame: any, page: Page) {
        try {
            const sb = frame.locator('#page-sidebar [data-testid="minix-container"]').first();
            if ((await sb.count()) > 0 && await sb.isVisible()) {
                const closeBtn = frame.locator('button[data-testid="minix-header-close-btn"]').first();
                if ((await closeBtn.count()) > 0) { await closeBtn.click(); await page.waitForTimeout(600); }
            }
        } catch { }
    }

    /** Navega para pasta pelo nome (tentando várias estratégias) */
    static async navigateToFolder(frame: any, page: Page, folderName: string): Promise<void> {
        if (!folderName || folderName === 'root') return;
        const strategiesBase = [
            `button:has-text("13. ${folderName}")`,
            `button:has-text("14. ${folderName}")`,
            `button:has-text("15. ${folderName}")`,
            `button:has-text("${folderName}")`,
            `a:has-text("${folderName}")`,
            `[role="button"]:has-text("${folderName}")`,
            `*[data-testid*="item"]:has-text("${folderName}")`
        ];
        for (let attempt = 1; attempt <= this.folderAttempts; attempt++) {
            for (const sel of strategiesBase) {
                try {
                    const el = frame.locator(sel).first();
                    if ((await el.count()) > 0 && await el.isVisible()) {
                        await el.click();
                        await page.waitForTimeout(1200);
                        return;
                    }
                } catch { }
            }
            // Scroll leve para tentar carregar itens
            try {
                await frame.locator('body').evaluate(() => {
                    const sc = document.scrollingElement || document.documentElement || document.body;
                    sc.scrollBy(0, 400);
                });
            } catch { }
            if (attempt < this.folderAttempts) {
                await page.waitForTimeout(this.folderDelayMs);
            }
        }
        throw new Error(`Pasta "${folderName}" não encontrada após ${this.folderAttempts} tentativas`);
    }

    /** Seleciona um documento pela heurística do aria-label ou texto */
    static async selectDocument(frame: any, page: Page, fileName: string): Promise<void> {
        await this.closeSidebarIfOpen(frame, page);
        for (let attempt = 1; attempt <= this.docAttempts; attempt++) {
            const candidates = await frame.locator('body').evaluate((body, target: string) => {
                const out: any[] = [];
                body.querySelectorAll('.doc-detail-view').forEach((el: any, i: number) => {
                    const aria = el.getAttribute('aria-label') || '';
                    const txt = (el.textContent || '').toLowerCase();
                    if (aria.includes(target) || txt.includes(target.toLowerCase())) {
                        out.push({ index: i, ariaLabel: aria, isVisible: el.offsetWidth > 0 && el.offsetHeight > 0 });
                    }
                });
                return out;
            }, fileName).catch(() => []);
            if (candidates && candidates.length > 0) {
                const target = candidates.find(c => c.isVisible) || candidates[0];
                try {
                    if (target.ariaLabel) {
                        await frame.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
                    } else {
                        await frame.locator(`.doc-detail-view:nth-of-type(${(target.index || 0) + 1})`).click();
                    }
                    await page.waitForTimeout(600);
                    return;
                } catch { }
            }
            if (attempt < this.docAttempts) {
                try {
                    await frame.locator('body').evaluate(() => {
                        const sc = document.scrollingElement || document.documentElement || document.body;
                        sc.scrollBy(0, 500);
                    });
                } catch { }
                await page.waitForTimeout(this.docDelayMs);
            }
        }
        throw new Error(`Documento não encontrado: ${fileName} após ${this.docAttempts} tentativas`);
    }
}
