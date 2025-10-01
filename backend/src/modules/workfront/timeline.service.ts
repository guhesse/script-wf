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
import { ProgressService } from './progress.service';
import { resolveHeadless } from './utils/headless.util';
import { UploadJobsService } from './upload-jobs.service';
import * as path from 'path';

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
    userId?: string;
    jobId?: string; // se já existe job de upload pré-criado
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
        private readonly progress: ProgressService,
        private readonly uploadJobs: UploadJobsService,
    ) { }

    /**
     * Executar workflow customizado de ações sequenciais
     */
    async executeWorkflow(config: TimelineConfig): Promise<{
        success: boolean;
        results: WorkflowResult[];
        summary: { total: number; successful: number; failed: number; skipped: number };
    }> {
    // Headless padrão controlado por variável de ambiente WF_HEADLESS_DEFAULT (default 'true')
    const { projectUrl, steps, headless = resolveHeadless(), stopOnError = false, userId, jobId: existingJobId } = config;
        let workflowJobId = existingJobId;
        if (!workflowJobId && userId) {
            const uploadStep = steps.find(s => s.enabled && s.action === WorkflowAction.UPLOAD);
            if (uploadStep) {
                const p = uploadStep.params || {};
                const staged = { assetZip: p.assetZipPath, finalMaterials: p.finalMaterialPaths };
                if (staged.assetZip || (Array.isArray(staged.finalMaterials) && staged.finalMaterials.length)) {
                    const job = this.uploadJobs.createJob({ userId, projectUrl, staged });
                    workflowJobId = job.id;
                    this.logger.log(`🆔 Job criado automaticamente para workflow: ${workflowJobId}`);
                }
            }
        }
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
    this.progress.publish({ phase: 'start', action: 'workflow', message: 'Iniciando workflow', projectUrl, extra: { total: steps.length } });
        this.logger.log(`📍 Projeto: ${projectUrl}`);
        this.logger.log(`📋 Total de steps: ${steps.length}`);

        // Construir plano simples de tasks (ações habilitadas)
        const tasks = steps.map((s, idx) => s.enabled ? ({ action: s.action, stepIndex: idx }) : null)
            .filter(Boolean) as { action: WorkflowAction; stepIndex: number }[];
        this.progress.publish({ phase: 'plan', action: 'workflow', message: 'Plano de workflow calculado', projectUrl, extra: { tasks, totalTasks: tasks.length } });

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
                this.progress.publish({ phase: 'skip', action: step.action, stepIndex: i, totalSteps: steps.length, message: 'Step pulado', projectUrl });
                skipped++;
                continue;
            }

            // Aguarda estabilização pós upload antes de SHARE ou COMMENT se necessário
            if (lastUploadCompletedAt && [WorkflowAction.SHARE, WorkflowAction.COMMENT].includes(step.action)) {
                const elapsed = Date.now() - lastUploadCompletedAt;
                if (elapsed < lastUploadPlannedDelay) {
                    const remaining = lastUploadPlannedDelay - elapsed;
                    this.logger.log(`⏳ Aguardando ${remaining}ms (estabilização pós upload: planejado ${lastUploadPlannedDelay}ms, decorrido ${elapsed}ms)`);
                    this.progress.publish({ phase: 'delay', action: step.action, stepIndex: i, totalSteps: steps.length, message: `Aguardando estabilização pós upload (${remaining}ms)`, projectUrl, extra: { remaining, planned: lastUploadPlannedDelay } });
                    try { await (page ?? { waitForTimeout: (ms:number)=>new Promise(r=>setTimeout(r,ms)) }).waitForTimeout(remaining); } catch { await new Promise(r => setTimeout(r, remaining)); }
                }
            }

            this.logger.log(`🎯 [${i + 1}/${steps.length}] Executando: ${step.action}`);
            this.progress.publish({ phase: 'start', action: step.action, stepIndex: i, totalSteps: steps.length, message: 'Iniciando step', projectUrl, extra: { params: step.params } });
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
                    this.progress.publish({ phase: 'success', action: step.action, stepIndex: i, totalSteps: steps.length, message: 'Step concluído', projectUrl, durationMs: duration, extra: { message: result.message } });
                    if (step.action === WorkflowAction.UPLOAD) {
                        lastUploadCompletedAt = Date.now();
                        const fileCount = this.estimateUploadFileCount(step);
                        if (workflowJobId) this.uploadJobs.markCompleted(workflowJobId, { message: result.message, fileCount });
                        const planned = Math.min(
                            this.MIN_DELAY_AFTER_UPLOAD_MS + (fileCount * this.DELAY_PER_FILE_AFTER_UPLOAD_MS),
                            this.MAX_DELAY_AFTER_UPLOAD_MS
                        );
                        lastUploadPlannedDelay = planned;
                        this.logger.log(`🕒 Upload finalizado. Arquivos estimados=${fileCount}. Delay planejado para estabilização: ${planned}ms`);
                        this.progress.publish({ phase: 'info', action: 'upload', stepIndex: i, totalSteps: steps.length, message: 'Upload finalizado - aguardará estabilização', projectUrl, extra: { fileCount, plannedDelay: planned } });
                    }
                } else {
                    if (step.action === WorkflowAction.UPLOAD && workflowJobId) this.uploadJobs.markFailed(workflowJobId, result.message);
                    failed++;
                    this.logger.error(`❌ ${step.action} falhou: ${result.message}`);
                    this.progress.publish({ phase: 'error', action: step.action, stepIndex: i, totalSteps: steps.length, message: result.message || 'Erro', projectUrl, durationMs: duration });
                    if (stopOnError) {
                        this.logger.warn('⛔ Parando workflow devido a erro');
                        this.progress.publish({ phase: 'error', action: 'workflow', stepIndex: i, totalSteps: steps.length, message: 'Interrompido por erro', projectUrl });
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
    this.progress.publish({ phase: 'success', action: 'workflow', message: 'Workflow finalizado', projectUrl, extra: { summary } });
        this.logger.log(`✅ Sucessos: ${successful}`);
        this.logger.log(`❌ Falhas: ${failed}`);
        this.logger.log(`⏭️ Pulados: ${skipped}`);

        return {
            success: failed === 0,
            results,
            summary,
            jobId: workflowJobId
        } as any;
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
            this.progress.publish({ phase: 'info', action: 'upload', message: 'Uploads concluídos', projectUrl });
            return { success: true, message: 'Upload(s) concluído(s) em sessão' };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha no upload em sessão' };
        }
    }

    private async shareInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { selections, selectedUser = 'carol' } = params || {};
        if (!selections || selections.length === 0) return { success: false, message: 'Nenhum arquivo para compartilhar' };
        try {
            this.progress.publish({ phase: 'info', action: 'share', message: `Iniciando compartilhamento de ${selections.length} arquivo(s)`, projectUrl });
            const out = await this.shareService.shareSelectionsInOpenSession({ page: ctx.page, frame: ctx.frame, projectUrl, selections, selectedUser });
            this.progress.publish({ phase: 'success', action: 'share', message: `Compartilhamento concluído (${out.summary.success} ok / ${out.summary.errors} erros)`, projectUrl, extra: out.summary });
            return { success: out.summary.errors === 0, message: `${out.summary.success} ok / ${out.summary.errors} erros` };
        } catch (e: any) { return { success: false, message: e?.message }; }
    }

    private async commentInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { folder, fileName, commentType, selectedUser = 'carol', commentMode, rawHtml } = params || {};
        if (!folder || !fileName) return { success: false, message: 'Dados insuficientes para comentário' };
        try {
            this.progress.publish({ phase: 'info', action: 'comment', message: `Preparando comentário ${fileName}`, projectUrl });
            // navegar para pasta + selecionar doc (reusa shareService helpers)
            if (folder && folder !== 'root') {
                this.progress.publish({ phase: 'info', action: 'comment', message: `Navegando para pasta ${folder}`, projectUrl });
                await this.shareService.navigateToFolder(ctx.frame, ctx.page, folder);
            }
            this.progress.publish({ phase: 'info', action: 'comment', message: `Selecionando documento ${fileName}`, projectUrl });
            await this.shareService.selectDocument(ctx.frame, ctx.page, fileName);
            const result = await this.commentService.addCommentUsingOpenPage({ frameLocator: ctx.frame, page: ctx.page, folderName: folder, fileName, commentType: this.normalizeCommentType(commentType), selectedUser, commentMode, rawHtml });
            this.progress.publish({ phase: result.success ? 'success' : 'error', action: 'comment', message: result.message, projectUrl });
            return { success: result.success, message: result.message };
        } catch (e: any) { return { success: false, message: e?.message || 'Falha comentário' }; }
    }

    private async statusInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { deliverableStatus, maxAttempts, retryDelay } = params || {};
        if (!deliverableStatus) return { success: false, message: 'deliverableStatus obrigatório' };
        try {
            this.progress.publish({ phase: 'info', action: 'status', message: 'Atualizando status (sessão)', projectUrl });
            const out = await this.statusService.updateDeliverableStatusInSession({
                page: ctx.page,
                frame: ctx.frame,
                projectUrl,
                deliverableStatus,
                maxAttempts,
                retryDelay
            });
            this.progress.publish({ phase: out.success ? 'success' : 'error', action: 'status', message: out.message, projectUrl });
            return { success: out.success, message: out.message };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha status sessão' };
        }
    }

    private async hoursInSession(projectUrl: string, params: any, ctx: { page: Page; frame: any; headless: boolean }) {
        const { hours = 0.3, note, taskName, maxAttempts, retryDelay } = params || {};
        try {
            this.progress.publish({ phase: 'info', action: 'hours', message: 'Lançando horas (sessão)', projectUrl });
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
            this.progress.publish({ phase: out.success ? 'success' : 'error', action: 'hours', message: out.message, projectUrl });
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
        try {
            // DIAGNÓSTICO CRÍTICO ANTES DA NAVEGAÇÃO
            await this.performAuthenticationDiagnostic(page);
            
            this.logger.log(`�️ [TIMELINE] Tentando navegar para pasta: ${folder}`);
            await this.shareService.navigateToFolder(frame, page, folder);
            this.logger.log(`✅ [TIMELINE] Navegação bem-sucedida para: ${folder}`);
            
            await this.uploadThroughDialog(frame, page, [filePath]);
            
            // VERIFICAÇÃO CRÍTICA: Upload realmente funcionou?
            await this.verifyUploadSuccess(frame, page, filePath, folder);
        } catch (error) {
            // DIAGNÓSTICO COMPLETO QUANDO FALHA
            await this.performAccessDiagnostic(page, folder);
            this.logger.error(`❌ [TIMELINE] Falha na navegação para ${folder}: ${error.message}`);
            throw error;
        }
    }

    private async navigateAndUploadMultiple(frame: any, page: Page, folder: string, filePaths: string[]) {
        try {
            // DIAGNÓSTICO CRÍTICO ANTES DA NAVEGAÇÃO
            await this.performAuthenticationDiagnostic(page);
            
            this.logger.log(`🖼️ [TIMELINE] Tentando navegar para pasta: ${folder} (${filePaths.length} arquivos)`);
            await this.shareService.navigateToFolder(frame, page, folder);
            this.logger.log(`✅ [TIMELINE] Navegação bem-sucedida para: ${folder}`);
            
            await this.uploadThroughDialog(frame, page, filePaths);
        } catch (error) {
            // DIAGNÓSTICO COMPLETO QUANDO FALHA
            await this.performAccessDiagnostic(page, folder);
            this.logger.error(`❌ [TIMELINE] Falha na navegação para ${folder}: ${error.message}`);
            throw error;
        }
    }

    private async uploadThroughDialog(frame: any, page: Page, filePaths: string[]) {
        this.logger.log(`📁 Upload simples de ${filePaths.length} arquivo(s)`);
        this.progress.publish({ phase: 'info', action: 'upload', message: `Iniciando sub-etapa: localizar botão Add new (${filePaths.length} arquivo[s])` });

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
                    this.progress.publish({ phase: 'start', action: 'upload', message: `Clicando botão Add new (selector=${sel})` });
                    await btn.click();
                    await page.waitForTimeout(1000); // espera ajustada
                    opened = true;
                    this.progress.publish({ phase: 'success', action: 'upload', message: 'Botão Add new aberto' });
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
        this.progress.publish({ phase: 'info', action: 'upload', message: 'Procurando opção de upload de documento' });
        for (const sel of docSelectors) {
            try {
                const it = frame.locator(sel).first();
                if ((await it.count()) > 0 && await it.isVisible()) {
                    this.progress.publish({ phase: 'start', action: 'upload', message: `Abrindo diálogo de seleção (selector=${sel})` });
                    await it.click();
                    clicked = true;
                    break;
                }
            } catch { }
        }
        if (!clicked) throw new Error('Opção de upload não encontrada');

    const chooser = await chooserPromise;
    this.progress.publish({ phase: 'info', action: 'upload', message: 'Definindo arquivos no file chooser' });
    await chooser.setFiles(filePaths);

        // Tempo de espera pós-seleção (dinâmico)
        const waitMs = 2500 + (filePaths.length * 1200);
        this.logger.log(`⏳ Aguardando ${waitMs}ms para processamento inicial dos arquivos...`);
        this.progress.publish({ phase: 'delay', action: 'upload', message: `Esperando processamento inicial (${waitMs}ms)`, extra: { fileCount: filePaths.length, waitMs } });
        await page.waitForTimeout(waitMs);
        this.progress.publish({ phase: 'success', action: 'upload', message: `Processamento inicial concluído (${filePaths.length} arquivo[s])` });
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

    // FUNÇÕES DE DIAGNÓSTICO CRÍTICO (COPIADAS DO UPLOAD-AUTOMATION.SERVICE)
    private async performAuthenticationDiagnostic(page: Page) {
        try {
            this.logger.log(`🔍 === DIAGNÓSTICO DE AUTENTICAÇÃO (Timeline) ===`);
            
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
            
            // 8. VERIFICAÇÃO CRÍTICA DE RENDERIZAÇÃO
            const interfaceStatus = await page.evaluate(() => {
                // Aguardar um pouco para renderização
                return new Promise((resolve) => {
                    setTimeout(() => {
                        const status = {
                            totalElements: document.querySelectorAll('*').length,
                            iframes: document.querySelectorAll('iframe').length,
                            workfrontElements: document.querySelectorAll('[class*="workfront"], [data-testid*="workfront"]').length,
                            reactElements: document.querySelectorAll('[class*="react"], [data-reactid]').length,
                            buttonElements: document.querySelectorAll('button').length,
                            tableElements: document.querySelectorAll('table').length,
                            isReactLoaded: !!(window as any).React || !!document.querySelector('[data-reactroot]'),
                            hasWorkfrontApp: !!document.querySelector('[class*="app"], [id*="app"], main, [role="main"]'),
                            documentReadyState: document.readyState,
                            networkStatus: navigator.onLine
                        };
                        resolve(status);
                    }, 2000);
                });
            }) as {
                totalElements: number;
                iframes: number;
                workfrontElements: number;
                reactElements: number;
                buttonElements: number;
                tableElements: number;
                isReactLoaded: boolean;
                hasWorkfrontApp: boolean;
                documentReadyState: string;
                networkStatus: boolean;
            };
            
            this.logger.log(`🏗️ Status da Interface:`);
            Object.entries(interfaceStatus).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: ${value}`);
            });
            
            // 9. AGUARDAR CARREGAMENTO COMPLETO DA INTERFACE WORKFRONT
            if (interfaceStatus.workfrontElements === 0 || interfaceStatus.tableElements === 0 || !interfaceStatus.isReactLoaded) {
                this.logger.warn(`⚠️ Interface Workfront incompleta! Aguardando carregamento...`);
                this.logger.warn(`   - workfrontElements: ${interfaceStatus.workfrontElements} (precisa >0)`);
                this.logger.warn(`   - tableElements: ${interfaceStatus.tableElements} (precisa >0)`);
                this.logger.warn(`   - isReactLoaded: ${interfaceStatus.isReactLoaded} (precisa true)`);
                
                // Aguardar carregamento completo com múltiplas tentativas
                let attempts = 0;
                const maxAttempts = 10;
                
                while (attempts < maxAttempts) {
                    attempts++;
                    this.logger.log(`🔄 Tentativa ${attempts}/${maxAttempts}: aguardando interface Workfront...`);
                    
                    await page.waitForTimeout(3000);
                    
                    const currentStatus = await page.evaluate(() => ({
                        workfrontElements: document.querySelectorAll('[class*="workfront"], [data-testid*="workfront"], [class*="wf-"], [id*="workfront"]').length,
                        tableElements: document.querySelectorAll('table, [class*="table"], [data-testid*="table"]').length,
                        documentRows: document.querySelectorAll('tr, [class*="row"], [data-testid*="row"]').length,
                        addButtons: document.querySelectorAll('[data-testid="add-new"], button[class*="add"], [class*="add-new"]').length,
                        folderElements: document.querySelectorAll('[class*="folder"], [data-testid*="folder"]').length
                    }));
                    
                    this.logger.log(`   📊 Status atual: workfront=${currentStatus.workfrontElements}, tables=${currentStatus.tableElements}, rows=${currentStatus.documentRows}, addBtns=${currentStatus.addButtons}, folders=${currentStatus.folderElements}`);
                    
                    // Condição de sucesso: tem elementos de tabela E botões de add
                    if (currentStatus.tableElements > 0 && currentStatus.addButtons > 0) {
                        this.logger.log(`✅ Interface Workfront carregada completamente! (tentativa ${attempts})`);
                        break;
                    }
                    
                    // Se chegou na última tentativa, forçar reload
                    if (attempts === maxAttempts) {
                        this.logger.warn(`⚠️ Interface ainda incompleta após ${maxAttempts} tentativas. Forçando reload...`);
                        await page.reload({ waitUntil: 'networkidle' });
                        await page.waitForTimeout(8000);
                        
                        const afterReload = await page.evaluate(() => ({
                            workfrontElements: document.querySelectorAll('[class*="workfront"], [data-testid*="workfront"]').length,
                            tableElements: document.querySelectorAll('table, [class*="table"]').length,
                            addButtons: document.querySelectorAll('[data-testid="add-new"], [class*="add-new"]').length
                        }));
                        
                        this.logger.log(`🔄 Após reload forçado: workfront=${afterReload.workfrontElements}, tables=${afterReload.tableElements}, addBtns=${afterReload.addButtons}`);
                    }
                }
            } else {
                this.logger.log(`✅ Interface Workfront já carregada completamente!`);
            }
            
            // 10. Capturar screenshot do estado de autenticação
            await this.captureDebugScreenshot(page, 'timeline-auth-diagnostic', 'Timeline Authentication diagnostic state');
            
            this.logger.log(`🔍 === FIM DO DIAGNÓSTICO ===`);
            
        } catch (error) {
            this.logger.error(`❌ Erro durante diagnóstico de autenticação: ${error.message}`);
            await this.captureDebugScreenshot(page, 'timeline-auth-error', 'Timeline Authentication diagnostic error');
        }
    }

    private async performAccessDiagnostic(page: Page, targetFolder: string) {
        try {
            this.logger.log(`🔍 === DIAGNÓSTICO DE ACESSO PARA PASTA "${targetFolder}" (Timeline) ===`);
            
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

    private async verifyUploadSuccess(frame: any, page: Page, filePath: string, folder: string) {
        try {
            const fileName = path.basename(filePath);
            const originalName = this.getOriginalFileName(fileName);
            
            this.logger.log(`🔍 [VERIFY] Verificando se upload de "${originalName}" realmente funcionou na pasta "${folder}"`);
            
            // Aguardar um momento para o arquivo aparecer
            await page.waitForTimeout(3000);
            
            // Procurar pelo arquivo na interface com seletores mais específicos
            const fileFound = await page.evaluate((searchName) => {
                // Tentar diferentes variações do nome
                const searchVariations = [
                    searchName,
                    searchName.replace(/\s+/g, ' ').trim(),
                    searchName.split('_').pop(), // parte final após último _
                    searchName.substring(0, 50) // primeiros 50 caracteres
                ];
                
                const selectors = [
                    // Seletores específicos do Workfront
                    'tr[data-testid*="document"] td',
                    'tr[data-testid*="folder"] td', 
                    '[class*="document-name"]',
                    '[class*="file-name"]',
                    'td[class*="name"]',
                    // Seletores genéricos
                    '[title*="SEARCH_TERM"]',
                    '[aria-label*="SEARCH_TERM"]',
                    'td:has-text("SEARCH_TERM")',
                    '*[class*="cell"]:has-text("SEARCH_TERM")'
                ];
                
                for (const variation of searchVariations) {
                    for (const selectorTemplate of selectors) {
                        try {
                            const selector = selectorTemplate.replace('SEARCH_TERM', variation);
                            const elements = document.querySelectorAll(selector);
                            
                            // Verificar se o texto realmente contém a variação
                            for (const element of elements) {
                                if (element.textContent && element.textContent.includes(variation)) {
                                    return { 
                                        found: true, 
                                        selector: selector,
                                        count: elements.length,
                                        matchedText: element.textContent.trim(),
                                        variation: variation
                                    };
                                }
                            }
                        } catch (e) {
                            // Ignorar erros de seletor
                        }
                    }
                }
                
                return { found: false, selector: null, count: 0, matchedText: '', variation: '' };
            }, originalName);
            
            if (fileFound.found) {
                this.logger.log(`✅ [VERIFY] Arquivo encontrado na interface!`);
                this.logger.log(`   📄 Procurado: "${originalName}"`);
                this.logger.log(`   🎯 Encontrado: "${fileFound.matchedText}"`);
                this.logger.log(`   🔍 Variação: "${fileFound.variation}"`);
                this.logger.log(`   🎛️ Seletor: ${fileFound.selector}`);
                this.logger.log(`   📊 Elementos: ${fileFound.count}`);
            } else {
                this.logger.error(`❌ [VERIFY] Arquivo "${originalName}" NÃO encontrado na interface após upload!`);
                
                // Listar todos os documentos visíveis
                const visibleDocs = await page.evaluate(() => {
                    const docSelectors = [
                        'td[class*="name"]',
                        '[class*="document"] [class*="name"]',
                        '[data-testid*="document"]',
                        'tr td:first-child'
                    ];
                    
                    const docs = [];
                    docSelectors.forEach(selector => {
                        try {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(el => {
                                const text = el.textContent?.trim();
                                if (text && text.length > 0 && !docs.includes(text)) {
                                    docs.push(text);
                                }
                            });
                        } catch (e) {
                            // Ignorar erros
                        }
                    });
                    
                    return docs;
                });
                
                this.logger.log(`📋 [VERIFY] Documentos visíveis na pasta "${folder}" (${visibleDocs.length}):`);
                visibleDocs.forEach((doc, index) => {
                    this.logger.log(`   ${index + 1}. "${doc}"`);
                });
                
                // Screenshot da situação
                await this.captureDebugScreenshot(page, `upload-verification-failed-${folder}`, `Upload verification failed for ${originalName} in ${folder}`);
            }
            
        } catch (error) {
            this.logger.error(`❌ [VERIFY] Erro durante verificação: ${error.message}`);
        }
    }

    private getOriginalFileName(filePath: string): string {
        const base = path.basename(filePath);
        const match = base.match(/^temp_\d+_[a-z0-9]+_(.+)$/);
        return match ? match[1] : base;
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
