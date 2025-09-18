import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
    AddCommentDto,
    AddCommentResponseDto,
    CommentPreviewDto,
    CommentPreviewResponseDto,
    CommentType,
    UserTeam,
} from '../pdf/dto/pdf.dto';
import { chromium, Page, Frame } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

// Configuração de usuários (alinhada com o legado)
const USERS_CONFIG: Record<string, Array<{ name: string; email: string; id?: string }>> = {
    // Equipe da Carolina
    carol: [
        { name: 'Yasmin Lahm', email: 'yasmin.lahm@dell.com', id: 'USER_682e04f003a037009d7bb6434c90f1bc' },
        { name: 'Gabriela Vargas', email: 'gabriela.vargas1@dell.com', id: 'USER_682cca1400bed8ae9149fedfdc5b0170' },
        { name: 'Eduarda Ulrich', email: 'eduarda.ulrich@dell.com', id: 'USER_66f6ab9b050fd317df75ed2a4de184e7' },
        { name: 'Evili Borges', email: 'evili.borges@dell.com', id: 'USER_6610596c008d57c44df182ec8183336d' },
        { name: 'Giovanna Deparis', email: 'giovanna.deparis@dell.com', id: 'USER_682e04e403a004b47dad0ce00a992d84' },
        { name: 'Natascha Batista', email: 'natascha.batista@dell.com', id: 'USER_6867f5d90093ad0c57fbe5a22851a7d0' },
        { name: 'Carolina Lipinski', email: 'carolina.lipinski@dell.com', id: 'USER_6404f185031cb4594c66a99fa57c36e5' },
    ],
    // Equipe da Giovana
    giovana: [
        { name: 'Luiza Schmidt', email: 'luiza.schmidt@dell.com', id: 'USER_66bcb320058d74ff5c0d17dd973e2de4' },
        { name: 'Gislaine Orico Paz', email: 'gislaine.orico@dell.com', id: 'USER_66548d5f197c3da898c4645c95589111' },
        { name: 'Giovana Jockyman', email: 'giovana.jockyman@dell.com', id: 'USER_6414745101140908a941c911fbe572b4' },
    ],
    // Teste
    test: [
        { name: 'Gustavo Hesse', email: 'gustavo.hesse@vml.com', id: 'USER_6601d747001b2091cb952da29f7285e5' },
    ],
};

// Templates de comentários (texto adicional após @mentions)
const COMMENT_TEMPLATES: Record<CommentType, { text: string; mentions: boolean }> = {
    [CommentType.ASSET_RELEASE]: { text: 'segue a pasta com os assets finais da tarefa.', mentions: true },
    [CommentType.FINAL_MATERIALS]: { text: 'segue os materiais finais da tarefa.', mentions: true },
    [CommentType.APPROVAL]: { text: 'for your approval.', mentions: false },
};

@Injectable()
export class CommentService {
    private readonly logger = new Logger(CommentService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ===== API principal =====
    async addComment(commentDto: AddCommentDto): Promise<AddCommentResponseDto> {
        try {
            const { projectUrl, folderName, fileName, commentType, selectedUser, headless } = commentDto;

            this.logger.log(`💬 Adicionando comentário: ${fileName}`);
            this.logger.log(`📁 Pasta: ${folderName || 'Raiz'}`);
            this.logger.log(`🏷️ Tipo: ${commentType}`);
            this.logger.log(`👥 Equipe: ${selectedUser}`);

            const template = COMMENT_TEMPLATES[commentType] || COMMENT_TEMPLATES[CommentType.ASSET_RELEASE];
            const allUsers = this.getUsersForTeam(selectedUser);
            // Final Materials: mencionar apenas a líder do time
            const users = commentType === CommentType.FINAL_MATERIALS
                ? [this.getLeadUserForTeam(selectedUser) || allUsers[0]].filter(Boolean)
                : allUsers;
            const mentionedUsers = template.mentions ? users.length : 0;

            const auto = await this.performDocumentComment({
                projectUrl,
                folderName: folderName || 'root',
                fileName,
                commentText: template.text,
                users,
                headless: headless === true ? true : false,
            });

            return {
                success: auto.success,
                message: auto.message || `Comentário adicionado com sucesso em ${fileName}`,
                commentText: template.text,
                mentionedUsers,
            };
        } catch (error: any) {
            this.logger.error(`❌ Erro ao adicionar comentário: ${error?.message}`);
            throw new Error(`Falha ao adicionar comentário: ${error?.message}`);
        }
    }

    // ===== Fluxo com página já aberta =====
    async addCommentUsingOpenPage(params: {
        frameLocator: any;
        page: Page;
        folderName?: string;
        fileName: string;
        commentType: CommentType;
        selectedUser: UserTeam;
    }): Promise<{ success: boolean; message: string }> {
        const { frameLocator, page, folderName, fileName, commentType, selectedUser } = params;

        this.logger.log(`💬 [Comment] INÍCIO | file="${fileName}" | pasta="${folderName || 'root'}" | team="${selectedUser}"`);

        // Configurar página
        page.setDefaultTimeout(45000);

        const template = COMMENT_TEMPLATES[commentType] || COMMENT_TEMPLATES[CommentType.ASSET_RELEASE];
        const allUsers = this.getUsersForTeam(selectedUser);
        const users = commentType === CommentType.FINAL_MATERIALS
            ? [this.getLeadUserForTeam(selectedUser) || allUsers[0]].filter(Boolean)
            : allUsers;
        const testMode = selectedUser.toString() === 'test';
        const textToUse = testMode ? 'teste' : template.text;

        try {
            // 1. Garantir iframe presente
            await this.ensureIframe(page);

            // 2. Navegar para pasta se necessário
            if (folderName && folderName !== 'root') {
                await this.navigateToFolder(frameLocator, page, folderName);
            }

            // 3. Selecionar documento
            await this.selectDocument(frameLocator, page, fileName);

            // 4. Abrir painel de comentários
            await this.openCommentPanel(frameLocator, page);

            // 5. Adicionar comentário
            await this.addCommentToField(frameLocator, page, template, users, textToUse);

            // 6. Submeter comentário
            await this.submitComment(frameLocator, page);

            this.logger.log('💬 [Comment] ✅ Comentário adicionado com sucesso!');
            return { success: true, message: `Comentário adicionado ao documento "${fileName}"` };

        } catch (error: any) {
            this.logger.error(`💬 [Comment] ❌ Erro: ${error.message}`);
            await this.debugShot(page, 'comment_error');
            throw error;
        }
    }

    // ===== Métodos auxiliares refatorados =====

    private async ensureIframe(page: Page): Promise<void> {
        try {
            this.logger.log('💬 [Comment] Aguardando iframe do Workfront...');
            await page.waitForSelector('iframe[src*="workfront"], iframe[src*="experience"], iframe', { timeout: 15000 });
            this.logger.log('💬 [Comment] ✅ Iframe do Workfront detectado');
        } catch (e: any) {
            this.logger.warn(`💬 [Comment] ⚠️ Iframe não detectado no timeout: ${e?.message}`);
        }
    }

    private async navigateToFolder(frameLocator: any, page: Page, folderName: string): Promise<void> {
        await this.closeSidebarIfOpen(frameLocator, page);
        this.logger.log(`💬 [Comment] Navegando para pasta: ${folderName}`);

        const folderSelectors = [
            `button:has-text("13. ${folderName}")`,
            `button:has-text("14. ${folderName}")`,
            `button:has-text("${folderName}")`,
            `a:has-text("${folderName}")`,
            `[role="button"]:has-text("${folderName}")`,
        ];

        for (const selector of folderSelectors) {
            try {
                const element = frameLocator.locator(selector).first();
                if (await element.count() > 0) {
                    this.logger.log(`💬 [Comment] Clicando pasta via seletor: ${selector}`);
                    await element.click();
                    await page.waitForTimeout(2000);
                    this.logger.log('💬 [Comment] Pasta ✅ encontrada');
                    return;
                }
            } catch (e: any) {
                // Continuar tentando próximo seletor
            }
        }

        this.logger.warn('💬 [Comment] ⚠️ Pasta não encontrada');
    }

    private async selectDocument(frameLocator: any, page: Page, fileName: string): Promise<void> {
        await this.closeSidebarIfOpen(frameLocator, page);
        await page.waitForTimeout(800);

        // Tentar encontrar documento por diferentes métodos
        const docCandidates = await frameLocator.locator('body').evaluate((body, target: string) => {
            const found: Array<{ index: number; ariaLabel?: string; isVisible: boolean }> = [];
            const elements = (body as any).querySelectorAll('.doc-detail-view');
            elements.forEach((el: any, idx: number) => {
                const aria = el.getAttribute('aria-label') || '';
                const text = (el.textContent || '').toLowerCase();
                if (aria.includes(target) || text.includes(target.toLowerCase())) {
                    found.push({
                        index: idx,
                        ariaLabel: aria,
                        isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
                    });
                }
            });
            return found;
        }, fileName);

        if (docCandidates && docCandidates.length > 0) {
            const target = docCandidates.find(d => d.isVisible) || docCandidates[0];
            if (target?.ariaLabel) {
                await frameLocator.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
            } else {
                await frameLocator.locator(`.doc-detail-view:nth-of-type(${target.index + 1})`).click();
            }
        } else {
            // Fallback: tentar outros seletores
            const row = frameLocator.locator(`[role="row"]:has-text("${fileName}")`).first();
            if (await row.count() > 0) {
                await row.click();
            } else {
                const clickable = frameLocator.locator(`a:has-text("${fileName}"), button:has-text("${fileName}")`).first();
                if (await clickable.count() > 0) {
                    await clickable.click();
                }
            }
        }

        await page.waitForTimeout(800);
    }

    private async openCommentPanel(frameLocator: any, page: Page): Promise<void> {
        await this.closeSidebarIfOpen(frameLocator, page);
        this.logger.log('💬 [Comment] Abrindo summary...');

        const summaryBtn = frameLocator.locator('button[data-testid="open-summary"]').first();
        const summaryCount = await summaryBtn.count();

        if (summaryCount > 0) {
            try {
                await summaryBtn.click();
                this.logger.log('💬 [Comment] ✅ Summary clicado');
                await page.waitForTimeout(2500);
            } catch (e: any) {
                this.logger.error(`💬 [Comment] ❌ Erro ao clicar summary: ${e?.message}`);
            }
        } else {
            this.logger.warn('💬 [Comment] ⚠️ Botão summary não encontrado');
        }
    }

    private async addCommentToField(
        frameLocator: any,
        page: Page,
        template: any,
        users: any[],
        textToUse: string
    ): Promise<void> {
        // Encontrar campo de comentário
        const field = await this.findCommentField(frameLocator, page);
        if (!field) {
            throw new Error('Campo de comentário não encontrado');
        }

        const { locator: commentField, selector } = field;

        // Detectar tipo de campo
        const fieldInfo = await this.analyzeField(commentField);
        this.logger.log(`💬 [Comment] Campo: tag=${fieldInfo.tag} | contentEditable=${fieldInfo.isContentEditable} | omega-action=${fieldInfo.omegaAction}`);

        // Processar campo baseado no tipo
        if (fieldInfo.tag === 'input' && fieldInfo.omegaAction === 'toggle-RTE-mode') {
            await this.handleRTEInput(frameLocator, page, commentField, template, users, textToUse);
        } else if (fieldInfo.isContentEditable) {
            await this.handleContentEditable(frameLocator, page, commentField, template, users, textToUse);
        } else if (fieldInfo.tag === 'input') {
            await this.handleSimpleInput(page, commentField, textToUse);
        } else {
            // Fallback
            await commentField.insertText(textToUse);
        }
    }

    private async findCommentField(frameLocator: any, page: Page): Promise<{ locator: any; selector: string } | null> {
        this.logger.log('💬 [Comment] Procurando campo de comentário...');

        // Aguardar carregamento
        await page.waitForTimeout(2000);

        const selectors = [
            'input[data-omega-element="add-comment-input"]',
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            '[role="textbox"][contenteditable="true"]',
            'input[aria-label="Add comment"]',
            '.zo2IKa_spectrum-Textfield-input',
        ];

        for (const selector of selectors) {
            try {
                const field = frameLocator.locator(selector).first();
                if (await field.count() > 0 && await field.isVisible()) {
                    this.logger.log(`💬 [Field] ✅ Campo encontrado: ${selector}`);
                    return { locator: field, selector };
                }
            } catch {
                // Continuar
            }
        }

        return null;
    }

    private async analyzeField(field: any): Promise<{
        tag: string;
        isContentEditable: boolean;
        omegaAction: string | null;
    }> {
        const tag = (await field.evaluate((el: any) => el.tagName)).toLowerCase();
        const isContentEditable = await field.evaluate((el: any) => el.contentEditable === 'true');
        const omegaAction = await field.evaluate((el: any) => el.getAttribute('data-omega-action'));

        return { tag, isContentEditable, omegaAction };
    }

    private async handleRTEInput(
        frameLocator: any,
        page: Page,
        inputField: any,
        template: any,
        users: any[],
        textToUse: string
    ): Promise<void> {
        this.logger.log('💬 [Comment] 🔄 Ativando editor RTE...');

        // Clicar para transformar input em editor
        await inputField.click();
        await page.waitForTimeout(1500);

        // Encontrar o editor que apareceu
        const rteField = await this.findRTEEditor(frameLocator);
        if (!rteField) {
            throw new Error('Editor RTE não foi ativado');
        }

        // Usar o editor
        await this.typeInRTEEditor(page, rteField, template, users, textToUse);
    }

    private async findRTEEditor(frameLocator: any): Promise<any> {
        const rteSelectors = [
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            '[role="textbox"][contenteditable="true"]',
        ];

        for (const selector of rteSelectors) {
            try {
                const field = frameLocator.locator(selector).first();
                if (await field.count() > 0 && await field.isVisible()) {
                    this.logger.log(`💬 [Comment] ✅ Editor RTE encontrado`);
                    return field;
                }
            } catch {
                // Continuar
            }
        }

        return null;
    }

    private async typeInRTEEditor(
        page: Page,
        field: any,
        template: any,
        users: any[],
        textToUse: string
    ): Promise<void> {
        // Focar e limpar
        await field.click();
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);

        // Adicionar mentions se necessário
        if (template.mentions && users.length > 0) {
            for (let i = 0; i < users.length; i++) {
                await this.addMention(page, field, users[i]);
                if (i < users.length - 1) {
                    await page.keyboard.insertText(' ');
                }
            }

            if (textToUse) {
                await page.keyboard.insertText(' ' + textToUse);
            }
        } else {
            await page.keyboard.insertText(textToUse);
        }

        this.logger.log('💬 [Comment] ✅ Texto inserido');
    }

    private async addMention(page: Page, frameLocator: any, user: any): Promise<void> {
        this.logger.log(`💬 [Comment] 👤 Adicionando @${user.name}`);

        await page.keyboard.insertText('@' + user.name);
        await page.waitForTimeout(800);

        // Tentar selecionar do dropdown
        try {
            const option = frameLocator.locator(`[role="option"]:has-text("${user.name}")`).first();
            if (await option.count() > 0) {
                await option.click();
                this.logger.log(`💬 [Comment] ✅ Mention selecionado`);
            } else {
                await page.keyboard.press('Enter');
            }
        } catch {
            await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(300);
    }

    private async handleContentEditable(
        frameLocator: any,
        page: Page,
        field: any,
        template: any,
        users: any[],
        textToUse: string
    ): Promise<void> {
        // Similar ao RTE mas o campo já está pronto
        await this.typeInRTEEditor(page, field, template, users, textToUse);
    }

    private async handleSimpleInput(page: Page, field: any, text: string): Promise<void> {
        this.logger.log('💬 [Comment] 📝 Usando input simples');

        await field.click();
        await page.waitForTimeout(50);

        // Tentar diferentes métodos
        try {
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            await page.keyboard.insertText(text);
        } catch {
            try {
                await field.fill(text);
            } catch {
                await field.insertText(text);
            }
        }

        this.logger.log('💬 [Comment] ✅ Texto inserido');
    }

    private async submitComment(frameLocator: any, page: Page): Promise<void> {
        this.logger.log('💬 [Comment] 📤 Submetendo comentário...');

        const submitSelectors = [
            'button[data-omega-action="submit"]',
            'button[data-omega-element="submit"]',
            'button:has-text("Submit")',
        ];

        for (const selector of submitSelectors) {
            try {
                const button = frameLocator.locator(selector).first();
                if (await button.count() > 0 && await button.isVisible()) {
                    await button.click();
                    this.logger.log('💬 [Comment] ✅ Comentário submetido');
                    await page.waitForTimeout(2000);
                    return;
                }
            } catch {
                // Continuar
            }
        }

        throw new Error('Botão de submit não encontrado');
    }

    // ===== Utilidades =====

    getCommentPreview(previewDto: CommentPreviewDto): CommentPreviewResponseDto {
        try {
            const { commentType, selectedUser } = previewDto;
            const template = COMMENT_TEMPLATES[commentType] || COMMENT_TEMPLATES[CommentType.ASSET_RELEASE];
            const allUsers = this.getUsersForTeam(selectedUser);
            const selected = commentType === CommentType.FINAL_MATERIALS
                ? [this.getLeadUserForTeam(selectedUser) || allUsers[0]].filter(Boolean)
                : allUsers;
            const usersToMention = template.mentions ? selected : [];

            return { success: true, commentText: template.text, users: usersToMention.map((u) => ({ name: u.name, email: u.email, id: u.id })) };
        } catch (error: any) {
            this.logger.error(`❌ Erro ao gerar preview: ${error.message}`);
            throw new Error(`Falha ao gerar preview: ${error.message}`);
        }
    }

    private getUsersForTeam(team: UserTeam): any[] {
        const teamKey = team.toString();
        return USERS_CONFIG[teamKey] || USERS_CONFIG.test;
    }

    // Retorna a líder por time para FINAL_MATERIALS
    private getLeadUserForTeam(team: UserTeam) {
        const teamKey = team.toString();
        const users = USERS_CONFIG[teamKey] || [];
        if (teamKey === 'carol') {
            return users.find(u => u.name === 'Carolina Lipinski') || users[0];
        }
        if (teamKey === 'giovana') {
            return users.find(u => u.name === 'Giovana Jockyman') || users[0];
        }
        // test ou outros: mantemos o primeiro usuário
        return users[0];
    }

    private async closeSidebarIfOpen(frameLocator: any, page: Page): Promise<void> {
        try {
            const sidebar = frameLocator.locator('#page-sidebar [data-testid="minix-container"]').first();
            if (await sidebar.count() > 0 && await sidebar.isVisible()) {
                const closeBtn = frameLocator.locator('button[data-testid="minix-header-close-btn"]').first();
                if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
                    await closeBtn.click();
                    await page.waitForTimeout(600);
                }
            }
        } catch {
            // Ignorar erros ao fechar sidebar
        }
    }

    private async debugShot(page: Page, name: string): Promise<void> {
        try { const dir = path.resolve(process.cwd(), 'automation_debug'); await fs.mkdir(dir, { recursive: true }); const file = path.resolve(dir, `${Date.now()}_${name}.png`); await page.screenshot({ path: file, fullPage: true }); this.logger.log(`🖼️ Debug screenshot salvo: ${file}`); } catch (e: any) { this.logger.warn(`Não foi possível salvar screenshot: ${e?.message}`); }
    }

    // Método auxiliar para buscar campo de comentário (usado no performDocumentComment)
    private async waitForAnyVisibleField(frameLocator: any, page: Page, timeoutMs = 12000): Promise<{ locator: any; selector: string } | null> {
        // Aguardar carregamento
        await page.waitForTimeout(2000);

        const commentFieldSelectors = [
            // Inputs com data-omega
            'input[data-omega-element="add-comment-input"]',

            // Rich text editors
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            '.react-spectrum-RichTextEditor [contenteditable="true"][data-lexical-editor="true"]',
            '[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            'div[contenteditable="true"]',

            // Inputs por aria-label
            'input[aria-label="Add comment"]',
            'input[aria-label="New comment"]',

            // Classes específicas
            '.zo2IKa_spectrum-Textfield-input',

            // Placeholder (para clicar e ativar)
            '.react-spectrum-RichTextEditor-placeholder',

            // Outros seletores
            'input[name="comment"]',
            '[aria-label*="comment" i]',
            'input[placeholder*="comment" i]',
            'textarea[placeholder*="comment" i]',
        ];

        for (const selector of commentFieldSelectors) {
            try {
                const field = frameLocator.locator(selector).first();
                const count = await field.count();

                if (count > 0) {
                    const isVisible = await field.isVisible();

                    if (isVisible) {
                        // Se for placeholder, clicar para ativar o editor
                        if (selector.includes('placeholder')) {
                            try {
                                await field.click({ force: true });
                                await page.waitForTimeout(300);
                            } catch { }
                            // Continuar procurando o campo real
                            continue;
                        }

                        return { locator: field, selector };
                    }
                }
            } catch {
                // Continuar tentando próximo seletor
            }
        }

        return null;
    }

    // ===== Automação standalone (mantido para compatibilidade) =====

    private async performDocumentComment(params: {
        projectUrl: string;
        folderName: string;
        fileName: string;
        commentText: string;
        users: Array<{ name: string; email: string; id?: string }>;
        headless: boolean;
    }): Promise<{ success: boolean; message?: string }> {
        const { projectUrl, folderName, fileName, commentText, users, headless } = params;
        const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        try {
            const statePath = await this.ensureStateFile();
            const context = await browser.newContext({ storageState: statePath, viewport: null });
            const page = await context.newPage();

            await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);
            const frameLocator = this.frameLocator(page);

            // pasta
            await this.closeSidebarIfOpen(frameLocator, page);
            if (folderName && folderName !== 'root') {
                const strategies = [
                    `button:has-text("13. ${folderName}")`,
                    `button:has-text("14. ${folderName}")`,
                    `button:has-text("${folderName}")`,
                    `a:has-text("${folderName}")`,
                    `[role="button"]:has-text("${folderName}")`,
                    `*[data-testid*="item"]:has-text("${folderName}")`,
                ];
                let ok = false;
                for (const sel of strategies) {
                    try { const el = frameLocator.locator(sel).first(); if ((await el.count()) > 0) { await el.click(); await page.waitForTimeout(4000); ok = true; break; } } catch { }
                }
                if (!ok) throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
            }

            // selecionar documento
            await this.closeSidebarIfOpen(frameLocator, page);
            await page.waitForTimeout(2500);
            const docCandidates = await frameLocator.locator('body').evaluate((body, target: string) => {
                const found: any[] = [];
                const els = (body as any).querySelectorAll('.doc-detail-view');
                els.forEach((el: any, idx: number) => {
                    const aria = el.getAttribute('aria-label') || '';
                    const txt = (el.textContent || '').toLowerCase();
                    if (aria.includes(target) || txt.includes(target.toLowerCase())) {
                        found.push({ index: idx, ariaLabel: aria, isVisible: el.offsetWidth > 0 && el.offsetHeight > 0 });
                    }
                });
                return found;
            }, fileName);
            if (!docCandidates || docCandidates.length === 0) throw new Error(`Documento não encontrado: ${fileName}`);
            const target = docCandidates.find((d: any) => d.isVisible) || docCandidates[0];
            if (target?.ariaLabel) await frameLocator.locator(`[aria-label="${target.ariaLabel}"]`).first().click();
            else await frameLocator.locator(`.doc-detail-view:nth-of-type(${(target.index || 0) + 1})`).click();
            await page.waitForTimeout(1200);

            // abrir summary
            await this.closeSidebarIfOpen(frameLocator, page);
            const summaryBtn = frameLocator.locator('button[data-testid="open-summary"]').first();
            if ((await summaryBtn.count()) > 0) { try { await summaryBtn.click(); } catch { } await page.waitForTimeout(2500); }

            // localizar campo de comentário
            const foundField = await this.waitForAnyVisibleField(frameLocator, page, 12000);
            if (!foundField) throw new Error('Campo de comentário não encontrado');

            const usedSelector = foundField.selector;
            let field = frameLocator.locator(usedSelector).first();
            await field.waitFor({ state: 'visible', timeout: 2000 }).catch(() => { });

            const tag = (await field.evaluate((el: any) => el.tagName)).toLowerCase();
            const isCE = await field.evaluate((el: any) => el.contentEditable === 'true');
            await field.click();
            await page.waitForTimeout(200);

            if (tag === 'input') {
                // Primeiro, tentar detectar se este input ativa o editor RTE (para suportar mentions)
                let toggledToRTE = false;
                try {
                    const omegaAction = await field.evaluate((el: any) => el.getAttribute('data-omega-action'));
                    if (omegaAction === 'toggle-RTE-mode') {
                        // Clicar para ativar o RTE
                        await field.click({ force: true });
                        await page.waitForTimeout(600);
                        const rteField = await this.findRTEEditor(frameLocator);
                        if (rteField) {
                            await this.typeInRTEEditor(page, rteField, { mentions: true }, users, commentText);
                            toggledToRTE = true;
                        }
                    }
                } catch { }

                if (!toggledToRTE) {
                    // Sem RTE disponível: fallback para texto simples (mentions podem não ser suportadas)
                    try { await field.scrollIntoViewIfNeeded(); } catch { }
                    try { await field.focus(); } catch { }
                    let finalValue = '';
                    let filledOk = false;
                    try {
                        const handle = await field.elementHandle({ timeout: 800 }).catch(() => null);
                        if (handle) {
                            await handle.evaluate((el: HTMLInputElement, v: string) => {
                                el.focus();
                                el.value = '';
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.value = v;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }, commentText);
                            await page.waitForTimeout(60);
                            finalValue = await field.inputValue().catch(() => '');
                            filledOk = !!finalValue && finalValue.includes(commentText);
                        }
                    } catch { }
                    if (!filledOk) {
                        try {
                            await field.click({ force: true });
                            await page.waitForTimeout(20);
                            await page.keyboard.press('Control+A');
                            await page.keyboard.press('Delete');
                            await page.keyboard.insertText(commentText);
                            await page.waitForTimeout(80);
                            finalValue = await field.inputValue().catch(() => '');
                            filledOk = !!finalValue && finalValue.includes(commentText);
                        } catch { }
                    }
                    if (!filledOk) {
                        try {
                            await field.fill('', { timeout: 600 });
                            await field.fill(commentText, { timeout: 1000 });
                            finalValue = await field.inputValue().catch(() => '');
                            filledOk = !!finalValue && finalValue.includes(commentText);
                        } catch { }
                    }
                    if (!filledOk) throw new Error('Falha ao preencher o campo de comentário (input)');
                }
            } else if (isCE) {
                await field.fill('');
                for (let i = 0; i < users.length; i++) {
                    const u = users[i];
                    await field.insertText('@' + u.name); await page.waitForTimeout(400);
                    try { const opt = frameLocator.locator('[role="option"]').filter({ hasText: u.name }).first(); if ((await opt.count()) > 0) await opt.click(); } catch { }
                    if (i < users.length - 1) await field.insertText(' ');
                }
                if (commentText) await field.insertText(`, ${commentText}`);
            } else { await field.insertText(commentText); }

            const submitSelectors = [
                'button[data-omega-action="submit"]',
                'button[data-omega-element="submit"]',
                'button:has-text("Submit")',
                'button[data-variant="accent"]:has-text("Submit")',
                '.o7Xu8a_spectrum-Button:has-text("Submit")',
            ];
            let submitted = false;
            for (const sel of submitSelectors) {
                try { const btn = frameLocator.locator(sel).first(); if ((await btn.count()) > 0 && (await btn.isVisible())) { await btn.click(); submitted = true; break; } } catch { }
            }
            await page.waitForTimeout(800);
            if (!submitted) throw new Error('Botão de submit não encontrado');

            return { success: true, message: `Comentário adicionado ao documento "${fileName}"` };
        } catch (error: any) {
            this.logger.error(`❌ Erro na automação de comentário: ${error?.message || error}`);
            return { success: false, message: error?.message || 'Falha ao adicionar comentário' };
        } finally {
            try { await browser.close(); } catch { }
        }
    }

    private async ensureStateFile(): Promise<string> {
        const statePath = path.resolve(process.cwd(), 'wf_state.json');
        try { await fs.access(statePath); return statePath; } catch { throw new Error(`Arquivo de sessão não encontrado: ${statePath}. Execute o login primeiro.`); }
    }

    private frameLocator(page: Page): any {
        return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
    }
}
