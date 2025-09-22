import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
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

  /**
   * Fazer login no Workfront
   */
  async login(): Promise<LoginResponseDto> {
    try {
      this.logger.log('🔑 Iniciando processo de login no Workfront...');

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
      headless: false,
      args: ['--start-maximized'],
    });

    try {
      const context = await browser.newContext({
        viewport: null,
      });

      const page = await context.newPage();

      this.logger.log('🌍 Abrindo Experience Cloud...');
      await page.goto('https://experience.adobe.com/', { waitUntil: 'domcontentloaded' });

      this.logger.log('👤 Complete o login SSO/MFA. Aguardando até 90s ou fechamento manual...');

      // Aguardar com checagem periódica se o contexto foi fechado
      const maxWait = 90000;
      const interval = 3000;
      let waited = 0;
      while (waited < maxWait) {
        if (page.isClosed()) {
          this.logger.warn('⚠️ Página fechada antes do tempo. Tentando salvar estado assim mesmo.');
          break;
        }
        await page.waitForTimeout(interval);
        waited += interval;
      }

      // Salvar estado da sessão
      await context.storageState({ path: this.STATE_FILE });
      this.logger.log(`✅ Sessão salva em ${this.STATE_FILE}`);
    } catch (e: any) {
      this.logger.error('Erro durante login interativo', e.message);
      throw e;
    } finally {
      if (browser.isConnected()) {
        await browser.close();
      }
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