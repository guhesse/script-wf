import React, { useState } from 'react';
import { AlertTriangle, Download, FolderDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
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
  const [headless] = useState(true);
  // Novos estados para PPT
  const [generatePpt, setGeneratePpt] = useState(false);
  const [pptTestMode, setPptTestMode] = useState(false);
  // Opções avançadas removidas da UI por enquanto: continueOnError, keepFiles, organizeByDSID
  const [result, setResult] = useState<BulkDownloadResult | null>(null);
  interface ProgressItem {
    projectNumber?: number;
    status: 'pending' | 'running' | 'success' | 'fail' | 'canceled';
    stage?: string;
    percent: number;
    dsid?: string;
    queueIndex?: number;
    dsidProvisional?: boolean;
    pptFile?: string;
    pptTestMode?: boolean;
  }
  const [progressList, setProgressList] = useState<ProgressItem[]>([]);
  // helper removido; usaremos placeholders pendentes e atualizaremos conforme eventos
  const [error, setError] = useState<string>('');
  const [preview, setPreview] = useState<BulkDownloadPreview | null>(null);
  const [sseActive, setSseActive] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [mode, setMode] = useState<'pm' | 'studio'>('pm');


  const addUrlFieldAfter = (index: number) => {
    const newUrls = [...projectUrls];
    newUrls.splice(index + 1, 0, '');
    setProjectUrls(newUrls);
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

  // Extrai múltiplas URLs de um texto colado
  const parsePastedUrls = (text: string): string[] => {
    if (!text) return [];
    // Quebra por espaços, quebras de linha, vírgulas e ponto e vírgula
    const rawParts = text.split(/\s+|,|;|\n|\r/g).map(s => s.trim()).filter(Boolean);
    // Regex simples para URL Workfront (http/https + domínio + /project/ ou algo similar)
    const urlRegex = /https?:\/\/[^\s]+/i;
    const fromLines: string[] = [];
    for (const part of rawParts) {
      if (urlRegex.test(part)) fromLines.push(part);
    }
    return fromLines;
  };

  const handlePasteUrls = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = e.clipboardData.getData('text');
    const urls = parsePastedUrls(text);
    if (urls.length <= 1) return; // deixa comportamento normal para colar simples
    e.preventDefault();
    // Substitui campo atual pelo primeiro URL e insere o resto abaixo
    const unique = new Set<string>();
    const current = [...projectUrls];
    // Inclui já existentes preservando ordem
    for (const u of current) unique.add(u);
    const toInsert: string[] = [];
    urls.forEach(u => { if (!unique.has(u)) { unique.add(u); toInsert.push(u); } });
    if (toInsert.length === 0) return;
    current[index] = toInsert[0];
    if (toInsert.length > 1) {
      current.splice(index + 1, 0, ...toInsert.slice(1));
    }
    setProjectUrls(current.filter(x => x !== ''));
  };

  const getValidUrls = () => {
    return projectUrls.filter(url => url.trim() !== '');
  };


  const handleOpenFolderDialog = async () => {
    try {
      const q = downloadPath ? `?initial=${encodeURIComponent(downloadPath)}` : '';
      const resp = await fetch(`/api/select-folder${q}`);
      const data = await resp.json();
      if (data && data.success && !data.canceled && data.path) {
        setDownloadPath(data.path);
      }
    } catch {
      setError('Não foi possível abrir o seletor de pastas.');
    }
  };

  // Fluxo com SSE de progresso (inline por projeto)
  const handleDownloadWithProgress = async () => {
    const validUrls = getValidUrls();

    if (validUrls.length === 0) {
      setError('Adicione pelo menos uma URL de projeto');
      return;
    }

    try {
      setError('');
      setResult(null);
      setPreview(null);
      setSseActive(true);
      // Pré-popula a UI com placeholders pendentes para todos os projetos
      setProgressList(Array.from({ length: validUrls.length }, (_, i) => ({
        queueIndex: i + 1,
        status: 'pending',
        percent: 0,
        stage: 'Aguardando'
      })));

      // 1) Iniciar operação e obter operationId
      const startResp = await fetch('/api/bulk-download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectUrls: validUrls,
          downloadPath: downloadPath || undefined,
          headless,
          continueOnError: true,
          keepFiles: true,
          organizeByDSID: true,
          concurrency: 3,
          mode,
          generatePpt: generatePpt || pptTestMode, // se testMode marcado, força generate
          pptTestMode
        })
      });
      const startData = await startResp.json();
      if (!startData.success || !startData.operationId) {
        setSseActive(false);
        setError(startData.message || 'Falha ao iniciar operação de bulk');
        return;
      }
      setOperationId(startData.operationId as string);

      // Helpers: mapping de estágio -> label/percent
      const stageLabel = (stage?: string) => {
        if (stage === 'navigating-briefing-folder') return 'Navegando para pasta';
        if (stage === 'downloading-and-extracting') return 'Salvando arquivos';
        if (stage === 'organizing-files') return 'Organizando arquivos';
        if (stage === 'cancel-requested') return 'Cancelado (solicitado)';
        return stage || 'Processando';
      };
      const stagePercent = (stage?: string) => {
        if (stage === 'navigating-briefing-folder') return 25;
        if (stage === 'downloading-and-extracting') return 70;
        if (stage === 'organizing-files') return 90;
        return 10;
      };

      // 3) Conectar ao SSE
      const es = new EventSource(`/api/bulk-download/stream/${startData.operationId}`);

      const counters = { total: validUrls.length, started: 0, success: 0, fail: 0 };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const type = payload.type as string;
          const data = payload.data || {};

          if (type === 'start') {
            counters.total = data.total || validUrls.length;
          } else if (type === 'project-start') {
            counters.started += 1;
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              // Se já existe com esse projectNumber, atualiza; caso contrário, pega o primeiro pendente
              let idx = prev.findIndex(p => p.projectNumber === pn);
              if (idx < 0) idx = prev.findIndex(p => p.status === 'pending');
              if (idx < 0) {
                // fallback: adiciona no fim
                return [...prev, { projectNumber: pn, status: 'running', stage: 'Acessando informações do projeto', percent: 10 }];
              }
              const updated: ProgressItem = { ...prev[idx], projectNumber: pn, status: 'running', stage: 'Acessando informações do projeto', percent: 10 };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
          } else if (type === 'stage') {
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              const idx = prev.findIndex(p => p.projectNumber === pn);
              if (idx < 0) return prev; // sem mapeamento ainda
              const base: ProgressItem = prev[idx];
              const friendly = stageLabel(data.stage);
              const percent = stagePercent(data.stage);
              const status: ProgressItem['status'] = data.stage === 'cancel-requested' ? 'canceled' : base.status;
              const updated: ProgressItem = { ...base, stage: friendly, percent, status };
              if (idx >= 0) return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
              return [...prev, updated];
            });
          } else if (type === 'project-success') {
            counters.success += 1;
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              const idx = prev.findIndex(p => p.projectNumber === pn);
              const base: ProgressItem = idx >= 0 ? prev[idx] : { projectNumber: pn, status: 'running', percent: 90 };
              const updated: ProgressItem = { ...base, status: 'success', stage: 'Concluído', percent: 100 };
              if (idx >= 0) return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
              return [...prev, updated];
            });
          } else if (type === 'project-fail') {
            counters.fail += 1;
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              const idx = prev.findIndex(p => p.projectNumber === pn);
              const base: ProgressItem = idx >= 0 ? prev[idx] : { projectNumber: pn, status: 'running', percent: 90 };
              const updated: ProgressItem = { ...base, status: 'fail', stage: 'Falha', percent: base.percent ?? 90 };
              if (idx >= 0) return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
              return [...prev, updated];
            });
          } else if (type === 'project-meta') {
            // Atualiza DSID no progresso
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              let idx = prev.findIndex(p => p.projectNumber === pn);
              if (idx < 0) idx = prev.findIndex(p => p.status === 'pending');
              if (idx < 0) return prev;
              const base: ProgressItem = prev[idx];
              const updated: ProgressItem = {
                ...base,
                projectNumber: pn ?? base.projectNumber,
                dsid: data?.provisional ? undefined : (data.dsid as string | undefined),
                dsidProvisional: !!data?.provisional
              };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
          } else if (type === 'ppt') {
            const pn = data.projectNumber as number;
            setProgressList(prev => {
              const idx = prev.findIndex(p => p.projectNumber === pn);
              if (idx < 0) return prev;
              const base = prev[idx] as ProgressItem & { pptFile?: string; pptTestMode?: boolean };
              const updated = { ...base, pptFile: data.fileName as string, pptTestMode: !!data.testMode };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
          } else if (type === 'completed') {
            es.close();
            setSseActive(false);
            setOperationId(null);
          } else if (type === 'error') {
            es.close();
            setSseActive(false);
            setOperationId(null);
            setError(data.message || 'Erro na operação');
          }
        } catch {
          // ignorar parse errors
        }
      };

      es.onerror = () => {
        es.close();
        setSseActive(false);
        setOperationId(null);
        setError('Conexão de progresso encerrada');
      };

    } catch {
      setSseActive(false);
      setError('Erro ao iniciar operação com progresso');
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
        <div className="flex items-center gap-3 mb-4">
          <FolderDown className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Download em Massa - Briefings</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Faça download de todos os arquivos da pasta "05. Briefing" de múltiplos projetos simultaneamente.
          <br />
          <strong>Melhorias implementadas:</strong> Seleção mais robusta de arquivos, tratamento de interceptação de cliques, e opções para organização personalizada.
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
                onPaste={(e) => handlePasteUrls(e, index)}
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
              <Button
                onClick={() => addUrlFieldAfter(index)}
                variant="outline"
                size="sm"
                className="px-3"
                title="Adicionar nova URL abaixo"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <div className="text-xs text-muted-foreground space-y-1">
            <div>URLs válidas: {getValidUrls().length} de {projectUrls.length}</div>
            <div className="leading-4">Dica: você pode <strong>Ctrl + V</strong> várias URLs de uma vez (separe por quebra de linha, espaço, vírgula ou ponto e vírgula).</div>
          </div>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-1 gap-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Caminho de Download (opcional)
            </label>
            <div className="flex gap-2">
              <Input
                value={downloadPath}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)}
                placeholder="Ex: C:/Downloads/Briefings"
              />
              <Button type="button" variant="outline" onClick={handleOpenFolderDialog} title="Abrir seletor de pasta">
                <FolderOpen className="w-4 h-4 mr-1" />
                Abrir pasta
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium text-foreground mb-2">Organização de pastas</label>
                <div className="flex items-center gap-3">
                  <select
                    className="border border-border bg-background text-foreground text-sm p-2"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'pm' | 'studio')}
                  >
                    <option value="pm">PM</option>
                    <option value="studio">Studio</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {mode === 'pm' ? (
                  <pre className="whitespace-pre leading-4 p-2 border border-border bg-muted">{`DSID
├─ brief
├─ creatives
└─ ppt`}</pre>
                ) : (
                  <pre className="whitespace-pre leading-4 p-2 border border-border bg-muted">{`DSID
├─ brief
├─ assets
│  ├─ master
│  ├─ products
│  ├─ lifestyles
│  └─ screenfill
├─ deliverables
└─ sb`}</pre>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <label className="text-sm font-medium text-foreground">Opções PPT</label>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={generatePpt} onChange={e => { setGeneratePpt(e.target.checked); if (!e.target.checked) setPptTestMode(false); }} />
                  <span>Gerar PPT</span>
                </label>
                <label className={`flex items-center gap-2 text-sm ${!generatePpt ? 'opacity-50 cursor-not-allowed' : ''}`}>                <input type="checkbox" disabled={!generatePpt} checked={pptTestMode} onChange={e => setPptTestMode(e.target.checked)} />
                  <span>Modo Teste (Base64)</span>
                </label>
                {generatePpt && (
                  <span className="text-xs text-muted-foreground">{pptTestMode ? 'Será retornado como base64 via evento.' : 'Arquivo será salvo na pasta do projeto.'}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-3 mt-6">
          {/* Preview removido */}

          <Button
            onClick={handleDownloadWithProgress}
            variant="secondary"
            disabled={sseActive || getValidUrls().length === 0}
            className="flex items-center gap-2"
            title="Executa com progresso em tempo real"
          >
            <Download className="w-4 h-4" />
            {sseActive ? 'Em Progresso...' : 'Fazer Download'}
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

      {/* Progresso inline por projeto */}
      {sseActive && progressList.length > 0 && (
        <div className="bg-card p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-card-foreground">Progresso</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!operationId || progressList.every(p => p.status !== 'running')}
                onClick={async () => {
                  if (!operationId) return;
                  // dispara cancel para todos os que estiverem em execução
                  const running = progressList.filter(p => p.status === 'running' && p.projectNumber);
                  for (const r of running) {
                    try { await fetch(`/api/bulk-download/cancel/${operationId}/${r.projectNumber}`, { method: 'POST' }); } catch (e) { console.error('Erro ao cancelar', r.projectNumber, e); }
                  }
                }}
                title="Cancelar todos"
              >
                Cancelar todos
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {progressList.map((p) => (
              <div
                key={p.projectNumber || p.queueIndex}
                className={`p-3 border border-border ${p.status === 'success' ? 'bg-green-900 text-white' : 'bg-muted'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">
                    {p.dsid ? (
                      <>DSID {p.dsid}{p.projectNumber ? <span className="text-muted-foreground ml-2">(Projeto {p.projectNumber})</span> : null}</>
                    ) : p.projectNumber ? (
                      <>Projeto {p.projectNumber}</>
                    ) : (
                      <>Aguardando...</>
                    )}
                  </div>
                  <button
                    className="text-xs p-1 rounded hover:bg-background"
                    onClick={async () => {
                      if (!operationId) return;
                      try {
                        await fetch(`/api/bulk-download/cancel/${operationId}/${p.projectNumber}`, { method: 'POST' });
                      } catch (err) {
                        console.error('Erro ao cancelar projeto', err);
                      }
                    }}
                    disabled={p.status !== 'running'}
                    title="Cancelar este projeto"
                  >
                    <Trash2 className={`w-4 h-4 ${p.status !== 'running' ? 'opacity-50' : ''}`} />
                  </button>
                </div>
                <div className={`h-2 ${p.status === 'success' ? 'bg-green-950' : 'bg-background'} border border-border`}>
                  <div className={`h-2 ${p.status === 'fail' ? 'bg-destructive' : p.status === 'success' ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${Math.max(0, Math.min(100, p.percent))}%` }}></div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.stage || (p.status === 'success' ? 'Concluído' : p.status === 'fail' ? 'Falha' : p.status === 'canceled' ? 'Cancelado' : 'Processando')}</div>
                {p.pptFile && (
                  <div className="mt-2 text-xs font-mono">
                    PPT: {p.pptFile} {p.pptTestMode && <Badge variant="outline" className="ml-2">test</Badge>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Histórico simples: itens concluídos */}
          {progressList.some(p => p.status === 'success' || p.status === 'fail' || p.status === 'canceled') && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-2">Concluído</h4>
              <div className="space-y-2">
                {progressList
                  .filter(p => p.status === 'success' || p.status === 'fail' || p.status === 'canceled')
                  .map(p => (
                    <div key={`hist-${p.projectNumber || p.queueIndex}`} className="text-xs text-muted-foreground">
                      {p.dsid ? `DSID ${p.dsid}` : p.projectNumber ? `Projeto ${p.projectNumber}` : 'Projeto'} — {p.status === 'success' ? 'Concluído' : p.status === 'fail' ? 'Falha' : 'Cancelado'}
                    </div>
                  ))}
              </div>
            </div>
          )}
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