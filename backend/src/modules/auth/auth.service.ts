import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { LoginProgressService } from './login-progress.service';
import { LoginPhase } from './login-progress.enum';
import { promises as fs } from 'fs';
import { join } from 'path';
import { resolveHeadless, logHeadlessConfigOnce } from '../workfront/utils/headless.util';
import {
  LoginResponseDto,
  LoginStatusDto,
  SessionInfoDto,
  ClearSessionResponseDto,
  SessionValidationDto,
  SessionStatsDto,
  LoginCredentialsDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly STATE_FILE = 'wf_state.json';
  private readonly PARTIAL_FILE = 'wf_state.partial.json';

  /**
   * Fazer login no Workfront
   */
  constructor(private readonly progress: LoginProgressService) {
    // Log da configuração headless no bootstrap
    logHeadlessConfigOnce('AuthService');
  }

  async login(options?: { headless?: boolean; credentials?: LoginCredentialsDto }): Promise<LoginResponseDto> {
    try {
      // Se já existe state válido, retornar direto
      const status = await this.checkLoginStatus();
      if (status.loggedIn) {
        this.logger.log('⚡ Sessão já válida — pulando novo login');
        return {
            success: true,
            message: 'Sessão existente reutilizada',
            sessionFile: this.STATE_FILE,
            loginTime: status.lastLogin,
        };
      }

      this.logger.log('🔑 Iniciando processo de login no Workfront...');
      this.progress.update(LoginPhase.LAUNCHING_BROWSER, 'Lançando navegador');

      // Implementar login diretamente com Playwright
      await this.performWorkfrontLogin(options);

      this.logger.log('✅ Login concluído com sucesso');

      // Verificar se o arquivo de estado foi criado
      const isLoggedIn = await this.checkLoginStatus();

      if (!isLoggedIn.loggedIn) {
        throw new Error('Login aparentemente falhou - arquivo de estado não encontrado');
      }

      return {
        success: true,
        message: 'Login realizado com sucesso! Sessão salva.',
        sessionFile: this.STATE_FILE,
        loginTime: isLoggedIn.lastLogin,
      };
    } catch (error) {
      this.logger.error('❌ Erro durante login:', error.message);
      throw new Error(`Falha no login: ${error.message}`);
    }
  }

  /**
   * Realizar login no Workfront usando Playwright
   */
  private async performWorkfrontLogin(options?: { headless?: boolean; credentials?: LoginCredentialsDto }): Promise<void> {
    this.logger.log('🔐 === FAZENDO LOGIN NO WORKFRONT ===');
    
    const headless = resolveHeadless({ 
      override: options?.headless, 
      allowOverride: true 
    });
    
    this.logger.log(`🔧 DEBUG HEADLESS - WF_FORCE_VISIBLE: ${process.env.WF_FORCE_VISIBLE}`);
    this.logger.log(`🔧 DEBUG HEADLESS - WF_HEADLESS_DEFAULT: ${process.env.WF_HEADLESS_DEFAULT}`);
    this.logger.log(`🔧 DEBUG HEADLESS - options?.headless: ${options?.headless}`);
    this.logger.log(`🔧 DEBUG HEADLESS - resolved headless: ${headless}`);
    
    const browser = await chromium.launch({
      headless,
      args: ['--no-sandbox','--disable-dev-shm-usage'],
    });

    try {
      const context = await browser.newContext();

      const page = await context.newPage();

  this.progress.update(LoginPhase.NAVIGATING, 'Abrindo Experience Cloud');
  this.logger.log('🌍 Abrindo Experience Cloud...');
      await page.goto('https://experience.adobe.com/', { waitUntil: 'domcontentloaded' });

      // DEBUG: Verificar se credenciais foram recebidas
      this.logger.log('🔍 DEBUG - Verificando credenciais recebidas:');
      this.logger.log(`🔍   - options existe: ${!!options}`);
      this.logger.log(`🔍   - options.credentials existe: ${!!options?.credentials}`);
      this.logger.log(`🔍   - email existe: ${!!options?.credentials?.email}`);
      this.logger.log(`�   - credenciais completas:`, JSON.stringify(options?.credentials, null, 2));

      if (options?.credentials && options.credentials.email) {
        this.logger.log('✅ EXECUTANDO LOGIN AUTOMÁTICO com credenciais fornecidas...');
        await this.performAutomaticLogin(page, options.credentials);
      } else {
        this.logger.log('⚠️ SEM CREDENCIAIS - login manual necessário. Complete o login SSO/MFA manualmente.');
        this.logger.log('👤 Polling do botão "Adobe Experience Cloud" para persistir sessão.');
      }

  const TARGET_BUTTON_SELECTOR = process.env.WF_LOGIN_BUTTON_SELECTOR || 'button[aria-label="Adobe Experience Cloud"], button[data-omega-element="Adobe Experience Cloud"]';
  const MAX_TOTAL_MS = parseInt(process.env.WF_LOGIN_MAX_TOTAL_MS || '90000', 10);
  const INITIAL_GRACE_MS = parseInt(process.env.WF_LOGIN_INITIAL_GRACE_MS || '40000', 10);
  const POLL_INTERVAL_MS = parseInt(process.env.WF_LOGIN_POLL_INTERVAL_MS || '3000', 10);
  const MAX_PERSIST_ATTEMPTS = parseInt(process.env.WF_LOGIN_MAX_PERSIST_ATTEMPTS || '15', 10);
      const start = Date.now();
  let persisted = false;
  let persistAttempts = 0;
  const allowMultiple = (process.env.WF_LOGIN_MULTI_PERSIST || '').toLowerCase() === 'true';

      // Fase inicial: aguardar período de SSO/MFA sem flood
      while (Date.now() - start < INITIAL_GRACE_MS) {
        if (page.isClosed()) break;
        await page.waitForTimeout(2500);
      }

  this.progress.update(LoginPhase.WAITING_SSO, 'Aguardando autenticação SSO/MFA');
  while ((Date.now() - start) < MAX_TOTAL_MS && !page.isClosed()) {
        try {
          const button = await page.$(TARGET_BUTTON_SELECTOR);
          if (button) {
            this.progress.update(LoginPhase.DETECTED_BUTTON, 'Sessão autenticada, persistindo');
            this.logger.log('✅ Botão Adobe Experience Cloud detectado — sessão aparentemente autenticada.');
            // Salva state a cada detecção (com limite)
            await context.storageState({ path: this.PARTIAL_FILE });
            persistAttempts++;
            if (!persisted) {
              persisted = true;
              this.logger.log(`💾 Sessão persistida (1ª captura parcial) em ${this.PARTIAL_FILE}`);
              if (!allowMultiple) {
                this.logger.log('🛑 Encerrando imediatamente após primeira persistência (WF_LOGIN_MULTI_PERSIST != true).');
                break;
              }
            } else if (allowMultiple) {
              this.logger.log(`💾 Sessão parcial atualizada (#${persistAttempts})`);
              if (persistAttempts >= MAX_PERSIST_ATTEMPTS) {
                this.logger.log('🛑 Limite de persistências atingido — encerrando browser para liberar usuário.');
                break;
              }
            }
          } else {
            this.logger.verbose('⌛ Botão ainda não encontrado, continuará polling...');
          }
        } catch (e: any) {
          this.logger.warn(`Falha durante polling de login: ${e.message}`);
        }
        await page.waitForTimeout(POLL_INTERVAL_MS);
      }

      if (!persisted) {
        // fallback final: salvar ao menos uma vez antes de fechar
        try {
            await context.storageState({ path: this.PARTIAL_FILE });
            this.logger.log('💾 Sessão salva no fallback final.');
        } catch (e:any) {
            this.logger.warn('Não foi possível salvar sessão no fallback: ' + e.message);
        }
      }

      this.logger.log(`✅ Processo de login concluído (persisted=${persisted})`);
      if (persisted) {
        this.progress.update(LoginPhase.PERSISTING, 'Validando e gravando state final');
        await this.promotePartialState();
        this.progress.success('Login concluído');
      } else {
        this.progress.fail('Não foi possível confirmar a sessão');
      }
    } catch (e: any) {
      this.logger.error('Erro durante login interativo', e.message);
      this.progress.fail(e.message);
      throw e;
    } finally {
      if (browser.isConnected()) {
        await browser.close();
      }
    }
  }

  /**
   * Executar login automático usando credenciais fornecidas
   */
  private async performAutomaticLogin(page: any, credentials: LoginCredentialsDto): Promise<void> {
    try {
      this.progress.update(LoginPhase.AUTOMATIC_LOGIN, 'Inserindo credenciais de login');
      
      // Aguardar aparecer campos de login (pode ser Adobe ID ou Okta)
      await page.waitForTimeout(3000);
      
      // Aguardar que a página carregue completamente
      this.logger.log('⏳ Aguardando página carregar...');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      
      // Verificar se foi redirecionado e escolher fluxo apropriado
      const currentUrl = page.url();
      this.logger.log(`🌐 URL atual após carregar: ${currentUrl}`);
      
      const isOktaLogin = currentUrl.includes('okta.com') || currentUrl.includes('wpp.okta.com');
      const isAdobeLogin = currentUrl.includes('experience.adobe.com') || currentUrl.includes('adobe.com');
      
      if (isOktaLogin) {
        this.logger.log('🔐 DETECTADO: Redirecionamento para OKTA - usando fluxo Okta');
        await this.handleOktaLogin(page, credentials);
        return;
      } else if (isAdobeLogin) {
        this.logger.log('🔐 DETECTADO: Página Adobe Experience Cloud - usando fluxo Adobe');
        await this.handleAdobeLogin(page, credentials);
        return;
      } else {
        this.logger.log(`⚠️ URL desconhecida: ${currentUrl} - tentando fluxo genérico`);
      }
      
      // Estratégia 1: Seletor específico do Adobe Experience Cloud
      this.logger.log('🔍 Procurando campo de email (#EmailPage-EmailField)...');
      let emailField = await page.waitForSelector('#EmailPage-EmailField', { timeout: 10000 }).catch(() => null);
      
      if (!emailField) {
        // Estratégia 2: Por data-id
        this.logger.log('🔍 Tentando data-id="EmailPage-EmailField"...');
        emailField = await page.$('input[data-id="EmailPage-EmailField"]');
      }
      
      if (!emailField) {
        // Estratégia 3: Por classe e tipo
        this.logger.log('🔍 Tentando classe spectrum-Textfield-input...');
        emailField = await page.$('input.zo2IKa_spectrum-Textfield-input[type="email"]');
      }
      
      if (!emailField) {
        // Estratégia 4: Por autocomplete
        this.logger.log('🔍 Tentando autocomplete="email webauthn"...');
        emailField = await page.$('input[autocomplete*="email"]');
      }
      
      if (!emailField) {
        // Estratégia 5: Qualquer input de email visível
        this.logger.log('🔍 Tentando qualquer input[type="email"] visível...');
        emailField = await page.$('input[type="email"]:visible');
      }
      
      if (emailField) {
        this.logger.log('✅ Campo de email encontrado, preenchendo...');
        
        // Garantir que o campo está visível
        await emailField.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        
        // Múltiplas tentativas de preenchimento
        try {
          // Tentativa 1: Método padrão Playwright
          await emailField.click(); 
          await emailField.fill(''); 
          await emailField.fill(credentials.email);
          this.logger.log('✅ Preenchido via Playwright');
        } catch (e) {
          this.logger.warn('⚠️ Falha Playwright, tentando JavaScript...');
          
          // Tentativa 2: JavaScript direto
          await page.evaluate((email) => {
            const field = document.getElementById('EmailPage-EmailField') as HTMLInputElement;
            if (field) {
              field.focus();
              field.value = '';
              field.value = email;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, credentials.email);
          this.logger.log('✅ Preenchido via JavaScript');
        }
        
        await page.waitForTimeout(1000);
        
        // Procurar e clicar no botão continuar
        this.logger.log('🔍 Procurando botão continuar...');
        
        // Aguardar um pouco para o botão aparecer
        await page.waitForTimeout(1000);
        
        // Estratégia 1: Botão submit padrão
        let continueBtn = await page.$('button[type="submit"]');
        
        if (!continueBtn) {
          // Estratégia 2: Por texto
          this.logger.log('🔍 Tentando por texto "Continue"...');
          continueBtn = await page.$('button:has-text("Continue")');
        }
        
        if (!continueBtn) {
          // Estratégia 3: Por texto "Continuar"
          this.logger.log('🔍 Tentando por texto "Continuar"...');
          continueBtn = await page.$('button:has-text("Continuar")');
        }
        
        if (!continueBtn) {
          // Estratégia 4: Qualquer botão que pode ser de submit
          this.logger.log('🔍 Tentando qualquer botão próximo ao formulário...');
          continueBtn = await page.$('form button, .EmailOrPhoneField__container ~ button, button[class*="submit"], button[class*="primary"]');
        }
        
        if (continueBtn) {
          this.logger.log('▶️ Botão continuar encontrado, clicando...');
          await continueBtn.scrollIntoViewIfNeeded();
          await continueBtn.click();
          await page.waitForTimeout(3000);
        } else {
          this.logger.log('▶️ Botão continuar não encontrado, tentando Enter no campo...');
          await emailField.press('Enter');
          await page.waitForTimeout(3000);
        }
      } else {
        this.logger.error('❌ Campo de email NÃO ENCONTRADO!');
        const currentUrl = page.url();
        const pageTitle = await page.title();
        this.logger.log(`🌐 URL atual: ${currentUrl}`);
        this.logger.log(`📄 Título da página: ${pageTitle}`);
        
        // Debug detalhado
        const hasEmailPageField = await page.$('#EmailPage-EmailField').then(() => true).catch(() => false);
        const hasEmailInput = await page.$('input[type="email"]').then(() => true).catch(() => false);
        const allInputs = await page.$$eval('input', inputs => inputs.map(input => ({
          id: input.id,
          name: input.name,
          type: input.type,
          className: input.className,
          'data-id': input.getAttribute('data-id'),
          visible: input.offsetParent !== null
        })));
        
        this.logger.log(`🔍 Debug - EmailPage-EmailField existe: ${hasEmailPageField}`);
        this.logger.log(`🔍 Debug - input[type="email"] existe: ${hasEmailInput}`);
        this.logger.log(`🔍 Debug - Todos os inputs:`, JSON.stringify(allInputs, null, 2));
        
        // Tentar screenshot se possível (em modo não-headless)
        try {
          await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
          this.logger.log('📸 Screenshot salvo como debug-login-page.png');
        } catch (e) {
          this.logger.log('📸 Não foi possível tirar screenshot (modo headless)');
        }
        
        // Última tentativa: usar JavaScript direto no DOM
        this.logger.log('🚨 Tentativa final: preenchimento via JavaScript...');
        const jsResult = await page.evaluate((email) => {
          // Tentar encontrar o campo por ID
          let field = document.getElementById('EmailPage-EmailField');
          
          if (!field) {
            // Tentar por data-id
            field = document.querySelector('input[data-id="EmailPage-EmailField"]');
          }
          
          if (!field) {
            // Tentar por tipo email
            field = document.querySelector('input[type="email"]');
          }
          
          if (field && field instanceof HTMLInputElement) {
            field.focus();
            field.value = email;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, method: 'JavaScript DOM' };
          }
          
          return { success: false, error: 'Campo não encontrado via JavaScript' };
        }, credentials.email);
        
        this.logger.log(`🔧 Resultado JavaScript: ${JSON.stringify(jsResult)}`);
        
        if (jsResult.success) {
          // Se conseguiu preencher via JS, tentar continuar
          await page.waitForTimeout(1000);
          
          // Tentar clicar no botão via JS também
          const btnResult = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.type === 'submit' || 
                  btn.textContent?.toLowerCase().includes('continue') ||
                  btn.textContent?.toLowerCase().includes('continuar')) {
                btn.click();
                return { success: true, buttonText: btn.textContent };
              }
            }
            return { success: false };
          });
          
          this.logger.log(`🔧 Resultado clique botão JS: ${JSON.stringify(btnResult)}`);
          await page.waitForTimeout(3000);
        }
      }
      
      // Aguardar campo de senha aparecer
      this.logger.log('🔍 Aguardando campo de senha...');
      await page.waitForTimeout(2000);
      
      const passwordField = await page.$('input[type="password"]');
      if (passwordField) {
        const currentUrl = page.url();
        const password = currentUrl.includes('okta') || currentUrl.includes('sso') 
          ? credentials.oktaPassword 
          : (credentials.workfrontPassword || credentials.oktaPassword);
        
        this.logger.log('🔑 Campo de senha encontrado, preenchendo...');
        await passwordField.click();
        await page.waitForTimeout(500);
        await passwordField.fill(password);
        await page.waitForTimeout(1000);
        
        // Procurar botão de login
        const loginBtn = await page.$('button[type="submit"], input[type="submit"]');
        if (loginBtn) {
          this.logger.log('▶️ Clicando no botão de login...');
          await loginBtn.click();
          await page.waitForTimeout(3000);
        } else {
          this.logger.log('▶️ Botão não encontrado, tentando Enter...');
          await passwordField.press('Enter');
          await page.waitForTimeout(3000);
        }
      }
      
      // Aguardar possível 2FA ou redirecionamento
      this.progress.update(LoginPhase.WAITING_SSO, 'Aguardando 2FA/MFA ou redirecionamento');
      this.logger.log('🔐 Aguardando possível 2FA/MFA ou redirecionamento...');
      
    } catch (error) {
      this.logger.warn('⚠️ Erro durante login automático, continuando com modo manual:', error.message);
      this.progress.update(LoginPhase.WAITING_SSO, 'Falha no login automático - continue manualmente');
    }
  }

  private async promotePartialState() {
    try {
      // Validar conteúdo básico
      const data = await fs.readFile(this.PARTIAL_FILE, 'utf8');
      const json = JSON.parse(data);
      if (!json.cookies || !Array.isArray(json.cookies) || json.cookies.length === 0) {
        throw new Error('State parcial sem cookies, abortando promoção');
      }
      // Renomear atômico
      try { await fs.unlink(this.STATE_FILE); } catch { /* ignore */ }
      await fs.rename(this.PARTIAL_FILE, this.STATE_FILE);
      this.logger.log('🟢 State final promovido com sucesso.');
    } catch (e:any) {
      this.logger.error('Falha ao promover state parcial:', e.message);
      try { await fs.unlink(this.PARTIAL_FILE); } catch {/* ignore */}
      throw e;
    }
  }

  /**
   * Verificar status do login
   */
  async checkLoginStatus(): Promise<LoginStatusDto> {
    try {
      // Verificar se arquivo de sessão existe
      await fs.access(this.STATE_FILE);

      // Obter informações do arquivo
      const stats = await fs.stat(this.STATE_FILE);
      const now = new Date();
      const fileAge = now.getTime() - stats.mtime.getTime();
      const hoursAge = fileAge / (1000 * 60 * 60);

      // Considerar válido se o arquivo foi criado nas últimas 8 horas
      const isValid = hoursAge < 8;

      return {
        loggedIn: isValid,
        lastLogin: stats.mtime.toISOString(),
        hoursAge: Math.round(hoursAge * 10) / 10,
        sessionFile: this.STATE_FILE,
        fileSize: stats.size,
      };
    } catch (error) {
      return {
        loggedIn: false,
        error: 'Arquivo de sessão não encontrado ou inacessível',
        sessionFile: this.STATE_FILE,
      };
    }
  }

  /**
   * Verificar se precisa fazer login
   */
  async requiresLogin(): Promise<boolean> {
    const status = await this.checkLoginStatus();
    return !status.loggedIn;
  }

  /**
   * Obter informações da sessão
   */
  async getSessionInfo(): Promise<SessionInfoDto> {
    try {
      const status = await this.checkLoginStatus();

      if (!status.loggedIn) {
        return {
          hasSession: false,
          message: 'Nenhuma sessão ativa encontrada',
        };
      }

      // Tentar ler conteúdo do arquivo de sessão (cuidado com dados sensíveis)
      const sessionContent = await fs.readFile(this.STATE_FILE, 'utf8');
      const sessionData = JSON.parse(sessionContent);

      // Retornar apenas informações não sensíveis
      return {
        hasSession: true,
        lastLogin: status.lastLogin,
        hoursAge: status.hoursAge,
        hasStorageState: !!sessionData.storageState,
        hasCookies: Array.isArray(sessionData.cookies) ? sessionData.cookies.length : 0,
        domain: this.extractDomainFromSession(sessionData),
      };
    } catch (error) {
      this.logger.error('❌ Erro ao obter informações da sessão:', error.message);
      return {
        hasSession: false,
        error: 'Erro ao ler arquivo de sessão',
      };
    }
  }

  /**
   * Limpar cache e sessão
   */
  async clearSession(): Promise<ClearSessionResponseDto> {
    try {
      this.logger.log('🧹 Limpando sessão do Workfront...');

      await fs.unlink(this.STATE_FILE);

      this.logger.log('✅ Sessão limpa com sucesso');
      return {
        success: true,
        message: 'Sessão limpa com sucesso. Faça login novamente.',
        clearedFile: this.STATE_FILE,
      };
    } catch (error: any) {
      // Se o arquivo não existir, considerar sucesso
      if (error.code === 'ENOENT') {
        this.logger.log('ℹ️ Sessão já estava limpa (arquivo não encontrado)');
        return {
          success: true,
          message: 'Sessão já estava limpa.',
          clearedFile: this.STATE_FILE,
        };
      } else {
        this.logger.error('❌ Erro ao limpar sessão:', error.message);
        throw new Error(`Falha ao limpar sessão: ${error.message}`);
      }
    }
  }

  /**
   * Validar sessão fazendo uma verificação básica
   */
  async validateSession(): Promise<SessionValidationDto> {
    try {
      const status = await this.checkLoginStatus();

      if (!status.loggedIn) {
        return {
          valid: false,
          reason: 'Nenhuma sessão ativa',
        };
      }

      // Verificar se arquivo de sessão tem conteúdo válido
      const sessionContent = await fs.readFile(this.STATE_FILE, 'utf8');
      const sessionData = JSON.parse(sessionContent);

      if (!sessionData.storageState) {
        return {
          valid: false,
          reason: 'Dados de sessão inválidos',
        };
      }

      return {
        valid: true,
        lastLogin: status.lastLogin,
        hoursAge: status.hoursAge,
      };
    } catch (error: any) {
      this.logger.error('❌ Erro ao validar sessão:', error.message);
      return {
        valid: false,
        reason: 'Erro ao validar sessão',
        error: error.message,
      };
    }
  }

  /**
   * Obter estatísticas de uso da sessão
   */
  async getSessionStats(): Promise<SessionStatsDto> {
    try {
      const status = await this.checkLoginStatus();

      if (!status.loggedIn) {
        return {
          hasStats: false,
          message: 'Nenhuma sessão ativa',
        };
      }

      return {
        hasStats: true,
        sessionAge: {
          hours: status.hoursAge!,
          days: Math.round((status.hoursAge! / 24) * 10) / 10,
        },
        sessionSize: status.fileSize,
        lastAccess: status.lastLogin,
        expiresIn: Math.max(0, 8 - status.hoursAge!), // 8 horas de validade
        isExpiringSoon: status.hoursAge! > 6, // Aviso se expira em menos de 2 horas
      };
    } catch (error: any) {
      this.logger.error('❌ Erro ao obter estatísticas da sessão:', error.message);
      return {
        hasStats: false,
        error: error.message,
      };
    }
  }

  /**
   * Executar login específico para Adobe Experience Cloud
   */
  private async handleAdobeLogin(page: any, credentials: LoginCredentialsDto): Promise<void> {
    this.logger.log('🔵 Iniciando fluxo de login Adobe Experience Cloud...');
    
    // Procurar campo de email específico do Adobe
    this.logger.log('🔍 Procurando campo de email Adobe (#EmailPage-EmailField)...');
    let emailField = await page.waitForSelector('#EmailPage-EmailField', { timeout: 10000 }).catch(() => null);
    
    if (!emailField) {
      emailField = await page.$('input[data-id="EmailPage-EmailField"]');
    }
    
    if (!emailField) {
      emailField = await page.$('input[type="email"]');
    }
    
    if (emailField) {
      this.logger.log('✅ Campo de email Adobe encontrado, preenchendo...');
      await emailField.scrollIntoViewIfNeeded();
      await emailField.click();
      await emailField.fill('');
      await emailField.fill(credentials.email);
      await page.waitForTimeout(1000);
      
      // Procurar botão continuar do Adobe
      const continueBtn = await page.$('button[type="submit"], button:has-text("Continue"), button:has-text("Continuar")');
      if (continueBtn) {
        this.logger.log('▶️ Clicando no botão continuar Adobe...');
        await continueBtn.click();
        await page.waitForTimeout(3000);
      } else {
        this.logger.log('▶️ Tentando Enter...');
        await emailField.press('Enter');
        await page.waitForTimeout(3000);
      }
      
      // Verificar se foi redirecionado para Okta após o login Adobe
      await this.checkForOktaRedirect(page, credentials);
    } else {
      this.logger.error('❌ Campo de email Adobe não encontrado!');
    }
  }

  /**
   * Verificar se foi redirecionado para Okta após login Adobe
   */
  private async checkForOktaRedirect(page: any, credentials: LoginCredentialsDto): Promise<void> {
    this.logger.log('🔍 Verificando possível redirecionamento para Okta...');
    
    // Aguardar possível redirecionamento
    await page.waitForTimeout(2000);
    
    // Verificar URL atual
    const currentUrl = page.url();
    this.logger.log(`🌐 URL após Adobe login: ${currentUrl}`);
    
    if (currentUrl.includes('okta.com') || currentUrl.includes('wpp.okta.com')) {
      this.logger.log('🎯 REDIRECIONADO PARA OKTA! Executando login Okta...');
      await this.handleOktaLogin(page, credentials);
    } else if (currentUrl.includes('experience.adobe.com')) {
      this.logger.log('📋 Ainda no Adobe Experience Cloud - pode necessitar 2FA ou próximos passos');
      // Verificar se precisa de mais ações no Adobe
      await this.checkAdobeNextSteps(page, credentials);
    } else {
      this.logger.log(`⚠️ Redirecionado para URL desconhecida: ${currentUrl}`);
      this.logger.log('🔍 Tentando detectar campos de login genericamente...');
      await this.handleGenericLogin(page, credentials);
    }
  }

  /**
   * Verificar próximos passos no Adobe após email
   */
  private async checkAdobeNextSteps(page: any, credentials: LoginCredentialsDto): Promise<void> {
    this.logger.log('🔍 Verificando próximos passos no Adobe...');
    
    // Procurar campo de senha Adobe (se existir)
    const passwordField = await page.$('input[type="password"]');
    if (passwordField && credentials.workfrontPassword) {
      this.logger.log('🔑 Campo de senha Adobe encontrado, preenchendo...');
      await passwordField.click();
      await passwordField.fill('');
      await passwordField.fill(credentials.workfrontPassword);
      
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        
        // Verificar novamente se foi redirecionado para Okta
        await this.checkForOktaRedirect(page, credentials);
      }
    } else {
      this.logger.log('👤 Nenhum campo de senha Adobe - aguardando redirecionamento ou 2FA');
    }
  }

  /**
   * Login genérico para URLs desconhecidas
   */
  private async handleGenericLogin(page: any, credentials: LoginCredentialsDto): Promise<void> {
    this.logger.log('🔧 Tentando login genérico...');
    
    // Procurar qualquer campo de email/usuário
    const emailField = await page.$('input[type="email"], input[name="username"], input[name="user"]');
    if (emailField) {
      await emailField.fill(credentials.email);
      await page.waitForTimeout(1000);
    }
    
    // Procurar campo de senha
    const passwordField = await page.$('input[type="password"]');
    if (passwordField) {
      await passwordField.fill(credentials.oktaPassword);
      await page.waitForTimeout(1000);
      
      // Procurar botão de submit
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
    }
  }

  /**
   * Executar login específico para Okta
   */
  private async handleOktaLogin(page: any, credentials: LoginCredentialsDto): Promise<void> {
    this.logger.log('🟠 Iniciando fluxo de login OKTA...');
    
    // No Okta, geralmente já vamos direto para a página de login
    await page.waitForTimeout(2000);
    
    // ETAPA 1: Preencher usuário e clicar "Next/Próximo"
    this.logger.log('📧 ETAPA 1: Procurando campo de usuário Okta...');
    
    // Seletores específicos baseados no HTML fornecido
    let usernameField = await page.$('#identifier');
    
    if (!usernameField) {
      usernameField = await page.$('input[data-se="identifier"]');
    }
    
    if (!usernameField) {
      // Seletores tradicionais do Okta
      usernameField = await page.$('input[name="username"], input[name="identifier"]');
    }
    
    if (!usernameField) {
      // Seletores genéricos
      this.logger.log('🔍 Tentando seletores genéricos para usuário...');
      usernameField = await page.$('input[type="text"], input[type="email"], input[autocomplete="username"]');
    }
    
    if (usernameField) {
      // Debug: verificar qual seletor funcionou
      const fieldId = await usernameField.getAttribute('id');
      const fieldName = await usernameField.getAttribute('name');
      const fieldDataSe = await usernameField.getAttribute('data-se');
      this.logger.log(`✅ Campo de usuário encontrado - ID: ${fieldId}, Name: ${fieldName}, data-se: ${fieldDataSe}`);
      
      await usernameField.scrollIntoViewIfNeeded();
      await usernameField.click();
      await usernameField.fill('');
      await usernameField.fill(credentials.email);
      await page.waitForTimeout(1000);
      
      // Procurar botão "Next" ou "Próximo" 
      this.logger.log('🔍 Procurando botão Next/Próximo...');
      let nextBtn = await page.$('input[type="submit"], button[type="submit"]');
      
      if (!nextBtn) {
        nextBtn = await page.$('button:has-text("Next"), button:has-text("Próximo"), button:has-text("Continue"), button:has-text("Continuar")');
      }
      
      if (!nextBtn) {
        // Procurar por atributos específicos do Okta
        nextBtn = await page.$('button[data-se="o-form-button-next"], input[data-se="o-form-button-next"]');
      }
      
      if (nextBtn) {
        this.logger.log('▶️ Clicando no botão Next/Próximo...');
        await nextBtn.click();
        await page.waitForTimeout(3000);
      } else {
        this.logger.log('▶️ Botão Next não encontrado, tentando Enter...');
        await usernameField.press('Enter');
        await page.waitForTimeout(3000);
      }
    } else {
      this.logger.error('❌ Campo de usuário Okta não encontrado!');
      return;
    }
    
    // ETAPA 2: Aguardar nova página e preencher senha
    this.logger.log('🔒 ETAPA 2: Procurando campo de senha Okta...');
    await page.waitForTimeout(2000); // Aguardar página de senha carregar
    
    // Seletores específicos baseados no HTML fornecido (Material-UI)
    let passwordField = await page.$('#credentials\\.passcode');
    
    if (!passwordField) {
      passwordField = await page.$('input[data-se="credentials.passcode"]');
    }
    
    if (!passwordField) {
      // Seletores tradicionais do Okta
      passwordField = await page.$('input[name="credentials.passcode"], input[name="password"]');
    }
    
    if (!passwordField) {
      // Aguardar um pouco mais e tentar novamente com seletores genéricos
      await page.waitForTimeout(3000);
      passwordField = await page.$('input[type="password"], input[autocomplete="current-password"]');
    }
    
    if (passwordField) {
      // Debug: verificar qual seletor funcionou
      const fieldId = await passwordField.getAttribute('id');
      const fieldName = await passwordField.getAttribute('name');
      const fieldDataSe = await passwordField.getAttribute('data-se');
      this.logger.log(`✅ Campo de senha encontrado - ID: ${fieldId}, Name: ${fieldName}, data-se: ${fieldDataSe}`);
      
      await passwordField.scrollIntoViewIfNeeded();
      await passwordField.click();
      await passwordField.fill('');
      await passwordField.fill(credentials.oktaPassword);
      await page.waitForTimeout(1000);
      
      // Procurar botão de login final
      this.logger.log('🔍 Procurando botão Sign In / Verificar...');
      
      // Primeiro procurar pelo botão "Verificar" baseado no HTML fornecido
      let loginBtn = await page.$('input[type="submit"][value="Verificar"]');
      
      if (!loginBtn) {
        loginBtn = await page.$('button:has-text("Verificar")');
      }
      
      if (!loginBtn) {
        // Seletores tradicionais
        loginBtn = await page.$('input[type="submit"], button[type="submit"]');
      }
      
      if (!loginBtn) {
        loginBtn = await page.$('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Entrar")');
      }
      
      if (!loginBtn) {
        loginBtn = await page.$('button[data-se="o-form-button-signin"], input[data-se="o-form-button-signin"]');
      }
      
      if (loginBtn) {
        const btnText = await loginBtn.textContent() || await loginBtn.getAttribute('value');
        this.logger.log(`▶️ Clicando no botão: ${btnText}`);
        await loginBtn.click();
        await page.waitForTimeout(3000);
      } else {
        this.logger.log('▶️ Botão não encontrado, tentando Enter na senha...');
        await passwordField.press('Enter');
        await page.waitForTimeout(3000);
      }
      
      // Verificar se apareceu a tela de notificação push
      this.logger.log('📱 Verificando se apareceu tela de notificação push...');
      await page.waitForTimeout(2000);
      
      const pushNotificationHeading = await page.$('h1[data-se="o-form-head"], h1:has-text("Notificação por push enviada"), h1:has-text("Push notification sent"), h1:has-text("Aguardando confirmação")');
      
      if (pushNotificationHeading) {
        const headingText = await pushNotificationHeading.textContent();
        this.logger.log(`📱 Tela de notificação push detectada: ${headingText}`);
        
        // Atualizar status para aguardando confirmação no dispositivo
        this.progress.update(
          LoginPhase.WAITING_DEVICE_CONFIRMATION,
          `Aguardando confirmação no dispositivo móvel: ${headingText || 'Notificação por push enviada'}`
        );
        
        this.logger.log('📱 Aguardando confirmação no dispositivo...');
        
        // Aguardar até 60 segundos pela confirmação ou mudança de página - com múltiplas verificações
        try {
          let confirmationAttempts = 0;
          const maxConfirmationAttempts = 20; // 20 tentativas de 3 segundos = 60 segundos
          let confirmedRedirect = false;
          
          while (confirmationAttempts < maxConfirmationAttempts && !confirmedRedirect) {
            confirmationAttempts++;
            this.logger.log(`📱 Verificação ${confirmationAttempts}/${maxConfirmationAttempts} - Aguardando confirmação...`);
            
            // Aguardar 3 segundos entre verificações
            await page.waitForTimeout(3000);
            
            try {
              // Verificar URL primeiro (mais seguro durante navegação)
              const currentUrl = page.url();
              this.logger.log(`🔍 URL atual: ${currentUrl}`);
              
              // Se saiu completamente do Okta, confirmação bem-sucedida
              if (!currentUrl.includes('okta') || currentUrl.includes('workfront') || currentUrl.includes('adobe.com')) {
                this.logger.log('✅ Confirmação detectada - Saiu do Okta pela URL!');
                confirmedRedirect = true;
                break;
              }
              
              // Se ainda no Okta, verificar elementos com timeout reduzido
              let pushHeading = null;
              try {
                pushHeading = await page.$('h1[data-se="o-form-head"]:has-text("Notificação por push"), h1:has-text("Push notification")').catch(() => null);
              } catch (elementError) {
                // Se erro ao buscar elemento, provavelmente a página mudou
                this.logger.log('� Erro ao verificar elemento - Página provavelmente mudou');
                // Aguardar um pouco e verificar URL novamente
                await page.waitForTimeout(1000);
                const newUrl = page.url();
                if (!newUrl.includes('okta') || newUrl.includes('adobe')) {
                  this.logger.log('✅ Confirmação detectada após erro de elemento!');
                  confirmedRedirect = true;
                  break;
                }
              }
              
              this.logger.log(`🔍 Tela de push ainda presente: ${pushHeading ? 'Sim' : 'Não'}`);
              
              // Se não tem mais a tela de push mas ainda no Okta
              if (!pushHeading && currentUrl.includes('okta')) {
                this.logger.log('🔄 Saiu da tela de push mas ainda no Okta - Aguardando redirecionamento...');
                
                // Aguardar um pouco mais para o redirect acontecer
                await page.waitForTimeout(2000);
                const redirectedUrl = page.url();
                if (!redirectedUrl.includes('okta')) {
                  this.logger.log('✅ Redirecionamento detectado após aguardar!');
                  confirmedRedirect = true;
                  break;
                }
              }
              
              // Se ainda está na tela de push
              if (pushHeading) {
                this.logger.log('📱 Ainda na tela de notificação push - Aguardando confirmação no dispositivo...');
              }
              
            } catch (checkError) {
              this.logger.warn(`⚠️ Erro durante verificação ${confirmationAttempts}: ${checkError.message}`);
              
              // Em caso de erro, verificar só pela URL
              try {
                const safeUrl = page.url();
                if (!safeUrl.includes('okta') || safeUrl.includes('adobe')) {
                  this.logger.log('✅ Confirmação detectada via URL após erro!');
                  confirmedRedirect = true;
                  break;
                }
              } catch (urlError) {
                this.logger.warn(`❌ Erro crítico ao verificar URL: ${urlError.message}`);
                // Se não conseguir nem pegar URL, assumir que navegou
                if (confirmationAttempts > 5) {
                  this.logger.log('🔄 Múltiplos erros - Assumindo navegação bem-sucedida');
                  confirmedRedirect = true;
                  break;
                }
              }
            }
          }
          
          if (confirmedRedirect) {
            this.progress.update(
              LoginPhase.DEVICE_CONFIRMED,
              'Confirmação recebida - Redirecionando para Workfront...'
            );
            
            // Aguardar mais um pouco para estabilizar
            await page.waitForTimeout(5000);
            
            // Iniciar persistência periódica a cada 3 segundos
            this.logger.log('💾 Iniciando persistência periódica da sessão...');
            await this.startPeriodicPersistence(page);
            
          } else {
            this.logger.log('⏰ Timeout aguardando confirmação após múltiplas tentativas');
            
            // Mesmo assim, tentar continuar o processo
            const finalUrl = page.url();
            if (!finalUrl.includes('okta')) {
              this.logger.log('🔄 Apesar do timeout, não está mais no Okta - Tentando continuar...');
              this.progress.update(
                LoginPhase.DEVICE_CONFIRMED,
                'Timeout na confirmação, mas continuando processo...'
              );
              await this.startPeriodicPersistence(page);
            } else {
              throw new Error('Timeout aguardando confirmação no dispositivo móvel');
            }
          }
          
        } catch (error) {
          this.logger.warn(`❌ Erro aguardando confirmação no dispositivo: ${error.message}`);
          
          // Se o erro é de contexto destruído, provavelmente a página mudou (bom sinal)
          if (error.message?.includes('Execution context was destroyed') || 
              error.message?.includes('navigation')) {
            this.logger.log('🔄 Contexto destruído - Página provavelmente mudou, tentando continuar...');
            
            try {
              // Aguardar um pouco para a navegação estabilizar
              await page.waitForTimeout(3000);
              
              const currentUrl = page.url();
              if (!currentUrl.includes('okta') || currentUrl.includes('adobe')) {
                this.logger.log('✅ Navegação detectada após erro de contexto - Continuando...');
                this.progress.update(
                  LoginPhase.DEVICE_CONFIRMED,
                  'Confirmação detectada - Continuando processo...'
                );
                await this.startPeriodicPersistence(page);
                return; // Sair sem erro
              }
            } catch (recoveryError) {
              this.logger.warn(`⚠️ Erro na recuperação: ${recoveryError.message}`);
            }
          }
          
          this.progress.fail('Erro aguardando confirmação no dispositivo - Por favor, confirme a notificação no seu dispositivo móvel e tente novamente');
          throw error;
        }
      }
      
      this.logger.log('🔐 Login Okta concluído, aguardando possível 2FA ou redirecionamento...');
    } else {
      this.logger.error('❌ Campo de senha Okta não encontrado na segunda página!');
      
      // Debug: mostrar HTML da página para investigar
      const pageTitle = await page.title();
      const currentUrl = page.url();
      this.logger.log(`� DEBUG - Título da página: ${pageTitle}`);
      this.logger.log(`🔍 DEBUG - URL atual: ${currentUrl}`);
      
      // Tentar screenshot para debug
      try {
        await page.screenshot({ path: 'okta-debug.png', fullPage: true });
        this.logger.log('📸 Screenshot salvo como okta-debug.png');
      } catch (e) {
        this.logger.log('📸 Não foi possível tirar screenshot');
      }
    }
  }

  /**
   * Extrair domínio da sessão (utilitário)
   */
  private extractDomainFromSession(sessionData: any): string {
    try {
      if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
        const domains = sessionData.cookies
          .map((cookie: any) => cookie.domain)
          .filter((domain: string) => domain)
          .filter((domain: string, index: number, arr: string[]) => arr.indexOf(domain) === index); // unique

        return domains.join(', ');
      }
      return 'Desconhecido';
    } catch (error) {
      return 'Erro ao extrair';
    }
  }

  private async startPeriodicPersistence(page: any): Promise<void> {
    this.logger.log('💾 Iniciando persistência periódica...');
    this.progress.update(LoginPhase.PERSISTING, 'Verificando sessão do Workfront...');
    
    let persistenceAttempts = 0;
    const maxAttempts = 15; // Max 45 segundos (15 x 3s) - aumentado para dar mais tempo
    let lastUrl = '';
    let stableUrlCount = 0;
    
    const persistInterval = setInterval(async () => {
      try {
        persistenceAttempts++;
        this.logger.log(`💾 Tentativa de persistência ${persistenceAttempts}/${maxAttempts}...`);
        
        // Atualizar progresso
        this.progress.update(
          LoginPhase.PERSISTING, 
          `Testando sessão... (${persistenceAttempts}/${maxAttempts})`
        );
        
        // Verificar URL atual
        const currentUrl = page.url();
        this.logger.log(`🔍 URL atual: ${currentUrl}`);
        
        // Verificar se a URL está estável (não mudou)
        if (currentUrl === lastUrl) {
          stableUrlCount++;
        } else {
          stableUrlCount = 0;
          lastUrl = currentUrl;
        }
        
        // Tentar salvar o estado atual
        const context = page.context();
        if (context) {
          try {
            await context.storageState({ path: this.PARTIAL_FILE });
            this.logger.log('💾 Estado da sessão salvo com sucesso');
          } catch (saveError) {
            this.logger.warn(`⚠️ Erro ao salvar estado: ${saveError.message}`);
          }
        }
        
        // Condições para finalizar:
        // 1. Chegou em Workfront/Adobe OU
        // 2. URL estável por pelo menos 3 tentativas (9 segundos) E não está no Okta
        const isInFinalDestination = currentUrl.includes('workfront') || 
                                   currentUrl.includes('adobe.com/experience-cloud') ||
                                   currentUrl.includes('adobe.com') && !currentUrl.includes('okta');
                                   
        const isStableAndOutOfOkta = stableUrlCount >= 3 && !currentUrl.includes('okta');
        
        if (isInFinalDestination || isStableAndOutOfOkta) {
          this.logger.log('🎯 Condição de finalização detectada:');
          this.logger.log(`   - Destino final: ${isInFinalDestination}`);
          this.logger.log(`   - URL estável fora do Okta: ${isStableAndOutOfOkta}`);
          this.logger.log(`   - URL: ${currentUrl}`);
          
          // Verificar se realmente conseguimos acessar os elementos da página
          const isWorkfrontAccessible = await this.verifyWorkfrontAccess(page);
          
          if (isWorkfrontAccessible) {
            this.logger.log('✅ Acesso ao Workfront/Adobe Experience Cloud verificado!');
            clearInterval(persistInterval);
            
            // Aguardar mais um pouco para garantir estabilidade
            await page.waitForTimeout(2000);
            
            // Salvar estado final
            try {
              await context.storageState({ path: this.PARTIAL_FILE });
              await this.promotePartialState();
              this.progress.success('Login concluído com sucesso');
              this.logger.log('✅ Persistência concluída com sucesso!');
            } catch (e) {
              this.logger.warn(`⚠️ Erro na finalização: ${e.message}`);
              this.progress.success('Login concluído (com avisos)');
            }
            return;
          } else {
            this.logger.log('⚠️ URL parece correta mas elementos não encontrados, continuando...');
            // Continuar tentando por mais algumas iterações
          }
        }
        
        // Se atingiu o máximo de tentativas
        if (persistenceAttempts >= maxAttempts) {
          this.logger.log('⏰ Máximo de tentativas de persistência atingido');
          this.logger.log(`🔍 URL final: ${currentUrl}`);
          clearInterval(persistInterval);
          
          // Mesmo assim, tentar promover o estado parcial
          try {
            if (context) {
              await context.storageState({ path: this.PARTIAL_FILE });
            }
            await this.promotePartialState();
            this.progress.success('Login concluído (timeout persistência)');
          } catch (e) {
            this.logger.error(`❌ Erro na finalização por timeout: ${e.message}`);
            this.progress.fail('Timeout durante persistência da sessão');
          }
        }
        
      } catch (error) {
        this.logger.warn(`❌ Erro na persistência ${persistenceAttempts}: ${error.message}`);
        
        if (persistenceAttempts >= maxAttempts) {
          clearInterval(persistInterval);
          this.progress.fail('Erro durante persistência da sessão');
        }
      }
    }, 3000); // A cada 3 segundos
  }

  private async verifyWorkfrontAccess(page: any): Promise<boolean> {
    try {
      this.logger.log('🔍 Verificando acesso ao Workfront/Adobe Experience Cloud...');
      
      const currentUrl = page.url();
      this.logger.log(`🔍 URL atual para verificação: ${currentUrl}`);
      
      // Aguardar um pouco para a página carregar
      await page.waitForTimeout(3000);
      
      // Debug: Capturar alguns elementos da página para investigar
      try {
        const bodyClasses = await page.evaluate(() => document.body?.className || '');
        const headTitle = await page.evaluate(() => document.head?.querySelector('title')?.textContent || '');
        const h1Elements = await page.$$eval('h1', (elements) => elements.map(el => el.textContent?.trim()).filter(Boolean));
        
        this.logger.log(`🔍 Debug - Body classes: ${bodyClasses}`);
        this.logger.log(`🔍 Debug - Head title: ${headTitle}`);
        this.logger.log(`🔍 Debug - H1 elements: ${JSON.stringify(h1Elements)}`);
      } catch (debugError) {
        this.logger.log(`🔍 Debug error: ${debugError.message}`);
      }
      
      // 1. Verificar elementos específicos da Adobe Experience Cloud (seletor exato fornecido)
      const specificHeroTitle = await page.$('span.hero-title._Jb1._Nc1.Pc1._Yb1._7c1[id="hero-title"][data-rsp-slot="text"]');
      if (specificHeroTitle) {
        const titleText = await specificHeroTitle.textContent();
        this.logger.log(`✅ Adobe Experience Cloud hero title específico encontrado: ${titleText}`);
        if (titleText?.includes('Adobe Experience Cloud')) {
          return true;
        }
      }
      
      // 1b. Verificar hero title genérico
      const adobeHeroTitle = await page.$('span.hero-title[data-rsp-slot="text"], span[id="hero-title"]');
      if (adobeHeroTitle) {
        const titleText = await adobeHeroTitle.textContent();
        this.logger.log(`✅ Adobe Experience Cloud hero title genérico encontrado: ${titleText}`);
        if (titleText?.includes('Adobe Experience Cloud')) {
          return true;
        }
      }
      
      // 2. Verificar outros elementos da Adobe Experience Cloud
      const adobeElements = await page.$$eval([
        'span:has-text("Adobe Experience Cloud")',
        'h1:has-text("Adobe Experience Cloud")',
        '[data-rsp-slot="text"]:has-text("Adobe Experience Cloud")',
        '.hero-title:has-text("Adobe Experience Cloud")'
      ].join(', '), (elements) => {
        return elements.length > 0 ? elements[0]?.textContent : null;
      }).catch(() => null);
      
      if (adobeElements) {
        this.logger.log(`✅ Elemento Adobe Experience Cloud encontrado: ${adobeElements}`);
        return true;
      }
      
      // 3. Verificar se conseguimos detectar elementos do Workfront
      const workfrontElements = await page.$$eval([
        '[data-testid*="workfront"]',
        '.workfront',
        'a[href*="workfront"]',
        'img[alt*="Workfront"]',
        'span:has-text("Workfront")'
      ].join(', '), (elements) => elements.length).catch(() => 0);
      
      if (workfrontElements > 0) {
        this.logger.log(`✅ ${workfrontElements} elementos Workfront encontrados`);
        return true;
      }
      
      // 4. Verificar se a página carregou completamente (não está em loading)
      const hasLoadingIndicators = await page.$$eval([
        '.loading',
        '.spinner',
        '[data-testid*="loading"]',
        '.loader'
      ].join(', '), (elements) => elements.length).catch(() => 0);
      
      if (hasLoadingIndicators > 0) {
        this.logger.log(`⏳ Página ainda carregando (${hasLoadingIndicators} indicadores de loading)`);
        return false;
      }
      
      // 5. Verificar título da página
      const pageTitle = await page.title();
      this.logger.log(`📄 Título da página: ${pageTitle}`);
      
      if (pageTitle?.includes('Adobe') || pageTitle?.includes('Workfront') || pageTitle?.includes('Experience Cloud')) {
        this.logger.log('✅ Título da página indica sucesso');
        return true;
      }
      
      // 6. Verificar se não estamos em uma página de erro
      const hasErrorElements = await page.$$eval([
        '.error',
        '[data-testid*="error"]',
        '.error-page',
        'h1:has-text("Error")',
        'h1:has-text("Erro")'
      ].join(', '), (elements) => elements.length).catch(() => 0);
      
      if (hasErrorElements > 0) {
        this.logger.log(`❌ Página de erro detectada (${hasErrorElements} elementos de erro)`);
        return false;
      }
      
      // 7. Se chegou até aqui e está na URL correta, assumir sucesso
      if (currentUrl.includes('adobe.com') && !currentUrl.includes('okta')) {
        this.logger.log('✅ URL da Adobe válida, assumindo sucesso');
        return true;
      }
      
      this.logger.log('❓ Não foi possível verificar definitivamente o acesso');
      return false;
      
    } catch (error) {
      this.logger.warn(`⚠️ Erro na verificação de acesso: ${error.message}`);
      return false;
    }
  }
}