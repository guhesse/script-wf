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

// API_URL removido (uso direto de /api via proxy)

export const useWorkfrontApi = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const getToken = useCallback((): string => {
    try { return localStorage.getItem('wf_access_token') || ''; } catch { return ''; }
  }, []);
  const authHeaders = useCallback((): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [getToken]);

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
        body: JSON.stringify({ projectUrl, headless: false })
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
          selectedUser,
          headless: false
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

  type CombinedSimpleParams = {
    projectUrl: string;
    selections: ShareSelection[];
    selectedUser?: 'carol' | 'giovana' | 'test';
    commentType?: 'assetRelease' | 'finalMaterials' | 'approval';
    headless?: boolean;
  };
  type CombinedBatchItem = { projectUrl: string; selections: ShareSelection[] };
  type CombinedBatchParams = {
    items: CombinedBatchItem[];
    selectedUser?: 'carol' | 'giovana' | 'test';
    commentType?: 'assetRelease' | 'finalMaterials' | 'approval';
    headless?: boolean;
  };

  const shareAndComment = useCallback(async (
    params: CombinedSimpleParams | CombinedBatchParams
  ): Promise<import('@/types').ShareAndCommentResponse> => {
    const isBatch = 'items' in params;
    const selections = isBatch ? params.items.flatMap((i) => i.selections) : params.selections;
    if (!isBatch && (!selections || selections.length === 0)) {
      toast.warning('Selecione pelo menos um arquivo');
      throw new Error('Nenhum arquivo selecionado');
    }

    const totalFiles = isBatch ? selections.length : selections.length;
    setIsLoading(true);
    setLoadingMessage(`Executando compartilhamento + comentário para ${totalFiles} arquivo(s)...\nO navegador será aberto em modo visível.`);

    try {
      const response = await fetch('/api/share-and-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          headless: false,
        }),
      });
      const data: import('@/types').ShareAndCommentResponse = await response.json();
      if (data.success) {
        toast.success(data.message || 'Fluxo concluído com sucesso');
      } else {
        toast.error(data.message || 'Falha ao executar fluxo');
      }
      return data;
    } catch (error) {
      console.error('Erro no fluxo combinado:', error);
      toast.error('Erro de conexão no fluxo combinado');
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
    commentMode?: 'plain' | 'raw';
    rawHtml?: string;
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
          headless: params.headless !== false,
          commentMode: params.commentMode || 'plain',
          rawHtml: params.rawHtml
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

  // Novo: preparar upload (envia arquivos e recebe caminhos salvos no backend para automação)
  const prepareUploadPlan = useCallback(async (params: {
    projectUrl: string;
    selectedUser: 'carol' | 'giovana' | 'test';
    assetZip: File;
    finalMaterials: File[];
  }): Promise<{ success: boolean; staged: { assetZip?: string; finalMaterials?: string[] }; jobId?: string; status?: string; message?: string } > => {
    if (!params.projectUrl) throw new Error('URL do projeto é obrigatória');
    if (!params.assetZip) throw new Error('ZIP de Asset Release é obrigatório');
    if (!params.finalMaterials || params.finalMaterials.length === 0) throw new Error('Adicione arquivos de Final Materials');

    setIsLoading(true);
    setLoadingMessage('Enviando arquivos e preparando fluxo...');

    try {
      const form = new FormData();
      form.append('projectUrl', params.projectUrl);
      form.append('selectedUser', params.selectedUser);
      form.append('assetZip', params.assetZip);
      params.finalMaterials.forEach((f) => form.append('finalMaterials', f));

      // Tenta via proxy do Vite primeiro
  let response: Response | null = await fetch('/api/upload/prepare', { method: 'POST', body: form, headers: authHeaders() }).catch(() => null);
      // Fallback direto para o backend (evita erros de proxy como ALPN negotiation)
      if (!response || !response.ok) {
        const direct = `http://localhost:3000/api/upload/prepare`;
  response = await fetch(direct, { method: 'POST', body: form, headers: authHeaders() });
      }
      const data = await response.json();
      if (data.success) {
        if (data.jobId) {
          try { localStorage.setItem('wf_activeUploadJob', JSON.stringify({ jobId: data.jobId, projectUrl: params.projectUrl })); } catch { /* ignore storage */ }
        }
        toast.success('Arquivos enviados! Pronto para acionar automação.');
      } else {
        toast.error(data.message || 'Falha ao preparar upload');
      }
      return data;
    } catch (e) {
      console.error('Erro no prepareUploadPlan:', e);
      toast.error('Erro de conexão ao enviar arquivos');
      throw e;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [authHeaders]);

  // Executar automação de upload (usa paths salvos no backend)
  const executeUploadAutomation = useCallback(async (params: {
    projectUrl: string;
    selectedUser: 'carol' | 'giovana' | 'test';
    assetZipPath: string;
    finalMaterialPaths: string[];
    headless?: boolean;
    jobId?: string;
  }): Promise<{ success: boolean; message: string; results?: unknown[]; summary?: unknown; jobId?: string }> => {
    setIsLoading(true);
    setLoadingMessage('Executando automação de upload no Workfront...');

    try {
      // Tenta via proxy primeiro
      let response: Response | null = await fetch('/api/upload/execute', {
        method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(authHeaders()) },
        body: JSON.stringify(params),
      }).catch(() => null);
      
      // Fallback direto
      if (!response || !response.ok) {
        response = await fetch('http://localhost:3000/api/upload/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeaders()) },
          body: JSON.stringify(params),
        });
      }
      
      const data = await response.json();
      if (data.success) {
        toast.success(data.message || 'Automação concluída com sucesso!');
        // se finalizado, remover job ativo
  try { localStorage.removeItem('wf_activeUploadJob'); } catch { /* ignore */ }
      } else {
        toast.error(data.message || 'Falha na automação');
      }
      return data;
    } catch (e) {
      console.error('Erro no executeUploadAutomation:', e);
      toast.error('Erro de conexão na automação');
      throw e;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [authHeaders]);

  // ---- JOBS DE UPLOAD ----
  interface UploadJob { id: string; projectUrl: string; staged: { assetZip?: string; finalMaterials?: string[] }; status: string; error?: string }
  const getActiveUploadJob = useCallback(async (): Promise<UploadJob | null> => {
    try {
  const resp = await fetch(`/api/upload/jobs/active`, { headers: authHeaders() });
      const data = await resp.json();
      return data.job || null;
    } catch (e) {
      console.warn('Falha ao obter job ativo', e);
      return null;
    }
  }, [authHeaders]);

  const getUploadJob = useCallback(async (jobId: string): Promise<UploadJob | null> => {
    try {
  const resp = await fetch(`/api/upload/jobs/${jobId}`, { headers: authHeaders() });
      const data = await resp.json();
      return data.job || null;
    } catch { return null; }
  }, [authHeaders]);

  const cancelUploadJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
  const resp = await fetch(`/api/upload/jobs/${jobId}/cancel`, { method: 'POST', headers: authHeaders() });
      const data = await resp.json();
      if (data.success) {
  try { localStorage.removeItem('wf_activeUploadJob'); } catch { /* ignore */ }
      }
      return !!data.success;
    } catch { return false; }
  }, [authHeaders]);

  const clearPreparedFiles = useCallback(async (): Promise<{ success: boolean; deletedFiles: number; message: string }> => {
    try {
      const resp = await fetch(`/api/upload/clear-prepared`, { method: 'DELETE', headers: authHeaders() });
      const data = await resp.json();
      if (data.success) {
        try { localStorage.removeItem('wf_activeUploadJob'); } catch { /* ignore */ }
      }
      return data;
    } catch (err) {
      console.error('Erro ao limpar arquivos:', err);
      return { success: false, deletedFiles: 0, message: (err as Error).message };
    }
  }, [authHeaders]);

  interface FrontendWorkflowStep { action: string; enabled?: boolean; params?: Record<string, unknown>; }
  const executeWorkflow = useCallback(async (config: {
    projectUrl: string;
    steps: FrontendWorkflowStep[];
    headless?: boolean;
    stopOnError?: boolean;
  }) => {
    try {
  const mappedSteps = (config.steps || []).map((s: FrontendWorkflowStep) => {
        if (!s) return s;
        const base = { enabled: s.enabled !== false, params: s.params || {} };
        switch (s.action) {
          case 'upload_asset':
          case 'upload_finals':
            return { action: 'upload', ...base, params: { ...base.params, ...s.params } };
          case 'share_asset':
            return { action: 'share', ...base, params: { ...base.params, selections: s.params?.selections || s.params?.selectionsAsset } };
          case 'comment_asset':
          case 'comment_finals':
            return { action: 'comment', ...base, params: { ...base.params, folder: s.params?.folder, fileName: s.params?.fileName, commentType: s.params?.commentType, commentMode: s.params?.commentMode, rawHtml: s.params?.rawHtml } };
          case 'status':
            return { action: 'status', ...base, params: { deliverableStatus: s.params?.deliverableStatus } };
          case 'hours':
            return { action: 'hours', ...base, params: { hours: s.params?.hours, note: s.params?.note, taskName: s.params?.taskName } };
          default:
            return s;
        }
      });

      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders()) },
        body: JSON.stringify({
          projectUrl: config.projectUrl,
          steps: mappedSteps,
          headless: config.headless || false,
          stopOnError: config.stopOnError || false,
        })
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.message || 'Workflow falhou');
      } else {
        toast.success('Workflow executado');
      }
      return data;
    } catch (error) {
      console.error('Erro ao executar workflow:', error);
      toast.error('Erro de conexão durante workflow');
      throw error;
    }
  }, [authHeaders]);

  return {
    isLoading,
    loadingMessage,
    checkLoginStatus,
    login,
    extractDocuments,
    extractDocumentsWithProgress,
    shareDocuments,
    shareAndComment,
    clearCache,
    clearPreparedFiles,
    getProjectHistory,
    getProjectByUrl,
    addComment,
    getCommentPreview,
    prepareUploadPlan,
    executeUploadAutomation,
    executeWorkflow,
    getActiveUploadJob,
    getUploadJob,
    cancelUploadJob,
  };
};