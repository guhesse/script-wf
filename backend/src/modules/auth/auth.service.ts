import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { LoginProgressService } from './login-progress.service';
import { LoginPhase } from './login-progress.enum';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  LoginResponseDto,
  LoginStatusDto,
  SessionInfoDto,
  ClearSessionResponseDto,
  SessionValidationDto,
  SessionStatsDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly STATE_FILE = 'wf_state.json';
  private readonly PARTIAL_FILE = 'wf_state.partial.json';

  /**
   * Fazer login no Workfront
   */
  constructor(private readonly progress: LoginProgressService) {}

  async login(): Promise<LoginResponseDto> {
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
      await this.performWorkfrontLogin();

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
  private async performWorkfrontLogin(): Promise<void> {
    this.logger.log('🔐 === FAZENDO LOGIN NO WORKFRONT ===');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox','--disable-dev-shm-usage'],
    });

    try {
      const context = await browser.newContext();

      const page = await context.newPage();

  this.progress.update(LoginPhase.NAVIGATING, 'Abrindo Experience Cloud');
  this.logger.log('🌍 Abrindo Experience Cloud...');
      await page.goto('https://experience.adobe.com/', { waitUntil: 'domcontentloaded' });

      this.logger.log('👤 Complete o login SSO/MFA. Polling do botão "Adobe Experience Cloud" para persistir sessão.');

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
}