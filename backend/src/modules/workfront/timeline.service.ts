import { Injectable, Logger } from '@nestjs/common';
import { ShareAutomationService } from './share-automation.service';
import { UploadAutomationService } from './upload-automation.service';
import { StatusAutomationService } from './status-automation.service';
import { HoursAutomationService } from './hours-automation.service';
import { CommentService } from '../pdf/comment.service';
import { CommentType } from '../pdf/dto/pdf.dto';
import { chromium, Browser, Page } from 'playwright';

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

        // Detectar se podemos rodar em sessão única para ações de documentos
        const docActions = steps.filter(s => s.enabled && [WorkflowAction.UPLOAD, WorkflowAction.SHARE, WorkflowAction.COMMENT].includes(s.action));
        const metaActions = steps.filter(s => s.enabled && [WorkflowAction.STATUS, WorkflowAction.HOURS].includes(s.action));
        const useSessionMode = docActions.length > 0; // primeira fase

        let browser: Browser | null = null; let page: Page | null = null; let frame: any = null;

        this.logger.log('🎬 === INICIANDO WORKFLOW DE AÇÕES ===');
        this.logger.log(`📍 Projeto: ${projectUrl}`);
        this.logger.log(`📋 Total de steps: ${steps.length}`);

        if (useSessionMode) {
            try {
                this.logger.log('🧩 Abrindo browser de sessão única para ações de documentos (upload/share/comment)');
                browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
                // Reusa state file através de shareService utilitário (garante login)
                // Aproveitamos ensureStateFile indiretamente chamando openProjectAndSelectDocument? Melhor abrir manualmente.
                const statePath = (this.shareService as any).ensureStateFile ? await (this.shareService as any).ensureStateFile() : 'wf_state.json';
                const context = await browser.newContext({ storageState: statePath, viewport: null });
                page = await context.newPage();
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3500);
                frame = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
                // fechar sidebar se existir
                try { await (this.shareService as any).closeSidebarIfOpen(frame, page); } catch { }
            } catch (e: any) {
                this.logger.error('❌ Falha ao preparar sessão única: ' + e?.message);
                // fallback: session mode desabilitado
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

            this.logger.log(`🎯 [${i + 1}/${steps.length}] Executando: ${step.action}`);
            const startTime = Date.now();

            try {
                let result: { success: boolean; message?: string };
                if (
                    browser && page && frame &&
                    [WorkflowAction.UPLOAD, WorkflowAction.SHARE, WorkflowAction.COMMENT, WorkflowAction.STATUS].includes(step.action) // <-- adiciona STATUS
                ) {
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

        // Segunda fase (meta actions) se não rodaram ainda com sessão aberta e abrimos browser só para elas
        if (metaActions.length > 0 && (browser || !useSessionMode)) {
            // Se já processamos meta actions no loop acima nada a fazer; elas já passaram no loop normal.
            // Caso queira otimização futura de abrir segundo browser somente após doc phase, poderia mover.
        }

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
        const { deliverableStatus } = params || {};
        if (!deliverableStatus) return { success: false, message: 'deliverableStatus obrigatório' };
        try {
            const out = await this.statusService.updateDeliverableStatusInSession({
                page: ctx.page,
                frame: ctx.frame,
                projectUrl,
                deliverableStatus
            });
            return { success: out.success, message: out.message };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Falha status sessão' };
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
        if (page.isClosed()) throw new Error('Página já está fechada antes do upload');
        this.logger.log(`📁 Iniciando upload de ${filePaths.length} arquivo(s)`);

        // 1. Abrir menu "Add new"
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
                    await btn.click({ timeout: 3000 });
                    await page.waitForTimeout(500);
                    opened = true;
                    break;
                }
            } catch { /* tenta próximo */ }
        }
        if (!opened) {
            throw new Error('Botão "Add new" não encontrado ou não visível');
        }

        // 2. Clicar em opção de upload (Document). Usar Promise.all para não perder o evento.
        const docSelectors = [
            'li[data-test-id="upload-file"]',
            'li.select-files-button',
            'li:has-text("Document")',
            '[role="menuitem"]:has-text("Document")'
        ];
        let chooser = null;
        let clicked = false;

        for (const sel of docSelectors) {
            try {
                const opt = frame.locator(sel).first();
                if ((await opt.count()) > 0 && await opt.isVisible()) {
                    this.logger.log(`🖱️ Clicando opção de upload (${sel})`);
                    const result = await Promise.all([
                        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
                        opt.click().then(() => true).catch(() => false)
                    ]);
                    chooser = result[0];
                    clicked = result[1] as boolean;
                    if (!clicked) continue;
                    break;
                }
            } catch { /* tenta próximo */ }
        }

        if (page.isClosed()) {
            throw new Error('Página foi fechada durante tentativa de abrir diálogo de upload');
        }

        // 3. Se não capturou filechooser tentar fallback localizar input[type=file]
        if (!chooser) {
            this.logger.warn('⚠️ filechooser não capturado; tentando fallback via input[type=file]');
            // Pequeno delay para DOM injetar input
            await page.waitForTimeout(1000);
            // Escopo amplo (dentro do iframe ou página)
            let fileInput = frame.locator('input[type="file"]:not([disabled])').first();
            if ((await fileInput.count()) === 0) {
                fileInput = page.locator('input[type="file"]:not([disabled])').first();
            }
            if ((await fileInput.count()) > 0) {
                try {
                    await fileInput.setInputFiles(filePaths);
                    this.logger.log('✅ Upload disparado via setInputFiles fallback');
                    await page.waitForTimeout(3500);
                    return;
                } catch (e:any) {
                    throw new Error('Falha no fallback setInputFiles: ' + e?.message);
                }
            } else {
                throw new Error('Não foi possível abrir diálogo de upload nem localizar input[type=file]');
            }
        } else {
            // 4. Usar filechooser normal
            try {
                await chooser.setFiles(filePaths);
                this.logger.log('✅ Arquivos enviados ao filechooser');
                await page.waitForTimeout(3500);
            } catch (e:any) {
                throw new Error('Falha ao setar arquivos no filechooser: ' + e?.message);
            }
        }
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
