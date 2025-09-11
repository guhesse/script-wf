// tests/workfront-sharing.spec.js
import { test, expect } from '@playwright/test';

const STATE_FILE = "wf_state.json";

// Função para obter o frame do Workfront
async function getWorkfrontFrame(page) {
    await page.waitForTimeout(2500);

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
                    await frame.waitForTimeout(500);
                    const url = frame.url();
                    if (url.includes('workfront') || url.includes('experience') || url.includes('adobe')) {
                        console.log(`✓ Frame encontrado: ${selector} (URL: ${url.substring(0, 50)}...)`);
                        return frame;
                    }
                }
            }
        } catch (e) {
            continue;
        }
    }

    console.log("ℹ️ Nenhum frame específico encontrado, usando página principal");
    return page;
}

test.describe('Workfront Document Sharing', () => {
    test.beforeEach(async ({ page }) => {
        // Carregar estado de autenticação salvo
        try {
            await page.context().storageState({ path: STATE_FILE });
        } catch (e) {
            console.log("⚠️ Estado de autenticação não encontrado. Execute login primeiro.");
        }
    });

    test('Compartilhar documento específico', async ({ page }) => {
        const projectUrl = "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents";
        const documentName = "2601G0179_0057_5297982_br_csg_gam_fy26q3w7_smv_jscon_wtn-txl_Award-Winning-Innovation-Tier-2_Vídeo4.zip";
        
        console.log("🌍 Abrindo projeto do Workfront...");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        console.log("🔍 Procurando frame do Workfront...");
        const frame = await getWorkfrontFrame(page);
        
        console.log("📄 Procurando documento específico...");
        
        // Aguardar interface carregar
        await frame.waitForTimeout(2000);
        
        // Procurar pelo documento específico usando seletores mais específicos
        const documentSelectors = [
            `[aria-label*="${documentName}"]`,
            `div:has-text("${documentName}")`,
            `[data-testid="standard-item-container"]:has-text("${documentName}")`,
            `.doc-detail-view:has-text("${documentName}")`
        ];
        
        let documentElement = null;
        console.log(`🎯 Procurando por: "${documentName.substring(0, 50)}..."`);
        
        for (const selector of documentSelectors) {
            try {
                console.log(`🔄 Tentando seletor: ${selector.substring(0, 50)}...`);
                documentElement = await frame.$(selector);
                if (documentElement && await documentElement.isVisible()) {
                    console.log(`✅ Documento encontrado com: ${selector.substring(0, 50)}...`);
                    break;
                }
            } catch (e) {
                console.log(`❌ Erro com seletor: ${e.message}`);
                continue;
            }
        }
        
        if (!documentElement) {
            // Estratégia alternativa: procurar por parte do nome
            const shortName = documentName.substring(0, 30);
            console.log(`🔄 Tentando com nome curto: "${shortName}"`);
            
            const alternativeSelectors = [
                `div:has-text("${shortName}")`,
                `[aria-label*="${shortName}"]`,
                `.doc-detail-view:has-text("${shortName}")`
            ];
            
            for (const selector of alternativeSelectors) {
                try {
                    documentElement = await frame.$(selector);
                    if (documentElement && await documentElement.isVisible()) {
                        console.log(`✅ Documento encontrado com nome curto: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        if (!documentElement) {
            throw new Error(`Documento "${documentName}" não encontrado na página`);
        }
        
        console.log("🖱️ Clicando no documento...");
        await documentElement.click();
        await frame.waitForTimeout(2000);
        
        console.log("🔗 Procurando botão de compartilhar...");
        const shareButtonSelectors = [
            'button[data-testid="share"]',
            'button:has-text("Share")',
            'button:has-text("Compartilhar")',
            'button[aria-label*="share"]',
            'button[title*="share"]',
            '*[data-testid*="share"]'
        ];
        
        let shareButton = null;
        for (const selector of shareButtonSelectors) {
            try {
                shareButton = await frame.$(selector);
                if (shareButton && await shareButton.isVisible()) {
                    console.log(`✅ Botão Share encontrado: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!shareButton) {
            throw new Error("Botão de compartilhar não encontrado");
        }
        
        console.log("🖱️ Clicando no botão Share...");
        await shareButton.click();
        await frame.waitForTimeout(3000);
        
        console.log("🔍 Verificando se modal de compartilhamento abriu...");
        const modalSelectors = [
            '[data-testid="unified-share-dialog"]',
            '.unified-share-dialog',
            '[role="dialog"]',
            '.spectrum-Dialog'
        ];
        
        let modal = null;
        for (const selector of modalSelectors) {
            try {
                modal = await frame.$(selector);
                if (modal && await modal.isVisible()) {
                    console.log(`✅ Modal encontrado: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!modal) {
            throw new Error("Modal de compartilhamento não abriu");
        }
        
        console.log("🎉 SUCESSO! Modal de compartilhamento está aberto e pronto para teste manual");
        console.log("📧 Agora você pode testar manualmente:");
        console.log("  1. Adicionar usuários no campo de entrada");
        console.log("  2. Testar mudança de permissões");
        console.log("  3. Verificar fechamento de dropdowns");
        
        // Manter o teste rodando para permitir interação manual
        console.log("⏸️ Pausando por 300 segundos para teste manual...");
        await page.waitForTimeout(300000); // 5 minutos
    });

    test('Login no Workfront (se necessário)', async ({ page }) => {
        console.log("🔐 Fazendo login no Experience Cloud...");
        await page.goto("https://experience.adobe.com/", { waitUntil: "domcontentloaded" });
        
        console.log("⏳ Aguardando 90 segundos para completar SSO/MFA...");
        console.log("👤 Por favor, complete o login no navegador que abriu");
        
        await page.waitForTimeout(90000); // 90 segundos para fazer login
        
        // Salvar estado de autenticação
        await page.context().storageState({ path: STATE_FILE });
        console.log("✅ Estado de autenticação salvo!");
    });
});