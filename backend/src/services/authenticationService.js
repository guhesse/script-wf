// src/services/authenticationService.js
import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const STATE_FILE = 'wf_state.json';

export class AuthenticationService {
    /**
     * Fazer login no Workfront
     */
    async login() {
        try {
            console.log('🔑 Iniciando processo de login no Workfront...');
            
            // Implementar login diretamente com Playwright
            await this.performWorkfrontLogin();
            
            console.log('✅ Login concluído com sucesso');
            
            // Verificar se o arquivo de estado foi criado
            const isLoggedIn = await this.checkLoginStatus();
            
            if (!isLoggedIn.loggedIn) {
                throw new Error('Login aparentemente falhou - arquivo de estado não encontrado');
            }
            
            return {
                success: true,
                message: 'Login realizado com sucesso! Sessão salva.',
                sessionFile: STATE_FILE,
                loginTime: isLoggedIn.lastLogin
            };

        } catch (error) {
            console.error('❌ Erro durante login:', error.message);
            throw new Error(`Falha no login: ${error.message}`);
        }
    }

    /**
     * Realizar login no Workfront usando Playwright
     */
    async performWorkfrontLogin() {
        console.log("🔐 === FAZENDO LOGIN NO WORKFRONT ===");

        const browser = await chromium.launch({
            headless: false, // Login sempre visível para autenticação manual
            args: ['--start-maximized']
        });

        try {
            const context = await browser.newContext({
                viewport: null
            });

            const page = await context.newPage();

            console.log("🌍 Abrindo Experience Cloud...");
            await page.goto("https://experience.adobe.com/", { waitUntil: "domcontentloaded" });

            console.log("👤 Complete o login SSO/MFA nos próximos 90 segundos...");
            await page.waitForTimeout(90000);

            // Salvar estado da sessão
            await context.storageState({ path: STATE_FILE });
            console.log(`✅ Sessão salva em ${STATE_FILE}`);

        } finally {
            await browser.close();
        }
    }

    /**
     * Verificar status do login
     */
    async checkLoginStatus() {
        try {
            // Verificar se arquivo de sessão existe
            await fs.access(STATE_FILE);
            
            // Obter informações do arquivo
            const stats = await fs.stat(STATE_FILE);
            const now = new Date();
            const fileAge = now - stats.mtime;
            const hoursAge = fileAge / (1000 * 60 * 60);

            // Considerar válido se o arquivo foi criado nas últimas 8 horas
            const isValid = hoursAge < 8;

            return {
                loggedIn: isValid,
                lastLogin: stats.mtime.toISOString(),
                hoursAge: Math.round(hoursAge * 10) / 10,
                sessionFile: STATE_FILE,
                fileSize: stats.size
            };

        } catch (error) {
            return {
                loggedIn: false,
                error: 'Arquivo de sessão não encontrado ou inacessível',
                sessionFile: STATE_FILE
            };
        }
    }

    /**
     * Verificar se precisa fazer login
     */
    async requiresLogin() {
        const status = await this.checkLoginStatus();
        return !status.loggedIn;
    }

    /**
     * Obter informações da sessão
     */
    async getSessionInfo() {
        try {
            const status = await this.checkLoginStatus();
            
            if (!status.loggedIn) {
                return {
                    hasSession: false,
                    message: 'Nenhuma sessão ativa encontrada'
                };
            }

            // Tentar ler conteúdo do arquivo de sessão (cuidado com dados sensíveis)
            const sessionContent = await fs.readFile(STATE_FILE, 'utf8');
            const sessionData = JSON.parse(sessionContent);

            // Retornar apenas informações não sensíveis
            return {
                hasSession: true,
                lastLogin: status.lastLogin,
                hoursAge: status.hoursAge,
                hasStorageState: !!sessionData.storageState,
                hasCookies: Array.isArray(sessionData.cookies) ? sessionData.cookies.length : 0,
                domain: this.extractDomainFromSession(sessionData)
            };

        } catch (error) {
            console.error('❌ Erro ao obter informações da sessão:', error.message);
            return {
                hasSession: false,
                error: 'Erro ao ler arquivo de sessão'
            };
        }
    }

    /**
     * Limpar cache e sessão
     */
    async clearSession() {
        try {
            console.log('🧹 Limpando sessão do Workfront...');
            
            await fs.unlink(STATE_FILE);
            
            console.log('✅ Sessão limpa com sucesso');
            return {
                success: true,
                message: 'Sessão limpa com sucesso. Faça login novamente.',
                clearedFile: STATE_FILE
            };

        } catch (error) {
            // Se o arquivo não existir, considerar sucesso
            if (error.code === 'ENOENT') {
                console.log('ℹ️ Sessão já estava limpa (arquivo não encontrado)');
                return {
                    success: true,
                    message: 'Sessão já estava limpa.',
                    clearedFile: STATE_FILE
                };
            } else {
                console.error('❌ Erro ao limpar sessão:', error.message);
                throw new Error(`Falha ao limpar sessão: ${error.message}`);
            }
        }
    }

    /**
     * Validar sessão fazendo uma verificação básica
     */
    async validateSession() {
        try {
            const status = await this.checkLoginStatus();
            
            if (!status.loggedIn) {
                return {
                    valid: false,
                    reason: 'Nenhuma sessão ativa'
                };
            }

            // Verificar se arquivo de sessão tem conteúdo válido
            const sessionContent = await fs.readFile(STATE_FILE, 'utf8');
            const sessionData = JSON.parse(sessionContent);

            if (!sessionData.storageState) {
                return {
                    valid: false,
                    reason: 'Dados de sessão inválidos'
                };
            }

            return {
                valid: true,
                lastLogin: status.lastLogin,
                hoursAge: status.hoursAge
            };

        } catch (error) {
            console.error('❌ Erro ao validar sessão:', error.message);
            return {
                valid: false,
                reason: 'Erro ao validar sessão',
                error: error.message
            };
        }
    }

    /**
     * Extrair domínio da sessão (utilitário)
     */
    extractDomainFromSession(sessionData) {
        try {
            if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
                const domains = sessionData.cookies
                    .map(cookie => cookie.domain)
                    .filter(domain => domain)
                    .filter((domain, index, arr) => arr.indexOf(domain) === index); // unique
                
                return domains.join(', ');
            }
            return 'Desconhecido';
        } catch (error) {
            return 'Erro ao extrair';
        }
    }

    /**
     * Obter estatísticas de uso da sessão
     */
    async getSessionStats() {
        try {
            const status = await this.checkLoginStatus();
            
            if (!status.loggedIn) {
                return {
                    hasStats: false,
                    message: 'Nenhuma sessão ativa'
                };
            }

            return {
                hasStats: true,
                sessionAge: {
                    hours: status.hoursAge,
                    days: Math.round(status.hoursAge / 24 * 10) / 10
                },
                sessionSize: status.fileSize,
                lastAccess: status.lastLogin,
                expiresIn: Math.max(0, 8 - status.hoursAge), // 8 horas de validade
                isExpiringSoon: status.hoursAge > 6 // Aviso se expira em menos de 2 horas
            };

        } catch (error) {
            console.error('❌ Erro ao obter estatísticas da sessão:', error.message);
            return {
                hasStats: false,
                error: error.message
            };
        }
    }
}

export default new AuthenticationService();