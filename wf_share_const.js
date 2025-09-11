// wf_share_modern.js
// Versão moderna usando @playwright/test
// Uso:
//   node wf_share_modern.js --login
//   node wf_share_modern.js --extract --projectUrl "URL_DO_PROJETO"
//   node wf_share_modern.js --share --projectUrl "URL_DO_PROJETO" --docName "NOME_DO_ARQUIVO" --selectedUser "carol"

import { chromium } from '@playwright/test';

const STATE_FILE = "wf_state.json";

// 1) CONFIGURAÇÃO DE USUÁRIOS BASEADA NO ASSET APPROVAL
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

function getUsers(selectedUser = 'carol') {
    return selectedUser === 'carol' ? CAROL_TEAM : GIOVANA_TEAM;
}

// 2) FUNÇÕES PRINCIPAIS COM @playwright/test

async function login() {
    console.log("🔐 === FAZENDO LOGIN NO WORKFRONT ===");

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: null
    });

    const page = await context.newPage();

    console.log("🌍 Abrindo Experience Cloud...");
    await page.goto("https://experience.adobe.com/", { waitUntil: "domcontentloaded" });

    console.log("👤 Complete o login SSO/MFA nos próximos 90 segundos...");
    await page.waitForTimeout(90000);

    await context.storageState({ path: STATE_FILE });
    console.log(`✅ Sessão salva em ${STATE_FILE}`);

    await browser.close();
}

async function extractDocuments(projectUrl) {
    const startTime = Date.now();
    console.log("📂 === EXTRAINDO DOCUMENTOS DO PROJETO ===");
    console.log(`🔗 URL: ${projectUrl}`);
    console.log(`⏱️ Iniciado em: ${new Date().toLocaleTimeString()}`);

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    try {
        const context = await browser.newContext({
            storageState: STATE_FILE,
            viewport: null
        });

        const page = await context.newPage();

        console.log("🌍 Carregando projeto...");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        console.log("🔍 Encontrando frame do Workfront...");
        const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();

        // Aguardar interface carregar
        await page.waitForTimeout(2000);

        const folders = [];
        const targetFolders = ['Asset Release', 'Final Materials'];

        console.log(`🎯 Procurando pastas: ${targetFolders.join(', ')}`);

        for (const folderName of targetFolders) {
            console.log(`\n📁 Processando pasta: ${folderName}`);

            try {
                // Usar getByRole e getByText para encontrar pasta
                const folderButton = frameLocator.getByRole('button', { name: new RegExp(folderName, 'i') })
                    .or(frameLocator.getByText(folderName))
                    .first();

                // Verificar se pasta existe
                try {
                    await folderButton.waitFor({ timeout: 5000 });
                    console.log(`✅ Pasta "${folderName}" encontrada`);

                    await folderButton.click();
                    console.log(`🖱️ Clicado na pasta "${folderName}"`);
                    await page.waitForTimeout(3000);

                    // Extrair arquivos da pasta
                    const files = await extractFilesFromFolder(frameLocator);

                    if (files.length > 0) {
                        folders.push({
                            name: folderName,
                            files: files
                        });

                        console.log(`✅ ${files.length} arquivos encontrados em "${folderName}"`);
                        files.forEach((file, i) => {
                            console.log(`  ${i + 1}. ${file.name} (${file.type})`);
                        });
                    } else {
                        console.log(`⚠️ Nenhum arquivo encontrado em "${folderName}"`);
                    }

                } catch (e) {
                    console.log(`❌ Pasta "${folderName}" não encontrada: ${e.message}`);
                }

            } catch (error) {
                console.log(`❌ Erro ao processar "${folderName}": ${error.message}`);
            }
        }

        const endTime = Date.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(2);
        const totalFiles = folders.reduce((sum, folder) => sum + folder.files.length, 0);

        console.log("\n" + "=".repeat(50));
        console.log(`⏱️ TEMPO TOTAL: ${totalTime}s`);
        console.log(`📊 RESULTADO: ${totalFiles} arquivos em ${folders.length} pastas`);
        console.log(`🏁 Concluído em: ${new Date().toLocaleTimeString()}`);
        console.log("=".repeat(50));

        const result = {
            success: true,
            folders: folders,
            totalFolders: folders.length,
            totalFiles: totalFiles,
            processingTime: {
                totalSeconds: parseFloat(totalTime),
                startedAt: new Date(startTime).toISOString(),
                completedAt: new Date(endTime).toISOString()
            }
        };

        console.log(`EXTRACT_RESULT:${JSON.stringify(result)}`);
        return result;

    } catch (error) {
        console.log(`❌ Erro durante extração: ${error.message}`);
        return {
            success: false,
            error: error.message,
            folders: [],
            totalFolders: 0,
            totalFiles: 0
        };
    } finally {
        await browser.close();
    }
}

async function extractFilesFromFolder(frameLocator) {
    const files = [];

    try {
        console.log("🔍 Analisando arquivos na pasta...");
        await frameLocator.locator('body').waitFor({ timeout: 3000 });

        // Estratégia 1: Procurar por containers de documentos específicos
        const documentContainers = frameLocator.locator('[data-testid="standard-item-container"]');
        const containerCount = await documentContainers.count();

        console.log(`📋 Encontrados ${containerCount} containers de documentos`);

        if (containerCount > 0) {
            for (let i = 0; i < containerCount; i++) {
                try {
                    const container = documentContainers.nth(i);
                    const link = container.locator('a.doc-item-link').first();

                    if (await link.isVisible()) {
                        const fileName = await link.textContent();
                        const href = await link.getAttribute('href');

                        if (fileName && fileName.trim()) {
                            const fileType = getFileTypeFromName(fileName.trim());
                            files.push({
                                name: fileName.trim(),
                                type: fileType,
                                url: href || 'N/A',
                                source: 'standard-container'
                            });
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ Erro no container ${i}: ${e.message}`);
                }
            }
        }

        // Estratégia 2: Fallback - procurar por qualquer link de documento
        if (files.length === 0) {
            console.log("🔄 Usando estratégia fallback...");

            const allLinks = frameLocator.locator('a[href*="document"], a.doc-item-link');
            const linkCount = await allLinks.count();

            for (let i = 0; i < linkCount; i++) {
                try {
                    const link = allLinks.nth(i);
                    const text = await link.textContent();
                    const href = await link.getAttribute('href');

                    if (text && text.includes('.') && text.length > 5) {
                        const fileType = getFileTypeFromName(text.trim());
                        files.push({
                            name: text.trim(),
                            type: fileType,
                            url: href || 'N/A',
                            source: 'fallback'
                        });
                    }
                } catch (e) {
                    continue;
                }
            }
        }

    } catch (error) {
        console.log(`❌ Erro ao extrair arquivos: ${error.message}`);
    }

    return files;
}

function getFileTypeFromName(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const typeMap = {
        'pdf': 'PDF',
        'jpg': 'Image', 'jpeg': 'Image', 'png': 'Image', 'gif': 'Image',
        'doc': 'Document', 'docx': 'Document',
        'xls': 'Spreadsheet', 'xlsx': 'Spreadsheet',
        'ppt': 'Presentation', 'pptx': 'Presentation',
        'zip': 'Archive', 'rar': 'Archive',
        'mp4': 'Video', 'avi': 'Video', 'mov': 'Video'
    };
    return typeMap[extension] || 'Document';
}

async function shareDocument(projectUrl, folderName, fileName, selectedUser = 'carol') {
    console.log("🔗 === COMPARTILHANDO DOCUMENTO ===");
    console.log(`📁 Pasta: ${folderName}`);
    console.log(`📄 Arquivo: ${fileName}`);
    console.log(`👥 Equipe: ${selectedUser}`);

    const USERS = getUsers(selectedUser);
    console.log(`👤 ${USERS.length} usuários serão adicionados`);

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
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

        // 1. Navegar para a pasta correta (adaptado do legacy)
        if (folderName && folderName !== 'root') {
            console.log(`📁 Navegando para pasta: ${folderName}`);

            // Aguardar frame carregar primeiro
            await page.waitForTimeout(2000);

            // 🎯 ESTRATÉGIA DO LEGACY: Tentar múltiplas estratégias para clicar na pasta
            const strategies = [
                `button:has-text("13. ${folderName}")`, // Formato com número
                `button:has-text("14. ${folderName}")`, // Formato com número
                `button:has-text("${folderName}")`, // Nome direto
                `a:has-text("${folderName}")`, // Link
                `[role="button"]:has-text("${folderName}")`, // Elemento com role button
                `*[data-testid*="item"]:has-text("${folderName}")` // Item com testid
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
                        console.log(`�️ Clique executado, aguardando carregamento...`);
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

        // 2. Aguardar a lista de documentos carregar e selecionar documento (estratégia do legacy)
        console.log(`📄 Aguardando lista de documentos carregar...`);

        // Aguardar a pasta carregar completamente
        await page.waitForTimeout(3000);

        console.log(`📄 Procurando documento: ${fileName}`);

        // 🎯 ESTRATÉGIA ESPECÍFICA DO LEGACY: Procurar pelo div.doc-detail-view que contém o arquivo
        console.log(`🎯 ESTRATÉGIA FOCADA: Procurando pelo div.doc-detail-view que contém "${fileName}"`);

        // Usar evaluate como no legacy para maior controle
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

        console.log(`� Encontrados ${documentElements.length} elementos doc-detail-view com "${fileName}":`);
        documentElements.forEach((elem, i) => {
            console.log(`  ${i + 1}. AriaLabel: "${elem.ariaLabel}"`);
            console.log(`     Texto: "${elem.textContent}"`);
            console.log(`     Visível: ${elem.isVisible}`);
        });

        if (documentElements.length > 0) {
            // Usar o primeiro elemento visível encontrado
            const targetElement = documentElements.find(elem => elem.isVisible) || documentElements[0];

            console.log(`✅ Selecionando elemento ${targetElement.index + 1} com aria-label: "${targetElement.ariaLabel}"`);

            // 🎯 CLICK CORRETO DO LEGACY: Clicar no div.doc-detail-view usando seletor CSS direto
            const selector = `.doc-detail-view:nth-of-type(${targetElement.index + 1})`;
            console.log(`🎯 Clicando no seletor: ${selector}`);

            await frameLocator.locator(selector).click();
            console.log(`�️ Clique executado no div.doc-detail-view!`);
            await page.waitForTimeout(2000);

        } else {
            // Se não encontrou com nome completo, usar estratégias de fallback como no legacy
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

                        const selector = `.doc-detail-view:nth-of-type(${targetElement.index + 1})`;
                        await frameLocator.locator(selector).click();
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

        await page.waitForTimeout(2000);

        // 3. Clicar em Share (estratégia correta do legacy)
        console.log("🔗 Procurando botão de compartilhar...");

        // Estratégias do legacy adaptadas para @playwright/test
        const strategies = [
            'button[data-testid="share"]', // Botão específico do Workfront (legacy prioridade 1)
            'button:has-text("Share")', // Botão com texto Share
            'button:has-text("Compartilhar")', // Botão em português
            'button[aria-label*="share"]', // Botão com aria-label
            'button[title*="share"]', // Botão com title
            '*[data-testid*="share"]' // Qualquer elemento com testid share
        ];

        let shareSuccess = false;
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            console.log(`🔄 Procurando botão share - Tentativa ${i + 1}: ${strategy}`);

            try {
                const element = frameLocator.locator(strategy).first();
                const count = await element.count();

                if (count > 0 && await element.isVisible()) {
                    console.log(`✅ Botão de compartilhar encontrado com estratégia ${i + 1}`);
                    await element.click();
                    console.log(`🖱️ Botão de compartilhar clicado!`);
                    await page.waitForTimeout(3000);

                    // 🎯 VERIFICAR SE MODAL ABRIU CORRETAMENTE (do legacy)
                    const modalOpened = await verifyShareModal(frameLocator, fileName);
                    if (modalOpened) {
                        console.log(`✅ Modal de compartilhamento aberto e verificado!`);
                        shareSuccess = true;
                        break;
                    } else {
                        console.log(`⚠️ Modal não abriu ou não tem o título correto. Tentando próxima estratégia...`);
                        // Continuar tentando outras estratégias
                    }
                } else {
                    console.log(`⚠️ Botão encontrado mas não visível - estratégia ${i + 1}`);
                }
            } catch (e) {
                console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                continue;
            }
        }

        if (!shareSuccess) {
            throw new Error("Botão de compartilhar não encontrado, não clicável, ou modal não abriu corretamente");
        }

        // 4. Adicionar usuários (estratégia melhorada)
        console.log("👥 Adicionando usuários...");

        // 🎯 PROCURAR PELO CAMPO DE ENTRADA ESPECÍFICO DO WORKFRONT (do legacy)
        const inputSelectors = [
            'input[role="combobox"]', // Campo combobox do Workfront
            'input[aria-autocomplete="list"]', // Campo com autocomplete
            'input[type="text"]:not([readonly])', // Campo de texto editável
            'input[id*="react-aria"]', // Campo com ID react-aria
            '.spectrum-Textfield-input', // Campo Spectrum específico
            'input.spectrum-Textfield-input' // Input específico do Spectrum
        ];

        let emailInput = null;

        console.log(`🔍 Procurando campo de entrada de usuários...`);
        for (const selector of inputSelectors) {
            try {
                const input = frameLocator.locator(selector).first();
                const count = await input.count();

                if (count > 0 && await input.isVisible()) {
                    // Verificar se não é readonly
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
            console.log(`❌ Campo de entrada de usuários não encontrado`);
            throw new Error("Campo de entrada de usuários não encontrado");
        }

        // 📧 ADICIONAR TODOS OS USUÁRIOS DA EQUIPE SELECIONADA
        for (let i = 0; i < USERS.length; i++) {
            const user = USERS[i];
            console.log(`\n👤 Adicionando ${i + 1}/${USERS.length}: ${user.email}`);

            try {
                // 1. Limpar o campo e digitar o email
                console.log(`🖱️ Clicando no campo de entrada...`);
                await emailInput.click();
                await page.waitForTimeout(500);

                console.log(`🧹 Limpando campo...`);
                await emailInput.fill('');
                await page.waitForTimeout(200);

                console.log(`📋 Digitando email: ${user.email}...`);
                await emailInput.fill(user.email);
                await page.waitForTimeout(1000); // Aguardar dropdown carregar

                // 2. Procurar e selecionar a opção no dropdown
                const option = frameLocator.getByRole('option', { name: new RegExp(user.email, 'i') })
                    .or(frameLocator.locator(`[role="option"]:has-text("${user.email}")`))
                    .first();

                const optionCount = await option.count();
                if (optionCount > 0) {
                    await option.click();
                    console.log(`✅ ${user.email} adicionado`);
                } else {
                    // Fallback: pressionar Enter
                    console.log(`⚠️ Opção não encontrada, tentando Enter...`);
                    await emailInput.press('Enter');
                }

                await page.waitForTimeout(500);

                // Verificar e alterar permissão se necessário
                await setUserPermissionModern(frameLocator, page, user.email, 'MANAGE');

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

async function setUserPermissionModern(frameLocator, page, userEmail, targetPermission) {
    try {
        console.log(`🔧 Verificando permissão para ${userEmail}...`);

        // Aguardar um pouco para garantir que o usuário foi adicionado
        await page.waitForTimeout(1000);

        // Encontrar linha do usuário (estratégias múltiplas)
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
                    console.log(`✅ Linha do usuário encontrada: ${selector}`);
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

        // Encontrar botão de permissão na linha do usuário
        const permissionButtonSelectors = [
            'button:has-text("View")',
            'button:has-text("Manage")',
            'button[aria-expanded="false"]:has(svg)', // Botão com dropdown
            '.o7Xu8a_spectrum-ActionButton:has-text("View")',
            '.o7Xu8a_spectrum-ActionButton:has-text("Manage")',
            'button[data-variant]' // Botão spectrum genérico
        ];

        let permissionButton = null;
        for (const selector of permissionButtonSelectors) {
            try {
                const button = userRow.locator(selector).first();
                const count = await button.count();
                if (count > 0 && await button.isVisible()) {
                    console.log(`✅ Botão de permissão encontrado: ${selector}`);
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

        // Verificar texto atual do botão
        const buttonText = await permissionButton.textContent();
        console.log(`📋 Permissão atual de ${userEmail}: "${buttonText}"`);

        if (buttonText && buttonText.includes('Manage')) {
            console.log(`✅ ${userEmail} já tem permissão MANAGE`);
            return true;
        }

        if (!buttonText || !buttonText.includes('View')) {
            console.log(`⚠️ Botão não reconhecido como View: "${buttonText}"`);
            return false;
        }

        // Clicar no botão para abrir dropdown
        console.log(`🖱️ Clicando no botão de permissão para abrir dropdown...`);
        await permissionButton.click();
        await page.waitForTimeout(800); // Aguardar dropdown abrir

        // Procurar pela opção "Manage" no dropdown
        console.log(`🔍 Procurando opção "Manage" no dropdown...`);

        const manageOptionSelectors = [
            '[role="menuitemradio"]:has-text("Manage")',
            '[data-key="EDIT"]', // Baseado no HTML do legacy
            '.dIo7iW_spectrum-Menu-item:has-text("Manage")',
            'div[role="menuitemradio"] span:has-text("Manage")',
            '[role="option"]:has-text("Manage")' // Alternativa
        ];

        let manageOption = null;
        for (const selector of manageOptionSelectors) {
            try {
                const option = frameLocator.locator(selector).first();
                const count = await option.count();
                if (count > 0 && await option.isVisible()) {
                    console.log(`✅ Opção Manage encontrada: ${selector}`);
                    manageOption = option;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!manageOption) {
            console.log(`❌ Opção "Manage" não encontrada no dropdown`);
            // Tentar fechar dropdown e retornar
            await page.keyboard.press('Escape');
            return false;
        }

        // Clicar na opção "Manage"
        console.log(`🖱️ Clicando na opção "Manage"...`);
        await manageOption.click();
        await page.waitForTimeout(500); // Aguardar seleção

        // 🎯 SOLUÇÃO DO DROPDOWN: Usar ESC do Playwright Test (nossa motivação para migrar!)
        console.log(`🔑 Fechando dropdown com ESC (solução @playwright/test)...`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Verificação adicional se dropdown fechou
        try {
            const dropdownCheck = frameLocator.locator('[role="menu"], [role="listbox"], .spectrum-Popover.is-open');
            await dropdownCheck.waitFor({ state: 'hidden', timeout: 2000 });
            console.log(`✅ Dropdown fechado com sucesso`);
        } catch (e) {
            // Se não conseguir verificar, tenta ESC adicional
            console.log(`🔑 ESC adicional para garantir fechamento...`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }

        console.log(`✅ Permissão MANAGE definida para ${userEmail}`);
        return true;

    } catch (error) {
        console.log(`⚠️ Erro ao alterar permissão para ${userEmail}: ${error.message}`);
        // Tentar fechar qualquer dropdown que possa estar aberto
        try {
            await page.keyboard.press('Escape');
        } catch (e) {
            // Ignorar erro de ESC
        }
        return false;
    }
}

// 3) MAIN - Execução baseada nos argumentos
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv;

    if (args.includes("--login")) {
        login().catch(console.error);

    } else if (args.includes("--extract")) {
        const urlIndex = args.indexOf("--projectUrl");
        if (urlIndex === -1 || !args[urlIndex + 1]) {
            console.error("❌ Use: --extract --projectUrl 'URL_DO_PROJETO'");
            process.exit(1);
        }
        const projectUrl = args[urlIndex + 1];
        extractDocuments(projectUrl).catch(console.error);

    } else if (args.includes("--share")) {
        const urlIndex = args.indexOf("--projectUrl");
        const docIndex = args.indexOf("--docName");

        if (urlIndex === -1 || !args[urlIndex + 1] || docIndex === -1 || !args[docIndex + 1]) {
            console.error("❌ Use: --share --projectUrl 'URL' --docName 'ARQUIVO' [--folder 'PASTA'] [--selectedUser 'carol|giovana']");
            process.exit(1);
        }

        const projectUrl = args[urlIndex + 1];
        const docName = args[docIndex + 1];

        const folderIndex = args.indexOf("--folder");
        const folderName = folderIndex !== -1 && args[folderIndex + 1] ? args[folderIndex + 1] : "Asset Release";

        const userIndex = args.indexOf("--selectedUser");
        const selectedUser = userIndex !== -1 && args[userIndex + 1] ? args[userIndex + 1] : "carol";

        shareDocument(projectUrl, folderName, docName, selectedUser).catch(console.error);

    } else {
        console.log(`
🎯 WORKFRONT SHARING - Versão Moderna (@playwright/test)

📋 Comandos disponíveis:
  node wf_share_modern.js --login
  node wf_share_modern.js --extract --projectUrl "URL_DO_PROJETO"
  node wf_share_modern.js --share --projectUrl "URL" --docName "ARQUIVO" [--folder "PASTA"] [--selectedUser "carol|giovana"]

🔗 Exemplo de URL:
  https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68a3355a009ab6b7e05496c230b884c1/documents

✨ Melhorias da versão moderna:
  ✅ Seletores mais robustos com getByRole()
  ✅ ESC funciona corretamente para fechar dropdowns
  ✅ Melhor tratamento de erros e timeouts
  ✅ Auto-wait para elementos
        `);
    }
}

// Função para verificar se o modal de compartilhamento abriu (adaptado do legacy)
async function verifyShareModal(frameLocator, expectedFileName) {
    console.log(`🔍 Verificando se modal de compartilhamento abriu para "${expectedFileName}"...`);

    try {
        // Aguardar modal aparecer
        await frameLocator.locator('body').waitFor({ timeout: 5000 });

        // Procurar pelo modal de compartilhamento (seletores do legacy)
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

                    // 🎯 MELHOR ESTRATÉGIA: Procurar especificamente pelo título com "Share"
                    const titleSelectors = [
                        'h2:has-text("Share")', // Título específico do modal de share
                        'h1:has-text("Share")', // Título alternativo
                        '[role="heading"]:has-text("Share")', // Cabeçalho com role
                        '.spectrum-Dialog-title:has-text("Share")' // Título do Spectrum Dialog
                    ];

                    for (const titleSelector of titleSelectors) {
                        const title = frameLocator.locator(titleSelector);
                        const titleCount = await title.count();

                        if (titleCount > 0) {
                            console.log(`✅ Título "Share" encontrado no modal!`);
                            return true;
                        }
                    }

                    // Se não encontrou título, mas modal existe, considerar válido
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

// Exportar funções para uso pelo servidor
export { login, extractDocuments, shareDocument };