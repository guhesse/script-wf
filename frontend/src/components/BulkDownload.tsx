import React, { useState } from 'react';
import { AlertTriangle, Download, FileDown, FolderDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input }  from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';

interface BulkDownloadPreview {
  totalProjects: number;
  targetFolder: string;
  downloadPath: string;
  estimatedTime: string;
  projects: Array<{
    number: number;
    url: string;
    status: string;
  }>;
}

interface BulkDownloadResult {
  success: boolean;
  total: number;
  successful: Array<{
    url: string;
    projectNumber: number;
    projectName: string;
    filesDownloaded: number;
    totalSize: number;
  }>;
  failed: Array<{
    url: string;
    projectNumber: number;
    error: string;
  }>;
  summary: {
    totalFiles: number;
    totalSize: number;
  };
}

const BulkDownload: React.FC = () => {
  const [projectUrls, setProjectUrls] = useState<string[]>(['']);
  const [downloadPath, setDownloadPath] = useState('');
  const [headless, setHeadless] = useState(true);
  const [continueOnError, setContinueOnError] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BulkDownloadResult | null>(null);
  const [error, setError] = useState<string>('');
  const [preview, setPreview] = useState<BulkDownloadPreview | null>(null);

  const addUrlField = () => {
    setProjectUrls([...projectUrls, '']);
  };

  const removeUrlField = (index: number) => {
    const newUrls = projectUrls.filter((_, i) => i !== index);
    setProjectUrls(newUrls.length > 0 ? newUrls : ['']);
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...projectUrls];
    newUrls[index] = value;
    setProjectUrls(newUrls);
  };

  const getValidUrls = () => {
    return projectUrls.filter(url => url.trim() !== '');
  };

  const handlePreview = async () => {
    const validUrls = getValidUrls();
    
    if (validUrls.length === 0) {
      setError('Adicione pelo menos uma URL de projeto');
      return;
    }

    try {
      setError('');
      const response = await fetch('/api/bulk-download/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectUrls: validUrls
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreview(data.preview);
      } else {
        setError(data.error || 'Erro ao gerar preview');
      }
    } catch {
      setError('Erro ao conectar com o servidor');
    }
  };

  const handleDownload = async () => {
    const validUrls = getValidUrls();
    
    if (validUrls.length === 0) {
      setError('Adicione pelo menos uma URL de projeto');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setResult(null);

      const response = await fetch('/api/bulk-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectUrls: validUrls,
          downloadPath: downloadPath || undefined,
          headless,
          continueOnError
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setPreview(null);
      } else {
        setError(data.error || 'Erro no download em massa');
      }
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center gap-2 mb-4">
          <FolderDown className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Download em Massa - Briefings</h2>
        </div>
        
        <p className="text-gray-600 mb-6">
          Faça download de todos os arquivos da pasta "05. Briefing" de múltiplos projetos simultaneamente.
        </p>

        {/* URLs dos Projetos */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            URLs dos Projetos Workfront
          </label>
          
          {projectUrls.map((url, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUrl(index, e.target.value)}
                placeholder={`URL do projeto ${index + 1}`}
                className="flex-1"
              />
              <Button
                onClick={() => removeUrlField(index)}
                variant="outline"
                size="sm"
                disabled={projectUrls.length === 1}
                className="px-3"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          
          <Button
            onClick={addUrlField}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar URL
          </Button>

          <div className="text-sm text-gray-500">
            URLs válidas: {getValidUrls().length} de {projectUrls.length}
          </div>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Caminho de Download (opcional)
            </label>
            <Input
              value={downloadPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)}
              placeholder="Ex: C:/Downloads/Briefings"
            />
            <p className="text-xs text-gray-500 mt-1">
              Deixe vazio para usar o diretório padrão
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeadless(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Modo headless (sem interface gráfica)</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={continueOnError}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContinueOnError(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Continuar mesmo com erros</span>
            </label>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-3 mt-6">
          <Button
            onClick={handlePreview}
            variant="outline"
            disabled={isLoading || getValidUrls().length === 0}
            className="flex items-center gap-2"
          >
            <FileDown className="w-4 h-4" />
            Preview
          </Button>

          <Button
            onClick={handleDownload}
            disabled={isLoading || getValidUrls().length === 0}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isLoading ? 'Processando...' : 'Iniciar Download'}
          </Button>
        </div>

        {/* Erros */}
        {error && (
          <Alert className="mt-4 border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <div className="text-red-800">{error}</div>
          </Alert>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Preview do Download</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{preview.totalProjects}</div>
              <div className="text-sm text-blue-700">Projetos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{preview.targetFolder}</div>
              <div className="text-sm text-green-700">Pasta Alvo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{preview.estimatedTime}</div>
              <div className="text-sm text-purple-700">Tempo Estimado</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{preview.downloadPath}</div>
              <div className="text-sm text-gray-700">Destino</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Projetos a processar:</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {preview.projects.map((project: BulkDownloadPreview['projects'][0], index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                  <span className="text-sm">Projeto {project.number}</span>
                  <Badge variant="secondary">{project.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Resultado do Download</h3>
          
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{result.successful.length}</div>
              <div className="text-sm text-green-700">Sucessos</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{result.failed.length}</div>
              <div className="text-sm text-red-700">Falhas</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{result.summary.totalFiles}</div>
              <div className="text-sm text-blue-700">Arquivos</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{formatFileSize(result.summary.totalSize)}</div>
              <div className="text-sm text-purple-700">Tamanho Total</div>
            </div>
          </div>

          {/* Projetos Bem-sucedidos */}
          {result.successful.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-green-700 mb-3">✅ Projetos Processados com Sucesso</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.successful.map((project, index) => (
                  <div key={index} className="p-3 bg-green-50 rounded border border-green-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{project.projectName}</div>
                        <div className="text-sm text-gray-600">Projeto {project.projectNumber}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-green-600 font-medium">{project.filesDownloaded} arquivos</div>
                        <div className="text-gray-500">{formatFileSize(project.totalSize)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projetos com Falha */}
          {result.failed.length > 0 && (
            <div>
              <h4 className="font-medium text-red-700 mb-3">❌ Projetos com Falha</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.failed.map((project, index) => (
                  <div key={index} className="p-3 bg-red-50 rounded border border-red-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm text-gray-600">Projeto {project.projectNumber}</div>
                        <div className="text-xs text-red-600 mt-1">{project.error}</div>
                      </div>
                      <Badge variant="destructive">Falha</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkDownload;