import { useCallback, useEffect, useState } from 'react';

interface PasswordCredentialData {
    email: string;
    password: string;
}

interface WorkfrontCredential {
    email: string;
    workfrontPassword: string;
    oktaPassword: string;
}

// Extende tipos globais para suportar a Credential Management API
declare global {
    interface Window {
        PasswordCredential: {
            new(data: PasswordCredentialInit): Credential;
        };
    }

    interface PasswordCredentialInit {
        id: string;
        password: string;
        name?: string;
        iconURL?: string;
    }
}

/**
 * Hook para gerenciar credenciais usando a Credential Management API do navegador
 * Permite salvar e recuperar credenciais de forma segura, similar ao comportamento
 * do Google Chrome de salvar senhas.
 * 
 * IMPORTANTE: A Credential Management API só funciona em contextos seguros (HTTPS)
 */
export const useCredentialManager = () => {
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Verifica se a API está disponível no navegador
        setIsSupported('credentials' in navigator && 'PasswordCredential' in window);
    }, []);

    /**
     * Salva credenciais simples (email/senha) no gerenciador de senhas do navegador
     */
    const savePasswordCredential = useCallback(async (
        id: string,
        password: string,
        name?: string
    ): Promise<boolean> => {
        if (!isSupported) {
            console.warn('Credential Management API não suportada neste navegador');
            return false;
        }

        try {
            // Cria uma credencial de senha
            const credential = new window.PasswordCredential({
                id, // geralmente o email
                password,
                name: name || id,
            });

            // Salva no gerenciador de credenciais do navegador
            await navigator.credentials.store(credential);
            console.log('Credencial salva com sucesso');
            return true;
        } catch (error) {
            console.error('Erro ao salvar credencial:', error);
            return false;
        }
    }, [isSupported]);

    /**
     * Recupera credenciais salvas do navegador
     */
    const getPasswordCredential = useCallback(async (): Promise<PasswordCredentialData | null> => {
        if (!isSupported) {
            return null;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const credential = await navigator.credentials.get({
                password: true,
                mediation: 'optional',
            } as any);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (credential && (credential as any).type === 'password') {
                return {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    email: (credential as any).id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    password: (credential as any).password,
                };
            }
            return null;
        } catch (error) {
            console.error('Erro ao recuperar credencial:', error);
            return null;
        }
    }, [isSupported]);

    /**
     * Salva credenciais do Workfront (múltiplas senhas) usando localStorage
     * como fallback, já que a API nativa só suporta uma senha por credencial.
     * 
     * Nota: Para produção, considere usar uma solução mais segura como:
     * - Criptografia local antes de armazenar
     * - Armazenamento no backend com tokens
     */
    const saveWorkfrontCredentials = useCallback(async (
        credentials: WorkfrontCredential
    ): Promise<boolean> => {
        try {
            // Tenta salvar usando a API nativa (apenas email/workfrontPassword)
            if (isSupported) {
                await savePasswordCredential(
                    credentials.email,
                    credentials.workfrontPassword,
                    'Workfront'
                );
            }

            // Salva dados adicionais em localStorage (com aviso sobre segurança)
            // AVISO: Não é 100% seguro. Em produção, use criptografia ou backend.
            const encryptedData = btoa(JSON.stringify({
                email: credentials.email,
                oktaPassword: credentials.oktaPassword,
                timestamp: Date.now(),
            }));

            localStorage.setItem('wf_creds', encryptedData);
            return true;
        } catch (error) {
            console.error('Erro ao salvar credenciais Workfront:', error);
            return false;
        }
    }, [isSupported, savePasswordCredential]);

    /**
     * Recupera credenciais do Workfront
     */
    const getWorkfrontCredentials = useCallback(async (): Promise<WorkfrontCredential | null> => {
        try {
            let email = '';
            let workfrontPassword = '';
            let oktaPassword = '';

            // Tenta recuperar da API nativa
            if (isSupported) {
                const nativeCredential = await getPasswordCredential();
                if (nativeCredential) {
                    email = nativeCredential.email;
                    workfrontPassword = nativeCredential.password;
                }
            }

            // Recupera dados adicionais do localStorage
            const encryptedData = localStorage.getItem('wf_creds');
            if (encryptedData) {
                try {
                    const data = JSON.parse(atob(encryptedData));
                    email = email || data.email;
                    oktaPassword = data.oktaPassword;
                } catch (e) {
                    console.error('Erro ao decodificar credenciais:', e);
                }
            }

            if (email && (workfrontPassword || oktaPassword)) {
                return { email, workfrontPassword, oktaPassword };
            }

            return null;
        } catch (error) {
            console.error('Erro ao recuperar credenciais Workfront:', error);
            return null;
        }
    }, [isSupported, getPasswordCredential]);

    /**
     * Remove credenciais salvas
     */
    const clearCredentials = useCallback(async (): Promise<void> => {
        try {
            // Remove do localStorage
            localStorage.removeItem('wf_creds');

            // A API nativa não tem método direto para remover,
            // mas podemos prevenir que sejam usadas
            if (isSupported) {
                await navigator.credentials.preventSilentAccess();
            }
        } catch (error) {
            console.error('Erro ao limpar credenciais:', error);
        }
    }, [isSupported]);

    /**
     * Solicita ao usuário para salvar credenciais após login bem-sucedido
     */
    const promptToSaveCredential = useCallback(async (
        email: string,
        password: string
    ): Promise<boolean> => {
        if (!isSupported) {
            return false;
        }

        try {
            const credential = new window.PasswordCredential({
                id: email,
                password,
                name: email,
            });

            await navigator.credentials.store(credential);
            return true;
        } catch (error) {
            console.error('Erro ao solicitar salvamento de credencial:', error);
            return false;
        }
    }, [isSupported]);

    return {
        isSupported,
        savePasswordCredential,
        getPasswordCredential,
        saveWorkfrontCredentials,
        getWorkfrontCredentials,
        clearCredentials,
        promptToSaveCredential,
    };
};
