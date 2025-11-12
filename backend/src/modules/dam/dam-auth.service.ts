import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { chromium, Cookie } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DamCredentials {
    username: string;
    password: string;
}

export interface DamSession {
    cookies: Cookie[];
    expiresAt: Date;
    isValid: boolean;
}

@Injectable()
export class DamAuthService implements OnModuleInit {
    private readonly logger = new Logger(DamAuthService.name);
    private session: DamSession | null = null;

    // URL do DAM - ajustar conforme o ambiente
    private readonly DAM_BASE_URL = process.env.DAM_URL || 'https://dam.dell.com';
    private readonly DAM_LOGIN_URL = `${this.DAM_BASE_URL}/content/dell-assetshare/login`;

    // Caminho do arquivo de estado
    private readonly STATE_FILE_PATH = path.join(process.cwd(), 'dam_state.json');

    /**
     * Chamado automaticamente quando o módulo é inicializado
     */
    async onModuleInit() {
        await this.loadSessionFromFile();
    }

    /**
     * Faz login no DAM e retorna sessão com cookies
     */
    async login(credentials: DamCredentials): Promise<DamSession> {
        this.logger.log('🔐 Iniciando login no DAM...');

        // Opção 1: Usar perfil do Chrome do usuário (descomente para usar)
        // const userDataDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
        
        // Opção 2: Usar perfil dedicado do Playwright (padrão)
        const userDataDir = path.join(process.cwd(), 'temp', 'playwright-dam-profile');
        
        this.logger.log(`📁 Usando perfil: ${userDataDir}`);
        
        const browser = await chromium.launchPersistentContext(userDataDir, {
            headless: false, // Sempre visível para debug
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            // Se usar perfil do Chrome, descomente:
            // channel: 'chrome', // Usa o Chrome instalado ao invés do Chromium
        });

        try {
            const page = browser.pages()[0] || await browser.newPage();

            // Passo 1: Ir para página de login
            this.logger.log(`📍 Navegando para: ${this.DAM_LOGIN_URL}`);
            await page.goto(this.DAM_LOGIN_URL, {
                waitUntil: 'networkidle',
                timeout: 90000, // Aumentado para 90s
            });

            // Passo 2: Clicar no botão "Sign in" do Vendor Access
            this.logger.log('🖱️ Clicando no botão "Sign in" (Vendor Access)...');
            const signInButton = page.locator('#vendor-publisher-button');
            await signInButton.waitFor({ state: 'visible', timeout: 20000 }); // Aumentado para 20s
            await signInButton.click();

            // Passo 3: Aguardar redirecionamento para página Coveo ou Okta
            this.logger.log('⏳ Aguardando redirecionamento para SSO (Coveo/Okta)...');
            
            // Aguardar qualquer uma das páginas de SSO
            try {
                await page.waitForURL('**/content/dell-assetshare/vendor/coveo.html', {
                    timeout: 15000,
                });
                this.logger.log('✅ Redirecionado para Coveo');
            } catch {
                this.logger.log('ℹ️ Não redirecionou para Coveo, pode ser Okta ou outro SSO');
            }

            // Passo 4: Aguardar carregamento da página de SSO/Login
            this.logger.log('⏳ Aguardando página de login SSO carregar...');
            await page.waitForLoadState('networkidle', { timeout: 60000 }); // Aumentado para 60s

            // Verificar se é Okta
            const isOkta = page.url().includes('okta.com') || page.url().includes('login.dell.com');
            if (isOkta) {
                this.logger.log('🔐 Detectado login via Okta');
            }

            // Passo 5: Preencher credenciais
            this.logger.log('📝 Preenchendo credenciais...');

            // Seletores para campo de usuário/email (incluindo Okta)
            const usernameSelectors = [
                'input[name="username"]',
                'input[type="email"]',
                'input[name="email"]',
                'input[id*="username"]',
                'input[id*="email"]',
                'input[id="okta-signin-username"]', // Okta
                'input[name="identifier"]', // Okta
                '#i0116', // Microsoft SSO
                '#email',
            ];

            let usernameField = null;
            for (const selector of usernameSelectors) {
                try {
                    usernameField = page.locator(selector).first();
                    await usernameField.waitFor({ state: 'visible', timeout: 5000 });
                    this.logger.log(`✅ Campo de usuário encontrado: ${selector}`);
                    break;
                } catch {
                    continue;
                }
            }

            if (!usernameField) {
                throw new Error('Campo de usuário não encontrado na página de login');
            }

            await usernameField.fill(credentials.username);
            this.logger.log('✅ Usuário preenchido');

            // Tentar clicar em botão "Next" se existir (comum em SSO)
            const nextButtonSelectors = [
                'input[type="submit"]',
                'button[type="submit"]',
                'input[id="idSIButton9"]', // Microsoft SSO Next
                'button[id="idSIButton9"]',
                'input[value="Next"]',
                'button:has-text("Next")',
                'button:has-text("Avançar")',
                'button:has-text("Continuar")',
                'input.button', // Okta
                'input[data-type="save"]', // Okta
            ];

            let hasNextButton = false;
            for (const selector of nextButtonSelectors) {
                try {
                    const nextButton = page.locator(selector).first();
                    await nextButton.waitFor({ state: 'visible', timeout: 3000 });
                    await nextButton.click();
                    this.logger.log(`✅ Clicou no botão "Next" (${selector})`);
                    hasNextButton = true;
                    break;
                } catch {
                    continue;
                }
            }

            if (hasNextButton) {
                // Aguardar redirecionamento para Okta ou campo de senha
                this.logger.log('⏳ Aguardando redirecionamento ou próxima tela...');
                await page.waitForLoadState('networkidle', { timeout: 30000 }); // Aumentado para 30s
                
                // Se for domínio VML, provavelmente vai para Okta
                const currentUrl = page.url();
                this.logger.log(`📍 URL atual: ${currentUrl}`);
                
                if (currentUrl.includes('okta.com') || currentUrl.includes('vml')) {
                    this.logger.log('🔐 Redirecionado para Okta SSO');
                }
            }

            // Passo 6: Preencher senha
            this.logger.log('🔍 Procurando campo de senha...');
            const passwordSelectors = [
                'input[name="password"]',
                'input[type="password"]',
                'input[id*="password"]',
                'input[id="okta-signin-password"]', // Okta
                'input[name="credentials.passcode"]', // Okta alternativo
                '#i0118', // Microsoft SSO
                '#passwd',
            ];

            let passwordField = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordField = page.locator(selector).first();
                    await passwordField.waitFor({ state: 'visible', timeout: 5000 });
                    this.logger.log(`✅ Campo de senha encontrado: ${selector}`);
                    break;
                } catch {
                    continue;
                }
            }

            if (!passwordField) {
                throw new Error('Campo de senha não encontrado na página de login');
            }

            await passwordField.fill(credentials.password);
            this.logger.log('✅ Senha preenchida');

            // Passo 7: Clicar no botão de login final
            this.logger.log('🔍 Procurando botão de login...');
            const loginButtonSelectors = [
                'input[type="submit"]',
                'button[type="submit"]',
                'input[id="idSIButton9"]', // Microsoft SSO Sign In
                'button[id="idSIButton9"]',
                'input[value="Sign In"]', // Okta
                'input[value="Verify"]', // Okta
                'input[data-type="save"]', // Okta
                'button:has-text("Sign in")',
                'button:has-text("Sign In")',
                'button:has-text("Login")',
                'button:has-text("Entrar")',
                'button:has-text("Verify")',
            ];

            let loginButton = null;
            for (const selector of loginButtonSelectors) {
                try {
                    loginButton = page.locator(selector).first();
                    await loginButton.waitFor({ state: 'visible', timeout: 3000 });
                    this.logger.log(`✅ Botão de login encontrado: ${selector}`);
                    break;
                } catch {
                    continue;
                }
            }

            if (!loginButton) {
                throw new Error('Botão de login não encontrado');
            }

            await loginButton.click();
            this.logger.log('🔑 Submetendo login...');

            // Passo 8: Aguardar redirecionamento de volta ao DAM (pode demorar com Okta)
            this.logger.log('⏳ Aguardando autenticação e redirecionamento de volta ao DAM...');
            this.logger.log('ℹ️ Isso pode levar até 2 minutos com autenticação Okta...');
            
            // Aguardar bastante tempo para o Okta processar e redirecionar
            await page.waitForLoadState('networkidle', { timeout: 120000 }); // 2 minutos

            // Passo 9: Verificar se login foi bem-sucedido
            const currentUrl = page.url();
            this.logger.log(`📍 URL final após login: ${currentUrl}`);
            
            // Se retornou para o DAM sem estar na página de login inicial, login foi bem-sucedido
            if (currentUrl.includes('/login') && !currentUrl.includes('coveo') && !currentUrl.includes('okta')) {
                throw new Error('Login falhou - ainda está na página de login');
            }

            this.logger.log(`✅ Login bem-sucedido! URL atual: ${currentUrl}`);

            // Passo 10: Capturar cookies da sessão
            const cookies = await browser.cookies();
            this.logger.log(`🍪 Capturados ${cookies.length} cookies`);

            const session: DamSession = {
                cookies,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
                isValid: true,
            };

            this.session = session;
            this.logger.log('✅ Sessão DAM criada com sucesso');

            // Salvar sessão em arquivo
            await this.saveSessionToFile(session);

            await browser.close();
            return session;
        } catch (error) {
            this.logger.error('❌ Erro ao fazer login no DAM:', error);
            throw error;
        } finally {
            await browser.close();
        }
    }

    /**
     * Salva a sessão em arquivo JSON
     */
    private async saveSessionToFile(session: DamSession): Promise<void> {
        try {
            const sessionData = {
                cookies: session.cookies,
                expiresAt: session.expiresAt.toISOString(),
                isValid: session.isValid,
                savedAt: new Date().toISOString(),
            };

            await fs.writeFile(
                this.STATE_FILE_PATH,
                JSON.stringify(sessionData, null, 2),
                'utf-8'
            );

            this.logger.log(`💾 Sessão salva em: ${this.STATE_FILE_PATH}`);
        } catch (error) {
            this.logger.error('❌ Erro ao salvar sessão em arquivo:', error);
        }
    }

    /**
     * Carrega a sessão do arquivo JSON
     */
    private async loadSessionFromFile(): Promise<void> {
        try {
            // Verificar se arquivo existe
            try {
                await fs.access(this.STATE_FILE_PATH);
            } catch {
                this.logger.log('ℹ️ Nenhuma sessão DAM salva encontrada');
                return;
            }

            // Ler arquivo
            const fileContent = await fs.readFile(this.STATE_FILE_PATH, 'utf-8');
            const sessionData = JSON.parse(fileContent);

            // Reconstruir sessão
            const session: DamSession = {
                cookies: sessionData.cookies,
                expiresAt: new Date(sessionData.expiresAt),
                isValid: sessionData.isValid,
            };

            // Verificar se sessão ainda é válida
            if (new Date() > session.expiresAt) {
                this.logger.warn('⏰ Sessão salva está expirada, ignorando...');
                await this.clearSessionFile();
                return;
            }

            this.session = session;
            this.logger.log(`✅ Sessão DAM carregada do arquivo (expira em: ${session.expiresAt.toLocaleString('pt-BR')})`);
        } catch (error) {
            this.logger.error('❌ Erro ao carregar sessão do arquivo:', error);
        }
    }

    /**
     * Remove o arquivo de sessão
     */
    private async clearSessionFile(): Promise<void> {
        try {
            await fs.unlink(this.STATE_FILE_PATH);
            this.logger.log('🗑️ Arquivo de sessão removido');
        } catch (error) {
            // Ignorar erro se arquivo não existir
        }
    }

    /**
     * Retorna sessão atual se válida
     */
    getSession(): DamSession | null {
        if (!this.session) {
            return null;
        }

        // Verificar se sessão expirou
        if (new Date() > this.session.expiresAt) {
            this.logger.warn('⏰ Sessão DAM expirada');
            this.session = null;
            return null;
        }

        return this.session;
    }

    /**
     * Invalida sessão atual
     */
    async logout(): Promise<void> {
        this.logger.log('🚪 Fazendo logout do DAM');
        this.session = null;
        await this.clearSessionFile();
    }

    /**
     * Importa cookies do browser manualmente
     * Útil para pular autenticação usando cookies já logados
     */
    async importCookiesFromBrowser(cookies: Cookie[]): Promise<DamSession> {
        this.logger.log(`📥 Importando ${cookies.length} cookies do browser...`);

        const session: DamSession = {
            cookies,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
            isValid: true,
        };

        this.session = session;
        await this.saveSessionToFile(session);

        this.logger.log('✅ Cookies importados com sucesso!');
        return session;
    }

    /**
     * Verifica se há uma sessão válida
     */
    hasValidSession(): boolean {
        return this.getSession() !== null;
    }
}
