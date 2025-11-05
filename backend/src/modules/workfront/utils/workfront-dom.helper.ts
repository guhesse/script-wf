import { Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '@nestjs/common';

const STATE_FILE = 'wf_state.json';

/** Helper central de utilidades DOM para Workfront */
export class WorkfrontDomHelper {
    private static readonly logger = new Logger(WorkfrontDomHelper.name);
    
    // Parâmetros padrão de tentativas (agora podem ser configurados via ENV)
    static folderAttempts = parseInt(process.env.WF_FOLDER_ATTEMPTS || '6', 10); // Aumentado de 4 para 6
    static folderDelayMs = parseInt(process.env.WF_FOLDER_DELAY_MS || '1200', 10); // Aumentado de 900 para 1200
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
        
        // Estratégias expandidas: inclui busca exata e parcial
        const strategiesBase = [
            // Busca com prefixos numéricos comuns
            `button:has-text("13. ${folderName}")`,
            `button:has-text("14. ${folderName}")`,
            `button:has-text("15. ${folderName}")`,
            // Busca exata pelo nome completo
            `button:has-text("${folderName}")`,
            `a:has-text("${folderName}")`,
            `[role="button"]:has-text("${folderName}")`,
            // Busca por elementos de pasta com data-testid
            `*[data-testid*="folder"]:has-text("${folderName}")`,
            `*[data-testid*="item"]:has-text("${folderName}")`,
            // Busca case-insensitive e parcial
            `button:text-is("${folderName}")`,
            `a:text-is("${folderName}")`,
            // Busca por span/div dentro de botões (estruturas aninhadas)
            `button:has(span:has-text("${folderName}"))`,
            `button:has(div:has-text("${folderName}"))`,
            // Busca por classe de documento/pasta
            `.doc-folder:has-text("${folderName}")`,
            `.folder-item:has-text("${folderName}")`,
        ];
        
        for (let attempt = 1; attempt <= this.folderAttempts; attempt++) {
            // Tenta cada estratégia
            for (const sel of strategiesBase) {
                try {
                    const el = frame.locator(sel).first();
                    if ((await el.count()) > 0 && await el.isVisible()) {
                        await el.click();
                        await page.waitForTimeout(1500); // Aumentado para dar tempo de carregar
                        return;
                    }
                } catch { }
            }
            
            // Estratégia adicional: busca por todos os elementos clicáveis e filtra por texto
            try {
                const allButtons = await frame.locator('button, a, [role="button"]').all();
                for (const btn of allButtons) {
                    try {
                        const text = await btn.textContent();
                        if (text && text.includes(folderName)) {
                            const isVisible = await btn.isVisible();
                            if (isVisible) {
                                await btn.click();
                                await page.waitForTimeout(1500);
                                return;
                            }
                        }
                    } catch { }
                }
            } catch { }
            
            // Scroll leve para tentar carregar itens lazy-loaded
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
        
        // Normalizar nome do arquivo para busca mais flexível
        const baseName = fileName.replace(/\.[^.]+$/, ''); // Remove extensão
        const searchTerms = [
            fileName, // Nome completo
            baseName, // Sem extensão
            fileName.replace(/_/g, ' '), // Com espaços
            baseName.replace(/_/g, ' '), // Sem extensão e com espaços
        ];
        
        this.logger.log(`🔍 Buscando documento: "${fileName}"`);
        this.logger.log(`📋 Termos de busca: ${searchTerms.join(', ')}`);
        
        for (let attempt = 1; attempt <= this.docAttempts; attempt++) {
            this.logger.log(`🔄 Tentativa ${attempt}/${this.docAttempts} de selecionar documento`);
            
            // Estratégia 1: Busca por seletores diretos (mais rápido)
            const directSelectors = [
                `[aria-label*="${fileName}"]`,
                `[aria-label*="${baseName}"]`,
                `[data-testid*="document-row"]:has-text("${fileName}")`,
                `[data-testid*="document-row"]:has-text("${baseName}")`,
                `.doc-detail-view:has-text("${fileName}")`,
                `.doc-detail-view:has-text("${baseName}")`,
            ];
            
            for (const selector of directSelectors) {
                try {
                    const el = frame.locator(selector).first();
                    if ((await el.count()) > 0) {
                        const isVisible = await el.isVisible().catch(() => false);
                        if (isVisible) {
                            this.logger.log(`✅ Documento encontrado com seletor: ${selector}`);
                            
                            // ESTRATÉGIA 1: Click no ícone da imagem (área 100% segura, sem botões)
                            try {
                                this.logger.log(`🎯 Tentando click no ícone do documento...`);
                                const iconImg = el.locator('.img img, .doc-image, img[class*="document-icon"]').first();
                                if ((await iconImg.count()) > 0) {
                                    await iconImg.click({ timeout: 2000, force: true });
                                    this.logger.log(`✅ Click no ícone executado com sucesso!`);
                                    await page.waitForTimeout(600);
                                    return;
                                }
                            } catch (iconError: any) {
                                this.logger.warn(`⚠️ Click no ícone falhou: ${iconError?.message}`);
                            }
                            
                            // ESTRATÉGIA 2: Disparar ng-click via JavaScript (mais confiável para AngularJS)
                            try {
                                this.logger.log(`🖱️ Tentando acionar ng-click via JavaScript...`);
                                await el.evaluate((element: any) => {
                                    // Simula o evento que o AngularJS espera
                                    const event = new MouseEvent('click', {
                                        view: window,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    element.dispatchEvent(event);
                                    
                                    // Fallback: chama a função ng-click diretamente se possível
                                    if (element.click) {
                                        element.click();
                                    }
                                });
                                this.logger.log(`✅ ng-click acionado via JavaScript`);
                                await page.waitForTimeout(600);
                                return;
                            } catch (ngError: any) {
                                this.logger.warn(`⚠️ ng-click via JS falhou: ${ngError?.message}`);
                            }
                            
                            // ESTRATÉGIA 3: Click com posição no canto esquerdo (área do ícone)
                            try {
                                this.logger.log(`🖱️ Tentando click posicionado no ícone...`);
                                await el.click({ position: { x: 20, y: 20 }, timeout: 2000, force: true });
                                this.logger.log(`✅ Click posicionado executado`);
                                await page.waitForTimeout(600);
                                return;
                            } catch (posError: any) {
                                this.logger.warn(`⚠️ Click posicionado falhou: ${posError?.message}`);
                            }
                            
                            // ESTRATÉGIA 4: Click no container .img
                            try {
                                this.logger.log(`🖱️ Tentando click no container da imagem...`);
                                const imgContainer = el.locator('.img').first();
                                if ((await imgContainer.count()) > 0) {
                                    await imgContainer.click({ timeout: 2000, force: true });
                                    this.logger.log(`✅ Click no container executado`);
                                    await page.waitForTimeout(600);
                                    return;
                                }
                            } catch (containerError: any) {
                                this.logger.warn(`⚠️ Click no container falhou: ${containerError?.message}`);
                            }
                            
                            // ESTRATÉGIA 5: Focus + Enter (simula teclado)
                            try {
                                this.logger.log(`⌨️ Tentando focus + Enter...`);
                                await el.focus({ timeout: 2000 });
                                await page.keyboard.press('Enter');
                                this.logger.log(`✅ Focus + Enter executado`);
                                await page.waitForTimeout(600);
                                return;
                            } catch (keyError: any) {
                                this.logger.error(`❌ Todas as estratégias falharam: ${keyError?.message}`);
                            }
                        }
                    }
                } catch (e: any) {
                    this.logger.warn(`⚠️ Erro ao processar seletor ${selector}: ${e?.message}`);
                }
            }
            
            // Estratégia 2: Busca detalhada via evaluate (mais precisa)
            const candidates = await frame.locator('body').evaluate((body, searchTerms: string[]) => {
                const out: any[] = [];
                
                // Busca em todos os elementos que podem ser documentos
                const docSelectors = [
                    '.doc-detail-view',
                    '[data-testid*="document"]',
                    '[role="row"]',
                    'tr[data-testid]'
                ];
                
                docSelectors.forEach(sel => {
                    body.querySelectorAll(sel).forEach((el: any, i: number) => {
                        const aria = el.getAttribute('aria-label') || '';
                        const txt = (el.textContent || '').toLowerCase();
                        
                        // Verifica se algum termo de busca corresponde
                        for (const term of searchTerms) {
                            const termLower = term.toLowerCase();
                            if (aria.toLowerCase().includes(termLower) || txt.includes(termLower)) {
                                // Calcular score de similaridade
                                let score = 0;
                                if (aria.toLowerCase() === termLower) score = 100; // Match exato
                                else if (aria.toLowerCase().includes(termLower)) score = 80;
                                else if (txt === termLower) score = 90;
                                else if (txt.includes(termLower)) score = 70;
                                
                                const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
                                
                                out.push({ 
                                    index: i, 
                                    ariaLabel: aria,
                                    text: txt.substring(0, 100),
                                    isVisible,
                                    score,
                                    selector: sel,
                                    matchedTerm: term
                                });
                                break; // Encontrou match, não precisa testar outros termos
                            }
                        }
                    });
                });
                
                // Ordena por score (maior primeiro) e visibilidade
                return out.sort((a, b) => {
                    if (a.isVisible && !b.isVisible) return -1;
                    if (!a.isVisible && b.isVisible) return 1;
                    return b.score - a.score;
                });
            }, searchTerms).catch((e) => {
                this.logger.warn(`⚠️ Erro ao buscar candidatos: ${e?.message}`);
                return [];
            });
            
            this.logger.log(`📊 Candidatos encontrados: ${candidates.length}`);
            
            if (candidates && candidates.length > 0) {
                // Log dos candidatos para debug
                candidates.slice(0, 3).forEach((c, i) => {
                    this.logger.log(`   ${i + 1}. Score: ${c.score}, Visível: ${c.isVisible}, Termo: "${c.matchedTerm}", Texto: "${c.text.substring(0, 50)}..."`);
                });
                
                const target = candidates[0]; // Já ordenado por score e visibilidade
                
                try {
                    // Tenta clicar usando aria-label primeiro (mais confiável)
                    if (target.ariaLabel) {
                        this.logger.log(`🖱️ Tentando click via aria-label...`);
                        const el = frame.locator(`[aria-label="${target.ariaLabel}"]`).first();
                        if ((await el.count()) > 0) {
                            try {
                                await el.click({ force: true, timeout: 5000 }); // Force click em headless
                                await page.waitForTimeout(800);
                                this.logger.log(`✅ Documento selecionado via aria-label`);
                                return;
                            } catch (clickErr: any) {
                                this.logger.warn(`⚠️ Click via aria-label falhou: ${clickErr?.message}`);
                            }
                        }
                    }
                    
                    // Fallback: tenta por seletor e index
                    this.logger.log(`🖱️ Tentando click via índice...`);
                    const el = frame.locator(`${target.selector}:nth-of-type(${(target.index || 0) + 1})`);
                    if ((await el.count()) > 0) {
                        try {
                            await el.click({ force: true, timeout: 5000 });
                            await page.waitForTimeout(800);
                            this.logger.log(`✅ Documento selecionado via índice`);
                            return;
                        } catch (clickErr: any) {
                            this.logger.warn(`⚠️ Click via índice falhou: ${clickErr?.message}`);
                        }
                    }
                } catch (e: any) {
                    this.logger.error(`❌ Erro crítico ao clicar no candidato: ${e?.message}`);
                }
            }
            
            // Scroll para carregar mais itens (lazy loading)
            if (attempt < this.docAttempts) {
                this.logger.log(`📜 Fazendo scroll para carregar mais documentos...`);
                try {
                    await frame.locator('body').evaluate(() => {
                        const sc = document.scrollingElement || document.documentElement || document.body;
                        sc.scrollBy(0, 500);
                    });
                } catch { }
                await page.waitForTimeout(this.docDelayMs);
            }
        }
        
        // Busca final: listar todos os documentos disponíveis para debug
        const allDocs = await frame.locator('body').evaluate((body) => {
            const docs: string[] = [];
            body.querySelectorAll('.doc-detail-view, [data-testid*="document"], [role="row"]').forEach((el: any) => {
                const aria = el.getAttribute('aria-label') || '';
                const txt = (el.textContent || '').trim();
                if (aria) docs.push(`aria: ${aria}`);
                else if (txt && txt.length < 200) docs.push(`text: ${txt.substring(0, 100)}`);
            });
            return docs.slice(0, 10); // Primeiros 10 documentos
        }).catch(() => []);
        
        this.logger.error(`❌ Documentos disponíveis na página:`);
        allDocs.forEach((doc, i) => this.logger.error(`   ${i + 1}. ${doc}`));
        
        throw new Error(`Documento não encontrado: ${fileName} após ${this.docAttempts} tentativas`);
    }
}
