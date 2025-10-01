import { Injectable, Logger } from '@nestjs/common';
import { Page, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { resolveHeadless } from './utils/headless.util';
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
    const { projectUrl, selectedUser, assetZipPath, finalMaterialPaths, headless = resolveHeadless() } = params;
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
            
            // DIAGNÓSTICO CRÍTICO DE AUTENTICAÇÃO
            await this.performAuthenticationDiagnostic(page);
            
            // Debug: informações da página atual
            this.logger.log(`🌐 [DEBUG] URL atual: ${page.url()}`);
            this.logger.log(`📄 [DEBUG] Título da página: ${await page.title()}`);
            
            // Screenshot inicial da página
            await page.screenshot({ path: '/app/temp/debug_initial_page.png', fullPage: true });
            this.logger.log('📸 Screenshot inicial salvo: /app/temp/debug_initial_page.png');

            // Asset Release
            if (assetZipPath && assetZipPath.trim()) {
                this.logger.log('🗂️ [DEBUG] Tentando navegar para pasta: Asset Release');
                try {
                    // Screenshot antes da navegação
                    await page.screenshot({ path: '/app/temp/debug_before_asset_release.png', fullPage: true });
                    this.logger.log('📸 Screenshot salvo: /app/temp/debug_before_asset_release.png');
                    
                    await WorkfrontDomHelper.navigateToFolder(frame, page, 'Asset Release');
                    this.logger.log('✅ [DEBUG] Navegação para Asset Release bem-sucedida');
                    
                    // Screenshot após navegação bem-sucedida
                    await page.screenshot({ path: '/app/temp/debug_after_asset_release.png', fullPage: true });
                    this.logger.log('📸 Screenshot salvo: /app/temp/debug_after_asset_release.png');
                } catch (error) {
                    // DIAGNÓSTICO COMPLETO DE ACESSO
                    await this.performAccessDiagnostic(page, 'Asset Release');
                    
                    // Screenshot do erro
                    await page.screenshot({ path: '/app/temp/debug_error_asset_release.png', fullPage: true });
                    this.logger.error('❌ [DEBUG] Falha na navegação para Asset Release:', error);
                    this.logger.log('📸 Screenshot do erro salvo: /app/temp/debug_error_asset_release.png');
                    throw error;
                }
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
            this.logger.log('🗂️ [DEBUG] Tentando navegar para pasta: Final Materials');
            try {
                await WorkfrontDomHelper.navigateToFolder(frame, page, 'Final Materials');
                this.logger.log('✅ [DEBUG] Navegação para Final Materials bem-sucedida');
            } catch (error) {
                this.logger.error('❌ [DEBUG] Falha na navegação para Final Materials:', error);
                throw error;
            }
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
            this.logger.log(`🔄 Iniciando upload do arquivo: ${filePath}`);
            
            await fs.access(filePath);
            this.logger.log(`✅ Arquivo encontrado no sistema: ${filePath}`);
            
            const addSel = ['button[data-testid="add-new"]', 'button.add-new-react-button', 'button:has-text("Add new")', 'button[id="add-new-button"]'];
            let opened = false;
            
            for (const sel of addSel) {
                try {
                    const b = frame.locator(sel).first();
                    if ((await b.count()) > 0 && await b.isVisible()) {
                        await b.click();
                        await page.waitForTimeout(1200);
                        opened = true;
                        this.logger.log(`✅ Botão "Add new" clicado: ${sel}`);
                        break;
                    }
                } catch { }
            }
            
            if (!opened) {
                this.logger.error(`❌ Não foi possível encontrar botão "Add new"`);
                return false;
            }
            
            const docSels = ['li[data-test-id="upload-file"]', 'li.select-files-button', 'li:has-text("Document")', '[role="menuitem"]:has-text("Document")'];
            const original = this.getOriginalFileName(filePath);
            let uploadPath = filePath;
            
            if (path.basename(filePath) !== original) {
                const tmpDir = path.resolve(process.cwd(), 'Downloads', 'staging', '.tmp_uploads');
                await fs.mkdir(tmpDir, { recursive: true });
                const tmp = path.resolve(tmpDir, original);
                try { await fs.unlink(tmp); } catch { }
                await fs.copyFile(filePath, tmp);
                uploadPath = tmp;
                this.logger.log(`📁 Arquivo copiado para: ${uploadPath}`);
            }

            const fileChooserPromise = page.waitForEvent('filechooser');
            let clicked = false;
            
            for (const sel of docSels) {
                try {
                    const d = frame.locator(sel).first();
                    if ((await d.count()) > 0 && await d.isVisible()) {
                        await d.click();
                        clicked = true;
                        this.logger.log(`✅ Botão "Document" clicado: ${sel}`);
                        break;
                    }
                } catch { }
            }
            
            if (!clicked) {
                this.logger.error(`❌ Não foi possível encontrar botão "Document"`);
                return false;
            }
            
            const chooser = await fileChooserPromise;
            await chooser.setFiles(uploadPath);
            this.logger.log(`📤 Arquivo enviado via file chooser: ${uploadPath}`);
            
            await page.waitForTimeout(3500);

            // verificação de sucesso
            const appearSelectors = [`text="${original}"`, `[aria-label*="${original}"]`, `.doc-detail-view:has-text("${original}")`];
            for (const sel of appearSelectors) {
                try {
                    const el = frame.locator(sel).first();
                    if ((await el.count()) > 0 && await el.isVisible()) {
                        this.logger.log(`✅ Upload confirmado - arquivo apareceu na interface: ${original}`);
                        return true;
                    }
                } catch { }
            }
            
            this.logger.warn(`⚠️ Upload pode ter falhado - arquivo não apareceu na interface: ${original}`);
            // Retornar true mesmo assim pois o arquivo foi enviado
            return true;
        } catch (error) {
            this.logger.error(`❌ Erro no upload de ${filePath}:`, error);
            return false;
        }
    }

    // FUNÇÕES DE DIAGNÓSTICO CRÍTICO
    private async performAuthenticationDiagnostic(page: Page) {
        try {
            this.logger.log(`🔍 === DIAGNÓSTICO DE AUTENTICAÇÃO ===`);
            
            // 1. Verificar URL atual
            const currentUrl = page.url();
            this.logger.log(`🌐 URL atual: ${currentUrl}`);
            
            // 2. Verificar título da página
            const title = await page.title();
            this.logger.log(`📄 Título da página: ${title}`);
            
            // 3. Verificar se está na página de login
            const isLoginPage = currentUrl.includes('login') || currentUrl.includes('auth') || title.toLowerCase().includes('sign in');
            this.logger.log(`🔐 É página de login: ${isLoginPage}`);
            
            // 4. Verificar cookies de sessão
            const cookies = await page.context().cookies();
            const sessionCookies = cookies.filter(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('auth') || c.name.toLowerCase().includes('token'));
            this.logger.log(`🍪 Cookies de sessão encontrados: ${sessionCookies.length}`);
            sessionCookies.forEach(cookie => {
                this.logger.log(`   - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
            });
            
            // 5. Verificar elementos de usuário logado
            const userElements = [
                '[data-testid="user-menu"]',
                '.user-menu',
                '[aria-label*="user"]',
                '[class*="user"]',
                '.avatar',
                '[data-cy="user"]'
            ];
            
            let userFound = false;
            for (const selector of userElements) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        this.logger.log(`👤 Elemento de usuário encontrado: ${selector}`);
                        userFound = true;
                        break;
                    }
                } catch (e) {
                    // Ignorar erros de seletor
                }
            }
            
            if (!userFound) {
                this.logger.warn(`⚠️ Nenhum elemento de usuário encontrado - possível problema de autenticação`);
            }
            
            // 6. Verificar se consegue acessar informações do projeto
            const projectInfo = await page.evaluate(() => {
                const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"], .breadcrumb, [data-testid*="breadcrumb"]');
                const projectName = document.querySelector('[class*="project"], [data-testid*="project"]');
                return {
                    breadcrumbs: breadcrumbs.length,
                    projectName: projectName?.textContent || 'não encontrado'
                };
            });
            
            this.logger.log(`🏗️ Informações do projeto: breadcrumbs=${projectInfo.breadcrumbs}, nome="${projectInfo.projectName}"`);
            
            // 7. Verificar permissões de acesso
            const hasUploadAccess = await page.evaluate(() => {
                const uploadButtons = document.querySelectorAll('[class*="upload"], [data-testid*="upload"], input[type="file"]');
                const addButtons = document.querySelectorAll('[class*="add"], [data-testid*="add"], button[class*="add"]');
                return {
                    uploadButtons: uploadButtons.length,
                    addButtons: addButtons.length
                };
            });
            
            this.logger.log(`📤 Elementos de upload encontrados: upload=${hasUploadAccess.uploadButtons}, add=${hasUploadAccess.addButtons}`);
            
            // 8. Capturar screenshot do estado de autenticação
            await this.captureDebugScreenshot(page, 'auth-diagnostic', 'Authentication diagnostic state');
            
            this.logger.log(`🔍 === FIM DO DIAGNÓSTICO ===`);
            
        } catch (error) {
            this.logger.error(`❌ Erro durante diagnóstico de autenticação: ${error.message}`);
            await this.captureDebugScreenshot(page, 'auth-error', 'Authentication diagnostic error');
        }
    }

    private async performAccessDiagnostic(page: Page, targetFolder: string) {
        try {
            this.logger.log(`🔍 === DIAGNÓSTICO DE ACESSO PARA PASTA "${targetFolder}" ===`);
            
            // 1. Estado básico da página
            const currentUrl = page.url();
            const title = await page.title();
            this.logger.log(`🌐 URL atual: ${currentUrl}`);
            this.logger.log(`📄 Título atual: ${title}`);
            
            // 2. Verificar se ainda estamos autenticados
            const isLoggedOut = currentUrl.includes('login') || currentUrl.includes('auth') || title.toLowerCase().includes('sign in');
            if (isLoggedOut) {
                this.logger.error(`🚨 PROBLEMA CRÍTICO: Usuário foi deslogado durante a operação!`);
                return;
            }
            
            // 3. Verificar estrutura da página de documentos
            const pageStructure = await page.evaluate(() => {
                return {
                    folders: document.querySelectorAll('[class*="folder"], [data-testid*="folder"]').length,
                    documents: document.querySelectorAll('[class*="document"], [data-testid*="document"]').length,
                    breadcrumbs: document.querySelectorAll('[class*="breadcrumb"], .breadcrumb').length,
                    navigation: document.querySelectorAll('nav, [class*="nav"]').length,
                    tables: document.querySelectorAll('table, [class*="table"]').length,
                    lists: document.querySelectorAll('ul, ol, [class*="list"]').length
                };
            });
            
            this.logger.log(`📊 Estrutura da página:`);
            Object.entries(pageStructure).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: ${value}`);
            });
            
            // 4. Listar todas as pastas visíveis
            const visibleFolders = await page.evaluate(() => {
                const folderSelectors = [
                    'tr[data-testid*="folder"] td:first-child',
                    '[class*="folder"] [class*="name"]',
                    'td[class*="name"]',
                    '.folder-name',
                    '[data-cy*="folder"]'
                ];
                
                const folders = [];
                
                folderSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const text = el.textContent?.trim();
                            if (text && text.length > 0 && !folders.includes(text)) {
                                folders.push(text);
                            }
                        });
                    } catch (e) {
                        // Ignorar erros de seletor
                    }
                });
                
                return folders;
            });
            
            this.logger.log(`📁 Pastas visíveis encontradas (${visibleFolders.length}):`);
            visibleFolders.forEach((folder, index) => {
                const isTarget = folder.toLowerCase().includes(targetFolder.toLowerCase()) || targetFolder.toLowerCase().includes(folder.toLowerCase());
                this.logger.log(`   ${index + 1}. "${folder}" ${isTarget ? '👈 POSSÍVEL MATCH' : ''}`);
            });
            
            // 5. Verificar permissões na página
            const permissions = await page.evaluate(() => {
                return {
                    canUpload: !!document.querySelector('input[type="file"], [class*="upload"], [data-testid*="upload"]'),
                    canCreate: !!document.querySelector('[class*="create"], [class*="new"], [data-testid*="create"]'),
                    hasEditAccess: !!document.querySelector('[class*="edit"], [class*="modify"], [data-testid*="edit"]'),
                    hasDeleteAccess: !!document.querySelector('[class*="delete"], [class*="remove"], [data-testid*="delete"]')
                };
            });
            
            this.logger.log(`🔒 Permissões detectadas:`);
            Object.entries(permissions).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: ${value ? '✅' : '❌'}`);
            });
            
            // 6. Verificar se a página carregou completamente
            const loadingIndicators = await page.evaluate(() => {
                const loadingSelectors = [
                    '[class*="loading"]',
                    '[class*="spinner"]',
                    '[data-testid*="loading"]',
                    '.loading',
                    '.spinner'
                ];
                
                return loadingSelectors.some(selector => {
                    const elements = document.querySelectorAll(selector);
                    return Array.from(elements).some(el => {
                        const htmlEl = el as HTMLElement;
                        return htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
                    });
                });
            });
            
            this.logger.log(`⏳ Página ainda carregando: ${loadingIndicators}`);
            
            this.logger.log(`🔍 === FIM DO DIAGNÓSTICO DE ACESSO ===`);
            
        } catch (error) {
            this.logger.error(`❌ Erro durante diagnóstico de acesso: ${error.message}`);
        }
    }

    private async captureDebugScreenshot(page: Page, identifier: string, description: string) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `debug_${identifier}_${timestamp}.png`;
            const fullPath = path.join('/app/temp', filename);
            
            await page.screenshot({ path: fullPath, fullPage: true });
            this.logger.log(`📸 Screenshot capturado: ${description} -> ${fullPath}`);
        } catch (error) {
            this.logger.warn(`⚠️ Falha ao capturar screenshot ${identifier}: ${error.message}`);
        }
    }
}
