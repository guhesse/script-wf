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
                            console.log(`\n🎯 Tentando múltiplas estratégias para "${folderName}":`)
                            
                            // ESTRATÉGIA: Tentar diferentes seletores baseados nos itens encontrados
                            const strategies = [
                                `button:has-text("${folderName} (1)")`, // Asset Release (1)
                                `button:has-text("${folderName} (0)")`, // Final Materials (0)  
                                `button:has-text("13. ${folderName}")`, // 13. Asset Release
                                `button:has-text("14. ${folderName}")`, // 14. Final Materials
                                `button:has-text("${folderName}")`, // Asset Release
                                `div[data-testid="standard-item-container"]:has-text("${folderName}")`,
                                `*[data-testid="standard-item-container"]:has-text("${folderName}")`
                            ];
                            
                            let navigationSuccess = false;
                            let currentUrl = wf.url();
                            console.log(`📍 URL inicial: ${currentUrl}`);
                            
                            for (let i = 0; i < strategies.length; i++) {
                                const strategy = strategies[i];
                                console.log(`\n🔄 Tentativa ${i + 1}: ${strategy}`);
                                
                                try {
                                    const element = await wf.$(strategy);
                                    if (element) {
                                        console.log(`✅ Elemento encontrado com estratégia ${i + 1}`);
                                        
                                        // Tentar clique simples
                                        await element.click();
                                        console.log(`🖱️ Clique executado, aguardando...`);
                                        await wf.waitForTimeout(2000);
                                        
                                        // Verificar se a URL mudou ou se o conteúdo mudou
                                        const newUrl = wf.url();
                                        console.log(`📍 URL após clique: ${newUrl}`);
                                        
                                        // Verificar se o conteúdo da página mudou
                                        const pageContent = await wf.evaluate(() => document.body.innerText);
                                        const hasOtherFolders = pageContent.includes('01. Files from Studio') || 
                                                              pageContent.includes('02. Files to Studio');
                                        
                                        if (!hasOtherFolders || newUrl !== currentUrl) {
                                            console.log(`🎯 Possível navegação detectada!`);
                                            navigationSuccess = true;
                                            break;
                                        } else {
                                            console.log(`❌ Navegação não detectada, tentando duplo clique...`);
                                            
                                            // Tentar duplo clique
                                            await element.dblclick();
                                            await wf.waitForTimeout(2000);
                                            
                                            const afterDblClick = await wf.evaluate(() => document.body.innerText);
                                            const stillHasOtherFolders = afterDblClick.includes('01. Files from Studio');
                                            
                                            if (!stillHasOtherFolders) {
                                                console.log(`🎯 Duplo clique funcionou!`);
                                                navigationSuccess = true;
                                                break;
                                            }
                                        }
                                    } else {
                                        console.log(`❌ Elemento não encontrado com estratégia ${i + 1}`);
                                    }
                                } catch (e) {
                                    console.log(`❌ Erro na estratégia ${i + 1}: ${e.message}`);
                                    continue;
                                }
                            }
                            
                            if (navigationSuccess) {
                                console.log(`\n🎉 Navegação bem-sucedida para "${folderName}"!`);
                                
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
                                
                                // Voltar para a lista principal
                                console.log(`🔙 Voltando para a lista principal...`);
                                const baseUrl = projectUrl.split('?')[0];
                                await wf.goto(baseUrl);
                                await wf.waitForTimeout(3000);
                                
                            } else {
                                console.log(`❌ Não foi possível navegar para "${folderName}" com nenhuma estratégia`);
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
        
        // Primeiro, vamos mapear TODOS os elementos da pasta para entender a estrutura
        console.log('🗂️ Mapeando TODA a estrutura interna da pasta...');
        
        const allElements = await frame.$$eval('*', () => {
            const items = [];
            
            // Pegar TODOS os elementos visíveis
            const allEls = document.querySelectorAll('*');
            allEls.forEach(el => {
                const text = el.textContent?.trim();
                if (text && text.length > 0 && text.length < 300) {
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;
                    
                    if (isVisible) {
                        items.push({
                            tagName: el.tagName,
                            className: el.className,
                            id: el.id,
                            testId: el.getAttribute('data-testid'),
                            role: el.getAttribute('role'),
                            href: el.href,
                            src: el.src,
                            alt: el.alt,
                            title: el.title,
                            ariaLabel: el.getAttribute('aria-label'),
                            textContent: text,
                            hasFileExtension: /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|mp4|avi|mov|ai|psd|eps|svg|tiff|bmp)$/i.test(text),
                            innerHTML: el.innerHTML.substring(0, 100) // Primeiros 100 chars do HTML interno
                        });
                    }
                }
            });
            
            // Remover duplicatas baseadas no texto E tagName
            const unique = items.filter((item, index, self) => 
                index === self.findIndex(i => 
                    i.textContent === item.textContent && 
                    i.tagName === item.tagName &&
                    i.testId === item.testId
                )
            );
            
            return unique;
        });
        
        console.log(`📋 ===== ENCONTRADOS ${allElements.length} ELEMENTOS ÚNICOS NA PASTA =====`);
        
        // Categorizar elementos de forma mais detalhada
        const categories = {
            filesWithExtension: [],
            links: [],
            images: [],
            buttons: [],
            divs: [],
            spans: [],
            dataTestIds: [],
            downloadLinks: [],
            possibleFiles: [],
            others: []
        };
        
        allElements.forEach(item => {
            const text = item.textContent.toLowerCase();
            
            // Categorização detalhada
            if (item.hasFileExtension) {
                categories.filesWithExtension.push(item);
            } else if (item.tagName === 'A' && item.href) {
                if (item.href.includes('download') || item.href.includes('file')) {
                    categories.downloadLinks.push(item);
                } else {
                    categories.links.push(item);
                }
            } else if (item.tagName === 'IMG' || item.src) {
                categories.images.push(item);
            } else if (item.tagName === 'BUTTON') {
                categories.buttons.push(item);
            } else if (item.tagName === 'DIV') {
                categories.divs.push(item);
            } else if (item.tagName === 'SPAN') {
                categories.spans.push(item);
            } else if (item.testId) {
                categories.dataTestIds.push(item);
            } else if (text.includes('download') || text.includes('file') || text.includes('.')) {
                categories.possibleFiles.push(item);
            } else {
                categories.others.push(item);
            }
        });
        
        // Mostrar TODOS os elementos por categoria
        Object.keys(categories).forEach(category => {
            const items = categories[category];
            if (items.length > 0) {
                console.log(`\n📁 ===== ${category.toUpperCase()} (${items.length}) =====`);
                items.forEach((item, i) => {
                    console.log(`  ${i+1}. ${item.tagName} "${item.textContent.substring(0, 80)}" ${item.hasFileExtension ? '🔗' : ''}`);
                    if (item.testId) console.log(`     └─ testid: "${item.testId}"`);
                    if (item.className) console.log(`     └─ class: "${item.className.substring(0, 50)}"`);
                    if (item.id) console.log(`     └─ id: "${item.id}"`);
                    if (item.href) console.log(`     └─ href: "${item.href}"`);
                    if (item.src) console.log(`     └─ src: "${item.src}"`);
                    if (item.role) console.log(`     └─ role: "${item.role}"`);
                    if (item.ariaLabel) console.log(`     └─ aria-label: "${item.ariaLabel}"`);
                    if (item.innerHTML && item.innerHTML !== item.textContent) {
                        console.log(`     └─ html: "${item.innerHTML}"`);
                    }
                    console.log(''); // linha em branco para separar
                });
            }
        });
        
        // Mostrar elementos com data-testid específicos
        const testIdElements = allElements.filter(item => item.testId);
        if (testIdElements.length > 0) {
            console.log(`\n🏷️ ===== ELEMENTOS COM DATA-TESTID (${testIdElements.length}) =====`);
            testIdElements.forEach((item, i) => {
                console.log(`  ${i+1}. ${item.tagName}[data-testid="${item.testId}"] "${item.textContent.substring(0, 60)}"`);
            });
        }
        
        // Analisar estrutura do DOM
        const domStructure = await frame.evaluate(() => {
            const getElementInfo = (el, level = 0) => {
                if (level > 3) return null; // Limitar profundidade
                
                const text = el.textContent?.trim();
                if (!text || text.length > 200) return null;
                
                return {
                    tag: el.tagName,
                    testId: el.getAttribute('data-testid'),
                    class: el.className,
                    text: text.substring(0, 100),
                    children: Array.from(el.children).map(child => getElementInfo(child, level + 1)).filter(Boolean)
                };
            };
            
            return Array.from(document.querySelectorAll('body > *')).map(el => getElementInfo(el)).filter(Boolean);
        });
        
        console.log(`\n🌳 ===== ESTRUTURA DOM (PRIMEIROS 3 NÍVEIS) =====`);
        const printDomStructure = (elements, indent = '') => {
            elements.forEach(el => {
                console.log(`${indent}${el.tag}${el.testId ? `[testid="${el.testId}"]` : ''} "${el.text}"`);
                if (el.children && el.children.length > 0) {
                    printDomStructure(el.children, indent + '  ');
                }
            });
        };
        printDomStructure(domStructure.slice(0, 5)); // Mostrar apenas os primeiros 5 elementos raiz
        
        // Extrair arquivos dos elementos encontrados
        const allPotentialFiles = [...categories.filesWithExtension, ...categories.downloadLinks, ...categories.possibleFiles];
        
        console.log(`\n📄 ===== PROCESSANDO POSSÍVEIS ARQUIVOS =====`);
        for (const item of allPotentialFiles) {
            const fileName = item.textContent.trim();
            const fileType = getFileTypeFromName(fileName);
            
            // Adicionar arquivo se tiver extensão conhecida ou se parecer um arquivo
            if (fileType !== 'unknown' || item.hasFileExtension || item.href) {
                files.push({
                    name: fileName,
                    type: fileType !== 'unknown' ? fileType : 'File',
                    size: 'N/A',
                    url: item.href || 'N/A',
                    element: {
                        tagName: item.tagName,
                        testId: item.testId,
                        className: item.className,
                        id: item.id
                    }
                });
                console.log(`✅ Arquivo adicionado: "${fileName}" (${fileType})`);
                console.log(`   └─ Elemento: ${item.tagName}${item.testId ? `[testid="${item.testId}"]` : ''}${item.href ? ` href="${item.href}"` : ''}`);
            }
        }
        
    } catch (error) {
        console.log(`❌ Erro ao extrair arquivos da pasta: ${error.message}`);
    }
    
    console.log(`\n📊 ===== RESUMO FINAL =====`);
    console.log(`📂 Total de arquivos identificados: ${files.length}`);
    if (files.length > 0) {
        console.log(`📋 Lista de arquivos encontrados:`);
        files.forEach((file, i) => {
            console.log(`  ${i+1}. ${file.name} (${file.type}) - ${file.element.tagName}`);
        });
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

async function shareDocument(projectUrl, docName) {
    console.log("=== COMPARTILHANDO DOCUMENTO ===");
    console.log(`URL do projeto: ${projectUrl}`);
    console.log(`Documento: ${docName}`);

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

        console.log(`\nProcurando documento: ${docName}`);

        // Tenta encontrar o documento
        const docSelectors = [
            `a:has-text("${docName}")`,
            `*[data-testid*="document"]:has-text("${docName}")`,
            `tr:has-text("${docName}")`,
            `*:has-text("${docName}")`
        ];

        let docElement = null;
        for (const selector of docSelectors) {
            try {
                docElement = await wf.$(selector);
                if (docElement) {
                    console.log(`✓ Documento encontrado com seletor: ${selector}`);
                    break;
                }
            } catch (e) {
                console.log(`❌ Erro com seletor ${selector}: ${e.message}`);
            }
        }

        if (!docElement) {
            throw new Error(`Documento "${docName}" não encontrado.`);
        }

        // Tenta clicar no documento
        await docElement.click();
        await wf.waitForTimeout(2000);

        // Procura pelo botão de compartilhar
        console.log("Procurando botão de compartilhar...");
        const shareSelectors = [
            'button:has-text("Share")',
            'button:has-text("Compartilhar")',
            '*[data-testid*="share"]',
            'button[aria-label*="share"]',
            'button[title*="share"]'
        ];

        let shareButton = null;
        for (const selector of shareSelectors) {
            try {
                shareButton = await wf.$(selector);
                if (shareButton) {
                    console.log(`✓ Botão de compartilhar encontrado: ${selector}`);
                    break;
                }
            } catch (e) {
                console.log(`❌ Erro com seletor de share ${selector}: ${e.message}`);
            }
        }

        if (!shareButton) {
            throw new Error("Botão de compartilhar não encontrado.");
        }

        await shareButton.click();
        await wf.waitForTimeout(2000);

        // Adiciona os usuários
        console.log("Adicionando usuários...");
        for (const user of USERS) {
            try {
                console.log(`Adicionando: ${user.email} (${user.role})`);

                // Procura campo de email
                const emailInput = await wf.$('input[type="email"], input[placeholder*="email"], input[name*="email"]');
                if (emailInput) {
                    await emailInput.fill(user.email);
                    await wf.waitForTimeout(500);

                    // Pressiona Enter ou procura botão Add
                    await emailInput.press('Enter');
                    await wf.waitForTimeout(1000);
                }

                // Define permissão se necessário
                if (user.role === "MANAGE") {
                    const roleSelector = await wf.$('select[name*="role"], select[name*="permission"]');
                    if (roleSelector) {
                        await roleSelector.selectOption("MANAGE");
                    }
                }

            } catch (e) {
                console.log(`❌ Erro ao adicionar ${user.email}: ${e.message}`);
            }
        }

        // Confirma o compartilhamento
        console.log("Confirmando compartilhamento...");
        const confirmSelectors = [
            'button:has-text("Send")',
            'button:has-text("Enviar")',
            'button:has-text("Share")',
            'button:has-text("Confirm")',
            '*[data-testid*="confirm"]'
        ];

        for (const selector of confirmSelectors) {
            try {
                const confirmButton = await wf.$(selector);
                if (confirmButton) {
                    await confirmButton.click();
                    console.log("✓ Compartilhamento confirmado!");
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        await wf.waitForTimeout(3000);
        console.log("✅ Documento compartilhado com sucesso!");

    } catch (error) {
        console.error("❌ Erro:", error.message);
        throw error;
    } finally {
        await browser.close();
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
        shareDocument(projectUrl, docName).catch(console.error);
    } else {
        console.log(`
📋 Uso:
  node wf_share_const.js --login
  node wf_share_const.js --extract --projectUrl "URL_DO_PROJETO"
  node wf_share_const.js --share --projectUrl "URL_DO_PROJETO" --docName "NOME_DO_ARQUIVO"

🔗 Exemplo de URL:
  https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68a3355a009ab6b7e05496c230b884c1/documents
        `);
    }
}

// Exportar as funções para uso pelo servidor
export { login, extractDocuments, shareDocument };