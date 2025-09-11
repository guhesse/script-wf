// tests/workfront-dropdown-test.spec.js
import { test, expect } from '@playwright/test';

const STATE_FILE = "wf_state.json";

test.describe('Workfront Dropdown Fix Test', () => {
    test.beforeEach(async ({ page }) => {
        // Carregar estado de autenticação
        try {
            await page.context().storageState({ path: STATE_FILE });
        } catch (e) {
            console.log("⚠️ Execute login primeiro");
        }
    });

    test('Testar compartilhamento com dropdown fix', async ({ page }) => {
        const projectUrl = "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents";
        const documentName = "2601G0179_0057_5297982_br_csg_gam_fy26q3w7_smv_jscon_wtn-txl_Award-Winning-Innovation-Tier-2_Vídeo4.zip";
        
        console.log("🌍 Navegando para projeto...");
        await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // Encontrar frame do Workfront usando seletores mais robustos
        console.log("🔍 Procurando frame...");
        const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
        
        console.log("📄 Procurando documento...");
        // Usar parte do nome para ser mais flexível
        const shortName = documentName.substring(0, 40);
        const documentLocator = frameLocator.getByText(shortName).first();
        
        await expect(documentLocator).toBeVisible({ timeout: 10000 });
        
        console.log("🖱️ Clicando no documento...");
        await documentLocator.click();
        await page.waitForTimeout(2000);
        
        console.log("🔗 Procurando botão Share...");
        const shareButton = frameLocator.getByRole('button', { name: /share/i });
        await expect(shareButton).toBeVisible();
        
        console.log("🖱️ Clicando em Share...");
        await shareButton.click();
        await page.waitForTimeout(3000);
        
        console.log("✅ Modal de compartilhamento aberto!");
        
        // Verificar se modal abriu
        const modal = frameLocator.getByRole('dialog');
        await expect(modal).toBeVisible();
        
        console.log("📧 Testando adição de usuário...");
        
        // Encontrar campo de entrada usando getByRole
        const emailInput = frameLocator.getByRole('combobox').or(frameLocator.getByRole('textbox')).first();
        await expect(emailInput).toBeVisible();
        
        // Adicionar primeiro usuário
        const testEmail = "yasmin.lahm@dell.com";
        console.log(`📝 Adicionando ${testEmail}...`);
        
        await emailInput.fill(testEmail);
        await page.waitForTimeout(1000);
        
        // Procurar dropdown e selecionar opção
        const option = frameLocator.getByRole('option', { name: new RegExp(testEmail, 'i') }).first();
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();
        
        console.log("✅ Usuário adicionado!");
        await page.waitForTimeout(1000);
        
        console.log("🔧 Testando mudança de permissão...");
        
        // Encontrar linha do usuário e botão de permissão
        const userRow = frameLocator.locator(`[data-testid="access-rule-row"]:has-text("${testEmail}")`);
        await expect(userRow).toBeVisible();
        
        // Procurar botão View (se existir)
        const permissionButton = userRow.getByRole('button', { name: /view|manage/i });
        
        if (await permissionButton.isVisible()) {
            const buttonText = await permissionButton.textContent();
            
            if (buttonText.includes('View')) {
                console.log("🔄 Mudando de View para Manage...");
                
                // Clicar no botão para abrir dropdown
                await permissionButton.click();
                await page.waitForTimeout(500);
                
                // Procurar opção Manage
                const manageOption = frameLocator.getByRole('menuitemradio', { name: /manage/i });
                await expect(manageOption).toBeVisible({ timeout: 3000 });
                await manageOption.click();
                
                console.log("✅ Opção Manage selecionada!");
                
                // 🎯 SOLUÇÃO PARA DROPDOWN: Usar Playwright Test ESC
                console.log("🔑 Fechando dropdown com ESC...");
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
                
                // Verificar se dropdown fechou (opcional)
                const dropdownStillOpen = frameLocator.getByRole('menu').or(frameLocator.locator('[role="listbox"]'));
                try {
                    await expect(dropdownStillOpen).not.toBeVisible({ timeout: 2000 });
                    console.log("✅ Dropdown fechado com sucesso!");
                } catch (e) {
                    console.log("⚠️ Dropdown pode ainda estar aberto, mas continuando...");
                    // Tentar ESC adicional
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);
                }
                
                console.log("✅ Permissão alterada para Manage!");
            } else {
                console.log("✅ Usuário já tem permissão Manage");
            }
        }
        
        console.log("🎉 Teste concluído com sucesso!");
        console.log("📝 Agora você pode:");
        console.log("  - Adicionar mais usuários");
        console.log("  - Testar outras permissões");
        console.log("  - Confirmar o compartilhamento");
        
        // Pausar para interação manual
        console.log("⏸️ Pausando 60 segundos para interação manual...");
        await page.waitForTimeout(60000);
    });

    test('Login rápido', async ({ page }) => {
        console.log("🔐 Fazendo login...");
        await page.goto("https://experience.adobe.com/");
        
        console.log("👤 Complete o login nos próximos 45 segundos...");
        await page.waitForTimeout(45000);
        
        await page.context().storageState({ path: STATE_FILE });
        console.log("✅ Login salvo!");
    });
});