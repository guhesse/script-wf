import { Injectable, Logger } from '@nestjs/common';
import { ShareAutomationService } from './share-automation.service';
import { UploadAutomationService } from './upload-automation.service';
import { StatusAutomationService } from './status-automation.service';
import { HoursAutomationService } from './hours-automation.service';
import { CommentService } from '../pdf/comment.service';
import { CommentType } from '../pdf/dto/pdf.dto';
import { Browser, Page } from 'playwright';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';

export enum WorkflowAction {
    SHARE = 'share',
    UPLOAD = 'upload',
    COMMENT = 'comment',
    STATUS = 'status',
    HOURS = 'hours'
}

export interface WorkflowStep {
    action: WorkflowAction;
    enabled: boolean;
    params?: any;
}

export interface WorkflowResult {
    action: WorkflowAction;
    success: boolean;
    message?: string;
    error?: string;
    duration?: number;
}

export interface TimelineConfig {
    projectUrl: string;
    steps: WorkflowStep[];
    headless?: boolean;
    stopOnError?: boolean;
}

@Injectable()
export class TimelineService {
    private readonly logger = new Logger(TimelineService.name);

    // Configuração de estabilização pós-upload (ajustável via ENV)
    private readonly MIN_DELAY_AFTER_UPLOAD_MS = parseInt(process.env.WF_MIN_DELAY_AFTER_UPLOAD_MS || '8000', 10);
    private readonly DELAY_PER_FILE_AFTER_UPLOAD_MS = parseInt(process.env.WF_DELAY_PER_FILE_MS || '1200', 10);
    private readonly MAX_DELAY_AFTER_UPLOAD_MS = parseInt(process.env.WF_MAX_DELAY_AFTER_UPLOAD_MS || '20000', 10);

    constructor(
        private readonly shareService: ShareAutomationService,
        private readonly uploadService: UploadAutomationService,
        private readonly statusService: StatusAutomationService,
        private readonly hoursService: HoursAutomationService,
        private readonly commentService: CommentService,
    ) { }

    /**
     * Executar workflow customizado de ações sequenciais
     */
    async executeWorkflow(config: TimelineConfig): Promise<{
        success: boolean;
        results: WorkflowResult[];
        summary: { total: number; successful: number; failed: number; skipped: number };
    }> {
        const { projectUrl, steps, headless = false, stopOnError = false } = config;
        const results: WorkflowResult[] = [];
        let successful = 0;
        let failed = 0;
        let skipped = 0;

        // Detectar se podemos rodar em sessão única (qualquer ação que interaja com a UI do projeto)
        const sessionActions = steps.filter(s => s.enabled && [
            WorkflowAction.UPLOAD,
            WorkflowAction.SHARE,
            WorkflowAction.COMMENT,
            WorkflowAction.STATUS,
            WorkflowAction.HOURS
        ].includes(s.action));
        const useSessionMode = sessionActions.length > 0;

    let browser: Browser | null = null; let page: Page | null = null; let frame: any = null;
    let lastUploadCompletedAt: number | null = null; // timestamp fim do último upload
    let lastUploadPlannedDelay: number = 0;          // atraso planejado calculado

        this.logger.log('🎬 === INICIANDO WORKFLOW DE AÇÕES ===');
        this.logger.log(`📍 Projeto: ${projectUrl}`);
        this.logger.log(`📋 Total de steps: ${steps.length}`);

        if (useSessionMode) {
            try {
                this.logger.log('🧩 Abrindo browser otimizado (sessão única) para ações: ' + sessionActions.map(a => a.action).join(', '));
                const { browser: b, context } = await createOptimizedContext({ headless, storageStatePath: await WorkfrontDomHelper.ensureStateFile(), viewport: { width: 1366, height: 900 } });
                browser = b;
                page = await context.newPage();
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);
                frame = WorkfrontDomHelper.frameLocator(page);
                await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);
            } catch (e: any) {
                this.logger.error('❌ Falha ao preparar sessão única otimizada: ' + e?.message);
                browser = null; page = null; frame = null;
            }
        }

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            if (!step.enabled) {
                this.logger.log(`⏭️ [${i + 1}/${steps.length}] Pulando: ${step.action}`);
                skipped++;
                continue;
            }

            // Aguarda estabilização pós upload antes de SHARE ou COMMENT se necessário
            if (lastUploadCompletedAt && [WorkflowAction.SHARE, WorkflowAction.COMMENT].includes(step.action)) {
                const elapsed = Date.now() - lastUploadCompletedAt;
                if (elapsed < lastUploadPlannedDelay) {
                    const remaining = lastUploadPlannedDelay - elapsed;
                    this.logger.log(`⏳ Aguardando ${remaining}ms (estabilização pós upload: planejado ${lastUploadPlannedDelay}ms, decorrido ${elapsed}ms)`);
                    try { await (page ?? { waitForTimeout: (ms:number)=>new Promise(r=>setTimeout(r,ms)) }).waitForTimeout(remaining); } catch { await new Promise(r => setTimeout(r, remaining)); }
                }
            }

            this.logger.log(`🎯 [${i + 1}/${steps.length}] Executando: ${step.action}`);
            const startTime = Date.now();

            try {
                let result: { success: boolean; message?: string };
                if (browser && page && frame && [
                    WorkflowAction.UPLOAD,
                    WorkflowAction.SHARE,
                    WorkflowAction.COMMENT,
                    WorkflowAction.STATUS,
                    WorkflowAction.HOURS
                ].includes(step.action)) {
                    result = await this.executeStepInSession(projectUrl, step, { page, frame, headless });
                } else {
                    result = await this.executeStep(projectUrl, step, headless);
                }
                const duration = Date.now() - startTime;

                results.push({
                    action: step.action,
                    success: result.success,
                    message: result.message,
                    duration
                });

                if (result.success) {
                    successful++;
                    this.logger.log(`✅ ${step.action} concluído em ${duration}ms`);
                    if (step.action === WorkflowAction.UPLOAD) {
                        lastUploadCompletedAt = Date.now();
                        const fileCount = this.estimateUploadFileCount(step);
                        const planned = Math.min(
                            this.MIN_DELAY_AFTER_UPLOAD_MS + (fileCount * this.DELAY_PER_FILE_AFTER_UPLOAD_MS),
                            this.MAX_DELAY_AFTER_UPLOAD_MS
                        );
                        lastUploadPlannedDelay = planned;
                        this.logger.log(`🕒 Upload finalizado. Arquivos estimados=${fileCount}. Delay planejado para estabilização: ${planned}ms`);
                    }
                } else {
                    failed++;
                    this.logger.error(`❌ ${step.action} falhou: ${result.message}`);
                    if (stopOnError) {
                        this.logger.warn('⛔ Parando workflow devido a erro');
                        break;
                    }
                }

                // Aguarda conclusão completa antes de prosseguir para o próximo
                this.logger.log(`⏳ Aguardando conclusão completa de ${step.action}...`);

            } catch (error: any) {
                const duration = Date.now() - startTime;
                failed++;

                results.push({
                    action: step.action,
                    success: false,
                    error: error?.message || 'Erro desconhecido',
                    duration
                });

                this.logger.error(`❌ Erro ao executar ${step.action}: ${error?.message}`);

                if (stopOnError) {
                    this.logger.warn('⛔ Parando workflow devido a erro');
                    break;
                }
            }
        }

        const summary = {
            total: steps.filter(s => s.enabled).length,
            successful,
            failed,
            skipped
        };

        // (Mantido para futura otimização: poderíamos separar fases caso necessário)

        // Encerrar sessão única
    if (browser) { try { await browser.close(); } catch { } }

        this.logger.log('📊 === WORKFLOW FINALIZADO ===');
        this.logger.log(`✅ Sucessos: ${successful}`);
        this.logger.log(`❌ Falhas: ${failed}`);
        this.logger.log(`⏭️ Pulados: ${skipped}`);

        return {
            success: failed === 0,
            results,
            summary
        };
    }

    /** Calcula número de arquivos do step de upload para definir delay dinâmico pós-processamento */
    private estimateUploadFileCount(step: WorkflowStep): number {
        if (step.action !== WorkflowAction.UPLOAD) return 0;
        const p = step.params || {};
        let count = 0;
        if (p.assetZipPath && String(p.assetZipPath).trim()) count += 1;
        if (Array.isArray(p.finalMaterialPaths)) count += p.finalMaterialPaths.length;
        return count;
    }

    /**
     * Executar um step individual do workflow
     */
    private async executeStep(
        projectUrl: string,
        step: WorkflowStep,
        headless: boolean
    ): Promise<{ success: boolean; message?: string }> {

        switch (step.action) {
            case WorkflowAction.SHARE:
                return await this.executeShareStep(projectUrl, step.params, headless);

            case WorkflowAction.UPLOAD:
                return await this.executeUploadStep(projectUrl, step.params, headless);

            case WorkflowAction.COMMENT:
                return await this.executeCommentStep(projectUrl, step.params, headless);

            case WorkflowAction.STATUS:
                return await this.executeStatusStep(projectUrl, step.params, headless);

            case WorkflowAction.HOURS:
                return await this.executeHoursStep(projectUrl, step.params, headless);

            default:
                return { success: false, message: `Ação desconhecida: ${step.action}` };
        }
    }

    private async executeShareStep(projectUrl: string, params: any, headless: boolean) {
        const { selections, selectedUser = 'carol' } = params || {};
        if (!selections || selections.length === 0) {
            return { success: false, message: 'Nenhum arquivo para compartilhar' };
        }

        const result = await this.shareService.shareDocuments(
            projectUrl,
            selections,
            selectedUser,
            headless
        );

        return {
            success: result.summary.errors === 0,
            message: `${result.summary.success} compartilhados, ${result.summary.errors} erros`
        };
    }

    private async executeUploadStep(projectUrl: string, params: any, headless: boolean) {
        const { assetZipPath, finalMaterialPaths, selectedUser = 'carol' } = params || {};

        if (!assetZipPath && (!finalMaterialPaths || finalMaterialPaths.length === 0)) {
            return { success: false, message: 'Nenhum arquivo para upload' };
        }

        const result = await this.uploadService.executeUploadPlan({
            projectUrl,
            selectedUser,
            assetZipPath: assetZipPath || '',
            finalMaterialPaths: finalMaterialPaths || [],
            headless
        });

        return {
            success: result.success,
            message: result.message
        };
    }

    private async executeCommentStep(projectUrl: string, params: any, headless: boolean) {
        const { folder, fileName, commentType, selectedUser = 'carol', commentMode, rawHtml } = params || {};

        if (!folder || !fileName) {
            return { success: false, message: 'Pasta e arquivo são obrigatórios para comentário' };
        }

        try {
            const result = await this.commentService.addComment({
                projectUrl,
                folderName: folder,
                fileName,
                commentType: this.normalizeCommentType(commentType),
                selectedUser,
                headless,
                commentMode,
                rawHtml
            } as any);

            return {
                success: result.success,
                message: result.message
            };
        } catch (error: any) {
            return {
                success: false,
                message: error?.message || 'Erro ao adicionar comentário'
            };
        }
    }

    // --- Sessão única helpers ---
    private async executeStepInSession(projectUrl: string, step: WorkflowStep, ctx: { page: Page; frame: any; headless: boolean }): Promise<{ success: boolean; message?: string }> {
        switch (step.action) {
            case WorkflowAction.UPLOAD:
                return await this.uploadInSession(projectUrl, step.params, ctx);
            case WorkflowAction.SHARE:
                return await this.shareInSession(projectUrl, step.params, ctx);
            case WorkflowAction.COMMENT:
                return await this.commentInSession(projectUrl, step.params, ctx);
            case WorkflowAction.STATUS: // <-- novo
                return await this.statusInSession(projectUrl, step.params, ctx);
            case WorkflowAction.HOURS: // <-- novo para horas em sessão
                return await this.hoursInSession(projectUrl, step.params, ctx);
            default:
                return { success: false, message: 'Ação não suportada em sessão' };
        }
    }

    private async uploadInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { assetZipPath, finalMaterialPaths = [], selectedUser = 'carol' } = params || {};
        if (!assetZipPath && finalMaterialPaths.length === 0) return { success: false, message: 'Nenhum arquivo para upload' };
        try {
            // Asset Release
            if (assetZipPath) {
                await this.navigateAndUploadSingle(ctx.frame, ctx.page, 'Asset Release', assetZipPath);
            }
            // Final Materials: multi-upload dos não-PDF em um diálogo se possível
            const pdfs = finalMaterialPaths.filter((p: string) => p.toLowerCase().endsWith('.pdf'));
            const others = finalMaterialPaths.filter((p: string) => !p.toLowerCase().endsWith('.pdf'));
            if (others.length > 0) {
                await this.navigateAndUploadMultiple(ctx.frame, ctx.page, 'Final Materials', others);
            }
            if (pdfs.length > 0) {
                for (const pdf of pdfs) {
                    await this.navigateAndUploadSingle(ctx.frame, ctx.page, 'Final Materials', pdf);
                }
            }
            return { success: true, message: 'Upload(s) concluído(s) em sessão' };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha no upload em sessão' };
        }
    }

    private async shareInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { selections, selectedUser = 'carol' } = params || {};
        if (!selections || selections.length === 0) return { success: false, message: 'Nenhum arquivo para compartilhar' };
        try {
            const out = await this.shareService.shareSelectionsInOpenSession({ page: ctx.page, frame: ctx.frame, projectUrl, selections, selectedUser });
            return { success: out.summary.errors === 0, message: `${out.summary.success} ok / ${out.summary.errors} erros` };
        } catch (e: any) { return { success: false, message: e?.message }; }
    }

    private async commentInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { folder, fileName, commentType, selectedUser = 'carol', commentMode, rawHtml } = params || {};
        if (!folder || !fileName) return { success: false, message: 'Dados insuficientes para comentário' };
        try {
            // navegar para pasta + selecionar doc (reusa shareService helpers)
            if (folder && folder !== 'root') {
                await this.shareService.navigateToFolder(ctx.frame, ctx.page, folder);
            }
            await this.shareService.selectDocument(ctx.frame, ctx.page, fileName);
            const result = await this.commentService.addCommentUsingOpenPage({ frameLocator: ctx.frame, page: ctx.page, folderName: folder, fileName, commentType: this.normalizeCommentType(commentType), selectedUser, commentMode, rawHtml });
            return { success: result.success, message: result.message };
        } catch (e: any) { return { success: false, message: e?.message || 'Falha comentário' }; }
    }

    private async statusInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { deliverableStatus, maxAttempts, retryDelay } = params || {};
        if (!deliverableStatus) return { success: false, message: 'deliverableStatus obrigatório' };
        try {
            const out = await this.statusService.updateDeliverableStatusInSession({
                page: ctx.page,
                frame: ctx.frame,
                projectUrl,
                deliverableStatus,
                maxAttempts,
                retryDelay
            });
            return { success: out.success, message: out.message };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha status sessão' };
        }
    }

    private async hoursInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { hours = 0.3, note, taskName, maxAttempts, retryDelay } = params || {};
        try {
            const out = await this.hoursService.logHoursInOpenSession({
                page: ctx.page,
                frame: ctx.frame,
                projectUrl,
                hours,
                note,
                taskName,
                maxAttempts,
                retryDelay
            });
            return { success: out.success, message: out.message };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha horas sessão' };
        }
    }

    private normalizeCommentType(raw: string | undefined): CommentType {
        if (!raw) return CommentType.ASSET_RELEASE;
        const map: Record<string, CommentType> = {
            assetrelease: CommentType.ASSET_RELEASE,
            finalmaterials: CommentType.FINAL_MATERIALS,
            approval: CommentType.APPROVAL
        };
        return map[raw.toLowerCase()] || CommentType.ASSET_RELEASE;
    }

    private async navigateAndUploadSingle(frame: any, page: Page, folder: string, filePath: string) {
        await this.shareService.navigateToFolder(frame, page, folder);
        await this.uploadThroughDialog(frame, page, [filePath]);
    }

    private async navigateAndUploadMultiple(frame: any, page: Page, folder: string, filePaths: string[]) {
        await this.shareService.navigateToFolder(frame, page, folder);
        await this.uploadThroughDialog(frame, page, filePaths);
    }

    private async uploadThroughDialog(frame: any, page: Page, filePaths: string[]) {
        this.logger.log(`📁 Upload simples de ${filePaths.length} arquivo(s)`);

        const addSelectors = [
            'button[data-testid="add-new"]',
            'button.add-new-react-button',
            'button:has-text("Add new")',
            'button[id="add-new-button"]'
        ];
        let opened = false;
        for (const sel of addSelectors) {
            try {
                const btn = frame.locator(sel).first();
                if ((await btn.count()) > 0 && await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(1000); // espera ajustada
                    opened = true;
                    break;
                }
            } catch { }
        }
        if (!opened) throw new Error('Botão Add new não encontrado');

        const docSelectors = [
            'li[data-test-id="upload-file"]',
            'li.select-files-button',
            'li:has-text("Document")',
            '[role="menuitem"]:has-text("Document")'
        ];
        let clicked = false;
        const chooserPromise = page.waitForEvent('filechooser');
        for (const sel of docSelectors) {
            try {
                const it = frame.locator(sel).first();
                if ((await it.count()) > 0 && await it.isVisible()) {
                    await it.click();
                    clicked = true;
                    break;
                }
            } catch { }
        }
        if (!clicked) throw new Error('Opção de upload não encontrada');

        const chooser = await chooserPromise;
        await chooser.setFiles(filePaths);

        // Tempo de espera pós-seleção (dinâmico)
        const waitMs = 2500 + (filePaths.length * 1200);
        this.logger.log(`⏳ Aguardando ${waitMs}ms para processamento inicial dos arquivos...`);
        await page.waitForTimeout(waitMs);
    }

    private async executeStatusStep(projectUrl: string, params: any, headless: boolean) {
        const { deliverableStatus } = params || {};

        if (!deliverableStatus) {
            return { success: false, message: 'deliverableStatus é obrigatório' };
        }

        const result = await this.statusService.updateDeliverableStatus({
            projectUrl,
            deliverableStatus,
            headless
        });

        return {
            success: result.success,
            message: result.message
        };
    }

    private async executeHoursStep(projectUrl: string, params: any, headless: boolean) {
        const { hours, note, taskName } = params || {};

        if (!hours || hours <= 0) {
            return { success: false, message: 'Horas deve ser maior que 0' };
        }

        const result = await this.hoursService.logHours({
            projectUrl,
            hours,
            note,
            taskName,
            headless
        });

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Criar workflow padrão para compartilhamento e comentário
     */
    createShareAndCommentWorkflow(
        projectUrl: string,
        selections: any[],
        selectedUser: string = 'carol'
    ): TimelineConfig {
        return {
            projectUrl,
            steps: [
                {
                    action: WorkflowAction.SHARE,
                    enabled: true,
                    params: { selections, selectedUser }
                },
                {
                    action: WorkflowAction.COMMENT,
                    enabled: true,
                    params: {
                        folder: selections[0]?.folder,
                        fileName: selections[0]?.fileName,
                        commentType: CommentType.ASSET_RELEASE,
                        selectedUser
                    }
                }
            ],
            headless: false,
            stopOnError: false
        };
    }

    /**
     * Criar workflow padrão para upload completo
     */
    createUploadWorkflow(
        projectUrl: string,
        assetZipPath: string,
        finalMaterialPaths: string[],
        selectedUser: string = 'carol'
    ): TimelineConfig {
        return {
            projectUrl,
            steps: [
                {
                    action: WorkflowAction.UPLOAD,
                    enabled: true,
                    params: { assetZipPath, finalMaterialPaths, selectedUser }
                },
                {
                    action: WorkflowAction.STATUS,
                    enabled: false, // Desabilitado por padrão
                    params: { deliverableStatus: 'Delivered' }
                },
                {
                    action: WorkflowAction.HOURS,
                    enabled: false, // Desabilitado por padrão
                    params: { hours: 1, note: 'Upload realizado' }
                }
            ],
            headless: false,
            stopOnError: true
        };
    }
}
