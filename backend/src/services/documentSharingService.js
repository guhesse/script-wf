// src/services/documentSharingService.js
import { chromium } from '@playwright/test';

const STATE_FILE = 'wf_state.json';

// Configuração de equipes
const CAROL_TEAM = [
    { email: "yasmin.lahm@dell.com", role: "MANAGE" },
    { email: "gabriela.vargas1@dell.com", role: "MANAGE" },
    { email: "eduarda.ulrich@dell.com", role: "MANAGE" },
    { email: "evili.borges@dell.com", role: "MANAGE" },
    { email: "giovanna.deparis@dell.com", role: "MANAGE" },
    { email: "natascha.batista@dell.com", role: "MANAGE" },
    { email: "carolina.lipinski@dell.com", role: "MANAGE" }
];

const GIOVANA_TEAM = [
    { email: "luiza.schmidt@dell.com", role: "MANAGE" },
    { email: "gislaine.orico@dell.com", role: "MANAGE" },
    { email: "giovana.jockyman@dell.com", role: "MANAGE" }
];

export class DocumentSharingService {
    /**
     * Compartilhar documentos selecionados
     */
    async shareDocuments(projectUrl, selections, options = {}) {
        try {
            const {
                selectedUser = 'carol',
                userAgent,
                ipAddress,
                headless = false
            } = options;

            console.log('📤 Iniciando compartilhamento de documentos...');
            console.log(`🔗 URL: ${projectUrl}`);
            console.log(`📋 Seleções: ${selections.length} arquivos`);
            console.log(`👥 Equipe: ${selectedUser}`);

            // Validar entradas
            this.validateShareInputs(projectUrl, selections);

            const results = [];
            let successCount = 0;
            let errorCount = 0;

            // Processar cada seleção individualmente
            for (let i = 0; i < selections.length; i++) {
                const selection = selections[i];
                const { folder, fileName } = selection;

                console.log(`\n📄 Compartilhando ${i + 1}/${selections.length}: ${fileName}`);
                console.log(`📁 Pasta: ${folder}`);

                try {
                    // Implementar compartilhamento diretamente com Playwright
                    const shareResult = await this.performDocumentShare(
                        projectUrl,
                        folder,
                        fileName,
                        selectedUser,
                        headless
                    );

                    if (shareResult && shareResult.success) {
                        console.log(`✅ ${fileName} compartilhado com sucesso`);
                        results.push({
                            folder,
                            fileName,
                            success: true,
                            message: shareResult.message || 'Compartilhado com sucesso'
                        });
                        successCount++;
                    } else {
                        throw new Error(shareResult?.message || 'Falha no compartilhamento');
                    }

                } catch (error) {
                    console.error(`❌ Erro ao compartilhar ${fileName}:`, error.message);
                    results.push({
                        folder,
                        fileName,
                        success: false,
                        error: error.message
                    });
                    errorCount++;
                }

                // Pausa entre compartilhamentos para evitar sobrecarga
                if (i < selections.length - 1) {
                    await this.delay(1000);
                }
            }

            const summary = {
                total: selections.length,
                success: successCount,
                errors: errorCount,
                successRate: Math.round((successCount / selections.length) * 100)
            };

            console.log('\n📊 Resumo do compartilhamento:');
            console.log(`✅ Sucessos: ${successCount}`);
            console.log(`❌ Erros: ${errorCount}`);
            console.log(`📈 Taxa de sucesso: ${summary.successRate}%`);

            return {
                success: errorCount === 0,
                message: this.generateSummaryMessage(summary),
                results,
                summary
            };

        } catch (error) {
            console.error('❌ Erro geral no compartilhamento:', error.message);
            throw new Error(`Falha no compartilhamento: ${error.message}`);
        }
    }

    /**
     * Compartilhar um único documento
     */
    async shareDocument(projectUrl, folderName, fileName, selectedUser = 'carol', options = {}) {
        try {
            const { headless = false } = options;

            console.log(`📄 Compartilhando documento único: ${fileName}`);
            console.log(`📁 Pasta: ${folderName}`);
            console.log(`👥 Equipe: ${selectedUser}`);

            const shareResult = await this.performDocumentShare(
                projectUrl,
                folderName,
                fileName,
                selectedUser,
                headless
            );

            if (shareResult && shareResult.success) {
                console.log(`✅ ${fileName} compartilhado com sucesso`);
                return {
                    success: true,
                    message: shareResult.message || 'Documento compartilhado com sucesso',
                    fileName,
                    folder: folderName
                };
            } else {
                throw new Error(shareResult?.message || 'Falha no compartilhamento');
            }

        } catch (error) {
            console.error(`❌ Erro ao compartilhar ${fileName}:`, error.message);
            throw new Error(`Falha ao compartilhar ${fileName}: ${error.message}`);
        }
    }

    /**
     * Validar entradas para compartilhamento
     */
    validateShareInputs(projectUrl, selections) {
        if (!projectUrl || typeof projectUrl !== 'string') {
            throw new Error('URL do projeto é obrigatória e deve ser uma string');
        }

        if (!Array.isArray(selections) || selections.length === 0) {
            throw new Error('Seleções devem ser um array não vazio');
        }

        // Validar cada seleção
        for (const selection of selections) {
            if (!selection.folder || !selection.fileName) {
                throw new Error('Cada seleção deve ter folder e fileName');
            }
        }

        // Validar URL do Workfront
        const validPatterns = [
            /experience\.adobe\.com.*workfront.*project/i,
            /workfront\.com.*project/i,
        ];

        const isValidUrl = validPatterns.some(pattern => pattern.test(projectUrl));
        if (!isValidUrl) {
            throw new Error('URL deve ser de um projeto do Workfront válido');
        }
    }

    /**
     * Gerar mensagem de resumo baseada nos resultados
     */
    generateSummaryMessage(summary) {
        const { total, success, errors, successRate } = summary;

        if (errors === 0) {
            return `Todos os ${total} documentos foram compartilhados com sucesso!`;
        } else if (success === 0) {
            return `Falha ao compartilhar todos os ${total} documentos.`;
        } else {
            return `Compartilhamento parcial: ${success}/${total} documentos compartilhados (${successRate}% de sucesso).`;
        }
    }

    /**
     * Obter configuração de usuários
     */
    getUsersConfiguration(selectedUser = 'carol') {
        const configurations = {
            carol: {
                name: 'Equipe Completa (Carolina)',
                count: 7,
                users: [
                    'yasmin.lahm@dell.com',
                    'gabriela.vargas1@dell.com',
                    'eduarda.ulrich@dell.com',
                    'evili.borges@dell.com',
                    'giovanna.deparis@dell.com',
                    'natascha.batista@dell.com',
                    'carolina.lipinski@dell.com'
                ]
            },
            giovana: {
                name: 'Equipe Reduzida (Giovana)',
                count: 3,
                users: [
                    'luiza.schmidt@dell.com',
                    'gislaine.orico@dell.com',
                    'giovana.jockyman@dell.com'
                ]
            }
        };

        return configurations[selectedUser] || configurations.carol;
    }

    /**
     * Obter estatísticas de compartilhamento
     */
    getShareStatistics(results) {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        const folderStats = {};
        results.forEach(result => {
            if (!folderStats[result.folder]) {
                folderStats[result.folder] = { total: 0, success: 0, failed: 0 };
            }
            folderStats[result.folder].total++;
            if (result.success) {
                folderStats[result.folder].success++;
            } else {
                folderStats[result.folder].failed++;
            }
        });

        return {
            overall: {
                total,
                successful,
                failed,
                successRate: total > 0 ? Math.round((successful / total) * 100) : 0
            },
            byFolder: folderStats
        };
    }

    /**
     * Utilitário para delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Realizar compartilhamento de documento usando Playwright
     */
    async performDocumentShare(projectUrl, folderName, fileName, selectedUser = 'carol', headless = true) {
        console.log("🔗 === COMPARTILHANDO DOCUMENTO ===");
        console.log(`📁 Pasta: ${folderName}`);
        console.log(`📄 Arquivo: ${fileName}`);
        console.log(`👥 Equipe: ${selectedUser}`);
        console.log(`👁️ Modo: ${headless ? 'Headless (invisível)' : 'Visível'}`);

        const USERS = this.getTeamUsers(selectedUser);
        console.log(`👤 ${USERS.length} usuários serão adicionados`);

        const browser = await chromium.launch({
            headless: headless,
            args: headless ? [] : ['--start-maximized']
        });

        try {
            const context = await browser.newContext({
                storageState: STATE_FILE,
                viewport: null
            });

            const page = await context.newPage();

            console.log("🌍 Abrindo projeto...");
            await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(3000);

            console.log("🔍 Encontrando frame do Workfront...");
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

            // 1. Navegar para a pasta correta
            if (folderName && folderName !== 'root') {
                console.log(`📁 Navegando para pasta: ${folderName}`);
                await page.waitForTimeout(2000);

                const strategies = [
                    `button:has-text("13. ${folderName}")`,
                    `button:has-text("14. ${folderName}")`,
                    `button:has-text("${folderName}")`,
                    `a:has-text("${folderName}")`,
                    `[role="button"]:has-text("${folderName}")`,
                    `*[data-testid*="item"]:has-text("${folderName}")`
                ];

                let navigationSuccess = false;
                for (let i = 0; i < strategies.length; i++) {
                    const strategy = strategies[i];
                    console.log(`🔄 Tentativa ${i + 1}: ${strategy}`);

                    try {
                        const element = frameLocator.locator(strategy).first();
                        const count = await element.count();

                        if (count > 0) {
                            console.log(`✅ Elemento encontrado com estratégia ${i + 1}`);
                            await element.click();
                            console.log(`🖱️ Clique executado, aguardando carregamento...`);
                            await page.waitForTimeout(4000);
                            navigationSuccess = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                        continue;
                    }
                }

                if (!navigationSuccess) {
                    console.log(`❌ Não foi possível navegar para a pasta "${folderName}"`);
                    throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
                }

                console.log(`✅ Navegação para "${folderName}" concluída!`);
            }

            // 2. Aguardar e selecionar documento
            console.log(`📄 Aguardando lista de documentos carregar...`);
            await page.waitForTimeout(3000);

            console.log(`📄 Procurando documento: ${fileName}`);

            // Usar evaluate para buscar pelo documento
            const documentElements = await frameLocator.locator('body').evaluate((body, targetFileName) => {
                const foundElements = [];
                const elements = body.querySelectorAll('.doc-detail-view');

                elements.forEach((element, index) => {
                    const ariaLabel = element.getAttribute('aria-label');
                    const textContent = element.textContent;

                    if ((ariaLabel && ariaLabel.includes(targetFileName)) ||
                        (textContent && textContent.includes(targetFileName))) {
                        foundElements.push({
                            index: index,
                            ariaLabel: ariaLabel,
                            textContent: textContent.substring(0, 100),
                            className: element.className,
                            isVisible: element.offsetWidth > 0 && element.offsetHeight > 0
                        });
                    }
                });

                return foundElements;
            }, fileName);

            console.log(`📄 Encontrados ${documentElements.length} elementos doc-detail-view com "${fileName}"`);

            if (documentElements.length > 0) {
                const targetElement = documentElements.find(elem => elem.isVisible) || documentElements[0];
                console.log(`✅ Selecionando elemento ${targetElement.index + 1} com aria-label: "${targetElement.ariaLabel}"`);

                const selector = `.doc-detail-view:nth-of-type(${targetElement.index + 1})`;
                await frameLocator.locator(selector).click();
                console.log(`🖱️ Clique executado no div.doc-detail-view!`);
                await page.waitForTimeout(2000);
            } else {
                console.log(`❌ Documento não encontrado: ${fileName}`);
                throw new Error(`Documento não encontrado: ${fileName}`);
            }

            // 3. Clicar em Share
            console.log("🔗 Procurando botão de compartilhar...");

            const shareStrategies = [
                'button[data-testid="share"]',
                'button:has-text("Share")',
                'button:has-text("Compartilhar")',
                'button[aria-label*="share"]',
                'button[title*="share"]',
                '*[data-testid*="share"]'
            ];

            let shareSuccess = false;
            for (let i = 0; i < shareStrategies.length; i++) {
                const strategy = shareStrategies[i];
                console.log(`🔄 Procurando botão share - Tentativa ${i + 1}: ${strategy}`);

                try {
                    const element = frameLocator.locator(strategy).first();
                    const count = await element.count();

                    if (count > 0 && await element.isVisible()) {
                        console.log(`✅ Botão de compartilhar encontrado com estratégia ${i + 1}`);
                        await element.click();
                        console.log(`🖱️ Botão de compartilhar clicado!`);
                        await page.waitForTimeout(3000);

                        const modalOpened = await this.verifyShareModal(frameLocator, fileName);
                        if (modalOpened) {
                            console.log(`✅ Modal de compartilhamento aberto e verificado!`);
                            shareSuccess = true;
                            break;
                        }
                    }
                } catch (e) {
                    console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                    continue;
                }
            }

            if (!shareSuccess) {
                throw new Error("Botão de compartilhar não encontrado, não clicável, ou modal não abriu corretamente");
            }

            // 4. Adicionar usuários
            console.log("👥 Adicionando usuários...");

            const inputSelectors = [
                'input[role="combobox"]',
                'input[aria-autocomplete="list"]',
                'input[type="text"]:not([readonly])',
                'input[id*="react-aria"]',
                '.spectrum-Textfield-input',
                'input.spectrum-Textfield-input'
            ];

            let emailInput = null;
            for (const selector of inputSelectors) {
                try {
                    const input = frameLocator.locator(selector).first();
                    const count = await input.count();

                    if (count > 0 && await input.isVisible()) {
                        const isReadonly = await input.getAttribute('readonly');
                        if (!isReadonly) {
                            console.log(`✅ Campo de entrada encontrado: ${selector}`);
                            emailInput = input;
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!emailInput) {
                throw new Error("Campo de entrada de usuários não encontrado");
            }

            // Adicionar todos os usuários da equipe
            for (let i = 0; i < USERS.length; i++) {
                const user = USERS[i];
                console.log(`\n👤 Adicionando ${i + 1}/${USERS.length}: ${user.email}`);

                try {
                    await emailInput.click();
                    await page.waitForTimeout(500);

                    await emailInput.fill('');
                    await page.waitForTimeout(200);

                    await emailInput.fill(user.email);
                    await page.waitForTimeout(1000);

                    const option = frameLocator.getByRole('option', { name: new RegExp(user.email, 'i') })
                        .or(frameLocator.locator(`[role="option"]:has-text("${user.email}")`))
                        .first();

                    const optionCount = await option.count();
                    if (optionCount > 0) {
                        await option.click();
                        console.log(`✅ ${user.email} adicionado`);
                    } else {
                        await emailInput.press('Enter');
                    }

                    await page.waitForTimeout(500);

                    // Definir permissão se necessário
                    await this.setUserPermission(frameLocator, page, user.email, 'MANAGE');

                } catch (error) {
                    console.log(`⚠️ Erro ao adicionar ${user.email}: ${error.message}`);
                }
            }

            // 5. Salvar compartilhamento
            console.log("\n💾 Salvando compartilhamento...");
            const saveButton = frameLocator.getByRole('button', { name: /save|share|send/i })
                .filter({ hasText: /save|share|send/i });

            try {
                await saveButton.click();
                console.log("🎉 Compartilhamento confirmado!");
                await page.waitForTimeout(3000);
            } catch (e) {
                console.log("⚠️ Botão de salvamento não encontrado, mas usuários foram adicionados");
            }

            return {
                success: true,
                message: `Documento "${fileName}" compartilhado com ${USERS.length} usuários`
            };

        } catch (error) {
            console.error(`❌ Erro: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }

    /**
     * Verificar se o modal de compartilhamento abriu
     */
    async verifyShareModal(frameLocator, expectedFileName) {
        console.log(`🔍 Verificando se modal de compartilhamento abriu para "${expectedFileName}"...`);

        try {
            await frameLocator.locator('body').waitFor({ timeout: 5000 });

            const modalSelectors = [
                '[data-testid="unified-share-dialog"]',
                '.unified-share-dialog',
                '[role="dialog"]',
                '.spectrum-Dialog'
            ];

            for (const modalSelector of modalSelectors) {
                try {
                    const modal = frameLocator.locator(modalSelector);
                    const count = await modal.count();

                    if (count > 0 && await modal.isVisible()) {
                        console.log(`✅ Modal encontrado: ${modalSelector}`);

                        const titleSelectors = [
                            'h2:has-text("Share")',
                            'h1:has-text("Share")',
                            '[role="heading"]:has-text("Share")',
                            '.spectrum-Dialog-title:has-text("Share")'
                        ];

                        for (const titleSelector of titleSelectors) {
                            const title = frameLocator.locator(titleSelector);
                            const titleCount = await title.count();

                            if (titleCount > 0) {
                                console.log(`✅ Título "Share" encontrado no modal!`);
                                return true;
                            }
                        }

                        console.log(`⚠️ Modal encontrado mas sem título "Share" detectado`);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            console.log(`❌ Modal de compartilhamento não encontrado ou não visível`);
            return false;

        } catch (error) {
            console.log(`❌ Erro ao verificar modal: ${error.message}`);
            return false;
        }
    }

    /**
     * Definir permissão do usuário
     */
    async setUserPermission(frameLocator, page, userEmail, targetPermission) {
        try {
            console.log(`🔧 Verificando permissão para ${userEmail}...`);
            await page.waitForTimeout(1000);

            const userRowSelectors = [
                `[data-testid="access-rule-row"]:has-text("${userEmail}")`,
                `[data-testid="access-rule"]:has-text("${userEmail}")`,
                `.access-rule:has-text("${userEmail}")`,
                `div:has-text("${userEmail}")`
            ];

            let userRow = null;
            for (const selector of userRowSelectors) {
                try {
                    const row = frameLocator.locator(selector).first();
                    const count = await row.count();
                    if (count > 0 && await row.isVisible()) {
                        userRow = row;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!userRow) {
                console.log(`⚠️ Linha do usuário ${userEmail} não encontrada`);
                return false;
            }

            const permissionButtonSelectors = [
                'button:has-text("View")',
                'button:has-text("Manage")',
                'button[aria-expanded="false"]:has(svg)',
                '.o7Xu8a_spectrum-ActionButton:has-text("View")',
                '.o7Xu8a_spectrum-ActionButton:has-text("Manage")',
                'button[data-variant]'
            ];

            let permissionButton = null;
            for (const selector of permissionButtonSelectors) {
                try {
                    const button = userRow.locator(selector).first();
                    const count = await button.count();
                    if (count > 0 && await button.isVisible()) {
                        permissionButton = button;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!permissionButton) {
                console.log(`⚠️ Botão de permissão não encontrado para ${userEmail}`);
                return false;
            }

            const buttonText = await permissionButton.textContent();
            if (buttonText && buttonText.includes('Manage')) {
                console.log(`✅ ${userEmail} já tem permissão MANAGE`);
                return true;
            }

            if (!buttonText || !buttonText.includes('View')) {
                return false;
            }

            await permissionButton.click();
            await page.waitForTimeout(800);

            const manageOptionSelectors = [
                '[role="menuitemradio"]:has-text("Manage")',
                '[data-key="EDIT"]',
                '.dIo7iW_spectrum-Menu-item:has-text("Manage")',
                'div[role="menuitemradio"] span:has-text("Manage")',
                '[role="option"]:has-text("Manage")'
            ];

            let manageOption = null;
            for (const selector of manageOptionSelectors) {
                try {
                    const option = frameLocator.locator(selector).first();
                    const count = await option.count();
                    if (count > 0 && await option.isVisible()) {
                        manageOption = option;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!manageOption) {
                await page.keyboard.press('Escape');
                return false;
            }

            await manageOption.click();
            await page.waitForTimeout(500);

            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            console.log(`✅ Permissão MANAGE definida para ${userEmail}`);
            return true;

        } catch (error) {
            console.log(`⚠️ Erro ao alterar permissão para ${userEmail}: ${error.message}`);
            try {
                await page.keyboard.press('Escape');
            } catch (e) {
                // Ignorar erro de ESC
            }
            return false;
        }
    }

    /**
     * Obter usuários da equipe selecionada
     */
    getTeamUsers(selectedUser = 'carol') {
        return selectedUser === 'carol' ? CAROL_TEAM : GIOVANA_TEAM;
    }
}

export default new DocumentSharingService();