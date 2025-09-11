// tests/test-dropdown-fix.spec.js
import { test, expect } from '@playwright/test';

const STATE_FILE = "wf_state.json";

test.describe('Teste de Dropdown - Workfront', () => {
    test('Testar fechamento de dropdown de permissões', async ({ page }) => {
        // Carregar estado de autenticação
        try {
            await page.context().storageState({ path: STATE_FILE });
        } catch (e) {
            console.log("⚠️ Execute o login primeiro: npx playwright test --ui e rode o teste de login");
            throw new Error("Estado de autenticação não encontrado");
        }

        const projectUrl = "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents";
        
        console.log("🌍 Abrindo projeto...");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // Encontrar frame do Workfront
        console.log("🔍 Encontrando frame...");
        const frameElement = await page.$('iframe[src*="workfront"], iframe[src*="experience"], iframe');
        const frame = await frameElement.contentFrame();
        
        if (!frame) {
            throw new Error("Frame do Workfront não encontrado");
        }

        await frame.waitForTimeout(2000);
        
        console.log("📄 Procurando documento específico...");
        const documentName = "2601G0179_0057_5297982_br_csg_gam_fy26q3w7_smv_jscon_wtn-txl_Award-Winning-Innovation-Tier-2_Vídeo4.zip";
        
        // Procurar documento (versão mais específica)
        const docElement = await frame.$(`div:has-text("${documentName.substring(0, 40)}")`);
        if (!docElement) {
            // Listar todos os documentos visíveis para debug
            const allDocs = await frame.$$eval('div', elements => {
                return elements
                    .filter(el => el.textContent && el.textContent.includes('.zip'))
                    .map(el => el.textContent.trim())
                    .slice(0, 10);
            });
            console.log("📋 Documentos encontrados:", allDocs);
            throw new Error("Documento específico não encontrado");
        }
        
        console.log("🖱️ Selecionando documento...");
        await docElement.click();
        await frame.waitForTimeout(2000);
        
        console.log("🔗 Clicando em Share...");
        const shareBtn = await frame.$('button:has-text("Share"), button[data-testid="share"]');
        if (!shareBtn) {
            throw new Error("Botão Share não encontrado");
        }
        
        await shareBtn.click();
        await frame.waitForTimeout(3000);
        
        console.log("✅ Modal de compartilhamento aberto!");
        console.log("📧 Agora você pode testar:");
        console.log("  1. Adicionar um usuário (ex: yasmin.lahm@dell.com)");
        console.log("  2. Clicar no dropdown View/Manage");
        console.log("  3. Selecionar 'Manage'");
        console.log("  4. Verificar se o dropdown fecha corretamente");
        
        // Aguardar interação manual
        console.log("⏸️ Teste pausado por 5 minutos para interação manual...");
        await frame.waitForTimeout(300000);
    });

    test('Login rápido', async ({ page }) => {
        console.log("🔐 Abrindo Experience Cloud para login...");
        await page.goto("https://experience.adobe.com/");
        
        console.log("👤 Complete o login e MFA nos próximos 60 segundos...");
        await page.waitForTimeout(60000);
        
        // Salvar estado
        await page.context().storageState({ path: STATE_FILE });
        console.log("✅ Login salvo!");
    });
});