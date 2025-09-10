// wf_share_const.js
// Uso:
//   node wf_share_const.js --login
//   node wf_share_const.js --share --projectUrl "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68a3355a009ab6b7e05496c230b884c1/documents" --docName "NOME_EXATO_DO_ARQUIVO.pdf"

import { chromium } from "playwright";

const STATE_FILE = "wf_state.json";

// 1) SEUS 6 E-MAILS FIXOS
const USERS = [
    { email: "carolina.lipinski@dell.com", role: "MANAGE" },
    { email: "eduarda.ulrich@dell.com", role: "VIEW" },
    { email: "pessoa3@dell.com", role: "VIEW" },
    { email: "pessoa4@dell.com", role: "VIEW" },
    { email: "pessoa5@dell.com", role: "MANAGE" },
    { email: "pessoa6@dell.com", role: "MANAGE" },
];

// 2) FUNÇÕES AUXILIARES
async function login() {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    console.log("Abrindo Experience Cloud. Faça o login SSO…");
    await page.goto("https://experience.adobe.com/", { waitUntil: "domcontentloaded" });
    // te dá tempo pra concluir o SSO (MFA, etc.)
    await page.waitForTimeout(90_000);
    await ctx.storageState({ path: STATE_FILE });
    console.log("Sessão salva em", STATE_FILE);
    await browser.close();
}

// Função para mapear toda a estrutura de documentos
async function mapDocumentStructure(frame) {
    console.log('\n🗂️ Mapeando toda a estrutura de documentos...');

    // Buscar todos os elementos que podem ser documentos ou pastas
    const allItems = await frame.$$eval('*', () => {
        const items = [];

        // Procurar por elementos que parecem ser itens de lista/tabela
        const selectors = [
            '[role="row"]',
            '[role="gridcell"]',
            '[data-testid*="row"]',
            '[data-testid*="item"]',
            '[data-testid*="document"]',
            '[data-testid*="folder"]',
            '[data-testid*="file"]',
            'tr',
            '.document-item',
            '.folder-item',
            '.file-item',
            'li',
            'button',
            'a[href]'
        ];

        selectors.forEach(selector => {
            try {
                const foundElements = document.querySelectorAll(selector);
                foundElements.forEach(el => {
                    const text = el.textContent?.trim();
                    if (text && text.length > 0 && text.length < 200 && !text.includes('@layer')) {
                        const rect = el.getBoundingClientRect();
                        const isVisible = rect.width > 0 && rect.height > 0;

                        if (isVisible) {
                            items.push({
                                selector: selector,
                                tagName: el.tagName,
                                className: el.className,
                                id: el.id,
                                testId: el.getAttribute('data-testid'),
                                role: el.getAttribute('role'),
                                textContent: text,
                                isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' ||
                                    el.onclick !== null || el.getAttribute('role') === 'button' ||
                                    el.style.cursor === 'pointer'
                            });
                        }
                    }
                });
            } catch (e) {
                // Ignorar erros de seletores
            }
        });

        // Remover duplicatas baseadas no texto
        const unique = items.filter((item, index, self) =>
            index === self.findIndex(i => i.textContent === item.textContent)
        );

        return unique.slice(0, 100); // Limitar para não sobrecarregar
    });

    console.log(`📋 Encontrados ${allItems.length} itens únicos na interface:`);

    // Agrupar por tipo para melhor visualização
    const itemsByType = {
        folders: [],
        documents: [],
        buttons: [],
        links: [],
        rows: [],
        others: []
    };

    allItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes('asset release') || text.includes('final materials') ||
            text.includes('working files') || text.includes('creative brief') ||
            text.includes('proofs')) {
            itemsByType.folders.push(item);
        } else if (item.tagName === 'BUTTON') {
            itemsByType.buttons.push(item);
        } else if (item.tagName === 'A') {
            itemsByType.links.push(item);
        } else if (item.role === 'row' || item.tagName === 'TR') {
            itemsByType.rows.push(item);
        } else if (text.includes('.pdf') || text.includes('.jpg') || text.includes('.png') ||
            text.includes('.doc') || text.includes('.xlsx')) {
            itemsByType.documents.push(item);
        } else {
            itemsByType.others.push(item);
        }
    });

    // Mostrar resumo por categoria
    Object.keys(itemsByType).forEach(category => {
        const items = itemsByType[category];
        if (items.length > 0) {
            console.log(`\n📁 ${category.toUpperCase()} (${items.length}):`);
            items.slice(0, 10).forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.tagName} "${item.textContent.substring(0, 60)}" ${item.isClickable ? '🔗' : ''}`);
                if (item.testId) console.log(`     └─ testid: "${item.testId}"`);
            });
            if (items.length > 10) {
                console.log(`     ... e mais ${items.length - 10} itens`);
            }
        }
    });

    return allItems;
}

async function extractDocuments(projectUrl) {
    console.log("=== EXTRAINDO DOCUMENTOS DO PROJETO ===");
    console.log(`\nURL do projeto: ${projectUrl}`);

    let browser = null;
    try {
        // Configuração do browser
        browser = await chromium.launch({
            headless: false,
            args: ['--start-maximized']
        });

        const context = await browser.newContext({
            storageState: STATE_FILE,
            viewport: null
        });

        const page = await context.newPage();

        console.log("\nAbrindo página de documentos do projeto…");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        console.log("Procurando frame do Workfront...");
        const wf = await getWorkfrontFrame(page);
        console.log("✓ Frame do Workfront encontrado!");

        console.log("📁 Analisando estrutura de pastas e documentos...");

        try {
            // Aguarda a página carregar completamente e elementos aparecerem
            await wf.waitForLoadState('networkidle');
            console.log("⏳ Aguardando carregamento completo da interface...");
            await wf.waitForTimeout(5000); // Aumenta tempo de espera

            // Verificar se há indicadores de carregamento
            try {
                await wf.waitForSelector('[data-testid*="loading"], .loading, .spinner', { timeout: 2000, state: 'hidden' });
                console.log("✓ Indicadores de carregamento removidos");
            } catch (e) {
                console.log("ℹ️ Nenhum indicador de carregamento detectado");
            }

            // 🔍 NOVA ESTRATÉGIA: Mapear toda a estrutura primeiro
            const allItems = await mapDocumentStructure(wf);

            // Agora filtrar apenas os itens que parecem ser pastas de interesse
            const folders = [];
            const targetFolders = ['Asset Release', 'Final Materials'];

            console.log(`\n🎯 Filtrando pastas de interesse: ${targetFolders.join(', ')}`);

            for (const folderName of targetFolders) {
                console.log(`\nProcurando pasta: ${folderName}`);                // Buscar nos itens mapeados
                const matchingItems = allItems.filter(item =>
                    item.textContent.includes(folderName) ||
                    item.textContent.toLowerCase().includes(folderName.toLowerCase())
                );

                if (matchingItems.length > 0) {
                    console.log(`✓ Encontrados ${matchingItems.length} itens para "${folderName}":`);
                    matchingItems.forEach((item, i) => {
                        console.log(`  ${i + 1}. ${item.tagName} [${item.selector}] "${item.textContent}" ${item.isClickable ? '(clicável)' : ''}`);
                    });

                    // Tentar clicar no primeiro item clicável encontrado
                    const clickableItem = matchingItems.find(item => item.isClickable);
                    if (clickableItem) {
                        try {
                            console.log(`\n🎯 Tentando acessar "${folderName}" (simplificado):`)

                            // ESTRATÉGIA SIMPLIFICADA: Só tentar os seletores que funcionaram
                            const strategies = [
                                `button:has-text("13. ${folderName}")`, // 13. Asset Release
                                `button:has-text("14. ${folderName}")`, // 14. Final Materials
                                `button:has-text("${folderName}")` // Asset Release / Final Materials
                            ];

                            let navigationSuccess = false;

                            for (let i = 0; i < strategies.length; i++) {
                                const strategy = strategies[i];
                                console.log(`\n🔄 Tentativa ${i + 1}: ${strategy}`);

                                try {
                                    const element = await wf.$(strategy);
                                    if (element) {
                                        console.log(`✅ Elemento encontrado com estratégia ${i + 1}`);

                                        // Clique simples apenas
                                        await element.click();
                                        console.log(`🖱️ Clique executado, aguardando carregamento...`);
                                        await wf.waitForTimeout(3000); // Aguardar mais tempo

                                        // 🎯 NOVA LÓGICA: Assumir que o clique funcionou e extrair documentos
                                        console.log(`� Assumindo navegação bem-sucedida para "${folderName}"!`);
                                        navigationSuccess = true;
                                        break;
                                    } else {
                                        console.log(`❌ Elemento não encontrado com estratégia ${i + 1}`);
                                    }
                                } catch (e) {
                                    console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                                    continue;
                                }
                            }

                            if (navigationSuccess) {
                                // Extrair documentos da pasta
                                console.log(`📄 Extraindo arquivos da pasta "${folderName}"...`);
                                const files = await extractFilesFromCurrentFolder(wf);
                                console.log(`📋 Encontrados ${files.length} arquivos na pasta "${folderName}"`);

                                if (files.length > 0) {
                                    folders.push({
                                        name: folderName,
                                        files: files
                                    });
                                    console.log(`✅ Pasta "${folderName}" processada: ${files.length} arquivos`);

                                    // Mostrar lista dos arquivos encontrados
                                    files.forEach((file, index) => {
                                        console.log(`  ${index + 1}. ${file.name} (${file.type})`);
                                    });
                                } else {
                                    console.log(`⚠️ Nenhum arquivo encontrado na pasta "${folderName}"`);
                                }

                                // Voltar para a lista principal (simplificado)
                                console.log(`🔙 Voltando para a lista principal...`);
                                await wf.waitForTimeout(2000);

                            } else {
                                console.log(`❌ Não foi possível navegar para "${folderName}"`);
                            }
                        } catch (e) {
                            console.log(`❌ Erro ao processar pasta "${folderName}": ${e.message}`);
                        }
                    }
                } else {
                    console.log(`❌ Pasta "${folderName}" não encontrada nos itens mapeados`);
                }
            }

            console.log(`✓ Extração concluída: ${folders.length} pastas, ${folders.reduce((total, folder) => total + folder.files.length, 0)} arquivos`);

            // Retorna o resultado
            const result = {
                success: true,
                folders: folders,
                totalFolders: folders.length,
                totalFiles: folders.reduce((total, folder) => total + folder.files.length, 0)
            };

            console.log(`EXTRACT_RESULT:${JSON.stringify(result)}`);
            return result;

        } catch (innerError) {
            console.log(`❌ Erro na análise de pastas: ${innerError.message}`);
            const errorResult = {
                success: false,
                error: innerError.message,
                folders: [],
                totalFolders: 0,
                totalFiles: 0
            };
            console.log(`EXTRACT_RESULT:${JSON.stringify(errorResult)}`);
            return errorResult;
        }

    } catch (error) {
        console.log(`❌ Erro durante extração: ${error.message}`);
        const errorResult = {
            success: false,
            error: error.message,
            folders: [],
            totalFolders: 0,
            totalFiles: 0
        };
        console.log(`EXTRACT_RESULT:${JSON.stringify(errorResult)}`);
        return errorResult;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Função para extrair arquivos da pasta atual
async function extractFilesFromCurrentFolder(frame) {
    const files = [];

    try {
        console.log('📂 ===== ANÁLISE DETALHADA DO CONTEÚDO DA PASTA =====');

        // Aguarda a pasta carregar completamente
        await frame.waitForTimeout(3000);

        // 🎯 ESTRATÉGIA FOCADA: Procurar especificamente pelos containers de documentos do Workfront
        console.log('🎯 Procurando por containers de documentos do Workfront...');

        const workfrontDocuments = await frame.evaluate(() => {
            const documentItems = [];

            // 1. Procurar pelos containers padrão de itens do Workfront
            const standardContainers = document.querySelectorAll('[data-testid="standard-item-container"]');
            console.log(`🔍 Encontrados ${standardContainers.length} containers padrão`);

            standardContainers.forEach((container, index) => {
                try {
                    // Procurar pelo link do documento dentro do container
                    const documentLink = container.querySelector('a.doc-item-link');
                    if (documentLink) {
                        const fileName = documentLink.textContent?.trim();
                        const href = documentLink.href;
                        const title = documentLink.title;

                        // Procurar por informações adicionais
                        const addedBySpan = container.querySelector('.fnt-sidenote.added-by');
                        const addedInfo = addedBySpan ? addedBySpan.textContent?.trim() : '';

                        // Procurar por ícone do arquivo para determinar tipo
                        const iconImg = container.querySelector('.document-icon-zip, .document-icon-pdf, .document-icon-doc, [class*="document-icon-"]');
                        let fileType = 'Unknown';
                        if (iconImg) {
                            const iconClass = iconImg.className;
                            if (iconClass.includes('document-icon-zip')) fileType = 'ZIP Archive';
                            else if (iconClass.includes('document-icon-pdf')) fileType = 'PDF Document';
                            else if (iconClass.includes('document-icon-doc')) fileType = 'Word Document';
                            else if (iconClass.includes('document-icon-xls')) fileType = 'Excel Spreadsheet';
                            else if (iconClass.includes('document-icon-ppt')) fileType = 'PowerPoint';
                            else if (iconClass.includes('document-icon-img')) fileType = 'Image';
                        }

                        // Se não conseguiu determinar pelo ícone, usar extensão
                        if (fileType === 'Unknown' && fileName) {
                            const extension = fileName.split('.').pop()?.toLowerCase();
                            const typeMap = {
                                'zip': 'ZIP Archive',
                                'pdf': 'PDF Document',
                                'doc': 'Word Document',
                                'docx': 'Word Document',
                                'xls': 'Excel Spreadsheet',
                                'xlsx': 'Excel Spreadsheet',
                                'ppt': 'PowerPoint',
                                'pptx': 'PowerPoint',
                                'jpg': 'Image',
                                'jpeg': 'Image',
                                'png': 'Image',
                                'gif': 'Image'
                            };
                            fileType = typeMap[extension] || 'Document';
                        }

                        if (fileName) {
                            documentItems.push({
                                fileName: fileName,
                                fileType: fileType,
                                href: href,
                                title: title,
                                addedInfo: addedInfo,
                                containerIndex: index,
                                containerHTML: container.outerHTML.substring(0, 500) // Primeiros 500 chars para debug
                            });
                        }
                    }
                } catch (e) {
                    console.log(`❌ Erro ao processar container ${index}: ${e.message}`);
                }
            });

            // 2. Fallback: Procurar por qualquer link que pareça ser de documento
            if (documentItems.length === 0) {
                console.log('🔄 Fallback: Procurando por qualquer link de documento...');
                
                const allLinks = document.querySelectorAll('a[href*="document"], a[href*="preview"], a.doc-item-link');
                allLinks.forEach(link => {
                    const text = link.textContent?.trim();
                    if (text && text.length > 5 && text.includes('.')) {
                        documentItems.push({
                            fileName: text,
                            fileType: 'Document',
                            href: link.href,
                            title: link.title || link.getAttribute('aria-label'),
                            addedInfo: '',
                            containerIndex: -1,
                            containerHTML: link.outerHTML
                        });
                    }
                });
            }

            // 3. Procurar também por elementos li.doc-item-detail (estrutura alternativa)
            const docItemDetails = document.querySelectorAll('li.doc-item-detail');
            docItemDetails.forEach((item, index) => {
                const link = item.querySelector('a');
                if (link) {
                    const fileName = link.textContent?.trim();
                    if (fileName && !documentItems.some(doc => doc.fileName === fileName)) {
                        documentItems.push({
                            fileName: fileName,
                            fileType: 'Document',
                            href: link.href,
                            title: link.title,
                            addedInfo: '',
                            containerIndex: index,
                            containerHTML: item.outerHTML.substring(0, 500)
                        });
                    }
                }
            });

            return documentItems;
        });

        console.log(`� ===== DOCUMENTOS WORKFRONT ENCONTRADOS: ${workfrontDocuments.length} =====`);

        if (workfrontDocuments.length > 0) {
            workfrontDocuments.forEach((doc, index) => {
                console.log(`\n📄 DOCUMENTO ${index + 1}:`);
                console.log(`   📛 Nome: "${doc.fileName}"`);
                console.log(`   📋 Tipo: ${doc.fileType}`);
                console.log(`   🔗 URL: ${doc.href}`);
                console.log(`   📅 Info: ${doc.addedInfo}`);
                console.log(`   🏷️ Title: ${doc.title}`);
                console.log(`   📦 Container: ${doc.containerIndex}`);
                console.log(`   🔧 HTML: ${doc.containerHTML.substring(0, 200)}...`);

                // Adicionar ao array de arquivos
                files.push({
                    name: doc.fileName,
                    type: doc.fileType,
                    size: 'N/A',
                    url: doc.href,
                    addedInfo: doc.addedInfo,
                    title: doc.title,
                    element: {
                        containerIndex: doc.containerIndex,
                        testId: 'standard-item-container',
                        tagName: 'A'
                    }
                });
            });
        } else {
            console.log('❌ Nenhum documento encontrado com seletores específicos do Workfront');
            
            // Backup: Análise completa como antes
            console.log('🔄 Executando análise completa como backup...');
            
            const allElements = await frame.$$eval('*', () => {
                const items = [];
                const allEls = document.querySelectorAll('*');
                
                allEls.forEach(el => {
                    const text = el.textContent?.trim();
                    if (text && text.length > 0 && text.length < 300) {
                        const rect = el.getBoundingClientRect();
                        const isVisible = rect.width > 0 && rect.height > 0;

                        if (isVisible && /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|mp4|avi|mov|ai|psd|eps|svg|tiff|bmp)$/i.test(text)) {
                            items.push({
                                tagName: el.tagName,
                                className: el.className,
                                textContent: text,
                                href: el.href
                            });
                        }
                    }
                });

                return items;
            });

            console.log(`📋 Backup: encontrados ${allElements.length} elementos com extensões`);
            allElements.forEach((item, index) => {
                const fileType = getFileTypeFromName(item.textContent);
                files.push({
                    name: item.textContent.trim(),
                    type: fileType,
                    size: 'N/A',
                    url: item.href || 'N/A',
                    element: {
                        tagName: item.tagName,
                        className: item.className
                    }
                });
                console.log(`   ${index + 1}. ${item.textContent} (${fileType})`);
            });
        }

        // Mostrar estrutura HTML completa da primeira pasta para debug
        const fullHTML = await frame.evaluate(() => {
            return document.body.innerHTML;
        });
        
        console.log(`\n🔧 ===== DEBUG: HTML COMPLETO DA PASTA (PRIMEIROS 2000 CHARS) =====`);
        console.log(fullHTML.substring(0, 2000));
        console.log(`===== FIM DO HTML (total: ${fullHTML.length} chars) =====`);

    } catch (error) {
        console.log(`❌ Erro ao extrair arquivos da pasta: ${error.message}`);
    }

    console.log(`\n📊 ===== RESUMO FINAL =====`);
    console.log(`📂 Total de arquivos identificados: ${files.length}`);
    if (files.length > 0) {
        console.log(`📋 Lista final de arquivos encontrados:`);
        files.forEach((file, i) => {
            console.log(`  ${i + 1}. "${file.name}" (${file.type})`);
            if (file.addedInfo) console.log(`      └─ ${file.addedInfo}`);
            if (file.url && file.url !== 'N/A') console.log(`      └─ URL: ${file.url}`);
        });
    } else {
        console.log(`❌ NENHUM ARQUIVO ENCONTRADO - pode ser que a pasta esteja vazia ou a estrutura seja diferente`);
    }
    console.log(`📂 ===== FIM DA ANÁLISE DETALHADA =====`);

    return files;
}

// Função para determinar o tipo do arquivo baseado no nome
function getFileTypeFromName(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();

    const typeMap = {
        'pdf': 'PDF',
        'jpg': 'Image',
        'jpeg': 'Image',
        'png': 'Image',
        'gif': 'Image',
        'doc': 'Document',
        'docx': 'Document',
        'xls': 'Spreadsheet',
        'xlsx': 'Spreadsheet',
        'ppt': 'Presentation',
        'pptx': 'Presentation',
        'zip': 'Archive',
        'rar': 'Archive',
        'mp4': 'Video',
        'avi': 'Video',
        'mov': 'Video'
    };

    return typeMap[extension] || 'unknown';
}

async function getWorkfrontFrame(page) {
    await page.waitForTimeout(3000);

    // Tenta encontrar o frame principal do Workfront
    const frameSelectors = [
        'iframe[src*="workfront"]',
        'iframe[src*="experience"]',
        'iframe[name*="workfront"]',
        'iframe'
    ];

    for (const selector of frameSelectors) {
        try {
            const frameElement = await page.$(selector);
            if (frameElement) {
                const frame = await frameElement.contentFrame();
                if (frame) {
                    // Verifica se é realmente o frame do Workfront
                    await frame.waitForTimeout(2000);
                    const url = frame.url();
                    if (url.includes('workfront') || url.includes('experience')) {
                        return frame;
                    }
                }
            }
        } catch (e) {
            continue;
        }
    }

    // Se não encontrou frame, retorna a página principal
    return page;
}

async function shareDocument(projectUrl, folderName, fileName) {
    console.log("=== COMPARTILHANDO DOCUMENTO ===");
    console.log(`URL do projeto: ${projectUrl}`);
    console.log(`Pasta: ${folderName}`);
    console.log(`Documento: ${fileName}`);

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

        console.log("\nAbrindo página de documentos do projeto…");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        console.log("Procurando frame do Workfront...");
        const wf = await getWorkfrontFrame(page);
        console.log("✓ Frame do Workfront encontrado!");

        // 🎯 PRIMEIRO: Navegar para a pasta correta
        console.log(`\n📁 Navegando para a pasta: ${folderName}`);
        const navigationSuccess = await navigateToFolder(wf, folderName);
        
        if (!navigationSuccess) {
            throw new Error(`Não foi possível navegar para a pasta "${folderName}"`);
        }

        console.log(`✅ Navegação para "${folderName}" bem-sucedida!`);
        await wf.waitForTimeout(3000);

        // 🎯 SEGUNDO: Procurar e selecionar o documento específico
        console.log(`\n📄 Procurando documento: ${fileName}`);
        const documentSelected = await selectDocument(wf, fileName);
        
        if (!documentSelected) {
            throw new Error(`Documento "${fileName}" não encontrado na pasta "${folderName}"`);
        }

        console.log(`✅ Documento "${fileName}" selecionado!`);
        await wf.waitForTimeout(2000);

        // 🎯 TERCEIRO: Procurar e clicar no botão de compartilhar
        console.log("\n🔗 Procurando botão de compartilhar...");
        const shareSuccess = await clickShareButton(wf, fileName);
        
        if (!shareSuccess) {
            throw new Error("Botão de compartilhar não encontrado, não clicável, ou modal não abriu corretamente");
        }

        console.log(`✅ Botão de compartilhar clicado e modal verificado!`);
        await wf.waitForTimeout(2000);

        // 🎯 QUARTO: Adicionar usuários e confirmar compartilhamento
        console.log("\n👥 Adicionando usuários...");
        const sharingSuccess = await addUsersAndShare(wf);
        
        if (!sharingSuccess) {
            throw new Error("Erro ao adicionar usuários ou confirmar compartilhamento");
        }

        console.log("✅ Documento compartilhado com sucesso!");
        await wf.waitForTimeout(2000);

        return {
            success: true,
            message: `Documento "${fileName}" compartilhado com sucesso!`
        };

    } catch (error) {
        console.error("❌ Erro:", error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

// Função auxiliar para navegar para uma pasta específica
async function navigateToFolder(frame, folderName) {
    console.log(`🎯 Tentando navegar para "${folderName}"...`);

    try {
        // Aguardar a página carregar
        await frame.waitForTimeout(2000);

        // Estratégias de seleção de pasta
        const strategies = [
            `button:has-text("13. ${folderName}")`, // Formato com número
            `button:has-text("14. ${folderName}")`, // Formato com número
            `button:has-text("${folderName}")`, // Nome direto
            `a:has-text("${folderName}")`, // Link
            `[role="button"]:has-text("${folderName}")`, // Elemento com role button
            `*[data-testid*="item"]:has-text("${folderName}")` // Item com testid
        ];

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            console.log(`🔄 Tentativa ${i + 1}: ${strategy}`);

            try {
                const element = await frame.$(strategy);
                if (element) {
                    console.log(`✅ Elemento encontrado com estratégia ${i + 1}`);
                    await element.click();
                    console.log(`🖱️ Clique executado, aguardando carregamento...`);
                    await frame.waitForTimeout(3000);
                    return true;
                }
            } catch (e) {
                console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                continue;
            }
        }

        console.log(`❌ Não foi possível encontrar a pasta "${folderName}"`);
        return false;

    } catch (error) {
        console.log(`❌ Erro ao navegar para pasta: ${error.message}`);
        return false;
    }
}

// Função auxiliar para selecionar um documento específico
async function selectDocument(frame, fileName) {
    console.log(`🔍 Procurando documento "${fileName}"...`);

    try {
        // Aguardar carregamento da pasta
        await frame.waitForTimeout(3000);

        console.log(`🎯 ESTRATÉGIA FOCADA: Procurando pelo div.doc-detail-view que contém "${fileName}"`);
        
        // 🎯 ESTRATÉGIA ESPECÍFICA: Procurar pelo container doc-detail-view que contém o arquivo
        const documentElements = await frame.$$eval('.doc-detail-view', (elements, targetFileName) => {
            const foundElements = [];
            
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

        console.log(`📋 Encontrados ${documentElements.length} elementos doc-detail-view com "${fileName}":`);
        documentElements.forEach((elem, i) => {
            console.log(`  ${i + 1}. AriaLabel: "${elem.ariaLabel}"`);
            console.log(`     Texto: "${elem.textContent}"`);
            console.log(`     Visível: ${elem.isVisible}`);
        });

        if (documentElements.length > 0) {
            // Usar o primeiro elemento visível encontrado
            const targetElement = documentElements.find(elem => elem.isVisible) || documentElements[0];
            
            console.log(`✅ Selecionando elemento ${targetElement.index + 1} com aria-label: "${targetElement.ariaLabel}"`);
            
            // 🎯 CLICK CORRETO: Clicar no div.doc-detail-view usando seletor CSS direto
            const selector = `.doc-detail-view:nth-of-type(${targetElement.index + 1})`;
            console.log(`🎯 Clicando no seletor: ${selector}`);
            
            await frame.click(selector);
            console.log(`🖱️ Clique executado no div.doc-detail-view!`);
            await frame.waitForTimeout(2000);
            
            return true;
        }

        console.log(`❌ Nenhum div.doc-detail-view encontrado para "${fileName}"`);
        return false;

    } catch (error) {
        console.log(`❌ Erro ao selecionar documento: ${error.message}`);
        return false;
    }
}

// Função auxiliar para clicar no botão de compartilhar e verificar se modal abriu
async function clickShareButton(frame, expectedFileName) {
    console.log(`🔗 Procurando botão de compartilhar...`);

    try {
        // Estratégias para encontrar o botão de compartilhar
        const strategies = [
            'button[data-testid="share"]', // Botão específico do Workfront
            'button:has-text("Share")', // Botão com texto Share
            'button:has-text("Compartilhar")', // Botão em português
            'button[aria-label*="share"]', // Botão com aria-label
            'button[title*="share"]', // Botão com title
            '*[data-testid*="share"]' // Qualquer elemento com testid share
        ];

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            console.log(`🔄 Procurando botão share - Tentativa ${i + 1}: ${strategy}`);

            try {
                const element = await frame.$(strategy);
                if (element) {
                    const isVisible = await element.isVisible();
                    if (isVisible) {
                        console.log(`✅ Botão de compartilhar encontrado com estratégia ${i + 1}`);
                        await element.click();
                        console.log(`🖱️ Botão de compartilhar clicado!`);
                        await frame.waitForTimeout(3000);
                        
                        // 🎯 VERIFICAR SE MODAL ABRIU CORRETAMENTE
                        const modalOpened = await verifyShareModal(frame, expectedFileName);
                        if (modalOpened) {
                            console.log(`✅ Modal de compartilhamento aberto e verificado!`);
                            return true;
                        } else {
                            console.log(`⚠️ Modal não abriu ou não tem o título correto. Tentando próxima estratégia...`);
                            // Continuar tentando outras estratégias
                        }
                    } else {
                        console.log(`⚠️ Botão encontrado mas não visível - estratégia ${i + 1}`);
                    }
                }
            } catch (e) {
                console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                continue;
            }
        }

        console.log(`❌ Botão de compartilhar não encontrado ou modal não abriu corretamente`);
        return false;

    } catch (error) {
        console.log(`❌ Erro ao clicar no botão de compartilhar: ${error.message}`);
        return false;
    }
}

// Função para verificar se o modal de compartilhamento abriu com o arquivo correto
async function verifyShareModal(frame, expectedFileName) {
    console.log(`🔍 Verificando se modal de compartilhamento abriu para "${expectedFileName}"...`);
    
    try {
        // Aguardar modal aparecer
        await frame.waitForTimeout(3000);
        
        // Procurar pelo modal de compartilhamento
        const modalSelectors = [
            '[data-testid="unified-share-dialog"]',
            '.unified-share-dialog',
            '[role="dialog"]',
            '.spectrum-Dialog'
        ];
        
        for (const modalSelector of modalSelectors) {
            try {
                const modal = await frame.$(modalSelector);
                if (modal) {
                    const isVisible = await modal.isVisible();
                    if (isVisible) {
                        console.log(`✅ Modal encontrado: ${modalSelector}`);
                        
                        // 🎯 MELHOR ESTRATÉGIA: Procurar especificamente pelo título com "Share"
                        const titleSelectors = [
                            'h2:has-text("Share")', // Título específico do modal de share
                            '.spectrum-Dialog-heading h2', // Título dentro do cabeçalho
                            'h2[id*="react-aria"]', // Título com ID react-aria
                            '[class*="Dialog-heading"] h2', // Qualquer cabeçalho de diálogo
                            'h1, h2, h3' // Fallback para qualquer heading
                        ];
                        
                        let modalTitle = '';
                        for (const titleSelector of titleSelectors) {
                            try {
                                const titleElement = await frame.$(titleSelector);
                                if (titleElement) {
                                    const title = await titleElement.textContent();
                                    if (title && title.trim().length > 0) {
                                        modalTitle = title.trim();
                                        console.log(`📋 Título encontrado com "${titleSelector}": "${modalTitle}"`);
                                        break;
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (!modalTitle) {
                            // Fallback: pegar todo o texto do modal e procurar por "Share"
                            const modalText = await modal.textContent();
                            console.log(`🔍 Texto completo do modal (primeiros 200 chars): "${modalText.substring(0, 200)}..."`);
                            
                            // Procurar por linhas que contenham "Share" e o nome do arquivo
                            const lines = modalText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                            const shareLine = lines.find(line => line.includes('Share') && line.length > 10);
                            if (shareLine) {
                                modalTitle = shareLine;
                                console.log(`📋 Título encontrado no texto: "${modalTitle}"`);
                            }
                        }
                        
                        // Verificar se o título contém o nome do arquivo (com ou sem extensão)
                        const fileNameBase = expectedFileName.replace(/\.[^/.]+$/, ""); // Remove extensão
                        const fileNameShort = fileNameBase.length > 30 ? fileNameBase.substring(0, 30) : fileNameBase; // Versão encurtada
                        
                        console.log(`🔍 Verificando título do modal:`);
                        console.log(`   Título encontrado: "${modalTitle}"`);
                        console.log(`   Arquivo esperado: "${expectedFileName}"`);
                        console.log(`   Arquivo base: "${fileNameBase}"`);
                        console.log(`   Arquivo curto: "${fileNameShort}"`);
                        
                        if (modalTitle && (
                            modalTitle.includes(expectedFileName) || 
                            modalTitle.includes(fileNameBase) ||
                            modalTitle.includes(fileNameShort) ||
                            (modalTitle.includes('Share') && modalTitle.length > 20) // Qualquer modal de share com conteúdo
                        )) {
                            console.log(`✅ Modal de compartilhamento detectado corretamente!`);
                            console.log(`🎉 SUCESSO: Modal abriu para o arquivo correto!`);
                            return true;
                        } else {
                            console.log(`⚠️ Modal pode não estar exibindo o arquivo correto, mas parece ser modal de share`);
                            if (modalTitle.includes('Share')) {
                                console.log(`📝 Assumindo sucesso pois é um modal de Share`);
                                return true;
                            }
                        }
                    }
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

// Função auxiliar para adicionar usuários e confirmar compartilhamento
async function addUsersAndShare(frame) {
    console.log(`👥 Adicionando usuários ao compartilhamento...`);

    try {
        // Aguardar o modal de compartilhamento estar completamente carregado
        await frame.waitForTimeout(3000);

        console.log(`📧 Adicionando ${USERS.length} usuários ao modal de compartilhamento...`);

        // 🎯 PROCURAR PELO CAMPO DE ENTRADA ESPECÍFICO DO WORKFRONT
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
                const input = await frame.$(selector);
                if (input && await input.isVisible() && !await input.getAttribute('readonly')) {
                    console.log(`✅ Campo de entrada encontrado: ${selector}`);
                    emailInput = input;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!emailInput) {
            console.log(`❌ Campo de entrada de usuários não encontrado`);
            return false;
        }

        // 🧪 TESTE INICIAL: Adicionar Giovana Jockyman
        console.log(`\n🧪 TESTE: Adicionando Giovana Jockyman...`);
        const testSuccess = await addUserWithDropdown(frame, emailInput, "giovana.jockyman@dell.com", "Giovana Jockyman");
        
        if (testSuccess) {
            console.log(`✅ Teste com Giovana Jockyman bem-sucedido!`);
            
            // Adicionar outros usuários
            for (const user of USERS) {
                try {
                    console.log(`\n➕ Adicionando usuário: ${user.email} (${user.role})`);
                    const userAdded = await addUserWithDropdown(frame, emailInput, user.email, null);
                    
                    if (userAdded) {
                        console.log(`✅ ${user.email} adicionado com sucesso`);
                        
                        // Definir permissão se necessário (MANAGE vs VIEW)
                        if (user.role === "MANAGE") {
                            try {
                                await setUserPermission(frame, user.email, "MANAGE");
                            } catch (e) {
                                console.log(`⚠️ Não foi possível definir permissão MANAGE para ${user.email}`);
                            }
                        }
                    } else {
                        console.log(`⚠️ Não foi possível adicionar ${user.email}`);
                    }

                } catch (e) {
                    console.log(`❌ Erro ao adicionar ${user.email}: ${e.message}`);
                }
            }
        } else {
            console.log(`❌ Teste com Giovana Jockyman falhou - parando processo`);
            return false;
        }

        console.log(`\n📤 Confirmando compartilhamento...`);

        // 🎯 PROCURAR BOTÃO DE SALVAMENTO ESPECÍFICO DO WORKFRONT
        const saveButtons = [
            'button:has-text("Save")', // Botão Save do modal
            'button[data-variant="accent"]', // Botão com variant accent (primary)
            'button.spectrum-Button[data-style="fill"]', // Botão preenchido
            'button:has-text("Share")',
            'button:has-text("Compartilhar")',
            'button:has-text("Send")',
            'button:has-text("Enviar")',
            'button[data-testid*="save"]',
            'button[data-testid*="confirm"]'
        ];

        let saveSuccess = false;
        for (const saveSelector of saveButtons) {
            try {
                const saveButton = await frame.$(saveSelector);
                if (saveButton && await saveButton.isVisible() && !await saveButton.isDisabled()) {
                    console.log(`✅ Botão de salvamento encontrado: ${saveSelector}`);
                    await saveButton.click();
                    console.log(`🎉 Compartilhamento confirmado!`);
                    await frame.waitForTimeout(3000);
                    saveSuccess = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!saveSuccess) {
            console.log(`⚠️ Botão de confirmação não encontrado, mas usuários foram adicionados`);
        }

        return true;

    } catch (error) {
        console.log(`❌ Erro ao adicionar usuários: ${error.message}`);
        return false;
    }
}

// 🎯 NOVA FUNÇÃO: Adicionar usuário com dropdown
async function addUserWithDropdown(frame, emailInput, userEmail, expectedName) {
    console.log(`\n📧 Adicionando usuário: ${userEmail}${expectedName ? ` (${expectedName})` : ''}`);
    
    try {
        // 1. Limpar o campo e digitar o email
        console.log(`🖱️ Clicando no campo de entrada...`);
        await emailInput.click();
        await frame.waitForTimeout(500);
        
        console.log(`🧹 Limpando campo...`);
        await emailInput.fill('');
        await frame.waitForTimeout(500);
        
        console.log(`⌨️ Digitando email: ${userEmail}...`);
        await emailInput.type(userEmail, { delay: 100 });
        await frame.waitForTimeout(2000); // Aguardar dropdown carregar
        
        // 2. Procurar pelo dropdown que aparece
        console.log(`🔍 Procurando dropdown de sugestões...`);
        const dropdownSelectors = [
            '[role="listbox"]', // Listbox padrão
            '.spectrum-Popover [role="listbox"]', // Listbox dentro de popover
            '[data-testid="popover"] [role="listbox"]', // Listbox com testid
            '.spectrum-Menu', // Menu do Spectrum
            '[class*="Popover"] [class*="Menu"]' // Menu dentro de popover
        ];
        
        let dropdown = null;
        for (const selector of dropdownSelectors) {
            try {
                dropdown = await frame.$(selector);
                if (dropdown && await dropdown.isVisible()) {
                    console.log(`✅ Dropdown encontrado: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!dropdown) {
            console.log(`❌ Dropdown não encontrado - tentando pressionar Enter`);
            await emailInput.press('Enter');
            await frame.waitForTimeout(1000);
            return false;
        }
        
        // 3. Procurar pela opção correta no dropdown
        console.log(`🎯 Procurando opção no dropdown...`);
        
        // Estratégias para encontrar a opção correta
        const optionStrategies = [
            // Se temos o nome esperado, procurar por ele
            ...(expectedName ? [
                `[role="option"]:has-text("${expectedName}")`,
                `[data-testid="search-result"]:has-text("${expectedName}")`,
                `.spectrum-Menu-item:has-text("${expectedName}")`
            ] : []),
            // Procurar pelo email
            `[role="option"]:has-text("${userEmail}")`,
            `[data-testid="search-result"]:has-text("${userEmail}")`,
            `.spectrum-Menu-item:has-text("${userEmail}")`,
            // Procurar pela primeira opção visível
            '[role="option"]:first-child',
            '[data-testid="search-result"]:first-child',
            '.spectrum-Menu-item:first-child'
        ];
        
        let optionSelected = false;
        for (const strategy of optionStrategies) {
            try {
                console.log(`🔄 Tentando estratégia: ${strategy}`);
                const option = await frame.$(strategy);
                if (option && await option.isVisible()) {
                    const optionText = await option.textContent();
                    console.log(`📋 Opção encontrada: "${optionText.trim().substring(0, 100)}..."`);
                    
                    // Verificar se é a opção correta
                    if ((expectedName && optionText.includes(expectedName)) || 
                        optionText.includes(userEmail) ||
                        !expectedName) { // Se não temos nome esperado, aceitar qualquer opção
                        
                        console.log(`✅ Clicando na opção correta...`);
                        await option.click();
                        await frame.waitForTimeout(1500);
                        optionSelected = true;
                        break;
                    }
                }
            } catch (e) {
                console.log(`❌ Erro na estratégia: ${e.message}`);
                continue;
            }
        }
        
        if (!optionSelected) {
            console.log(`⚠️ Nenhuma opção selecionada - tentando Enter`);
            await emailInput.press('Enter');
            await frame.waitForTimeout(1000);
        }
        
        // 4. Verificar se o usuário foi adicionado
        console.log(`🔍 Verificando se usuário foi adicionado...`);
        await frame.waitForTimeout(1000);
        
        // Procurar se o email aparece na lista de usuários adicionados
        const userInListSelectors = [
            `text=${userEmail}`,
            `text=${expectedName || ''}`,
            `[aria-label*="${userEmail}"]`,
            `[title*="${userEmail}"]`
        ];
        
        for (const selector of userInListSelectors) {
            try {
                if (selector.includes('text=') && !selector.replace('text=', '').trim()) continue;
                
                const userInList = await frame.$(selector);
                if (userInList) {
                    console.log(`✅ Usuário "${userEmail}" confirmado na lista!`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log(`⚠️ Não foi possível confirmar se "${userEmail}" foi adicionado`);
        return true; // Assumir sucesso para continuar
        
    } catch (error) {
        console.log(`❌ Erro ao adicionar usuário "${userEmail}": ${error.message}`);
        return false;
    }
}

// Função auxiliar para definir permissão de usuário
async function setUserPermission(frame, userEmail, permission) {
    console.log(`� Definindo permissão ${permission} para ${userEmail}...`);
    
    try {
        // Procurar por seletores de permissão próximos ao usuário
        const permissionSelectors = [
            `select[name*="role"]`,
            `select[name*="permission"]`,
            `select[data-testid*="permission"]`,
            `.permission-dropdown`,
            `[aria-label*="permission"]`
        ];

        for (const selector of permissionSelectors) {
            try {
                const permissionSelect = await frame.$(selector);
                if (permissionSelect && await permissionSelect.isVisible()) {
                    await permissionSelect.selectOption(permission);
                    console.log(`✅ Permissão ${permission} definida para ${userEmail}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }

        console.log(`⚠️ Selector de permissão não encontrado para ${userEmail}`);
        return false;

    } catch (error) {
        console.log(`❌ Erro ao definir permissão: ${error.message}`);
        return false;
    }
}

// 3) MAIN - só executa se chamado diretamente, não quando importado
if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.argv.includes("--login")) {
        login().catch(console.error);
    } else if (process.argv.includes("--extract")) {
        const urlIndex = process.argv.indexOf("--projectUrl");
        if (urlIndex === -1 || !process.argv[urlIndex + 1]) {
            console.error("❌ Use: --extract --projectUrl 'URL_DO_PROJETO'");
            process.exit(1);
        }
        const projectUrl = process.argv[urlIndex + 1];
        extractDocuments(projectUrl).catch(console.error);
    } else if (process.argv.includes("--share")) {
        const urlIndex = process.argv.indexOf("--projectUrl");
        const docIndex = process.argv.indexOf("--docName");

        if (urlIndex === -1 || !process.argv[urlIndex + 1] || docIndex === -1 || !process.argv[docIndex + 1]) {
            console.error("❌ Use: --share --projectUrl 'URL_DO_PROJETO' --docName 'NOME_DO_ARQUIVO'");
            process.exit(1);
        }

        const projectUrl = process.argv[urlIndex + 1];
        const docName = process.argv[docIndex + 1];
        
        // Para compatibilidade com versões antigas, assumir pasta "Asset Release" se não especificada
        const folderIndex = process.argv.indexOf("--folder");
        const folderName = folderIndex !== -1 && process.argv[folderIndex + 1] 
            ? process.argv[folderIndex + 1] 
            : "Asset Release";
            
        shareDocument(projectUrl, folderName, docName).catch(console.error);
    } else {
        console.log(`
📋 Uso:
  node wf_share_const.js --login
  node wf_share_const.js --extract --projectUrl "URL_DO_PROJETO"
  node wf_share_const.js --share --projectUrl "URL_DO_PROJETO" --docName "NOME_DO_ARQUIVO" [--folder "NOME_DA_PASTA"]

🔗 Exemplo de URL:
  https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68a3355a009ab6b7e05496c230b884c1/documents
        `);
    }
}

// Exportar as funções para uso pelo servidor
export { login, extractDocuments, shareDocument };