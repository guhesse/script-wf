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
import { WorkfrontDomHelper } from '../workfront/utils/workfront-dom.helper';
import { ProgressService } from '../workfront/progress.service';

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
    [CommentType.APPROVAL]: { text: 'for your approval.', mentions: true },
};

@Injectable()
export class CommentService {
    private readonly logger = new Logger(CommentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly progress: ProgressService,
    ) { }

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

            // Gerar HTML completo para o comentário
            const rawHtml = this.generateCommentHtml(commentType, selectedUser);

            // Emitir evento de progresso: escrevendo comentário
            const commentPreview = template.text.length > 50 ? template.text.substring(0, 47) + '...' : template.text;
            this.progress.publish({
                projectUrl,
                phase: 'info',
                message: `Escrevendo: "${commentPreview}"`,
            });

            const auto = await this.performDocumentComment({
                projectUrl,
                folderName: folderName || 'root',
                fileName,
                commentText: template.text,
                users,
                headless: headless === true ? true : false,
                commentMode: 'raw', // Sempre usar modo raw para HTML completo
                rawHtml,
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
        commentMode?: 'plain' | 'raw';
        rawHtml?: string;
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

        // Gerar HTML completo
        const rawHtml = testMode ? '<p>teste</p>' : this.generateCommentHtml(commentType, selectedUser);

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

            // 5. Adicionar comentário usando HTML completo
            await this.addCommentToField(frameLocator, page, template, users, '', { commentMode: 'raw', rawHtml });

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

    // ===== Novo método para gerar HTML completo =====
    private generateCommentHtml(commentType: CommentType, selectedUser: UserTeam): string {
        const teamKey = selectedUser.toString();
        const users = this.getUsersForTeam(selectedUser);
        const template = COMMENT_TEMPLATES[commentType];

        // Approval: líder do time + SM team
        if (commentType === CommentType.APPROVAL) {
            const leader = this.getLeadUserForTeam(selectedUser);
            if (!leader) return `<p>for your approval.</p>`;

            // HTML compacto sem quebras de linha
            return `<p class="mb-0"><a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/${leader.id}" class="mention" data-mention="${leader.id}" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@${leader.name}</a> <span> </span><a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66abd595000d58f156ae2cce417fd0a4" class="mention" data-mention="USER_66abd595000d58f156ae2cce417fd0a4" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@Avidesh Bind</a> <span> </span><a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66ab9d50000ead1d50a66758735c020b" class="mention" data-mention="USER_66ab9d50000ead1d50a66758735c020b" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@Saish Kadam</a> <span> </span><a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66a7e9b200333682efc3e680ca25bde8" class="mention" data-mention="USER_66a7e9b200333682efc3e680ca25bde8" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@Jogeshkumar Vishwakarma</a>, ${template.text}</p>`;
        }

        // Asset Release: equipe completa
        if (commentType === CommentType.ASSET_RELEASE) {
            // Construir mentions de forma compacta com espaços corretos
            const mentionsHtml = users.map(user =>
                `<a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/${user.id}" class="mention" data-mention="${user.id}" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@${user.name}</a>`
            ).join(' <span> </span>');

            return `<p class="mb-0">${mentionsHtml}, ${template.text}</p>`;
        }

        // Final Materials: apenas líder
        if (commentType === CommentType.FINAL_MATERIALS) {
            const leader = this.getLeadUserForTeam(selectedUser);
            if (!leader) return `<p>${template.text}</p>`;

            return `<p class="mb-0"><a href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/${leader.id}" class="mention" data-mention="${leader.id}" data-lexical-mention="true" target="_blank" rel="noopener noreferrer">@${leader.name}</a>, ${template.text}</p>`;
        }

        return `<p>${template.text}</p>`;
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
                    await page.waitForTimeout(1500);
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
        // Usar WorkfrontDomHelper otimizado ao invés de implementação própria
        return WorkfrontDomHelper.selectDocument(frameLocator, page, fileName);
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
                this.logger.log('💬 [Comment] ⏳ Aguardando 5s para painel carregar (arquivos grandes podem demorar)...');
                await page.waitForTimeout(5000); // Aumentado para 5s para arquivos grandes
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
        textToUse: string,
        options?: { commentMode?: 'plain' | 'raw'; rawHtml?: string }
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
        if (options?.commentMode === 'raw' && options?.rawHtml) {
            this.logger.log('💬 [Comment] 🎯 Modo RAW ativado - injetando HTML diretamente');

            // Se for input que vira RTE, ativar primeiro
            if (fieldInfo.tag === 'input' && fieldInfo.omegaAction === 'toggle-RTE-mode') {
                this.logger.log('💬 [Comment] 🔄 Ativando RTE para injeção Raw...');
                await commentField.click();
                await page.waitForTimeout(1500);

                const rteField = await this.findRTEEditor(frameLocator);
                if (rteField) {
                    await this.injectRawHtml(page, rteField, options.rawHtml, { tag: 'div', isContentEditable: true, omegaAction: null });
                } else {
                    throw new Error('RTE não foi ativado para modo Raw');
                }
            } else {
                // Usar campo atual diretamente
                await this.injectRawHtml(page, commentField, options.rawHtml, fieldInfo);
            }

            this.logger.log('💬 [Comment] ✅ HTML bruto injetado - finalizando');
            return;
        }

        // Remover métodos antigos, sempre usar raw
        throw new Error('Modo plain não suportado - use raw mode');
    }

    private async findCommentField(frameLocator: any, page: Page): Promise<{ locator: any; selector: string } | null> {
        this.logger.log('💬 [Comment] Procurando campo de comentário...');

        // Aguardar carregamento (aumentado para dar tempo ao painel carregar com arquivos grandes)
        await page.waitForTimeout(2500);

        const selectors = [
            // Seletores específicos do Workfront
            'input[data-omega-element="add-comment-input"]',
            'input[data-omega-action="toggle-RTE-mode"]',

            // Rich Text Editors
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            '[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"]',

            // Inputs comuns
            'input[aria-label="Add comment"]',
            'input[aria-label*="comment" i]',
            'textarea[aria-label*="comment" i]',

            // Classes específicas
            '.zo2IKa_spectrum-Textfield-input',
            'input[class*="Textfield-input"]',

            // Placeholder (clicar para ativar)
            '.react-spectrum-RichTextEditor-placeholder',
        ];

        for (const selector of selectors) {
            try {
                const field = frameLocator.locator(selector).first();
                const count = await field.count();

                if (count > 0) {
                    const isVisible = await field.isVisible().catch(() => false);
                    this.logger.log(`💬 [Field] 🔍 Testando "${selector}": count=${count}, visible=${isVisible}`);

                    if (isVisible) {
                        // Se for placeholder, clicar para ativar e procurar novamente
                        if (selector.includes('placeholder')) {
                            this.logger.log(`💬 [Field] 🎯 Clicando placeholder para ativar editor...`);
                            await field.click({ force: true });
                            await page.waitForTimeout(1000);
                            // Recursão para encontrar o campo real ativado
                            continue;
                        }

                        this.logger.log(`💬 [Field] ✅ Campo encontrado: ${selector}`);
                        return { locator: field, selector };
                    }
                }
            } catch (e: any) {
                this.logger.warn(`💬 [Field] ⚠️ Erro com "${selector}": ${e?.message}`);
            }
        }

        this.logger.error('💬 [Field] ❌ Nenhum campo de comentário encontrado após testar todos seletores');
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
        textToUse: string,
        options?: { commentMode?: 'plain' | 'raw'; rawHtml?: string }
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
        await this.typeInRTEEditor(page, rteField, template, users, textToUse, options);
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
        textToUse: string,
        options?: { commentMode?: 'plain' | 'raw'; rawHtml?: string }
    ): Promise<void> {
        // Focar e limpar
        await field.click();
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);

        // Raw mode é tratado antes de chegar aqui - só processa typing normal

        // Adicionar mentions se necessário
        // if (template.mentions && users.length > 0) {
        //     for (let i = 0; i < users.length; i++) {
        //         await this.addMention(page, field, users[i]);
        //         if (i < users.length - 1) {
        //             await page.keyboard.insertText(' ');
        //         }
        //     }

        //     if (textToUse) {
        //         await page.keyboard.insertText(' ' + textToUse);
        //     }
        // } else {
        //     await page.keyboard.insertText(textToUse);
        // }

        this.logger.log('💬 [Comment] ✅ Texto inserido');
    }

    // private async addMention(page: Page, frameLocator: any, user: any): Promise<void> {
    //     this.logger.log(`💬 [Comment] 👤 Adicionando @${user.name}`);

    //     await page.keyboard.insertText('@' + user.name);
    //     await page.waitForTimeout(800);

    //     // Tentar selecionar do dropdown
    //     try {
    //         const option = frameLocator.locator(`[role="option"]:has-text("${user.name}")`).first();
    //         if (await option.count() > 0) {
    //             await option.click();
    //             this.logger.log(`💬 [Comment] ✅ Mention selecionado`);
    //         } else {
    //             await page.keyboard.press('Enter');
    //         }
    //     } catch {
    //         await page.keyboard.press('Enter');
    //     }

    //     await page.waitForTimeout(500);
    // }

    private async handleContentEditable(
        frameLocator: any,
        page: Page,
        field: any,
        template: any,
        users: any[],
        textToUse: string,
        options?: { commentMode?: 'plain' | 'raw'; rawHtml?: string }
    ): Promise<void> {
        // Similar ao RTE mas o campo já está pronto
        await this.typeInRTEEditor(page, field, template, users, textToUse, options);
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

        // Aguardar um pouco para garantir que o conteúdo foi processado
        await page.waitForTimeout(500);

        const submitSelectors = [
            'button[data-omega-action="submit"]',
            'button[data-omega-element="submit"]',
            'button:has-text("Submit")',
            'button[aria-label="Submit"]',
            'button.spectrum-Button--primary:has-text("Submit")',
            'button[type="submit"]:has-text("Submit")',
        ];

        let submitted = false;

        // Primeiro, tentar encontrar todos os botões visíveis para debug
        const visibleButtons = await frameLocator.locator('button:visible').all();
        this.logger.log(`💬 [Comment] Encontrados ${visibleButtons.length} botões visíveis`);

        // Listar textos dos botões para debug
        for (const btn of visibleButtons.slice(0, 5)) { // Apenas os primeiros 5 para não poluir o log
            const text = await btn.textContent().catch(() => '');
            const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
            const dataOmega = await btn.getAttribute('data-omega-action').catch(() => '');
            if (text || ariaLabel || dataOmega) {
                this.logger.log(`💬 [Comment] Botão: text="${text?.trim()}" | aria="${ariaLabel}" | omega="${dataOmega}"`);
            }
        }

        // Tentar cada seletor
        for (const selector of submitSelectors) {
            try {
                const button = frameLocator.locator(selector).first();
                const count = await button.count();

                if (count > 0) {
                    const isVisible = await button.isVisible();
                    const isEnabled = await button.isEnabled();

                    this.logger.log(`💬 [Comment] Tentando seletor: ${selector} | visible=${isVisible} | enabled=${isEnabled}`);

                    if (isVisible && isEnabled) {
                        // Scroll até o botão se necessário
                        await button.scrollIntoViewIfNeeded().catch(() => { });

                        // Tentar clicar
                        await button.click({ timeout: 5000 });
                        submitted = true;
                        this.logger.log('💬 [Comment] ✅ Botão clicado com sucesso!');
                        break;
                    }
                }
            } catch (e: any) {
                this.logger.warn(`💬 [Comment] Falha com seletor ${selector}: ${e.message}`);
                // Continuar tentando próximo seletor
            }
        }

        // Se ainda não submeteu, tentar método alternativo
        if (!submitted) {
            this.logger.log('💬 [Comment] Tentando método alternativo: Enter key');

            // Tentar pressionar Enter no campo de comentário
            try {
                // Focar no campo de comentário novamente
                const field = await this.findCommentField(frameLocator, page);
                if (field) {
                    await field.locator.focus();
                    await page.waitForTimeout(200);

                    // Tentar Ctrl+Enter (comum em muitos sistemas de comentário)
                    await page.keyboard.press('Control+Enter');
                    await page.waitForTimeout(1000);

                    // Verificar se o comentário foi enviado
                    const stillHasContent = await field.locator.evaluate((el: HTMLElement) => {
                        return el.innerHTML.length > 10 || el.textContent?.length > 10;
                    }).catch(() => false);

                    if (!stillHasContent) {
                        submitted = true;
                        this.logger.log('💬 [Comment] ✅ Comentário enviado via Ctrl+Enter!');
                    }
                }
            } catch (e: any) {
                this.logger.warn(`💬 [Comment] Ctrl+Enter falhou: ${e.message}`);
            }
        }

        // Se ainda não submeteu, tentar encontrar botão por proximidade
        if (!submitted) {
            this.logger.log('💬 [Comment] Tentando encontrar botão próximo ao campo...');

            try {
                // Buscar botões próximos ao campo de comentário
                const nearbyButton = frameLocator.locator('button').filter({
                    hasText: /submit|post|send|comment/i
                }).first();

                if (await nearbyButton.count() > 0 && await nearbyButton.isVisible()) {
                    await nearbyButton.click();
                    submitted = true;
                    this.logger.log('💬 [Comment] ✅ Botão próximo clicado!');
                }
            } catch (e: any) {
                this.logger.warn(`💬 [Comment] Busca por botão próximo falhou: ${e.message}`);
            }
        }

        if (submitted) {
            // Aguardar o comentário ser processado
            await page.waitForTimeout(2000);
            this.logger.log('💬 [Comment] ✅ Comentário submetido com sucesso!');

            // Verificar se o campo foi limpo (indicação de sucesso)
            try {
                const field = await this.findCommentField(frameLocator, page);
                if (field) {
                    const isEmpty = await field.locator.evaluate((el: HTMLElement) => {
                        return !el.innerHTML || el.innerHTML === '' || el.innerHTML === '<p></p>' || el.innerHTML === '<br>';
                    }).catch(() => true);

                    if (isEmpty) {
                        this.logger.log('💬 [Comment] ✅ Campo limpo - comentário confirmado!');
                    } else {
                        this.logger.warn('💬 [Comment] ⚠️ Campo ainda tem conteúdo - verificar se foi enviado');
                    }
                }
            } catch {
                // Ignorar erros de verificação
            }
        } else {
            // Tirar screenshot para debug
            await this.debugShot(page, 'submit_button_not_found');
            throw new Error('Botão de submit não encontrado ou não clicável');
        }
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
        commentMode: 'plain' | 'raw';
        rawHtml?: string;
    }): Promise<{ success: boolean; message?: string }> {
        const { projectUrl, folderName, fileName, commentText, users, headless, commentMode, rawHtml } = params;
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

            if (commentMode === 'raw' && rawHtml) {
                this.logger.log('💬 [Comment] 🎯 Modo RAW standalone ativado');

                if (tag === 'input') {
                    const omegaAction = await field.evaluate((el: any) => el.getAttribute('data-omega-action'));
                    if (omegaAction === 'toggle-RTE-mode') {
                        await field.click({ force: true });
                        await page.waitForTimeout(600);
                        const rteField = await this.findRTEEditor(frameLocator);
                        if (rteField) {
                            await this.injectRawHtml(page, rteField, rawHtml, { tag: 'div', isContentEditable: true, omegaAction: null });
                        } else {
                            throw new Error('RTE não foi ativado para modo Raw');
                        }
                    } else {
                        throw new Error('Input não suporta modo Raw (não é RTE)');
                    }
                } else if (isCE) {
                    await this.injectRawHtml(page, field, rawHtml, { tag, isContentEditable: true, omegaAction: null });
                } else {
                    throw new Error('Campo não suporta modo Raw');
                }

                this.logger.log('💬 [Comment] ✅ Raw standalone concluído');
            } else {
                throw new Error('Modo plain não suportado - use raw mode');
            }

            await this.submitComment(frameLocator, page);
            await page.waitForTimeout(800);

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

    // ===== Injeção de HTML bruto =====
    private async injectRawHtml(page: Page, field: any, rawHtml: string, fieldInfo: { tag: string; isContentEditable: boolean; omegaAction: any }) {
        this.logger.log('💬 [RAW] Iniciando injeção HTML via Clipboard API...');

        const htmlToInject = rawHtml;
        this.logger.log(`💬 [RAW] HTML a injetar: ${htmlToInject.substring(0, 200)}...`);

        // Focar no campo
        await field.click({ force: true });
        await page.waitForTimeout(300);

        // Limpar campo completamente
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);

        // Verificar se campo está realmente vazio
        const isEmpty = await field.evaluate((el: HTMLElement) => {
            return el.innerHTML === '' || el.innerHTML === '<p></p>' || el.innerHTML === '<br>';
        });

        if (!isEmpty) {
            this.logger.log('💬 [RAW] Campo não estava vazio, limpando novamente...');
            await field.evaluate((el: HTMLElement) => {
                el.innerHTML = '';
                el.textContent = '';
            });
            await page.waitForTimeout(200);
        }

        // Copiar para clipboard e colar
        try {
            // Injeta o HTML no clipboard do navegador
            const clipboardSuccess = await page.evaluate(async (html) => {
                try {
                    // Cria um elemento temporário com o HTML
                    const temp = document.createElement('div');
                    temp.innerHTML = html;
                    temp.style.position = 'absolute';
                    temp.style.left = '-9999px';
                    document.body.appendChild(temp);

                    // Seleciona o conteúdo
                    const range = document.createRange();
                    range.selectNodeContents(temp);
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);

                    // Copia para o clipboard usando execCommand
                    const copySuccess = document.execCommand('copy');

                    // Remove o elemento temporário
                    document.body.removeChild(temp);
                    selection?.removeAllRanges();

                    return copySuccess;
                } catch (e) {
                    console.error('Clipboard copy failed:', e);
                    return false;
                }
            }, htmlToInject);

            if (clipboardSuccess) {
                this.logger.log('💬 [RAW] HTML copiado para clipboard, colando...');

                // Focar no campo novamente
                await field.click({ force: true });
                await page.waitForTimeout(100);

                // Cola usando Ctrl+V
                await page.keyboard.press('Control+V');
                await page.waitForTimeout(1500); // Aguarda o paste ser processado

                // Verifica se o conteúdo foi colado corretamente
                const pasteCheck = await field.evaluate((el: HTMLElement) => {
                    // Busca por diferentes tipos de elementos que indicam mentions
                    const links = el.querySelectorAll('a');
                    const mentions = el.querySelectorAll('.mention, a[data-mention], [data-lexical-mention], span[data-mention]');
                    const atMentions = (el.textContent || '').match(/@\w+/g) || [];

                    return {
                        html: el.innerHTML,
                        text: el.textContent || '',
                        linksCount: links.length,
                        mentionsCount: mentions.length,
                        atMentionsCount: atMentions.length,
                        hasContent: el.innerHTML.length > 10,
                        hasTextContent: (el.textContent || '').length > 10,
                        // Verifica se há duplicação
                        hasDuplicateContent: (el.textContent || '').includes('for your approvalfor your approval') ||
                            (el.textContent || '').includes('segue a pasta com os assets finais da tarefasegue a pasta') ||
                            (el.textContent || '').includes('segue os materiais finais da tarefasegue os materiais')
                    };
                });

                this.logger.log(`💬 [RAW] Após paste: links=${pasteCheck.linksCount} | mentions=${pasteCheck.mentionsCount} | @mentions=${pasteCheck.atMentionsCount} | hasContent=${pasteCheck.hasContent} | text="${pasteCheck.text?.substring(0, 50)}..."`);

                // Se detectar duplicação, limpar e tentar novamente
                if (pasteCheck.hasDuplicateContent) {
                    this.logger.warn('💬 [RAW] ⚠️ Duplicação detectada! Limpando e abortando...');
                    await field.evaluate((el: HTMLElement) => {
                        el.innerHTML = '';
                    });
                    throw new Error('Conteúdo duplicado detectado');
                }

                // SUCESSO: Se tem mentions OU tem @mentions OU tem conteúdo significativo
                const isSuccess = (pasteCheck.mentionsCount > 0 ||
                    pasteCheck.atMentionsCount > 0 ||
                    pasteCheck.linksCount > 0 ||
                    (pasteCheck.hasContent && pasteCheck.text.includes('@'))) &&
                    pasteCheck.hasTextContent;

                if (isSuccess) {
                    this.logger.log('💬 [RAW] ✅ Conteúdo inserido com sucesso! Mentions detectadas ou texto com @');

                    // Aguardar um pouco para garantir que o Workfront processou
                    await page.waitForTimeout(500);

                    return; // Sucesso - retorna para prosseguir com submit
                }

                // Se não teve sucesso completo mas tem algum conteúdo, ainda considerar sucesso
                if (pasteCheck.hasContent && pasteCheck.hasTextContent) {
                    this.logger.warn('💬 [RAW] ⚠️ Conteúdo inserido mas sem mentions detectadas. Prosseguindo mesmo assim...');
                    return; // Prossegue mesmo assim
                }

                // Só falhar se realmente não tiver conteúdo
                throw new Error(`Paste não funcionou: links=${pasteCheck.linksCount}, mentions=${pasteCheck.mentionsCount}, content=${pasteCheck.hasContent}`);
            } else {
                throw new Error('Falha ao copiar HTML para clipboard');
            }
        } catch (e: any) {
            // Se o erro for sobre mentions mas tem conteúdo, não propagar o erro
            if (e.message.includes('Paste não funcionou') && e.message.includes('content=true')) {
                this.logger.warn(`💬 [RAW] ⚠️ ${e.message} - mas prosseguindo pois tem conteúdo`);
                return; // Prossegue mesmo com aviso
            }

            this.logger.error(`💬 [RAW] Erro no método clipboard: ${e.message}`);
            throw e;
        }
    }
}
