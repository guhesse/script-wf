import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlayCircle, Settings, Upload, Share2, MessageSquare, Activity, Clock, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';

type TeamKey = 'carol' | 'giovana' | 'test';

type WorkflowAction = 'upload_asset' | 'share_asset' | 'comment_asset' | 'upload_finals' | 'comment_finals' | 'status' | 'hours';

interface UploadAssetParams { kind: 'upload_asset'; assetZipPath: string; selectedUser: TeamKey; }
interface ShareAssetParams { kind: 'share_asset'; selections: { folder: string; fileName: string }[]; selectedUser: TeamKey; }
interface CommentParams { kind: 'comment_asset' | 'comment_finals'; folder: string; fileName: string; commentType: string; selectedUser: TeamKey; }
interface UploadFinalsParams { kind: 'upload_finals'; finalMaterialPaths: string[]; selectedUser: TeamKey; }
interface StatusParams { kind: 'status'; deliverableStatus: string; }
interface HoursParams { kind: 'hours'; hours: number; note?: string; taskName?: string; }

// Allow intermediate UI editing states via generic record (will still be sent as-is to backend)
type StepParams =
    | UploadAssetParams
    | ShareAssetParams
    | CommentParams
    | UploadFinalsParams
    | StatusParams
    | HoursParams
    | (Record<string, unknown> & { kind?: string })
    | undefined;

interface WorkflowStep {
    action: WorkflowAction;
    enabled: boolean;
    params?: StepParams;
    description?: string;
    folder?: string;
    group?: string;
}

interface TimelineSectionProps {
    projectUrl: string;
    selectedUser: TeamKey;
    stagedPaths?: { assetZip?: string; finalMaterials?: string[] } | null;
}

const WORKFLOW_ICONS: Record<WorkflowAction, React.ComponentType<{ className?: string }>> = {
    upload_asset: Upload,
    share_asset: Share2,
    comment_asset: MessageSquare,
    upload_finals: Upload,
    comment_finals: MessageSquare,
    status: Activity,
    hours: Clock,
};

const DELIVERABLE_STATUS_OPTIONS = ['Round 1 Review', 'Round 2 Review', 'Extra Round Review', 'Delivered'];

export default function TimelineSection({ projectUrl, selectedUser, stagedPaths }: TimelineSectionProps) {
    const [steps, setSteps] = useState<WorkflowStep[]>([]);
    const [executing, setExecuting] = useState(false);
    // results shape depende do backend; usar tipo flexível estruturado mínimo
    const [results, setResults] = useState<{ success?: boolean; summary?: { successful: number; failed: number; skipped: number }; message?: string } | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { executeWorkflow } = useWorkfrontApi();

    // Build default steps when staging changes
    useEffect(() => {
        if (!stagedPaths?.assetZip || !stagedPaths?.finalMaterials) { setSteps([]); return; }
        const pdfFile = stagedPaths.finalMaterials.find(f => f.toLowerCase().endsWith('.pdf'));
        const pdfName = pdfFile ? pdfFile.split(/[/\\]/).pop() || 'arquivo.pdf' : 'arquivo.pdf';
        const zipName = stagedPaths.assetZip.split(/[/\\]/).pop() || 'arquivo.zip';
        setSteps([
            { action: 'upload_asset', enabled: true, params: { kind: 'upload_asset', assetZipPath: stagedPaths.assetZip, selectedUser }, description: 'Upload do ZIP para Asset Release', folder: 'Asset Release', group: 'asset' },
            { action: 'share_asset', enabled: true, params: { kind: 'share_asset', selections: [{ folder: 'Asset Release', fileName: zipName }], selectedUser }, description: 'Compartilhar ZIP', folder: 'Asset Release', group: 'asset' },
            { action: 'comment_asset', enabled: true, params: { kind: 'comment_asset', folder: 'Asset Release', fileName: zipName, commentType: 'assetRelease', selectedUser }, description: 'Comentário Asset Release', folder: 'Asset Release', group: 'asset' },
            { action: 'upload_finals', enabled: true, params: { kind: 'upload_finals', finalMaterialPaths: stagedPaths.finalMaterials, selectedUser }, description: `Upload de ${stagedPaths.finalMaterials.length} arquivos`, folder: 'Final Materials', group: 'finals' },
            { action: 'comment_finals', enabled: true, params: { kind: 'comment_finals', folder: 'Final Materials', fileName: pdfName, commentType: 'finalMaterials', selectedUser }, description: 'Comentário PDF Final', folder: 'Final Materials', group: 'finals' },
            { action: 'status', enabled: false, params: { kind: 'status', deliverableStatus: 'Delivered' }, description: 'Atualizar status', group: 'extra' },
            { action: 'hours', enabled: false, params: { kind: 'hours', hours: 1, note: 'Upload realizado', taskName: '' }, description: 'Lançar horas', group: 'extra' },
        ]);
    }, [stagedPaths, selectedUser]);

    const toggleStep = (i: number) => setSteps(p => p.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s));
    const updateStepParam = (i: number, key: string, value: unknown) => setSteps(prev => prev.map((s, idx) => {
        if (idx !== i) return s;
        if (!s.params || typeof s.params !== 'object') return s;
        const cloned: Record<string, unknown> = { ...s.params };
        cloned[key] = value;
        return { ...s, params: cloned as unknown as StepParams };
    }));

    const executeTimeline = async () => {
        if (!projectUrl || steps.length === 0) return;
        setExecuting(true); setResults(null);
        try { const result = await executeWorkflow({ projectUrl, steps, headless: false, stopOnError: false }); setResults(result); }
        catch (e) { setResults({ success: false, message: (e as Error).message }); }
        finally { setExecuting(false); }
    };

    // Presets
    const presetAssetOnly = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'asset' })));
    const presetFinalsOnly = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'finals' })));
    const presetFullFlow = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'asset' || s.group === 'finals' })));
    const presetStatusOnly = () => setSteps(p => p.map(s => ({ ...s, enabled: s.action === 'status' })));

    const enabledSteps = steps.filter(s => s.enabled);

    return (
        <div className="space-y-6">
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-card-foreground">
                        <div className="flex items-center gap-3">
                            <Settings className="w-4 h-4 text-primary" />
                            Timeline de Automação
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            {showAdvanced ? 'Ocultar' : 'Configurar'}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!stagedPaths && (
                        <div className="text-xs text-muted-foreground mb-4">Prepare os arquivos para habilitar as ações.</div>
                    )}
                    <div className="flex gap-2 mb-4 flex-wrap">
                        <Button variant="outline" size="sm" onClick={presetFullFlow}>Fluxo Completo</Button>
                        <Button variant="outline" size="sm" onClick={presetAssetOnly}>Apenas Asset Release</Button>
                        <Button variant="outline" size="sm" onClick={presetFinalsOnly}>Apenas Final Materials</Button>
                        <Button variant="outline" size="sm" onClick={presetStatusOnly}>Apenas Status</Button>
                        <Button variant="outline" size="sm" onClick={() => setSteps(prev => prev.map(s => ({ ...s, enabled: false })))}>Desabilitar Tudo</Button>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><FolderOpen className="w-4 h-4" />Asset Release</div>
                            {steps.filter(s => s.group === 'asset').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'opacity-100 bg-card' : 'opacity-50 bg-muted'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'upload_asset' && 'Upload ZIP'}
                                                    {step.action === 'share_asset' && 'Compartilhar'}
                                                    {step.action === 'comment_asset' && 'Comentar'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{step.description}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><FolderOpen className="w-4 h-4" />Final Materials</div>
                            {steps.filter(s => s.group === 'finals').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'opacity-100 bg-card' : 'opacity-50 bg-muted'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'upload_finals' && 'Upload Arquivos'}
                                                    {step.action === 'comment_finals' && 'Comentar PDF'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{step.description}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Settings className="w-4 h-4" />Ações Adicionais</div>
                            {steps.filter(s => s.group === 'extra').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'opacity-100 bg-card' : 'opacity-50 bg-muted'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'status' && 'Atualizar Status'}
                                                    {step.action === 'hours' && 'Lançar Horas'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{step.description}</div>
                                            </div>
                                        </div>
                                        {showAdvanced && step.enabled && (
                                            <div className="mt-3 pl-7 space-y-3">
                                                {step.action === 'status' && step.params && (step.params as StatusParams).kind === 'status' && (
                                                    <div className="flex items-center gap-3">
                                                        <Label className="text-xs w-24">Status:</Label>
                                                        <Select value={(step.params as StatusParams).deliverableStatus} onValueChange={v => updateStepParam(idx, 'deliverableStatus', v)}>
                                                            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                                                            <SelectContent>
                                                                {DELIVERABLE_STATUS_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                {step.action === 'hours' && step.params && (step.params as HoursParams).kind === 'hours' && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Horas:</Label>
                                                            <Input type="number" min={0.25} step={0.25} className="h-8 w-32" value={(step.params as HoursParams).hours ?? ''} onChange={e => updateStepParam(idx, 'hours', parseFloat(e.target.value))} />
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Nota:</Label>
                                                            <Input className="h-8" value={(step.params as HoursParams).note ?? ''} onChange={e => updateStepParam(idx, 'note', e.target.value)} />
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Tarefa:</Label>
                                                            <Input className="h-8" value={(step.params as HoursParams).taskName ?? ''} onChange={e => updateStepParam(idx, 'taskName', e.target.value)} placeholder="(opcional)" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="flex items-center gap-4 pt-2">
                <Button onClick={executeTimeline} disabled={executing || enabledSteps.length === 0}>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    {executing ? 'Executando...' : `Executar (${enabledSteps.length})`}
                </Button>
                {results && (
                    <Badge variant={results.success ? 'default' : 'destructive'}>
                        {results.success ? 'Sucesso' : 'Falhou'}
                    </Badge>
                )}
                {results?.summary && (
                    <div className="text-xs text-muted-foreground">{`OK: ${results.summary.successful} | Falhas: ${results.summary.failed} | Pulados: ${results.summary.skipped}`}</div>
                )}
            </div>
        </div>
    );
}