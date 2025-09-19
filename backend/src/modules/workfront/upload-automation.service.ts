import { Injectable, Logger } from '@nestjs/common';
import { chromium, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CommentService } from '../pdf/comment.service';
import { ShareAutomationService } from './share-automation.service';
import { CommentType } from '../pdf/dto/pdf.dto';

const STATE_FILE = 'wf_state.json';
type TeamKey = 'carol' | 'giovana' | 'test';

@Injectable()
export class UploadAutomationService {
    private readonly logger = new Logger(UploadAutomationService.name);
    constructor(
        private readonly commentService: CommentService,
        private readonly shareService: ShareAutomationService,
    ) { }

    async executeUploadPlan(params: {
        projectUrl: string;
        selectedUser: TeamKey;
        assetZipPath: string;
        finalMaterialPaths: string[];
        headless?: boolean;
    }): Promise<{
        success: boolean; message: string; results: Array<{ type: 'asset-release' | 'final-materials'; fileName: string; uploadSuccess: boolean; shareSuccess: boolean; commentSuccess: boolean; message?: string; error?: string }>;
        summary: { totalFiles: number; uploadSuccesses: number; shareSuccesses: number; commentSuccesses: number; errors: number }
    }> {
        const { projectUrl, selectedUser, assetZipPath, finalMaterialPaths, headless = false } = params;
        this.logger.log('🚀 [UPLOAD] Iniciando plano');
        const results: any[] = []; let uploadSuccesses = 0; let shareSuccesses = 0; let commentSuccesses = 0; let errors = 0;
        const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);
            await this.waitForWorkfrontFrame(page);
            const frame = this.frameLocator(page);
            await this.closeSidebarIfOpen(frame, page);

            // Asset Release (opcional - pode ser omitido em alguns steps do workflow)
            if (assetZipPath && assetZipPath.trim()) {
                await this.navigateToFolder(frame, page, 'Asset Release');
                const assetRes = await this.uploadSingleFile(frame, page, assetZipPath);
                results.push({ type: 'asset-release', fileName: path.basename(assetZipPath), uploadSuccess: assetRes, shareSuccess: false, commentSuccess: false });
                if (assetRes) uploadSuccesses++; else errors++;
                if (assetRes) {
                    const assetFileName = this.getOriginalFileName(assetZipPath);
                    // Share automático do ZIP (opcional, manter para consistência)
                    try {
                        const shareCtx = await this.shareService.openProjectAndSelectDocument(projectUrl, 'Asset Release', assetFileName, headless);
                        try {
                            await this.shareService.shareUsingOpenPage(shareCtx.frame, shareCtx.page, selectedUser as any);
                            const idx = results.findIndex(r => r.type === 'asset-release' && r.fileName === path.basename(assetZipPath));
                            if (idx >= 0) { results[idx].shareSuccess = true; shareSuccesses++; }
                        } catch (e: any) { this.logger.warn('[UPLOAD][ASSET] Share falhou: ' + e?.message); }
                        finally { try { await shareCtx.page.context().browser()?.close(); } catch { } }
                    } catch (e: any) { this.logger.warn('[UPLOAD][ASSET] Não foi possível preparar share: ' + e?.message); }
                    // (Comentário não é usual para o ZIP; pulado para evitar ruído)
                }
            } else {
                this.logger.log('[UPLOAD] Sem assetZipPath informado - pulando Asset Release');
            }

            // Final Materials
            await this.navigateToFolder(frame, page, 'Final Materials');
            const pdfs = finalMaterialPaths.filter(f => f.toLowerCase().endsWith('.pdf'));
            const others = finalMaterialPaths.filter(f => !f.toLowerCase().endsWith('.pdf'));

            for (const filePath of [...others, ...pdfs]) {
                const isPdf = pdfs.includes(filePath);
                const baseName = path.basename(filePath);
                const upOk = await this.uploadSingleFile(frame, page, filePath);
                const entry = { type: 'final-materials', fileName: baseName, uploadSuccess: upOk, shareSuccess: false, commentSuccess: false };
                results.push(entry);
                if (upOk) uploadSuccesses++; else { errors++; continue; }

                // Share imediato do arquivo final
                try {
                    const shareCtx = await this.shareService.openProjectAndSelectDocument(projectUrl, 'Final Materials', baseName, headless);
                    try {
                        await this.shareService.shareUsingOpenPage(shareCtx.frame, shareCtx.page, selectedUser as any);
                        entry.shareSuccess = true; shareSuccesses++;
                    } catch (e: any) { this.logger.warn(`[UPLOAD][FINALS] Share falhou para ${baseName}: ${e?.message}`); }
                    finally { try { await shareCtx.page.context().browser()?.close(); } catch { } }
                } catch (e: any) { this.logger.warn(`[UPLOAD][FINALS] Não conseguiu preparar share para ${baseName}: ${e?.message}`); }

                if (isPdf) await page.waitForTimeout(1500); // leve espaçamento
            }

            if (pdfs.length > 0) {
                const lastPdf = pdfs[pdfs.length - 1];
                const lastName = this.getOriginalFileName(lastPdf);
                try {
                    // Reabrir contexto para evitar estado residual
                    const commentCtx = await this.shareService.openProjectAndSelectDocument(projectUrl, 'Final Materials', lastName, headless);
                    try {
                        const cRes = await this.commentService.addCommentUsingOpenPage({ frameLocator: commentCtx.frame, page: commentCtx.page, folderName: 'Final Materials', fileName: lastName, commentType: CommentType.FINAL_MATERIALS, selectedUser: selectedUser as any });
                        const idx = results.findIndex(r => r.type === 'final-materials' && r.fileName === path.basename(lastPdf));
                        if (idx >= 0) { results[idx].commentSuccess = cRes.success; results[idx].message = cRes.message; }
                        if (cRes.success) commentSuccesses++; else errors++;
                    } catch (e: any) { this.logger.warn('Comentário Final Materials falhou: ' + e?.message); errors++; }
                    finally { try { await commentCtx.page.context().browser()?.close(); } catch { } }
                } catch (e: any) { this.logger.warn('Comentário Final Materials (prep) falhou: ' + e?.message); errors++; }
            }

            const totalFiles = (assetZipPath && assetZipPath.trim() ? 1 : 0) + finalMaterialPaths.length;
            const success = errors === 0;
            return { success, message: success ? 'Upload + Share completo' : 'Upload + Share concluído com erros', results, summary: { totalFiles, uploadSuccesses, shareSuccesses, commentSuccesses, errors } };
        } catch (e: any) {
            this.logger.error('Falha no plano: ' + e?.message);
            return { success: false, message: e?.message || 'Erro no plano', results, summary: { totalFiles: results.length, uploadSuccesses, shareSuccesses, commentSuccesses, errors: errors + 1 } };
        } finally { try { await browser.close(); } catch { } }
    }

    // Helpers reutilizados (extraídos)
    private async ensureStateFile() { const p = path.resolve(process.cwd(), STATE_FILE); try { await fs.access(p); return p; } catch { throw new Error('Sessão não encontrada. Faça login.'); } }
    private frameLocator(page: Page) { return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first(); }
    private async closeSidebarIfOpen(frame: any, page: Page) { try { const sb = frame.locator('#page-sidebar [data-testid="minix-container"]').first(); if ((await sb.count()) > 0 && await sb.isVisible()) { const btn = frame.locator('button[data-testid="minix-header-close-btn"]').first(); if ((await btn.count()) > 0) { await btn.click(); await page.waitForTimeout(600); } } } catch { } }
    private async waitForWorkfrontFrame(page: Page) { try { await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"], iframe', { timeout: 10000 }); await page.waitForTimeout(2500); } catch { } }
    private getOriginalFileName(filePath: string) { const base = path.basename(filePath); const m = base.match(/^[0-9]+_[a-z0-9]+__(.+)$/); return m ? m[1] : base; }
    private async selectDocumentInPage(frame: any, page: Page, fileName: string) { try { await this.closeSidebarIfOpen(frame, page); await page.waitForTimeout(800); const found = await frame.locator('body').evaluate((body, target) => { const out: any[] = []; body.querySelectorAll('.doc-detail-view').forEach((el: any, i: number) => { const aria = el.getAttribute('aria-label') || ''; const txt = (el.textContent || '').toLowerCase(); if (aria.includes(target) || txt.includes(target.toLowerCase())) out.push({ index: i, ariaLabel: aria, isVisible: el.offsetWidth > 0 && el.offsetHeight > 0 }); }); return out; }, fileName); if (!found || found.length === 0) return false; const target = found.find(f => f.isVisible) || found[0]; if (target.ariaLabel) await frame.locator(`[aria-label="${target.ariaLabel}"]`).first().click(); else await frame.locator(`.doc-detail-view:nth-of-type(${target.index + 1})`).click(); await page.waitForTimeout(1200); return true; } catch { return false; } }
    private async navigateToFolder(frame: any, page: Page, folderName: string) { try { await this.closeSidebarIfOpen(frame, page); await page.waitForTimeout(1000); const sels = [`button:has-text("13. ${folderName}")`, `button:has-text("14. ${folderName}")`, `button:has-text("15. ${folderName}")`, `button:has-text("${folderName}")`, `a:has-text("${folderName}")`, `[role="button"]:has-text("${folderName}")`, `*[data-testid*="item"]:has-text("${folderName}")`]; for (const sel of sels) { try { const el = frame.locator(sel).first(); if ((await el.count()) > 0 && await el.isVisible()) { await el.click(); await page.waitForTimeout(2500); return true; } } catch { } } return false; } catch { return false; } }
    private async uploadSingleFile(frame: any, page: Page, filePath: string) {
        try {
            await fs.access(filePath); const addSel = ['button[data-testid="add-new"]', 'button.add-new-react-button', 'button:has-text("Add new")', 'button[id="add-new-button"]']; let opened = false; for (const sel of addSel) { try { const b = frame.locator(sel).first(); if ((await b.count()) > 0 && await b.isVisible()) { await b.click(); await page.waitForTimeout(1200); opened = true; break; } } catch { } } if (!opened) return false; const docSels = ['li[data-test-id="upload-file"]', 'li.select-files-button', 'li:has-text("Document")', '[role="menuitem"]:has-text("Document")']; const original = this.getOriginalFileName(filePath); let uploadPath = filePath; if (path.basename(filePath) !== original) { const tmpDir = path.resolve(process.cwd(), 'Downloads', 'staging', '.tmp_uploads'); await fs.mkdir(tmpDir, { recursive: true }); const tmp = path.resolve(tmpDir, original); try { await fs.unlink(tmp); } catch { } await fs.copyFile(filePath, tmp); uploadPath = tmp; }
            const fileChooserPromise = page.waitForEvent('filechooser');
            let clicked = false; for (const sel of docSels) { try { const d = frame.locator(sel).first(); if ((await d.count()) > 0 && await d.isVisible()) { await d.click(); clicked = true; break; } } catch { } }
            if (!clicked) return false; const chooser = await fileChooserPromise; await chooser.setFiles(uploadPath); await page.waitForTimeout(3500);
            // verificação simples
            const appearSelectors = [`text="${original}"`, `[aria-label*="${original}"]`, `.doc-detail-view:has-text("${original}")`];
            for (const sel of appearSelectors) { try { const el = frame.locator(sel).first(); if ((await el.count()) > 0 && await el.isVisible()) return true; } catch { } }
            return true;
        } catch { return false; }
    }
}
