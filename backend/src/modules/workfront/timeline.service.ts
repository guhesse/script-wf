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
                // CONFIGURAÇÃO ESPECIAL PARA WORKFRONT - SEM OTIMIZAÇÕES AGRESSIVAS
                this.logger.log('⚙️ Configurando browser sem otimizações agressivas para Workfront:');
                this.logger.log('   - blockHeavy: false (permite imagens/fonts/mídia)');
                this.logger.log('   - serviceWorkers: allow (permite service workers)');
                this.logger.log('   - reducedMotion: no-preference (permite animações)');
                this.logger.log('   - extraHeaders: {} (sem Save-Data)');
                this.logger.log('   - bloqueios: disabled (sem bloqueio de recursos)');
                
                const { browser: b, context } = await createOptimizedContext({ 
                    headless, 
                    storageStatePath: await WorkfrontDomHelper.ensureStateFile(), 
                    viewport: { width: 1280, height: 720 },
                    blockHeavy: true,  // ❌ NÃO bloquear recursos pesados no Workfront
                    extraHeaders: {},   // ❌ NÃO usar Save-Data que pode quebrar interface
                    extraBlockDomains: [], // ❌ NÃO bloquear domínios extras
                    shortCircuitGlobs: []  // ❌ NÃO short-circuit nenhum endpoint
                });
                browser = b;
                page = await context.newPage();
                
                // Navegar direto para a URL do projeto (simples e rápido)
                this.logger.log(`🌐 Navegando para: ${projectUrl}`);
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await page.waitForTimeout(3000); // Timeout reduzido
                
                // Resolver contexto (frame ou page direta)
                frame = await this.resolveWorkfrontContext(page);
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
        
        // Validar se os paths são recentes (mesmo dia)
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const allPaths = [assetZipPath, ...finalMaterialPaths].filter(Boolean);
        
        for (const filePath of allPaths) {
            // Verificar se o path contém a data de hoje
            if (!filePath.includes(today)) {
                const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
                const fileDate = dateMatch ? dateMatch[1] : 'desconhecida';
                this.logger.error(`❌ [UPLOAD] Arquivo com data antiga detectado: ${fileDate} (esperado: ${today})`);
                return { 
                    success: false, 
                    message: `Arquivos preparados estão expirados (data: ${fileDate}). Por favor, clique em "Preparar Arquivos" novamente.` 
                };
            }
        }
        
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
            // Diagnóstico removido - otimização de performance
            const wfFrame = await this.getWorkfrontFrame(page);
            if (!wfFrame) {
                throw new Error('Frame Workfront não encontrado (getWorkfrontFrame retornou null)');
            }

            this.logger.log(`📂 [TIMELINE] Tentando navegar para pasta: ${folder}`);
            try {
                await this.navigateToFolderRobust(wfFrame, page, folder);
                this.logger.log(`✅ [TIMELINE] Navegação bem-sucedida para: ${folder}`);
            } catch (navErr: any) {
                this.logger.error(`❌ Falha na navegação (estratégia robusta) para ${folder}: ${navErr.message}`);
                throw navErr;
            }

            await this.uploadThroughDialogRobust(wfFrame, page, [filePath]);
            // Verificação removida - Workfront processa em background
        } catch (error) {
            this.logger.error(`❌ [TIMELINE] Falha no upload para ${folder}: ${error.message}`);
            throw error;
        }
    }

    private async navigateAndUploadMultiple(frame: any, page: Page, folder: string, filePaths: string[]) {
        try {
            // Diagnóstico removido - já feito no início do workflow
            const wfFrame = await this.getWorkfrontFrame(page);
            if (!wfFrame) {
                throw new Error('Frame Workfront não encontrado (getWorkfrontFrame retornou null)');
            }

            this.logger.log(`🖼️ [TIMELINE] Tentando navegar para pasta: ${folder} (${filePaths.length} arquivos)`);
            await this.navigateToFolderRobust(wfFrame, page, folder);
            this.logger.log(`✅ [TIMELINE] Navegação bem-sucedida para: ${folder}`);
            await this.uploadThroughDialogRobust(wfFrame, page, filePaths);
        } catch (error) {
            this.logger.error(`❌ [TIMELINE] Falha no upload para ${folder}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Localiza o frame real do Workfront com retry incremental.
     */
    private async getWorkfrontFrame(page: Page): Promise<any | null> {
        // Se já estamos diretamente no Workfront, retornar page
        const currentUrl = page.url();
        if (currentUrl.includes('dell.my.workfront.adobe.com')) {
            this.logger.log('✅ [FRAME] Já estamos no Workfront diretamente, usando page');
            return page;
        }
        
        const maxMs = 15000;
        const start = Date.now();
        let attempt = 0;
        let directTried = false;
        while (Date.now() - start < maxMs) {
            attempt++;
            const frames = page.frames();
            const info = frames.map(f => ({ url: f.url(), name: f.name() })).slice(0, 10);
            this.logger.log(`🔎 [FRAME] Tentativa ${attempt}: totalFrames=${frames.length} => ${info.map(i => i.url).join(' | ')}`);
            const wf = frames.find(f => /\.workfront\.adobe\.com\/project\//.test(f.url()));
            if (wf) {
                // Validação de cookie wf-auth
                const cookies = await page.context().cookies();
                const wfAuth = cookies.find(c => c.name === 'wf-auth');
                if (!wfAuth) {
                    this.logger.warn('⚠️ [FRAME] Cookie wf-auth ausente - sessão pode ser parcial. Considere reexecutar fluxo de login completo.');
                }
                this.logger.log(`✅ [FRAME] Frame Workfront encontrado: ${wf.url()}`);
                return wf;
            }
            // Fallback: tentar URL direta se ainda não tentou e página base é experience.adobe.com
            if (!directTried && /experience\.adobe\.com/.test(page.url()) && attempt === 5) {
                const projectMatch = page.url().match(/project\/([a-f0-9]{10,})/);
                if (projectMatch) {
                    const projectId = projectMatch[1];
                    const directUrl = `https://dell.my.workfront.adobe.com/project/${projectId}/documents`;
                    this.logger.warn(`⚠️ [FRAME] Tentando fallback de navegação direta para: ${directUrl}`);
                    try {
                        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        directTried = true;
                        continue; // reavaliar frames
                    } catch (err: any) {
                        this.logger.error(`❌ [FRAME] Fallback URL direta falhou: ${err.message}`);
                    }
                }
            }
            await page.waitForTimeout(1000);
        }
        this.logger.error('❌ [FRAME] Frame do Workfront não localizado após timeout');
        await this.captureDebugScreenshot(page, 'no-workfront-frame', 'No Workfront frame found');
        return null;
    }

    /**
     * Resolve o contexto correto do Workfront (page direto ou frame)
     */
    private async resolveWorkfrontContext(page: Page): Promise<any> {
        // Verificar se estamos diretamente no Workfront ou em iframe
        const currentUrl = page.url();
        
        if (currentUrl.includes('dell.my.workfront.adobe.com')) {
            this.logger.log('✅ [CONTEXT] Usando page direto (não iframe) - URL Workfront direta');
            return page; // Retornar page direto como "frame"
        }
        
        // Se estamos no experience.adobe, procurar frame
        const frames = page.frames();
        const wfFrame = frames.find(f => f.url().includes('.workfront.adobe.com/project/'));
        
        if (wfFrame) {
            this.logger.log('✅ [CONTEXT] Usando frame do Workfront dentro do experience.adobe');
            return wfFrame;
        }
        
        // Fallback: usar frameLocator
        this.logger.warn('⚠️ [CONTEXT] Frame não encontrado, usando frameLocator como fallback');
        return WorkfrontDomHelper.frameLocator(page);
    }

    private async navigateToFolderRobust(frame: any, page: Page, folder: string) {
        // AGUARDAR botão Add new estar VISÍVEL antes de navegar
        this.logger.log(`⏳ [NAV] Aguardando botão Add new estar visível...`);
        try {
            // Usar o próprio frame, não frameLocator
            if (frame.url) {
                // É um Frame real
                await frame.waitForSelector('[data-testid="add-new"], button[class*="add"]', { 
                    state: 'visible',
                    timeout: 10000 
                });
                this.logger.log(`✅ [NAV] Botão Add new está visível no frame`);
            } else {
                // É um FrameLocator
                await frame.locator('[data-testid="add-new"], button[class*="add"]').first().waitFor({ 
                    state: 'visible',
                    timeout: 10000 
                });
                this.logger.log(`✅ [NAV] Botão Add new está visível no frameLocator`);
            }
        } catch (waitErr) {
            this.logger.error(`❌ [NAV] Botão Add new NÃO ficou visível: ${waitErr.message}`);
            await this.captureDebugScreenshot(page, 'no-add-button-visible', 'Add button not visible before navigation');
            throw new Error('Interface Workfront não carregou completamente - botão Add new não visível');
        }
        
        // Primeiro tentar via serviço existente
        try {
            await this.shareService.navigateToFolder(frame, page, folder);
            return;
        } catch { /* fallback custom abaixo */ }

        this.logger.log(`🔁 [NAV] Usando fallback custom para localizar pasta: ${folder}`);
        
        // ESTRATÉGIA MAIS AGRESSIVA: tentar múltiplos seletores em paralelo
        const normalized = folder.toLowerCase();
        const folderCandidates = [
            // Seletores de linha de tabela
            `tr:has-text("${folder}")`,
            `tr[data-testid*="folder"]:has-text("${folder}")`,
            // Seletores de texto direto
            `text="${folder}"`,
            `text=/^${folder}$/i`,
            // XPath
            `xpath=//tr[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${normalized}')]`,
            // Seletores de célula
            `td:has-text("${folder}")`,
            `[class*="cell"]:has-text("${folder}")`
        ];
        
        for (const sel of folderCandidates) {
            try {
                this.logger.log(`🔍 [NAV] Tentando seletor: ${sel}`);
                const loc = frame.locator ? frame.locator(sel).first() : frame(sel).first();
                const count = await loc.count();
                
                if (count > 0) {
                    const isVisible = await loc.isVisible().catch(() => false);
                    this.logger.log(`   📊 Encontrado ${count} elemento(s), visível: ${isVisible}`);
                    
                    if (isVisible) {
                        await loc.click({ delay: 50, timeout: 5000 });
                        this.logger.log(`✅ [NAV] Pasta selecionada via seletor: ${sel}`);
                        await page.waitForTimeout(2000); // Aguardar navegação
                        return;
                    }
                }
            } catch (err) {
                this.logger.warn(`⚠️ [NAV] Seletor falhou: ${sel} - ${err.message}`);
            }
        }
        
        // Se nada funcionou, capturar screenshot
        await this.captureDebugScreenshot(page, `folder-not-found-${folder}`, `Could not locate folder ${folder}`);
        throw new Error(`Folder '${folder}' não localizada após todas estratégias`);
    }

    /**
     * Estratégia robusta para abrir diálogo de upload e enviar múltiplos arquivos.
     */
    private async uploadThroughDialogRobust(frame: any, page: Page, filePaths: string[]) {
        this.logger.log(`📁 [UPLOAD-R] Upload robusto de ${filePaths.length} arquivo(s)`);
        
        // Aguardar interface REALMENTE estável
        this.logger.log(`⏳ [UPLOAD-R] Aguardando 3 segundos para estabilização completa...`);
        await page.waitForTimeout(3000);
        
        // Determinar se é Frame real ou FrameLocator
        const isRealFrame = !!frame.url;
        this.logger.log(`🔍 [UPLOAD-R] Tipo de frame: ${isRealFrame ? 'Frame real' : 'FrameLocator'}`);
        
        // Setup file chooser listener ANTES de qualquer clique (muito importante!)
        this.logger.log(`🎯 [UPLOAD-R] Preparando listener de file chooser (timeout 30s)...`);
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 30000 });
        
        // Seletores do botão Add new
        const addSelectors = [
            'button[data-testid="add-new"]',
            '#add-new-button',
            'button.add-new-react-button',
            'button:has-text("Add new")'
        ];
        
        let opened = false;
        for (const sel of addSelectors) {
            try {
                this.logger.log(`🔍 [UPLOAD-R] Tentando botão: ${sel}`);
                const btn = isRealFrame ? frame.locator(sel).first() : frame.locator(sel).first();
                const count = await btn.count();
                
                if (count > 0) {
                    const isVisible = await btn.isVisible().catch(() => false);
                    this.logger.log(`   📊 Botão encontrado (count=${count}, visible=${isVisible})`);
                    
                    if (isVisible) {
                        await btn.click({ delay: 30, timeout: 5000 });
                        await page.waitForTimeout(800); // Aguardar menu aparecer
                        opened = true;
                        this.logger.log(`✅ [UPLOAD-R] Botão Add new clicado: ${sel}`);
                        break;
                    }
                }
            } catch (err) {
                this.logger.warn(`⚠️ [UPLOAD-R] Falha no botão ${sel}: ${err.message}`);
            }
        }
        
        if (!opened) {
            this.logger.error('❌ [UPLOAD-R] Não conseguiu clicar Add new após todas tentativas');
            await this.captureDebugScreenshot(page, 'no-add-new-clickable', 'Could not click Add new button');
            throw new Error('Botão Add new não encontrado ou não clicável');
        }

        // Clicar opção Document (file chooser já tem listener ativo)
        const docSelectors = [
            'li[data-test-id="upload-file"]',
            'li.select-files-button',
            'li:has-text("Document")',
            '[role="menuitem"]:has-text("Document")'
        ];
        
        let docClicked = false;
        for (const sel of docSelectors) {
            try {
                this.logger.log(`🔍 [UPLOAD-R] Tentando opção Document: ${sel}`);
                const m = isRealFrame ? frame.locator(sel).first() : frame.locator(sel).first();
                const count = await m.count();
                
                if (count > 0) {
                    this.logger.log(`   📊 Opção encontrada (count=${count}) - tentando clicar com force...`);
                    
                    // Tentar clicar COM FORCE mesmo se não visível (menus dropdown podem ter visibilidade complexa)
                    try {
                        await m.click({ timeout: 3000, force: true });
                        this.logger.log(`✅ [UPLOAD-R] Document clicado: ${sel}`);
                        docClicked = true;
                        break;
                    } catch (clickErr) {
                        this.logger.warn(`⚠️ Click falhou em ${sel}: ${clickErr.message}`);
                    }
                }
            } catch (err) {
                this.logger.warn(`⚠️ [UPLOAD-R] Falha na opção ${sel}: ${err.message}`);
            }
        }
        
        if (!docClicked) {
            this.logger.error('❌ [UPLOAD-R] Não conseguiu clicar Document');
            await this.captureDebugScreenshot(page, 'no-document-option', 'Document option not clickable');
            throw new Error('Opção Document não encontrada ou não clicável');
        }
        
        // Aguardar file chooser aparecer
        let chooser = null;
        try {
            chooser = await chooserPromise;
            this.logger.log(`✅ [UPLOAD-R] File chooser aberto com sucesso`);
        } catch (chooserErr) {
            this.logger.error(`❌ File chooser timeout: ${chooserErr.message}`);
            await this.captureDebugScreenshot(page, 'no-file-chooser', 'File chooser did not open');
            throw new Error('File chooser não abriu após clicar Document');
        }
        
        // Converter paths para absolutos e validar existência
        const fs = require('fs').promises;
        const path = require('path');
        const absolutePaths: string[] = [];
        
        for (const filePath of filePaths) {
            // Converter para path absoluto se for relativo
            const absolutePath = path.isAbsolute(filePath) 
                ? filePath 
                : path.resolve(process.cwd(), filePath);
            
            this.logger.log(`📁 [UPLOAD-R] Validando arquivo: ${absolutePath}`);
            
            // Verificar se arquivo existe
            try {
                const stats = await fs.stat(absolutePath);
                this.logger.log(`✅ [UPLOAD-R] Arquivo encontrado: ${path.basename(absolutePath)} (${stats.size} bytes)`);
                absolutePaths.push(absolutePath);
            } catch (err) {
                this.logger.error(`❌ [UPLOAD-R] Arquivo não encontrado: ${absolutePath}`);
                throw new Error(`Arquivo não encontrado: ${absolutePath}`);
            }
        }
        
        // Enviar arquivos com paths absolutos validados
        this.logger.log(`📤 [UPLOAD-R] Enviando ${absolutePaths.length} arquivo(s) para file chooser...`);
        await chooser.setFiles(absolutePaths);
        this.logger.log(`✅ [UPLOAD-R] ${absolutePaths.length} arquivo(s) enviado(s) com sucesso`);
        
        // Aguardar processamento otimizado - Workfront processa em background
        const waitTime = Math.max(6000, filePaths.length * 3000); // Mínimo 6s, 3s por arquivo (otimizado)
        this.logger.log(`⏳ [UPLOAD-R] Aguardando ${waitTime}ms para processamento...`);
        await page.waitForTimeout(waitTime);
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
            
            const currentUrl = page.url();
            this.logger.log(`🌐 URL atual: ${currentUrl}`);
            
            const title = await page.title();
            this.logger.log(`📄 Título da página: ${title}`);
            
            // CRÍTICO: Verificar no IFRAME, não na página principal
            const frames = page.frames();
            const wfFrame = frames.find(f => f.url().includes('.workfront.adobe.com/project/'));
            
            if (wfFrame) {
                this.logger.log(`✅ Frame Workfront encontrado - analisando conteúdo do frame...`);
                
                // Análise DENTRO do frame
                const frameStatus = await wfFrame.evaluate(() => {
                    return {
                        totalElements: document.querySelectorAll('*').length,
                        buttons: document.querySelectorAll('button').length,
                        tables: document.querySelectorAll('table, [class*="table"]').length,
                        addButtons: document.querySelectorAll('[data-testid="add-new"], button[class*="add"], [class*="add-new"]').length,
                        folders: document.querySelectorAll('[class*="folder"], [data-testid*="folder"], tr[data-testid*="folder"]').length,
                        documents: document.querySelectorAll('[class*="document"], [data-testid*="document"], tr[data-testid*="document"]').length,
                        hasTable: !!document.querySelector('table'),
                        bodyText: document.body?.innerText?.substring(0, 300) || 'vazio'
                    };
                });
                
                this.logger.log(`🏗️ Status do Frame Workfront:`);
                this.logger.log(`   - totalElements: ${frameStatus.totalElements}`);
                this.logger.log(`   - buttons: ${frameStatus.buttons}`);
                this.logger.log(`   - tables: ${frameStatus.tables}`);
                this.logger.log(`   - addButtons: ${frameStatus.addButtons}`);
                this.logger.log(`   - folders: ${frameStatus.folders}`);
                this.logger.log(`   - documents: ${frameStatus.documents}`);
                this.logger.log(`   - hasTable: ${frameStatus.hasTable}`);
                this.logger.log(`   - bodyText: "${frameStatus.bodyText}"`);
                
                // CONDIÇÃO DE SUCESSO: Tem botões Add E tem estrutura de documentos
                if (frameStatus.addButtons > 0 && (frameStatus.tables > 0 || frameStatus.folders > 0)) {
                    this.logger.log(`✅ Interface Workfront PRONTA no frame! (addBtns=${frameStatus.addButtons}, structure=${frameStatus.tables || frameStatus.folders})`);
                    return; // Interface OK, pular espera
                } else {
                    this.logger.warn(`⚠️ Interface incompleta no frame: addBtns=${frameStatus.addButtons}, tables=${frameStatus.tables}, folders=${frameStatus.folders}`);
                }
            } else {
                this.logger.error(`❌ Frame Workfront NÃO encontrado!`);
            }
            
            // AGUARDAR CARREGAMENTO NO FRAME (não na página principal)
            if (wfFrame) {
                this.logger.log(`⏳ Aguardando carregamento completo no FRAME Workfront...`);
                let attempts = 0;
                const maxAttempts = 15; // Aumentado para 15 tentativas
                
                while (attempts < maxAttempts) {
                    attempts++;
                    this.logger.log(`🔄 Tentativa ${attempts}/${maxAttempts}: verificando frame...`);
                    
                    await page.waitForTimeout(2000); // 2s entre tentativas
                    
                    const currentStatus = await wfFrame.evaluate(() => ({
                        addButtons: document.querySelectorAll('[data-testid="add-new"], button[class*="add"], [class*="add-new"]').length,
                        tables: document.querySelectorAll('table, [class*="table"]').length,
                        folders: document.querySelectorAll('[class*="folder"], [data-testid*="folder"], tr').length,
                        visibleButtons: Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0).length
                    }));
                    
                    this.logger.log(`   📊 Frame: addBtns=${currentStatus.addButtons}, tables=${currentStatus.tables}, folders=${currentStatus.folders}, visibleBtns=${currentStatus.visibleButtons}`);
                    
                    // Condição de sucesso: tem botões de add VISÍVEIS
                    if (currentStatus.addButtons > 0 && currentStatus.visibleButtons > 0) {
                        this.logger.log(`✅ Interface Workfront carregada no frame! (tentativa ${attempts})`);
                        break;
                    }
                    
                    // Se chegou na última tentativa
                    if (attempts === maxAttempts) {
                        this.logger.error(`❌ Interface ainda incompleta após ${maxAttempts} tentativas!`);
                        // NÃO fazer reload - pode piorar
                    }
                }
            }
            
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
        // Arquivos agora são salvos diretamente com nome correto (sem prefixo temp_)
        return path.basename(filePath);
    }

    private async performPageStructureDiagnostic(page: Page) {
        try {
            this.logger.log(`🔍 === DIAGNÓSTICO COMPLETO DA ESTRUTURA DA PÁGINA ===`);
            
            // 1. Análise básica do DOM
            const domAnalysis = await page.evaluate(() => {
                return {
                    docType: document.doctype?.name || 'não definido',
                    charset: document.characterSet,
                    readyState: document.readyState,
                    referrer: document.referrer,
                    domain: document.domain,
                    bodyClasses: document.body?.className || 'sem classes',
                    htmlLang: document.documentElement?.lang || 'não definido'
                };
            });
            
            this.logger.log(`📄 Análise do DOM:`);
            Object.entries(domAnalysis).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: "${value}"`);
            });
            
            // 2. Estrutura de elementos principais
            const mainStructure = await page.evaluate(() => {
                return {
                    headElements: document.head?.children.length || 0,
                    metaTags: document.querySelectorAll('meta').length,
                    linkTags: document.querySelectorAll('link').length,
                    scriptTags: document.querySelectorAll('script').length,
                    styleTags: document.querySelectorAll('style').length,
                    bodyChildren: document.body?.children.length || 0,
                    totalDivs: document.querySelectorAll('div').length,
                    totalSpans: document.querySelectorAll('span').length,
                    totalInputs: document.querySelectorAll('input').length,
                    totalForms: document.querySelectorAll('form').length,
                    totalImages: document.querySelectorAll('img').length
                };
            });
            
            this.logger.log(`🏗️ Estrutura de elementos:`);
            Object.entries(mainStructure).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: ${value}`);
            });
            
            // 3. Conteúdo textual da página
            const textContent = await page.evaluate(() => {
                const bodyText = document.body?.innerText?.substring(0, 500) || 'sem texto';
                const title = document.title;
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 5);
                
                return {
                    title,
                    bodyTextPreview: bodyText,
                    headings: headings,
                    hasErrorMessages: bodyText.toLowerCase().includes('error') || bodyText.toLowerCase().includes('erro'),
                    hasLoadingMessages: bodyText.toLowerCase().includes('loading') || bodyText.toLowerCase().includes('carregando')
                };
            });
            
            this.logger.log(`📝 Conteúdo da página:`);
            this.logger.log(`   - title: "${textContent.title}"`);
            this.logger.log(`   - bodyText (preview): "${textContent.bodyTextPreview}"`);
            this.logger.log(`   - headings: [${textContent.headings.map(h => `"${h}"`).join(', ')}]`);
            this.logger.log(`   - hasErrorMessages: ${textContent.hasErrorMessages}`);
            this.logger.log(`   - hasLoadingMessages: ${textContent.hasLoadingMessages}`);
            
            // 4. Análise de iframes
            const iframeAnalysis = await page.evaluate(() => {
                const iframes = Array.from(document.querySelectorAll('iframe'));
                return iframes.map((iframe, index) => ({
                    index,
                    src: iframe.src || 'sem src',
                    id: iframe.id || 'sem id',
                    className: iframe.className || 'sem classes',
                    width: iframe.width || 'auto',
                    height: iframe.height || 'auto',
                    name: iframe.name || 'sem nome'
                }));
            });
            
            this.logger.log(`🖼️ Análise de iframes (${iframeAnalysis.length}):`);
            iframeAnalysis.forEach(iframe => {
                this.logger.log(`   ${iframe.index + 1}. src="${iframe.src}", id="${iframe.id}", classes="${iframe.className}"`);
            });
            
            // 5. JavaScript e erros no console
            const jsAnalysis = await page.evaluate(() => {
                return {
                    hasReact: !!(window as any).React,
                    hasAngular: !!(window as any).angular,
                    hasJQuery: !!(window as any).jQuery || !!(window as any).$,
                    hasWorkfrontGlobal: !!(window as any).Workfront || !!(window as any).WF || !!(window as any).workfront,
                    globalKeys: Object.keys(window).filter(key => key.toLowerCase().includes('workfront') || key.toLowerCase().includes('adobe')).slice(0, 10)
                };
            });
            
            this.logger.log(`⚡ JavaScript e globals:`);
            Object.entries(jsAnalysis).forEach(([key, value]) => {
                this.logger.log(`   - ${key}: ${value}`);
            });
            
            // 6. Classes CSS mais comuns
            const cssClasses = await page.evaluate(() => {
                const allElements = document.querySelectorAll('*');
                const classMap = new Map();
                
                Array.from(allElements).forEach(el => {
                    const classList = el.className;
                    if (typeof classList === 'string' && classList.trim()) {
                        classList.split(/\s+/).forEach(cls => {
                            if (cls.trim()) {
                                classMap.set(cls, (classMap.get(cls) || 0) + 1);
                            }
                        });
                    }
                });
                
                return Array.from(classMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([className, count]) => ({ className, count }));
            });
            
            this.logger.log(`🎨 Classes CSS mais frequentes:`);
            cssClasses.forEach((cls, index) => {
                this.logger.log(`   ${index + 1}. "${cls.className}" (${cls.count}x)`);
            });
            
            // 7. Análise específica do iframe (se houver)
            if (iframeAnalysis.length > 0) {
                this.logger.log(`🔍 Analisando conteúdo do iframe principal...`);
                try {
                    const frame = page.frameLocator('iframe').first();
                    const frameContent = await frame.locator('body').textContent();
                    const frameButtons = await frame.locator('button').count();
                    const frameTables = await frame.locator('table').count();
                    const frameInputs = await frame.locator('input').count();
                    
                    this.logger.log(`📱 Conteúdo do iframe:`);
                    this.logger.log(`   - textContent (preview): "${frameContent?.substring(0, 200) || 'vazio'}"`);
                    this.logger.log(`   - buttons: ${frameButtons}`);
                    this.logger.log(`   - tables: ${frameTables}`);
                    this.logger.log(`   - inputs: ${frameInputs}`);
                    
                    // Verificar se é uma página de erro ou carregamento
                    const frameAnalysis = await page.evaluate(() => {
                        const iframe = document.querySelector('iframe');
                        if (iframe && iframe.contentDocument) {
                            const doc = iframe.contentDocument;
                            return {
                                url: iframe.src,
                                title: doc.title,
                                bodyText: doc.body?.innerText?.substring(0, 300) || 'sem texto',
                                hasError: doc.body?.innerText?.toLowerCase().includes('error') || false,
                                hasAuth: doc.body?.innerText?.toLowerCase().includes('login') || doc.body?.innerText?.toLowerCase().includes('sign') || false
                            };
                        }
                        return { error: 'Iframe não acessível' };
                    });
                    
                    this.logger.log(`🔍 Análise do iframe:`);
                    Object.entries(frameAnalysis).forEach(([key, value]) => {
                        this.logger.log(`   - ${key}: "${value}"`);
                    });
                    
                } catch (frameError) {
                    this.logger.warn(`⚠️ Não foi possível acessar conteúdo do iframe: ${frameError.message}`);
                }
            }
            
            this.logger.log(`🔍 === FIM DO DIAGNÓSTICO DE ESTRUTURA ===`);
            
        } catch (error) {
            this.logger.error(`❌ Erro durante diagnóstico de estrutura: ${error.message}`);
        }
    }

    // REMOVIDO: prepareCleanFileNames - arquivos agora são salvos diretamente com nome correto

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
