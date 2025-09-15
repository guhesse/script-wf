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
      <div className="bg-card p-6 border border-border">
        <div className="flex items-center gap-2 mb-4">
          <FolderDown className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-card-foreground">Download em Massa - Briefings</h2>
        </div>
        
        <p className="text-muted-foreground mb-6">
          Faça download de todos os arquivos da pasta "05. Briefing" de múltiplos projetos simultaneamente.
        </p>

        {/* URLs dos Projetos */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
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

          <div className="text-sm text-muted-foreground">
            URLs válidas: {getValidUrls().length} de {projectUrls.length}
          </div>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Caminho de Download (opcional)
            </label>
            <Input
              value={downloadPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)}
              placeholder="Ex: C:/Downloads/Briefings"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deixe vazio para usar o diretório padrão
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeadless(e.target.checked)}
                className=""
              />
              <span className="text-sm text-foreground">Modo headless (sem interface gráfica)</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={continueOnError}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContinueOnError(e.target.checked)}
                className=""
              />
              <span className="text-sm text-foreground">Continuar mesmo com erros</span>
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
          <Alert className="mt-4 border-destructive bg-destructive/10">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div className="text-destructive">{error}</div>
          </Alert>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-card p-6 border border-border">
          <h3 className="text-lg font-semibold text-card-foreground mb-4">Preview do Download</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{preview.totalProjects}</div>
              <div className="text-sm text-muted-foreground">Projetos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{preview.targetFolder}</div>
              <div className="text-sm text-muted-foreground">Pasta Alvo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{preview.estimatedTime}</div>
              <div className="text-sm text-muted-foreground">Tempo Estimado</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{preview.downloadPath}</div>
              <div className="text-sm text-muted-foreground">Destino</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground">Projetos a processar:</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {preview.projects.map((project: BulkDownloadPreview['projects'][0], index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted border border-border">
                  <span className="text-sm text-foreground">Projeto {project.number}</span>
                  <Badge variant="outline">{project.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="bg-card p-6 border border-border">
          <h3 className="text-lg font-semibold mb-4 text-card-foreground">Resultado do Download</h3>
          
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-muted border border-border">
              <div className="text-2xl font-bold text-primary">{result.successful.length}</div>
              <div className="text-sm text-muted-foreground">Sucessos</div>
            </div>
            <div className="text-center p-4 bg-muted border border-border">
              <div className="text-2xl font-bold text-destructive">{result.failed.length}</div>
              <div className="text-sm text-muted-foreground">Falhas</div>
            </div>
            <div className="text-center p-4 bg-muted border border-border">
              <div className="text-2xl font-bold text-primary">{result.summary.totalFiles}</div>
              <div className="text-sm text-muted-foreground">Arquivos</div>
            </div>
            <div className="text-center p-4 bg-muted border border-border">
              <div className="text-2xl font-bold text-primary">{formatFileSize(result.summary.totalSize)}</div>
              <div className="text-sm text-muted-foreground">Tamanho Total</div>
            </div>
          </div>

          {/* Projetos Bem-sucedidos */}
          {result.successful.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-primary mb-3">✅ Projetos Processados com Sucesso</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.successful.map((project, index) => (
                  <div key={index} className="p-3 bg-muted border border-border">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-foreground">{project.projectName}</div>
                        <div className="text-sm text-muted-foreground">Projeto {project.projectNumber}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-primary font-medium">{project.filesDownloaded} arquivos</div>
                        <div className="text-muted-foreground">{formatFileSize(project.totalSize)}</div>
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
              <h4 className="font-medium text-destructive mb-3">❌ Projetos com Falha</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.failed.map((project, index) => (
                  <div key={index} className="p-3 bg-muted border border-border">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm text-foreground">Projeto {project.projectNumber}</div>
                        <div className="text-xs text-destructive mt-1">{project.error}</div>
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