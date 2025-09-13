import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  WorkfrontFolder,
  LoginStatusResponse,
  DocumentsResponse,
  ShareSelection,
  ShareResponse,
  ProjectHistoryResponse,
  WorkfrontProject
} from '@/types';

export const useWorkfrontApi = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const checkLoginStatus = useCallback(async (): Promise<LoginStatusResponse> => {
    try {
      const response = await fetch('/api/login-status');
      return await response.json();
    } catch (error) {
      console.error('Erro ao verificar status de login:', error);
      throw new Error('Erro ao verificar status de login');
    }
  }, []);

  const login = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadingMessage('Fazendo login no Workfront...\nEsta janela pode ser minimizada.');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Login realizado com sucesso!');
      } else {
        toast.error(data.message || 'Erro durante o login');
        throw new Error(data.message || 'Erro durante o login');
      }
    } catch (error) {
      console.error('Erro no login:', error);
      toast.error('Erro de conexão durante o login');
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const extractDocuments = useCallback(async (projectUrl: string): Promise<WorkfrontFolder[]> => {
    if (!projectUrl) {
      toast.warning('Por favor, adicione a URL do projeto');
      throw new Error('URL do projeto é obrigatória');
    }

    setIsLoading(true);
    setLoadingMessage('Extraindo documentos do projeto...\nEste processo abrirá o navegador para acessar o Workfront.\nAguarde enquanto coletamos os arquivos disponíveis.');

    try {
      const response = await fetch('/api/extract-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectUrl })
      });

      const data: DocumentsResponse = await response.json();

      if (data.success && data.folders) {
        toast.success(`Documentos extraídos com sucesso! Encontradas ${data.totalFolders || 0} pastas com ${data.totalFiles || 0} arquivos.`);
        return data.folders;
      } else {
        console.error('Erro na extração:', data);
        let errorMessage = data.message || 'Erro ao extrair documentos';

        if (data.debug) {
          console.log('Debug info:', data.debug);
          errorMessage += ' (veja o console para mais detalhes)';
        }

        toast.error(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Erro na extração:', error);
      toast.error('Erro de conexão durante a extração');
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const extractDocumentsWithProgress = useCallback(async (
    projectUrl: string,
    onProgress: (step: string, message: string, progress: number, data?: unknown) => void
  ): Promise<WorkfrontFolder[]> => {
    if (!projectUrl) {
      toast.warning('Por favor, adicione a URL do projeto');
      throw new Error('URL do projeto é obrigatória');
    }

    setIsLoading(true);

    try {
      const projectId = Math.random().toString(36).substring(7);
      const encodedUrl = encodeURIComponent(projectUrl);

      const eventSource = new EventSource(`/api/extract-documents-stream/${projectId}?url=${encodedUrl}`);

      return new Promise((resolve, reject) => {
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onProgress(data.step, data.message, data.progress, data.data);

            if (data.step === 'completed' && data.data) {
              eventSource.close();
              setIsLoading(false);
              toast.success(`Documentos extraídos com sucesso! Encontradas ${data.data.totalFolders || 0} pastas com ${data.data.totalFiles || 0} arquivos.`);
              resolve(data.data.folders);
            } else if (data.step === 'error') {
              eventSource.close();
              setIsLoading(false);
              toast.error(data.message);
              reject(new Error(data.message));
            }
          } catch (error) {
            console.error('Erro ao processar evento SSE:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('Erro no EventSource:', error);
          eventSource.close();
          setIsLoading(false);
          toast.error('Erro de conexão durante a extração');
          reject(new Error('Erro de conexão durante a extração'));
        };

        eventSource.addEventListener('close', () => {
          eventSource.close();
          setIsLoading(false);
        });
      });
    } catch (error) {
      console.error('Erro na extração com progresso:', error);
      setIsLoading(false);
      toast.error('Erro de conexão durante a extração');
      throw error;
    }
  }, []);

  const shareDocuments = useCallback(async (
    projectUrl: string,
    selections: ShareSelection[],
    selectedUser: 'carol' | 'giovana' = 'carol'
  ): Promise<ShareResponse> => {
    if (selections.length === 0) {
      toast.warning('Selecione pelo menos um arquivo para compartilhar');
      throw new Error('Nenhum arquivo selecionado');
    }

    const totalFiles = selections.length;
    const teamName = selectedUser === 'carol' ? 'Equipe Completa (Carolina)' : 'Equipe Reduzida (Giovana)';
    setIsLoading(true);
    setLoadingMessage(`Compartilhando ${totalFiles} arquivo(s) com ${teamName}...\nEste processo pode demorar alguns minutos.`);

    try {
      const response = await fetch('/api/share-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectUrl,
          selections,
          users: [], // Será usado pelos usuários configurados no backend
          selectedUser
        })
      });

      const data: ShareResponse = await response.json();

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Erro durante o compartilhamento');
      }

      return data;
    } catch (error) {
      console.error('Erro no compartilhamento:', error);
      toast.error('Erro de conexão durante o compartilhamento');
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const clearCache = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadingMessage('Limpando cache do navegador...');

    try {
      const response = await fetch('/api/clear-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Cache limpo com sucesso! Você precisará fazer login novamente.');
      } else {
        toast.error(data.message || 'Erro ao limpar cache');
        throw new Error(data.message || 'Erro ao limpar cache');
      }
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      toast.error('Erro de conexão ao limpar cache');
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const getProjectHistory = useCallback(async (page = 1, limit = 10): Promise<ProjectHistoryResponse> => {
    try {
      const response = await fetch(`/api/projects/history?page=${page}&limit=${limit}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      throw new Error('Erro ao buscar histórico de projetos');
    }
  }, []);

  const getProjectByUrl = useCallback(async (url: string): Promise<WorkfrontProject | null> => {
    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/api/projects/by-url?url=${encodedUrl}`);
      const data = await response.json();
      return data.success ? data.project : null;
    } catch (error) {
      console.error('Erro ao buscar projeto por URL:', error);
      return null;
    }
  }, []);

  const addComment = useCallback(async (params: {
    projectUrl: string;
    folderName?: string;
    fileName: string;
    commentType?: 'assetRelease' | 'finalMaterials' | 'approval';
    selectedUser?: 'carol' | 'giovana' | 'test';
    headless?: boolean;
  }): Promise<{ success: boolean; message: string; commentText?: string }> => {
    setIsLoading(true);
    setLoadingMessage('Adicionando comentário no documento...');

    try {
      const response = await fetch('/api/add-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectUrl: params.projectUrl,
          folderName: params.folderName,
          fileName: params.fileName,
          commentType: params.commentType || 'assetRelease',
          selectedUser: params.selectedUser || 'test',
          headless: params.headless !== false
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Comentário adicionado com sucesso!\n${data.message}`);
        return data;
      } else {
        toast.error(data.error || 'Erro ao adicionar comentário');
        throw new Error(data.error || 'Erro ao adicionar comentário');
      }
    } catch (error) {
      console.error('Erro ao adicionar comentário:', error);
      toast.error('Erro de conexão ao adicionar comentário');
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const getCommentPreview = useCallback(async (params: {
    commentType: 'assetRelease' | 'finalMaterials' | 'approval';
    selectedUser: 'carol' | 'giovana' | 'test';
  }): Promise<{ success: boolean; commentText: string; users: Array<{ name: string; email: string }> }> => {
    try {
      const response = await fetch('/api/comment/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Erro ao obter preview do comentário:', error);
      throw new Error('Erro ao obter preview do comentário');
    }
  }, []);

  return {
    isLoading,
    loadingMessage,
    checkLoginStatus,
    login,
    extractDocuments,
    extractDocumentsWithProgress,
    shareDocuments,
    clearCache,
    getProjectHistory,
    getProjectByUrl,
    addComment,
    getCommentPreview
  };
};