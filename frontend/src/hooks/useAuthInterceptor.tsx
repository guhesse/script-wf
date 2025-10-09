import { useEffect } from 'react';
import { useAppAuth } from './useAppAuth';
import { toast } from 'sonner';

/**
 * Hook para interceptar erros 401 e fazer logout automático
 */
export const useAuthInterceptor = () => {
  const { logout } = useAppAuth();

  useEffect(() => {
    // Salvar o fetch original
    const originalFetch = window.fetch;

    // Sobrescrever o fetch global
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Se receber 401 Unauthorized, fazer logout
      if (response.status === 401) {
        console.warn('🔒 Sessão expirada (401). Fazendo logout automático...');
        
        // Mostrar notificação para o usuário
        toast.error('Sessão expirada', {
          description: 'Sua sessão expirou. Por favor, faça login novamente.',
          duration: 4000,
        });
        
        // Fazer logout após um pequeno delay para garantir que a resposta seja processada
        setTimeout(() => {
          logout();
        }, 500);
      }

      return response;
    };

    // Cleanup: restaurar fetch original quando o componente desmontar
    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);
};
