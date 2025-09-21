import { Injectable, Logger } from '@nestjs/common';
import { Page, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { CommentService } from '../pdf/comment.service';
import { ShareAutomationService } from './share-automation.service';
import { CommentType } from '../pdf/dto/pdf.dto';

const STATE_FILE = 'wf_state.json';
// NOVO: pesos e base de cálculo
const BASE_SECONDS = 30; // 1 unidade de peso = 30s (ajustável)
const EXT_WEIGHTS: Record<string, number> = {
    '.mp4': 5,
    '.mov': 5,
    '.mkv': 5,
    '.zip': 3,      // tempo médio
    '.pdf': 1,
    '.png': 0.7,
    '.jpg': 0.7,
    '.jpeg': 0.7,
    '.webp': 0.7,
    '.gif': 0.7
};

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
        success: boolean; message: string; results: Array<{ type: 'asset-release' | 'final-materials'; fileName: string; uploadSuccess: boolean; shareSuccess: boolean; commentSuccess: boolean; message?: string; error?: string; estimatedUploadSeconds?: number; cumulativeEstimatedSeconds?: number }>;
        summary: { totalFiles: number; uploadSuccesses: number; shareSuccesses: number; commentSuccesses: number; errors: number; estimatedTotalSeconds?: number }
    }> {
        const { projectUrl, selectedUser, assetZipPath, finalMaterialPaths, headless = false } = params;
        this.logger.log('🚀 [UPLOAD] Iniciando plano');
        const results: any[] = []; let uploadSuccesses = 0; let shareSuccesses = 0; let commentSuccesses = 0; let errors = 0;

        // NOVO: preparar ordem de arquivos p/ estimativa (mesma ordem do processo real)
        const assetList = assetZipPath && assetZipPath.trim() ? [assetZipPath] : [];
        const pdfs = finalMaterialPaths.filter(f => f.toLowerCase().endsWith('.pdf'));
        const others = finalMaterialPaths.filter(f => !f.toLowerCase().endsWith('.pdf'));
        const orderedForEstimate = [...assetList, ...others, ...pdfs];
        const estimates = this.computeUploadEstimates(orderedForEstimate);
        this.logger.log(`[UPLOAD][ESTIMATE] Total estimado: ${this.formatSeconds(estimates.total)} (${estimates.total}s)`);
        orderedForEstimate.forEach(f => {
            const e = estimates.perFile[path.basename(f)];
            if (e) this.logger.log(` • ${path.basename(f)} => ${e.est}s (acumulado ${e.cumulative}s)`);
        });

        const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await WorkfrontDomHelper.ensureStateFile(), viewport: { width: 1366, height: 900 } });
        try {
            const page = await context.newPage();
            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            try { await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"]', { timeout: 10000 }); } catch { }
            const frame = WorkfrontDomHelper.frameLocator(page);
            await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);

            // Asset Release
            if (assetZipPath && assetZipPath.trim()) {
                await WorkfrontDomHelper.navigateToFolder(frame, page, 'Asset Release');
                const assetRes = await this.uploadSingleFile(frame, page, assetZipPath);
                const baseName = path.basename(assetZipPath);
                const est = estimates.perFile[baseName];
                results.push({
                    type: 'asset-release',
                    fileName: baseName,
                    uploadSuccess: assetRes,
                    shareSuccess: false,
                    commentSuccess: false,
                    estimatedUploadSeconds: est?.est,
                    cumulativeEstimatedSeconds: est?.cumulative
                });
                if (assetRes) uploadSuccesses++; else errors++;
                // Share automático do ZIP (opcional, manter para consistência)
                try {
                    const assetFileName = this.getOriginalFileName(assetZipPath); // <-- adicionado
                    const shareCtx = await this.shareService.openProjectAndSelectDocument(projectUrl, 'Asset Release', assetFileName, headless);
                    try {
                        await this.shareService.shareUsingOpenPage(shareCtx.frame, shareCtx.page, selectedUser as any);
                        const idx = results.findIndex(r => r.type === 'asset-release' && r.fileName === path.basename(assetZipPath));
                        if (idx >= 0) { results[idx].shareSuccess = true; shareSuccesses++; }
                    } catch (e: any) { this.logger.warn('[UPLOAD][ASSET] Share falhou: ' + e?.message); }
                    finally { try { await shareCtx.page.context().browser()?.close(); } catch { } }
                } catch (e: any) { this.logger.warn('[UPLOAD][ASSET] Não foi possível preparar share: ' + e?.message); }
                // (Comentário não é usual para o ZIP; pulado para evitar ruído)
            } else {
                this.logger.log('[UPLOAD] Sem assetZipPath informado - pulando Asset Release');
            }

            // Final Materials
            await WorkfrontDomHelper.navigateToFolder(frame, page, 'Final Materials');
            const pdfs = finalMaterialPaths.filter(f => f.toLowerCase().endsWith('.pdf'));
            const others = finalMaterialPaths.filter(f => !f.toLowerCase().endsWith('.pdf'));

            for (const filePath of [...others, ...pdfs]) {
                const isPdf = pdfs.includes(filePath);
                const baseName = path.basename(filePath);
                const upOk = await this.uploadSingleFile(frame, page, filePath);
                const est = estimates.perFile[baseName];
                const entry = {
                    type: 'final-materials',
                    fileName: baseName,
                    uploadSuccess: upOk,
                    shareSuccess: false,
                    commentSuccess: false,
                    estimatedUploadSeconds: est?.est,
                    cumulativeEstimatedSeconds: est?.cumulative
                };
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
            return {
                success,
                message: success ? 'Upload + Share completo' : 'Upload + Share concluído com erros',
                results,
                summary: {
                    totalFiles,
                    uploadSuccesses,
                    shareSuccesses,
                    commentSuccesses,
                    errors,
                    estimatedTotalSeconds: estimates.total
                }
            };
        } catch (e: any) {
            this.logger.error('Falha no plano: ' + e?.message);
            return {
                success: false,
                message: e?.message || 'Erro no plano',
                results,
                summary: {
                    totalFiles: results.length,
                    uploadSuccesses,
                    shareSuccesses,
                    commentSuccesses,
                    errors: errors + 1,
                    estimatedTotalSeconds: results.length ? results[results.length - 1].cumulativeEstimatedSeconds : 0
                }
            };
        } finally { try { await disposeBrowser(undefined, browser as Browser); } catch { } }
    }

    // NOVO: cálculo de estimativas
    private computeUploadEstimates(filePaths: string[]): { perFile: Record<string, { est: number; cumulative: number }>, total: number } {
        const perFile: Record<string, { est: number; cumulative: number }> = {};
        let cumulative = 0;
        for (const full of filePaths) {
            const base = path.basename(full);
            const ext = (path.extname(base) || '').toLowerCase();
            const weight = EXT_WEIGHTS[ext] ?? 1; // default peso 1
            const est = Math.round(weight * BASE_SECONDS);
            cumulative += est;
            perFile[base] = { est, cumulative };
        }
        return { perFile, total: cumulative };
    }

    // NOVO: formatação amigável
    private formatSeconds(total: number): string {
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [
            h > 0 ? `${h}h` : null,
            m > 0 ? `${m}m` : null,
            `${s}s`
        ].filter(Boolean).join(' ');
    }

    // Helpers reutilizados (extraídos)
    // Removidos: ensureStateFile, frameLocator, closeSidebarIfOpen, waitForWorkfrontFrame (agora em helpers)
    private getOriginalFileName(filePath: string) { const base = path.basename(filePath); const m = base.match(/^[0-9]+_[a-z0-9]+__(.+)$/); return m ? m[1] : base; }
    // Removidos métodos locais de navegação/seleção em favor do WorkfrontDomHelper
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
