// src/services/documentCommentService.js
import { chromium } from '@playwright/test';
import fs from 'fs/promises';

const STATE_FILE = 'wf_state.json';

// Configuração de usuários baseada no approval.html
const USERS_CONFIG = {
    // Carolina's team
    carol: [
        { 
            name: "Yasmin Lahm", 
            email: "yasmin.lahm@dell.com", 
            id: "USER_682e04f003a037009d7bb6434c90f1bc",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682e04f003a037009d7bb6434c90f1bc"
        },
        { 
            name: "Gabriela Vargas", 
            email: "gabriela.vargas1@dell.com", 
            id: "USER_682cca1400bed8ae9149fedfdc5b0170",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682cca1400bed8ae9149fedfdc5b0170"
        },
        { 
            name: "Eduarda Ulrich", 
            email: "eduarda.ulrich@dell.com", 
            id: "USER_66f6ab9b050fd317df75ed2a4de184e7",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66f6ab9b050fd317df75ed2a4de184e7"
        },
        { 
            name: "Evili Borges", 
            email: "evili.borges@dell.com", 
            id: "USER_6610596c008d57c44df182ec8183336d",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6610596c008d57c44df182ec8183336d"
        },
        { 
            name: "Giovanna Deparis", 
            email: "giovanna.deparis@dell.com", 
            id: "USER_682e04e403a004b47dad0ce00a992d84",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682e04e403a004b47dad0ce00a992d84"
        },
        { 
            name: "Natascha Batista", 
            email: "natascha.batista@dell.com", 
            id: "USER_6867f5d90093ad0c57fbe5a22851a7d0",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6867f5d90093ad0c57fbe5a22851a7d0"
        },
        { 
            name: "Carolina Lipinski", 
            email: "carolina.lipinski@dell.com", 
            id: "USER_6404f185031cb4594c66a99fa57c36e5",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6404f185031cb4594c66a99fa57c36e5"
        }
    ],
    // Giovana's team
    giovana: [
        { 
            name: "Luiza Schmidt", 
            email: "luiza.schmidt@dell.com", 
            id: "USER_66bcb320058d74ff5c0d17dd973e2de4",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66bcb320058d74ff5c0d17dd973e2de4"
        },
        { 
            name: "Gislaine Orico Paz", 
            email: "gislaine.orico@dell.com", 
            id: "USER_66548d5f197c3da898c4645c95589111",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66548d5f197c3da898c4645c95589111"
        },
        { 
            name: "Giovana Jockyman", 
            email: "giovana.jockyman@dell.com", 
            id: "USER_6414745101140908a941c911fbe572b4",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6414745101140908a941c911fbe572b4"
        }
    ],
    // Para testes
    test: [
        { 
            name: "Gustavo Hesse", 
            email: "gustavo.hesse@dell.com", 
            id: "USER_6601d747001b2091cb952da29f7285e5",
            url: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6601d747001b2091cb952da29f7285e5"
        }
    ]
};

// Templates de comentários
const COMMENT_TEMPLATES = {
    assetRelease: {
        carol: (users) => `${users.map(u => `@${u.name}`).join(' ')}, segue a pasta com os assets finais da tarefa.`,
        giovana: (users) => `${users.map(u => `@${u.name}`).join(' ')}, segue a pasta com os assets finais da tarefa.`,
        test: (users) => `${users.map(u => `@${u.name}`).join(' ')}, teste de approval.`
    },
    finalMaterials: {
        carol: (users) => `@Carolina Lipinski, segue os materiais finais da tarefa.`,
        giovana: (users) => `@Giovana Jockyman, segue os materiais finais da tarefa.`,
        test: (users) => `@Gustavo Hesse, teste de materiais finais.`
    },
    approval: {
        carol: (users) => `@Carolina Lipinski @Avidesh Bind @Saish Kadam @Jogeshkumar Vishwakarma, for your approval.`,
        giovana: (users) => `@Giovana Jockyman @Avidesh Bind @Saish Kadam @Jogeshkumar Vishwakarma, for your approval.`,
        test: (users) => `@Gustavo Hesse, teste de approval.`
    }
};

export class DocumentCommentService {
    /**
     * Adicionar comentário em um documento
     */
    async addComment(projectUrl, folderName, fileName, commentType = 'assetRelease', selectedUser = 'test', options = {}) {
        try {
            console.log('💬 === ADICIONANDO COMENTÁRIO NO DOCUMENTO ===');
            console.log(`📁 Pasta: ${folderName}`);
            console.log(`📄 Arquivo: ${fileName}`);
            console.log(`🏷️ Tipo: ${commentType}`);
            console.log(`👥 Equipe: ${selectedUser}`);

            // Validar entradas
            this.validateCommentInputs(projectUrl, fileName, commentType, selectedUser);

            // Obter usuários e template
            const users = this.getUsersForComment(selectedUser);
            const commentText = this.generateCommentText(commentType, selectedUser, users);

            console.log(`📝 Comentário: ${commentText}`);
            console.log(`👤 ${users.length} usuários serão mencionados`);

            // Executar comentário usando Playwright
            const result = await this.performDocumentComment(
                projectUrl, 
                folderName, 
                fileName, 
                commentText, 
                users,
                options.headless !== false
            );

            console.log('✅ Comentário adicionado com sucesso!');
            return result;

        } catch (error) {
            console.error('❌ Erro ao adicionar comentário:', error.message);
            throw error;
        }
    }

    /**
     * Validar entradas para comentário
     */
    validateCommentInputs(projectUrl, fileName, commentType, selectedUser) {
        if (!projectUrl) {
            throw new Error('URL do projeto é obrigatória');
        }

        if (!fileName) {
            throw new Error('Nome do arquivo é obrigatório');
        }

        if (!COMMENT_TEMPLATES[commentType]) {
            throw new Error(`Tipo de comentário inválido: ${commentType}. Tipos disponíveis: ${Object.keys(COMMENT_TEMPLATES).join(', ')}`);
        }

        if (!USERS_CONFIG[selectedUser]) {
            throw new Error(`Equipe inválida: ${selectedUser}. Equipes disponíveis: ${Object.keys(USERS_CONFIG).join(', ')}`);
        }

        console.log('✅ Validação concluída com sucesso');
    }

    /**
     * Obter usuários para mencionar no comentário
     */
    getUsersForComment(selectedUser) {
        return USERS_CONFIG[selectedUser] || [];
    }

    /**
     * Gerar texto do comentário baseado no template
     */
    generateCommentText(commentType, selectedUser, users) {
        const template = COMMENT_TEMPLATES[commentType][selectedUser];
        if (typeof template === 'function') {
            return template(users);
        }
        return template || `@${users[0]?.name || 'Usuário'}, comentário automático.`;
    }

    /**
     * Executar comentário usando Playwright
     */
    async performDocumentComment(projectUrl, folderName, fileName, commentText, users, headless = true) {
        console.log('🎭 Iniciando automação com Playwright...');
        
        const browser = await chromium.launch({
            headless: headless,
            args: headless ? [] : ['--start-maximized']
        });

        try {
            // Verificar se existe sessão salva
            try {
                await fs.access(STATE_FILE);
                console.log('✅ Sessão encontrada');
            } catch {
                throw new Error(`Arquivo de sessão não encontrado: ${STATE_FILE}. Execute o login primeiro.`);
            }

            const context = await browser.newContext({
                storageState: STATE_FILE,
                viewport: null
            });

            const page = await context.newPage();

            console.log('🌍 Carregando projeto...');
            await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(5000); // Aumentado para aguardar carregamento

            console.log('🔍 Encontrando frame do Workfront...');
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
            await page.waitForTimeout(3000); // Aumentado para aguardar frame carregar

            // 1. Navegar para a pasta se especificada
            if (folderName && folderName !== 'root') {
                await this.navigateToFolder(frameLocator, page, folderName);
            }

            // 2. Selecionar o documento
            await this.selectDocument(frameLocator, page, fileName);

            // 3. Abrir o summary
            await this.openSummary(frameLocator, page);

            // 4. Adicionar comentário
            await this.addCommentToDocument(frameLocator, page, commentText, users);

            // 5. Submeter comentário
            await this.submitComment(frameLocator, page);

            console.log('✅ Comentário adicionado com sucesso!');
            
            return {
                success: true,
                message: `Comentário adicionado no documento "${fileName}"`,
                commentText: commentText,
                mentionedUsers: users.length
            };

        } catch (error) {
            console.error(`❌ Erro durante automação: ${error.message}`);
            throw error;
        } finally {
            await browser.close();
        }
    }

    /**
     * Navegar para pasta específica
     */
    async navigateToFolder(frameLocator, page, folderName) {
        console.log(`📁 Navegando para pasta: ${folderName}`);

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
                    await page.waitForTimeout(5000); // Aumentado para aguardar carregamento da pasta
                    navigationSuccess = true;
                    break;
                }
            } catch (e) {
                console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                continue;
            }
        }

        if (!navigationSuccess) {
            throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
        }

        console.log(`✅ Navegação para "${folderName}" concluída!`);
    }

    /**
     * Selecionar documento específico usando estratégia robusta
     */
    async selectDocument(frameLocator, page, fileName) {
        console.log(`📄 Selecionando documento: ${fileName}`);

        await page.waitForTimeout(4000); // Aguardar pasta carregar

        // 🎯 ESTRATÉGIA ESPECÍFICA: Procurar pelo div.doc-detail-view usando evaluate (como documentSharingService)
        console.log(`🎯 ESTRATÉGIA FOCADA: Procurando pelo div.doc-detail-view que contém "${fileName}"`);

        const documentElements = await frameLocator.locator('body').evaluate((body, targetFileName) => {
            const foundElements = [];
            const elements = body.querySelectorAll('.doc-detail-view');

            elements.forEach((element, index) => {
                const ariaLabel = element.getAttribute('aria-label');
                const textContent = element.textContent;

                // Verificar se o elemento contém o nome do arquivo
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

        console.log(`� Encontrados ${documentElements.length} elementos doc-detail-view com "${fileName}"`);
        documentElements.forEach((elem, i) => {
            console.log(`  ${i + 1}. AriaLabel: "${elem.ariaLabel}"`);
            console.log(`     Texto: "${elem.textContent}"`);
            console.log(`     Visível: ${elem.isVisible}`);
        });

        if (documentElements.length > 0) {
            // Usar o primeiro elemento visível encontrado
            const targetElement = documentElements.find(elem => elem.isVisible) || documentElements[0];

            console.log(`✅ Selecionando elemento ${targetElement.index + 1} com aria-label: "${targetElement.ariaLabel}"`);

            // 🎯 SOLUÇÃO CORRETA: Usar aria-label exato para evitar strict mode violation
            console.log(`🎯 Clicando no elemento com aria-label exato: "${targetElement.ariaLabel}"`);
            
            // Usar o aria-label exato para selecionar o elemento específico
            const exactSelector = `[aria-label="${targetElement.ariaLabel}"]`;
            await frameLocator.locator(exactSelector).first().click();
            console.log(`🖱️ Documento selecionado com sucesso!`);
            await page.waitForTimeout(2000);

        } else {
            // Se não encontrou com nome completo, usar estratégias de fallback
            console.log(`❌ Nenhum div.doc-detail-view encontrado para "${fileName}"`);
            console.log(`🔄 Tentando estratégias de fallback...`);

            // Estratégia de fallback: procurar por partes do nome
            const nameParts = fileName.split('_');
            let foundWithFallback = false;

            if (nameParts.length >= 3) {
                const searchTerms = [
                    nameParts.slice(0, 3).join('_'), // Primeiras 3 partes
                    nameParts.slice(0, 2).join('_'), // Primeiras 2 partes
                    nameParts[0] // Primeira parte
                ];

                for (const searchTerm of searchTerms) {
                    console.log(`🔍 Tentando fallback com: "${searchTerm}"`);

                    const fallbackElements = await frameLocator.locator('body').evaluate((body, searchTerm) => {
                        const elements = body.querySelectorAll('.doc-detail-view');
                        const found = [];

                        elements.forEach((element, index) => {
                            const ariaLabel = element.getAttribute('aria-label');
                            const textContent = element.textContent;

                            if ((ariaLabel && ariaLabel.includes(searchTerm)) ||
                                (textContent && textContent.includes(searchTerm))) {
                                found.push({
                                    index: index,
                                    ariaLabel: ariaLabel,
                                    isVisible: element.offsetWidth > 0 && element.offsetHeight > 0
                                });
                            }
                        });

                        return found;
                    }, searchTerm);

                    if (fallbackElements.length > 0) {
                        const targetElement = fallbackElements.find(elem => elem.isVisible) || fallbackElements[0];
                        console.log(`✅ Encontrado com fallback: "${targetElement.ariaLabel}"`);

                        // Usar aria-label exato também no fallback
                        const fallbackSelector = `[aria-label="${targetElement.ariaLabel}"]`;
                        await frameLocator.locator(fallbackSelector).first().click();
                        console.log(`🖱️ Clique executado com fallback!`);
                        foundWithFallback = true;
                        break;
                    }
                }
            }

            if (!foundWithFallback) {
                console.log(`❌ Documento não encontrado: ${fileName}`);
                console.log(`💡 Dica: Verifique se o nome do arquivo está correto ou se ele existe na pasta selecionada`);
                throw new Error(`Documento não encontrado: ${fileName}`);
            }
        }
    }

    /**
     * Abrir summary do documento
     */
    async openSummary(frameLocator, page) {
        console.log('📋 Verificando status do summary...');

        // Primeiro, verificar se o painel do summary já está visível
        const summaryPanelSelectors = [
            '#page-sidebar',
            '.wf-mfe_project',
            '[data-testid*="summary"]',
            '.css-fhpdg7:has-text("SUMMARY")',
            '.css-fhpdg7:has-text("DOCUMENT SUMMARY")'
        ];

        let summaryAlreadyOpen = false;
        for (const selector of summaryPanelSelectors) {
            try {
                const panel = frameLocator.locator(selector).first();
                const count = await panel.count();
                
                if (count > 0 && await panel.isVisible()) {
                    console.log(`✅ Painel do summary detectado: ${selector}`);
                    summaryAlreadyOpen = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (summaryAlreadyOpen) {
            console.log('✅ Summary já está aberto, verificando se há campo de comentário...');
            await page.waitForTimeout(1000);
            
            // Verificar se o campo de comentário está disponível
            const commentFieldVisible = await this.checkCommentFieldAvailable(frameLocator);
            if (commentFieldVisible) {
                console.log('✅ Campo de comentário encontrado no summary aberto');
                return;
            } else {
                console.log('⚠️ Summary aberto mas campo de comentário não encontrado, tentando reabrir...');
            }
        }

        // Tentar abrir/reabrir o summary
        console.log('� Tentando abrir summary...');
        const summaryButton = frameLocator.locator('button[data-testid="open-summary"]').first();
        
        try {
            const buttonCount = await summaryButton.count();
            if (buttonCount > 0) {
                const buttonTitle = await summaryButton.getAttribute('title');
                console.log(`🔍 Botão encontrado, title="${buttonTitle}"`);

                // Tentar clique com diferentes estratégias
                try {
                    await summaryButton.click();
                    console.log('✅ Clique normal executado');
                } catch (interceptError) {
                    console.log('⚠️ Clique interceptado, tentando estratégias alternativas...');
                    
                    // Estratégia 1: Clique forçado
                    try {
                        await summaryButton.click({ force: true });
                        console.log('✅ Clique forçado executado');
                    } catch (forceError) {
                        // Estratégia 2: Usar JavaScript
                        console.log('⚠️ Tentando clique via JavaScript...');
                        await summaryButton.evaluate(button => button.click());
                        console.log('✅ Clique via JavaScript executado');
                    }
                }
                
                console.log('🖱️ Summary processado!');
                await page.waitForTimeout(3000);
            } else {
                console.log('❌ Botão de summary não encontrado');
            }
        } catch (e) {
            console.log(`❌ Erro ao processar summary: ${e.message}`);
        }

        // Aguardar um pouco mais para garantir que o summary carregou
        await page.waitForTimeout(2000);
        console.log('✅ Processamento do summary concluído');
    }

    /**
     * Verificar se o campo de comentário está disponível
     */
    async checkCommentFieldAvailable(frameLocator) {
        const commentFieldSelectors = [
            'input[data-omega-element="add-comment-input"]',
            'input[aria-label="Add comment"]',
            'input[name="comment"]',
            'label:has-text("New comment") + div input',
            '.zo2IKa_spectrum-Textfield-input',
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            '[aria-label="New comment"]',
            'textarea[placeholder*="comment" i]',
            'input[placeholder*="comment" i]'
        ];

        for (const selector of commentFieldSelectors) {
            try {
                const field = frameLocator.locator(selector).first();
                const count = await field.count();
                
                if (count > 0 && await field.isVisible()) {
                    console.log(`✅ Campo de comentário disponível: ${selector}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        
        return false;
    }

    /**
     * Adicionar comentário no documento
     */
    async addCommentToDocument(frameLocator, page, commentText, users) {
        console.log('💬 Adicionando comentário...');

        // Aguardar um pouco para garantir que o summary carregou completamente
        await page.waitForTimeout(2000);

        // Procurar pelo campo de comentário com seletores expandidos
        const commentFieldSelectors = [
            // Seletores específicos baseados no HTML fornecido
            'input[data-omega-element="add-comment-input"]',
            'input[aria-label="Add comment"]',
            'input[name="comment"]',
            
            // Seletores por estrutura
            'label:has-text("New comment") + div input',
            'label:has-text("Add comment") + div input',
            
            // Seletores por classes CSS
            '.zo2IKa_spectrum-Textfield-input',
            '.react-spectrum-RichTextEditor-input[contenteditable="true"]',
            'div[contenteditable="true"][data-lexical-editor="true"]',
            
            // Seletores por atributos
            '[aria-label="New comment"]',
            '[aria-label*="comment" i]',
            '[placeholder*="comment" i]',
            'textarea[placeholder*="comment" i]',
            'input[placeholder*="comment" i]',
            
            // Seletores genéricos de comentário
            'input[type="text"][aria-label*="comment" i]',
            'textarea[aria-label*="comment" i]',
            
            // Seletores de fallback
            '#page-sidebar input[type="text"]',
            '#page-sidebar textarea',
            '.wf-mfe_project input[type="text"]',
            '.wf-mfe_project textarea'
        ];

        console.log('🔍 Procurando campo de comentário...');
        
        let commentField = null;
        let usedSelector = '';
        
        for (let i = 0; i < commentFieldSelectors.length; i++) {
            const selector = commentFieldSelectors[i];
            console.log(`🔄 Tentativa ${i + 1}: ${selector}`);
            
            try {
                const field = frameLocator.locator(selector).first();
                const count = await field.count();

                if (count > 0) {
                    const isVisible = await field.isVisible();
                    console.log(`   📊 Encontrados: ${count}, Visível: ${isVisible}`);
                    
                    if (isVisible) {
                        console.log(`✅ Campo de comentário encontrado: ${selector}`);
                        commentField = field;
                        usedSelector = selector;
                        break;
                    }
                }
            } catch (e) {
                console.log(`   ❌ Erro: ${e.message}`);
                continue;
            }
        }

        if (!commentField) {
            // Debug: listar todos os inputs e textareas disponíveis
            console.log('🔍 DEBUG: Listando todos os campos disponíveis...');
            
            try {
                const allInputs = await frameLocator.locator('input, textarea, [contenteditable="true"]').all();
                console.log(`📊 Total de campos encontrados: ${allInputs.length}`);
                
                for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
                    try {
                        const input = allInputs[i];
                        const tagName = await input.evaluate(el => el.tagName);
                        const type = await input.getAttribute('type');
                        const ariaLabel = await input.getAttribute('aria-label');
                        const placeholder = await input.getAttribute('placeholder');
                        const dataOmega = await input.getAttribute('data-omega-element');
                        const isVisible = await input.isVisible();
                        
                        console.log(`   ${i + 1}. ${tagName}[type="${type}"] aria-label="${ariaLabel}" placeholder="${placeholder}" data-omega="${dataOmega}" visible=${isVisible}`);
                    } catch (e) {
                        console.log(`   ${i + 1}. Erro ao inspecionar elemento`);
                    }
                }
            } catch (e) {
                console.log('❌ Erro ao listar campos disponíveis');
            }
            
            throw new Error('Campo de comentário não encontrado após busca extensiva');
        }

        // Verificar se é um input ou div contenteditable
        const tagName = await commentField.evaluate(el => el.tagName.toLowerCase());
        const isContentEditable = await commentField.evaluate(el => el.contentEditable === 'true');
        
        console.log(`📝 Tipo de campo: ${tagName}, ContentEditable: ${isContentEditable}`);

        // Clicar no campo para focar
        await commentField.click();
        await page.waitForTimeout(500);

        if (tagName === 'input') {
            // Para campos input simples
            console.log('📝 Usando estratégia para INPUT');
            
            // Limpar e digitar texto simples (sem @mentions)
            await commentField.fill('');
            await page.waitForTimeout(200);
            await commentField.fill(commentText);
            console.log(`✅ Texto digitado: ${commentText}`);
            
        } else if (isContentEditable) {
            // Para campos ricos com contenteditable
            console.log('📝 Usando estratégia para CONTENTEDITABLE');
            
            // Limpar o campo
            await commentField.fill('');
            await page.waitForTimeout(200);

            // Para cada usuário, adicionar mention
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                console.log(`👤 Adicionando mention para: ${user.name}`);

                // Digitar @ para abrir menu de mentions
                await commentField.type('@');
                await page.waitForTimeout(1000);

                // Digitar o nome do usuário
                await commentField.type(user.name);
                await page.waitForTimeout(1000);

                // Tentar selecionar o usuário do dropdown
                try {
                    const userOption = frameLocator.locator(`[role="option"]:has-text("${user.name}")`)
                        .or(frameLocator.locator(`*:has-text("${user.name}")`))
                        .first();

                    const optionCount = await userOption.count();
                    if (optionCount > 0) {
                        await userOption.click();
                        console.log(`✅ Mention adicionado para ${user.name}`);
                    } else {
                        // Fallback: pressionar Enter
                        await page.keyboard.press('Enter');
                    }
                } catch (e) {
                    // Fallback: pressionar Enter
                    await page.keyboard.press('Enter');
                }

                // Adicionar espaço após o mention (exceto no último)
                if (i < users.length - 1) {
                    await commentField.type(' ');
                }

                await page.waitForTimeout(300);
            }

            // Adicionar texto adicional se houver
            const additionalText = commentText.replace(/@\w+\s*/g, '').trim();
            if (additionalText) {
                // Adicionar vírgula e texto
                await commentField.type(', ' + additionalText);
            }
        } else {
            // Fallback: tentar digitar texto simples
            console.log('📝 Usando estratégia FALLBACK');
            await commentField.type(commentText);
        }

        console.log('✅ Comentário digitado com sucesso!');
        await page.waitForTimeout(1000);
    }

    /**
     * Submeter comentário
     */
    async submitComment(frameLocator, page) {
        console.log('📤 Submetendo comentário...');

        // Procurar pelo botão de submit
        const submitButtonSelectors = [
            'button[data-omega-action="submit"]',
            'button[data-omega-element="submit"]',
            'button:has-text("Submit")',
            'button[data-variant="accent"]:has-text("Submit")',
            '.o7Xu8a_spectrum-Button:has-text("Submit")'
        ];

        let submitButton = null;
        for (const selector of submitButtonSelectors) {
            try {
                const button = frameLocator.locator(selector).first();
                const count = await button.count();

                if (count > 0 && await button.isVisible()) {
                    console.log(`✅ Botão de submit encontrado: ${selector}`);
                    submitButton = button;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!submitButton) {
            throw new Error('Botão de submit não encontrado');
        }

        await submitButton.click();
        console.log('🖱️ Comentário submetido!');
        await page.waitForTimeout(2000);

        console.log('✅ Comentário adicionado com sucesso!');
    }

    /**
     * Obter configurações de usuários disponíveis
     */
    getAvailableTeams() {
        return Object.keys(USERS_CONFIG);
    }

    /**
     * Obter tipos de comentário disponíveis
     */
    getAvailableCommentTypes() {
        return Object.keys(COMMENT_TEMPLATES);
    }

    /**
     * Obter preview do comentário
     */
    getCommentPreview(commentType, selectedUser) {
        const users = this.getUsersForComment(selectedUser);
        return this.generateCommentText(commentType, selectedUser, users);
    }
}

export default new DocumentCommentService();