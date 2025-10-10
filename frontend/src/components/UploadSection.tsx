import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Upload, UploadCloud, Share2, MessageSquare, Activity, Clock,
    FileArchive,
    FileText,
    PlayCircle,
    FileVideo,
    FileImage,
    Trash2,
    UserCheck,
    Link, Loader2, CheckCircle2, XCircle, SkipForward,
    Files as FilesIcon,
} from 'lucide-react';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { useWorkflowProgress } from '@/hooks/useWorkflowProgress';
import TimelineSection from './TimelineSection';

type TeamKey = 'carol' | 'giovana' | 'test';

type UploadSectionProps = {
    projectUrl: string;
    setProjectUrl: (v: string) => void;
    selectedUser: TeamKey;
    setSelectedUser: (u: TeamKey) => void;
    currentProject: { title?: string; dsid?: string } | null;
};

const isZip = (f: File) => /\.zip$/i.test(f.name);
const isPdf = (f: File) => /\.pdf$/i.test(f.name);
const isImage = (f: File) => /\.(png|jpg|jpeg)$/i.test(f.name);
const isVideo = (f: File) => /\.(mp4|mov|mkv)$/i.test(f.name);




// interface UploadInfo {
//     fileName: string;
//     uploadId: string;
//     uploadUrl: string;
//     headers: Record<string, string>;
//     cdnUrl: string;
//     storagePath: string;
// }

export default function UploadSection({ projectUrl, setProjectUrl, selectedUser, setSelectedUser, currentProject }: UploadSectionProps) {
    const [showInternal] = useState(false); // modo debug desativado por padrão (toggle removido)
    const progress = useWorkflowProgress({ projectUrl });
    // Guardar o "plano" (sequência real de tasks enviadas) para enriquecer UI
    const [executedPlan, setExecutedPlan] = useState<Array<{ action: string; subtype?: 'zip' | 'finals'; params?: Record<string, unknown>; label: string }>>([]);

    // Estados para execução de workflow
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState<{ success?: boolean; summary?: { successful: number; failed: number; skipped: number }; message?: string } | null>(null);
    const [executeWorkflowFn, setExecuteWorkflowFn] = useState<(() => Promise<unknown>) | null>(null);
    const [workflowStats, setWorkflowStats] = useState({ readyCount: 0, totalCount: 0, hasInvalid: false });

    const [assetZip, setAssetZip] = useState<File | null>(null);
    const [finalMaterials, setFinalMaterials] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [stagedPaths, setStagedPaths] = useState<{ assetZip?: string; finalMaterials?: string[] } | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // estado de execução direta removido; execução ocorre via Timeline
    const zipInputRef = useRef<HTMLInputElement>(null);
    // input único para todos os arquivos (reuse zipInputRef)

    const { getActiveUploadJob, cancelUploadJob } = useWorkfrontApi();
    const { token } = useAppAuth();
    const [jobId, setJobId] = useState<string | null>(null);

    const hasPdfInFinals = useMemo(() => finalMaterials.some(isPdf), [finalMaterials]);
    const hasOtherInFinals = useMemo(() => finalMaterials.some(f => isImage(f) || isVideo(f)), [finalMaterials]);
    const isValidUrl = (url: string) => !!url && url.includes('workfront');

    // Log de debug para validação
    useEffect(() => {
        console.log('🔍 Validação de arquivos:', {
            assetZip: !!assetZip,
            finalMaterialsCount: finalMaterials.length,
            hasPdfInFinals,
            hasOtherInFinals,
            projectUrlValid: isValidUrl(projectUrl),
            arquivos: {
                zip: assetZip?.name,
                finals: finalMaterials.map(f => ({
                    name: f.name,
                    isPdf: isPdf(f),
                    isImage: isImage(f),
                    isVideo: isVideo(f)
                }))
            }
        });
    }, [assetZip, finalMaterials, hasPdfInFinals, hasOtherInFinals, projectUrl]);

    // Resetar stagedPaths quando arquivos mudam (usuário alterou seleção)
    useEffect(() => {
        // Se já tinha paths preparados mas os arquivos mudaram, limpar
        if (stagedPaths) {
            setStagedPaths(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetZip, finalMaterials]);

    const toArray = (files: FileList | File[]): File[] => Array.from(files instanceof FileList ? Array.from(files) : files);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        onDropFiles(e.dataTransfer.files);
    };

    const onDropFiles = (files: FileList | File[]) => {
        const arr = toArray(files);
        // Seleciona primeiro ZIP, se houver
        const firstZip = arr.find(isZip) || null;
        if (firstZip) setAssetZip(firstZip);
        // Demais finais (pdf/imagem/vídeo)
        const finals = arr.filter(f => !isZip(f) && (isPdf(f) || isImage(f) || isVideo(f)));
        if (finals.length) {
            setFinalMaterials(prev => {
                const map = new Map<string, File>();
                [...prev, ...finals].forEach(f => map.set(`${f.name}-${f.size}`, f));
                return Array.from(map.values());
            });
        }
    };

    const removeFinal = (idx: number) => setFinalMaterials(f => f.filter((_, i) => i !== idx));
    const clearAll = () => { setAssetZip(null); setFinalMaterials([]); setStagedPaths(null); };

    // Restaurar job ativo ao montar (por usuário atual simplificado)
    useEffect(() => {
        const saved = (() => { try { return JSON.parse(localStorage.getItem('wf_activeUploadJob') || 'null'); } catch { return null; } })();
        if (saved?.jobId) {
            // Ajustado: getActiveUploadJob não recebe parâmetros
            getActiveUploadJob().then(job => {
                if (job && job.id === saved.jobId) {
                    setJobId(job.id);
                    setStagedPaths(job.staged);
                    if (!projectUrl) setProjectUrl(job.projectUrl);
                } else {
                    localStorage.removeItem('wf_activeUploadJob');
                }
            });
        } else {
            // Ajustado: getActiveUploadJob não recebe parâmetros
            getActiveUploadJob().then(job => {
                if (job) {
                    setJobId(job.id);
                    setStagedPaths(job.staged);
                    if (!projectUrl) setProjectUrl(job.projectUrl);
                    try { localStorage.setItem('wf_activeUploadJob', JSON.stringify({ jobId: job.id, projectUrl: job.projectUrl })); } catch { /* ignore */ }
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async () => {
        if (!assetZip || finalMaterials.length === 0 || !hasPdfInFinals || !isValidUrl(projectUrl)) return;

        if (!token) {
            alert('Você precisa estar logado para fazer upload de arquivos');
            return;
        }

        setSubmitting(true);

        try {
            // Preparar dados no formato esperado pelo backend (lista única de files)
            const allFiles = [
                { name: assetZip.name, size: assetZip.size, type: assetZip.type, isZip: true },
                ...finalMaterials.map(f => ({ name: f.name, size: f.size, type: f.type, isZip: false }))
            ];

            const requestBody = {
                files: allFiles,
                projectUrl,
                selectedUser
            };

            console.log('🐛 Enviando para /api/upload/prepare:', requestBody);

            // Gerar URLs de upload CDN
            const prepareResponse = await fetch('/api/upload/prepare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!prepareResponse.ok) {
                throw new Error(`Erro ao preparar upload: ${prepareResponse.statusText}`);
            }

            const result = await prepareResponse.json();

            if (result.success) {
                // Fazer upload de cada arquivo para o servidor local
                const allFiles = [assetZip, ...finalMaterials];
                const realPaths: string[] = [];

                for (let i = 0; i < allFiles.length; i++) {
                    const file = allFiles[i];
                    const uploadInfo = result.uploads[i];

                    console.log(`🔄 Upload ${i + 1}/${allFiles.length}:`, {
                        fileName: file.name,
                        uploadId: uploadInfo.uploadId,
                        uploadUrl: uploadInfo.uploadUrl,
                        expectedPath: uploadInfo.storagePath
                    });

                    // Upload para servidor local usando multipart/form-data
                    const formData = new FormData();
                    formData.append('file', file);

                    const uploadResponse = await fetch(uploadInfo.uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text();
                        console.error(`❌ Erro no upload de ${file.name}:`, errorText);
                        throw new Error(`Erro no upload de ${file.name}: ${uploadResponse.statusText}`);
                    }

                    // Capturar o caminho real retornado pelo servidor
                    const uploadResult = await uploadResponse.json();
                    
                    // Normalizar path para usar barras normais
                    const normalizedPath = uploadResult.path.replace(/\\/g, '/');
                    realPaths.push(normalizedPath);

                    console.log(`✅ Arquivo ${file.name} enviado:`, {
                        originalPath: uploadResult.path,
                        normalizedPath,
                        uploadId: uploadInfo.uploadId
                    });
                }

                // Usar os caminhos REAIS retornados pelo servidor
                const assetZipPath = realPaths.find(path => path.toLowerCase().endsWith('.zip'));
                const finalMaterialPaths = realPaths.filter(path => !path.toLowerCase().endsWith('.zip'));

                const staged = {
                    assetZip: assetZipPath,
                    finalMaterials: finalMaterialPaths
                };

                console.log('� Paths preparados:', {
                    allPaths: realPaths,
                    staged,
                    selectedUser,
                    jobId: result.jobId
                });

                setStagedPaths(staged);
                if (result.jobId) {
                    setJobId(result.jobId);
                }

                console.log('✅ Arquivos preparados com sucesso! Agora configure e execute o workflow na Timeline.');
            }
        } catch (error) {
            console.error('Erro no upload:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            alert(`Erro no upload: ${errorMessage}`);
        } finally {
            setSubmitting(false);
        }
    };

    // (Execução direta de upload removida; usar TimelineSection para acionar workflow)

    const handleCancel = async () => {
        if (!jobId) return;
        // Ajustado: cancelUploadJob aceita apenas jobId
        const ok = await cancelUploadJob(jobId);
        if (ok) {
            clearAll();
            setJobId(null);
        }
    };

    const handleExecute = async () => {
        if (!executeWorkflowFn) return;
        setExecuting(true);
        setResults(null);

        try {
            const result = await executeWorkflowFn();
            setResults(result as typeof results);
        } catch (e) {
            setResults({ success: false, message: (e as Error).message });
        } finally {
            setExecuting(false);
        }
    };

    const handleExecuteReady = useCallback((fn: () => Promise<unknown>, stats: { readyCount: number; totalCount: number; hasInvalid: boolean }) => {
        setExecuteWorkflowFn(() => fn);
        setWorkflowStats(stats);
    }, []);

    return (
        <div className="space-y-6">

            {/* URL do Projeto + Seleção de Equipe (unificados) */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Link className="w-4 h-4 text-primary" />
                        URL do Projeto (Documentos Workfront)
                    </CardTitle>
                </CardHeader>
                <CardContent className='space-y-6'>
                    {currentProject && (
                        <div className="mb-4 p-3 bg-muted border border-border rounded">
                            <div className="text-sm text-foreground"><strong>Título:</strong> {currentProject.title}</div>
                            {currentProject.dsid && (
                                <div className="text-sm text-foreground mt-1 flex items-center gap-2">
                                    <strong>DSID:</strong>
                                    <Badge variant="outline" className="text-xs">{currentProject.dsid}</Badge>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 items-center">
                        <Input
                            type="url"
                            value={projectUrl}
                            onChange={(e) => setProjectUrl(e.target.value)}
                            placeholder="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/..."
                            className="flex-1"
                        />
                        <TeamBadge selectedUser={selectedUser} setSelectedUser={setSelectedUser} />
                    </div>
                    {projectUrl && !isValidUrl(projectUrl) && (
                        <p className="text-destructive text-sm mt-2">URL deve ser da página de documentos do Workfront</p>
                    )}

                </CardContent>
            </Card>


            {/* Grid com Upload (esquerda) e Timeline (direita) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Coluna esquerda: Upload */}
                <Card
                    className={`border-l-primary bg-card border-border h-full transition-all duration-200 ${dragOver ? 'border-primary bg-primary/5 shadow-lg' : ''
                        }`}
                    onDragOver={(assetZip || finalMaterials.length > 0) ? handleDragOver : undefined}
                    onDragLeave={(assetZip || finalMaterials.length > 0) ? handleDragLeave : undefined}
                    onDrop={(assetZip || finalMaterials.length > 0) ? handleDrop : undefined}
                >
                    <CardHeader>
                        <CardTitle className="flex items-center text-card-foreground gap-3">
                            <FilesIcon className="w-4 h-4 text-primary" />
                            Arquivos do Projeto
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Área de drop inicial (apenas quando não há arquivos) */}
                        {!assetZip && finalMaterials.length === 0 && (
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`rounded border border-dashed p-6 text-center h-[450px] transition-all duration-200 ${dragOver
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-muted/40 hover:bg-muted/70 scale-[1.02]'
                                    }`}
                            >
                                <div className="flex flex-col items-center h-full justify-center gap-2">
                                    <FileArchive className="w-8 h-8 text-primary" />
                                    <div className="text-sm text-muted-foreground">Arraste seus arquivos de Asset Release (zip) e de Final Material (pdf, mp4, png, jpeg)</div>
                                    <div className="flex gap-2 flex-wrap">
                                        <input
                                            ref={zipInputRef}
                                            type="file"
                                            accept=".zip,.pdf,.png,.jpg,.jpeg,.mp4,.mov,.mkv"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => e.target.files && onDropFiles(e.target.files)}
                                        />
                                        <Button variant="secondary" onClick={() => zipInputRef.current?.click()}>
                                            <Upload className="w-4 h-4 mr-2" /> Selecionar Arquivos
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Input oculto para seleção de arquivos (quando já há arquivos) */}
                        {(assetZip || finalMaterials.length > 0) && (
                            <input
                                ref={zipInputRef}
                                type="file"
                                accept=".zip,.pdf,.png,.jpg,.jpeg,.mp4,.mov,.mkv"
                                multiple
                                className="hidden"
                                onChange={(e) => e.target.files && onDropFiles(e.target.files)}
                            />
                        )}

                        {/* ScrollArea para lista de arquivos */}
                        {(assetZip || finalMaterials.length > 0) && (
                            <ScrollArea className="h-[450px] pr-4">

                                {/* ZIP selecionado */}
                                {assetZip && (
                                    <div className="mt-4">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">Asset Release (ZIP)</div>
                                        <div className="flex items-center justify-between rounded border border-border p-3">
                                            <div className="flex items-center gap-2 text-sm">
                                                <FileArchive className="w-4 h-4" />
                                                <div className="flex flex-col">
                                                    <span className="text-foreground">{assetZip.name}</span>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{(assetZip.size / 1024 / 1024).toFixed(1)} MB</span>
                                                        <Badge variant="secondary" className="text-xs">
                                                            {assetZip.size > 20 * 1024 * 1024 ? 'Grande (upload pode demorar)' : 'Tamanho normal'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => setAssetZip(null)}><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                )}

                                {/* Finals list */}
                                {finalMaterials.length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">Final Materials</div>
                                        <div className="space-y-2">
                                            {finalMaterials.map((f, idx) => {
                                                const fileSizeMB = (f.size / 1024 / 1024).toFixed(1);
                                                return (
                                                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between rounded border border-border p-3">
                                                        <div className="flex items-center gap-2 text-sm">
                                                            {isPdf(f) ? <FileText className="w-4 h-4" /> : isImage(f) ? <FileImage className="w-4 h-4" /> : <FileVideo className="w-4 h-4" />}
                                                            <div className="flex flex-col">
                                                                <span className="text-foreground">{f.name}</span>
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <span>{fileSizeMB} MB</span>
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        {f.size > 20 * 1024 * 1024 ? 'Grande (upload pode demorar)' : 'Tamanho normal'}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button variant="ghost" size="icon" onClick={() => removeFinal(idx)}><Trash2 className="w-4 h-4" /></Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Alerts de obrigatoriedade */}
                                {(!assetZip || !hasPdfInFinals || !hasOtherInFinals) && (
                                    <Alert className="mt-3 border-destructive/20 bg-destructive/10">
                                        <AlertDescription>
                                            {!assetZip && 'Inclua 1 arquivo ZIP para Asset Release. '}
                                            {!hasPdfInFinals && 'Inclua pelo menos 1 PDF nos Final Materials. '}
                                            {!hasOtherInFinals && 'Inclua pelo menos 1 arquivo de outro formato (imagem/vídeo) nos Final Materials.'}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Botão para adicionar mais arquivos */}
                                <div className="mt-4 flex justify-center">
                                    <Button variant="outline" size="sm" onClick={() => zipInputRef.current?.click()}>
                                        <Upload className="w-4 h-4 mr-2" /> Adicionar mais arquivos
                                    </Button>
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>

                {/* Coluna direita: Timeline */}
                <TimelineSection
                    projectUrl={projectUrl}
                    selectedUser={selectedUser}
                    stagedPaths={stagedPaths}
                    onPlanChange={setExecutedPlan}
                    onExecuteReady={handleExecuteReady}
                />
            </div>
            {/* Barra de Progresso Global */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-card-foreground">
                        <div className="flex items-center gap-3">
                            <Activity className="w-4 h-4 text-primary" /> Execução (tempo real)
                        </div>
                        <Badge>
                            {progress.percent}%
                        </Badge>

                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Progress value={progress.percent} className="h-2" />
                    {/* Removed log details area */}
                    {/* Lista de tasks lineares (usando id/display) */}
                    {progress.tasks && progress.tasks.length > 0 && (
                        <div className="flex flex-col gap-1 pt-1">
                            {/* Toggle visão interna */}
                            <div className="flex justify-end pr-1 pb-1" />
                            {/* Agrupamento por etapa de alto nível */}
                            {(!showInternal && executedPlan.length > 0) ? (() => {
                                // Ordena tarefas internas
                                const sorted = progress.tasks.slice().sort((a, b) => a.stepIndex - b.stepIndex);
                                interface Group { action: string; tasks: typeof sorted; }
                                // Cria grupos contíguos por action
                                const rawGroups: Group[] = [];
                                let current: Group | null = null;
                                for (const t of sorted) {
                                    if (!current || current.action !== t.action) {
                                        current = { action: t.action, tasks: [] as typeof sorted };
                                        rawGroups.push(current);
                                    }
                                    current.tasks.push(t);
                                }
                                // Associa grupos à ordem do executedPlan (matching por action sequencial)
                                const usedGroupIdx = new Set<number>();
                                const highLevel = executedPlan.map((p, idx) => {
                                    const groupIdx = rawGroups.findIndex((g, i) => !usedGroupIdx.has(i) && g.action === (p.action));
                                    if (groupIdx >= 0) usedGroupIdx.add(groupIdx);
                                    const g = groupIdx >= 0 ? rawGroups[groupIdx] : null;
                                    const tasks = g ? g.tasks : [];
                                    // Deriva status agregado
                                    let status: string = 'pending';
                                    if (tasks.length) {
                                        if (tasks.some(t => t.status === 'error')) status = 'error';
                                        else if (tasks.some(t => t.status === 'running')) status = 'running';
                                        else if (tasks.every(t => t.status === 'skip')) status = 'skip';
                                        else if (tasks.every(t => t.status === 'success')) status = 'success';
                                        else status = 'pending';
                                    }
                                    const durationMs = tasks.reduce((acc, t) => acc + (t.durationMs || 0), 0) || undefined;
                                    // Reaproveita lógica de detalhes existente
                                    const pseudoTask: { id: string; action: string; display: string; status: string; message?: string; durationMs?: number } = { id: `${p.action}-hl-${idx}`, action: p.action, display: p.label || p.action, status, message: tasks[tasks.length - 1]?.message, durationMs };
                                    return { plan: p, pseudo: pseudoTask, tasks };
                                });
                                return highLevel.map(({ plan, pseudo, tasks }) => {
                                    const t = pseudo;
                                    const Icon = plan.subtype === 'finals' && plan.action === 'upload' ? UploadCloud : plan.action === 'upload' ? Upload : plan.action === 'share' ? Share2 : plan.action === 'comment' ? MessageSquare : plan.action === 'status' ? Activity : Clock;
                                    const baseColor = t.status === 'success' ? 'text-emerald-500' : t.status === 'error' ? 'text-destructive' : t.status === 'skip' ? 'text-amber-500' : t.status === 'running' ? 'text-primary' : 'text-muted-foreground';
                                    const bg = t.status === 'running' ? 'bg-primary/5' : t.status === 'success' ? 'bg-emerald-500/5' : t.status === 'error' ? 'bg-destructive/10' : t.status === 'skip' ? 'bg-amber-500/10' : 'bg-muted/10';
                                    const statusIcon = t.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : t.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : t.status === 'error' ? <XCircle className="w-3 h-3" /> : t.status === 'skip' ? <SkipForward className="w-3 h-3" /> : null;
                                    const title = `${t.display} • ${t.status}` + (t.durationMs ? ` • ${progress.formatDuration(t.durationMs)}` : '') + (t.message ? `\n${t.message}` : '');
                                    const planItem = plan;
                                    const details = (() => {
                                        if (!planItem) return null;
                                        const p = planItem.params || {} as Record<string, unknown>;
                                        const userLabel = typeof p.selectedUser === 'string' ? (p.selectedUser === 'carol' ? 'Equipe Carolina' : p.selectedUser === 'giovana' ? 'Equipe Giovana' : 'Usuário Teste') : undefined;
                                        if (planItem.action === 'upload' && planItem.subtype === 'zip') {
                                            if (p.assetZipPath) {
                                                const name = String(p.assetZipPath).split(/[/\\]/).pop();
                                                return `Subindo arquivo: ${name}${userLabel ? ' · ' + userLabel : ''}`;
                                            }
                                        }
                                        if (planItem.action === 'upload' && planItem.subtype === 'finals') {
                                            if (Array.isArray(p.finalMaterialPaths)) {
                                                const all = (p.finalMaterialPaths as unknown as string[]).map(f => f.split(/[/\\]/).pop());
                                                const multi = all.join('\n');
                                                return `Upload finais:\n${multi}${userLabel ? '\n' + userLabel : ''}`;
                                            }
                                        }
                                        if (planItem.action === 'share') {
                                            const selections = (p.selections as Array<{ fileName?: string }> | undefined) || [];
                                            const files = selections.map(s => s.fileName).filter(Boolean).join('\n');
                                            return `Compartilhando ${selections.length} arquivo(s)${files ? ':\n' + files : ''}${userLabel ? '\n' + userLabel : ''}`;
                                        }
                                        if (planItem.action === 'comment') {
                                            const ct = p.commentType as string | undefined;
                                            const preview = (p.rawHtml as string | undefined) || '';
                                            return preview.trim() || `Comentário ${ct || ''}`;
                                        }
                                        if (planItem.action === 'status') {
                                            return `Novo status: ${p.deliverableStatus}`;
                                        }
                                        if (planItem.action === 'hours') {
                                            // mostrar com vírgula
                                            const hrs = typeof p.hours === 'number' ? p.hours.toString().replace('.', ',') : p.hours;
                                            const task = p.taskName ? ` (${p.taskName})` : '';
                                            return `Horas: ${hrs}${task}${p.note ? ' · ' + p.note : ''}`;
                                        }
                                        return null;
                                    })();
                                    const countInfo = tasks.length > 1 ? ` (${tasks.filter(x => x.status === 'success').length}/${tasks.length})` : '';
                                    return (
                                        <div key={t.id} className={`flex items-center gap-3 border rounded px-3 py-2 ${bg}`} title={title}>
                                            <Icon className={`w-4 h-4 ${baseColor}`} />
                                            <div className="flex-1 text-xs flex flex-col gap-0.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium tracking-wide capitalize">{t.display}{countInfo}</span>
                                                    <span className={`flex items-center gap-1 text-[10px] ${baseColor}`}>
                                                        {statusIcon}{t.status}
                                                        {t.durationMs && t.status === 'success' && <span className="text-muted-foreground">{progress.formatDuration(t.durationMs)}</span>}
                                                    </span>
                                                </div>
                                                {details && <div className="text-[10px] text-muted-foreground whitespace-pre-wrap" title={details}>{details}</div>}
                                                {t.message && <div className="text-[10px] text-muted-foreground truncate" >{t.message}</div>}
                                            </div>
                                        </div>
                                    );
                                });
                            })() : (
                                // Visão interna (original): todas subtarefas
                                progress.tasks.slice().sort((a, b) => a.stepIndex - b.stepIndex).map(t => {
                                    const Icon = t.action === 'upload' ? Upload : t.action === 'share' ? Share2 : t.action === 'comment' ? MessageSquare : t.action === 'status' ? Activity : Clock;
                                    const baseColor = t.status === 'success' ? 'text-emerald-500' : t.status === 'error' ? 'text-destructive' : t.status === 'skip' ? 'text-amber-500' : t.status === 'running' ? 'text-primary' : 'text-muted-foreground';
                                    const bg = t.status === 'running' ? 'bg-primary/5' : t.status === 'success' ? 'bg-emerald-500/5' : t.status === 'error' ? 'bg-destructive/10' : t.status === 'skip' ? 'bg-amber-500/10' : 'bg-muted/10';
                                    const statusIcon = t.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : t.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : t.status === 'error' ? <XCircle className="w-3 h-3" /> : t.status === 'skip' ? <SkipForward className="w-3 h-3" /> : null;
                                    const title = `${t.display} • ${t.status}` + (t.durationMs ? ` • ${progress.formatDuration(t.durationMs)}` : '') + (t.message ? `\n${t.message}` : '');
                                    return (
                                        <div key={t.id} className={`flex items-center gap-3 border rounded px-3 py-2 ${bg}`} title={title}>
                                            <Icon className={`w-4 h-4 ${baseColor}`} />
                                            <div className="flex-1 text-xs flex flex-col gap-0.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium tracking-wide capitalize">{t.display}</span>
                                                    <span className={`flex items-center gap-1 text-[10px] ${baseColor}`}>
                                                        {statusIcon}{t.status}
                                                        {t.durationMs && t.status === 'success' && <span className="text-muted-foreground">{progress.formatDuration(t.durationMs)}</span>}
                                                    </span>
                                                </div>
                                                {t.message && <div className="text-[10px] text-muted-foreground truncate" >{t.message}</div>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Botões de Ação (abaixo dos cards) */}
            <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        onClick={handleSubmit}
                        disabled={!assetZip || finalMaterials.length === 0 || !hasPdfInFinals || !hasOtherInFinals || !isValidUrl(projectUrl) || submitting}
                    >
                        <Upload className="w-4 h-4 mr-2" /> {stagedPaths ? 'Arquivos Preparados ✓' : 'Preparar Arquivos'}
                    </Button>
                    <Button variant="outline" onClick={clearAll} disabled={submitting}>Limpar</Button>
                    {jobId && (
                        <Button variant="destructive" onClick={handleCancel} disabled={submitting}>Cancelar</Button>
                    )}
                    <Button onClick={handleExecute} disabled={executing || workflowStats.readyCount === 0}>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        {executing ? 'Executando...' : `Executar (${workflowStats.readyCount}${workflowStats.hasInvalid ? ` de ${workflowStats.totalCount}` : ''})`}
                    </Button>
                    {results && (
                        <Badge variant={results.success ? 'default' : 'destructive'}>
                            {results.success ? 'Sucesso' : 'Falhou'}
                        </Badge>
                    )}
                    {results?.summary && (
                        <div className="text-xs text-muted-foreground">
                            {`OK: ${results.summary.successful} | Falhas: ${results.summary.failed} | Pulados: ${results.summary.skipped}`}
                        </div>
                    )}
                </div>

                {!stagedPaths && (
                    <Alert className="border-primary/20 bg-primary/5">
                        <AlertDescription className="text-sm">
                            Você pode já lançar Status e Hours na Timeline mesmo sem preparar arquivos. (Prepare arquivos para habilitar Upload / Comments.)
                        </AlertDescription>
                    </Alert>
                )}
            </div>
        </div>
    );
}

// Componente de badge/popover para seleção de equipe, inspirado no RoundBadge
function TeamBadge({ selectedUser, setSelectedUser }: { selectedUser: TeamKey; setSelectedUser: (u: TeamKey) => void }) {
    const [open, setOpen] = useState(false);

    const teams: { key: TeamKey; label: string; count: number }[] = [
        { key: 'carol', label: 'Equipe Completa (Carol)', count: 7 },
        { key: 'giovana', label: 'Equipe Reduzida (Giovana)', count: 3 },
        { key: 'test', label: 'Teste (Gustavo)', count: 1 },
    ];

    const current = teams.find(t => t.key === selectedUser) ?? teams[0];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-indigo-900/50 border border-indigo-600/40 text-indigo-300 text-xs hover:bg-indigo-900/70 transition-colors cursor-pointer"
                    title="Selecionar equipe para comentário"
                >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span className="whitespace-nowrap">{current.label}</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{current.count} pessoas</Badge>
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-72"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            >
                <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                        {teams.map((t) => (
                            <button
                                key={t.key}
                                onClick={(e) => { e.stopPropagation(); setSelectedUser(t.key); setOpen(false); }}
                                className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-all
                                    ${selectedUser === t.key
                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                                        : 'bg-background border border-border hover:bg-accent hover:border-primary/50'}
                                `}
                            >
                                <span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> {t.label}</span>
                                <Badge variant={selectedUser === t.key ? 'secondary' : 'outline'} className="text-[10px] h-5 px-1.5">{t.count} pessoas</Badge>
                            </button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
