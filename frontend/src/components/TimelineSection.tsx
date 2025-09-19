import { useState, useEffect, useMemo } from 'react';
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

const ALLOWED_STATUS = ['Round 1 Review', 'Round 2 Review', 'Extra Round Review', 'Delivered'] as const;
type AllowedStatus = typeof ALLOWED_STATUS[number];
// Substitui constante antiga (mantém se usada em outro lugar)
const DELIVERABLE_STATUS_OPTIONS = ALLOWED_STATUS;

export default function TimelineSection({ projectUrl, selectedUser, stagedPaths }: TimelineSectionProps) {
    // Passos base sempre presentes (params podem ser preenchidos depois)
    const baseSteps: WorkflowStep[] = [
        { action: 'upload_asset',   enabled: false, params: { kind: 'upload_asset', assetZipPath: '' , selectedUser }, description: 'Upload do ZIP para Asset Release', folder: 'Asset Release', group: 'asset' },
        { action: 'share_asset',    enabled: false, params: { kind: 'share_asset', selections: [], selectedUser },      description: 'Compartilhar ZIP',               folder: 'Asset Release', group: 'asset' },
        { action: 'comment_asset',  enabled: false, params: { kind: 'comment_asset', folder: 'Asset Release', fileName: '', commentType: 'assetRelease', selectedUser }, description: 'Comentário Asset Release', folder: 'Asset Release', group: 'asset' },
        { action: 'upload_finals',  enabled: false, params: { kind: 'upload_finals', finalMaterialPaths: [], selectedUser }, description: 'Upload de finais',          folder: 'Final Materials', group: 'finals' },
        { action: 'comment_finals', enabled: false, params: { kind: 'comment_finals', folder: 'Final Materials', fileName: '', commentType: 'finalMaterials', selectedUser }, description: 'Comentário PDF Final', folder: 'Final Materials', group: 'finals' },
        { action: 'status',         enabled: false, params: { kind: 'status', deliverableStatus: 'Round 1 Review' }, description: 'Atualizar status', group: 'extra' },
        { action: 'hours',          enabled: false, params: { kind: 'hours', hours: 1, note: '', taskName: '' },        description: 'Lançar horas',     group: 'extra' },
    ];

    const [steps, setSteps] = useState<WorkflowStep[]>(baseSteps);
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState<{ success?: boolean; summary?: { successful: number; failed: number; skipped: number }; message?: string } | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { executeWorkflow } = useWorkfrontApi();

    // Preenche params quando staging disponível
    useEffect(() => {
        if (!stagedPaths) return;
        setSteps(prev => prev.map(s => {
            if (s.action === 'upload_asset' && stagedPaths.assetZip) {
                return { ...s, params: { ...(s.params as UploadAssetParams), assetZipPath: stagedPaths.assetZip } };
            }
            if (s.action === 'share_asset' && stagedPaths.assetZip) {
                const zipName = stagedPaths.assetZip.split(/[/\\]/).pop() || '';
                return { ...s, params: { ...(s.params as ShareAssetParams), selections: [{ folder: 'Asset Release', fileName: zipName }], selectedUser } };
            }
            if (s.action === 'comment_asset' && stagedPaths.assetZip) {
                const zipName = stagedPaths.assetZip.split(/[/\\]/).pop() || '';
                return { ...s, params: { ...(s.params as CommentParams), fileName: zipName, folder: 'Asset Release', commentType: 'assetRelease', selectedUser } };
            }
            if (s.action === 'upload_finals' && stagedPaths.finalMaterials) {
                return { ...s, params: { ...(s.params as UploadFinalsParams), finalMaterialPaths: stagedPaths.finalMaterials, selectedUser } };
            }
            if (s.action === 'comment_finals' && stagedPaths.finalMaterials) {
                const pdf = stagedPaths.finalMaterials.find(f => f.toLowerCase().endsWith('.pdf'));
                const pdfName = pdf ? pdf.split(/[/\\]/).pop() || 'arquivo.pdf' : '';
                return { ...s, params: { ...(s.params as CommentParams), fileName: pdfName, folder: 'Final Materials', commentType: 'finalMaterials', selectedUser } };
            }
            if (s.action === 'status') {
                return { ...s, params: { ...(s.params as StatusParams) } };
            }
            if (s.action === 'hours') {
                return { ...s, params: { ...(s.params as HoursParams) } };
            }
            return s;
        }));
    }, [stagedPaths, selectedUser]);

    // Sanitiza status
    useEffect(() => {
        setSteps(prev => prev.map(s => {
            if (s.action === 'status') {
                const val = (s.params as StatusParams).deliverableStatus;
                if (!ALLOWED_STATUS.includes(val as AllowedStatus)) {
                    return { ...s, params: { ...(s.params as StatusParams), deliverableStatus: 'Round 1 Review' } };
                }
            }
            return s;
        }));
    }, [steps.length]);

    const toggleStep = (i: number) =>
        setSteps(p => p.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s));

    const updateStepParam = (i: number, key: string, value: unknown) =>
        setSteps(prev => prev.map((s, idx) => {
            if (idx !== i) return s;
            if (!s.params || typeof s.params !== 'object') return s;
            return { ...s, params: { ...(s.params as any), [key]: value } };
        }));

    // Valida se um passo tem params suficientes para execução
    const isParamReady = (step: WorkflowStep) => {
        if (!step.params) return false;
        if (step.action === 'upload_asset')   return !!(step.params as UploadAssetParams).assetZipPath;
        if (step.action === 'share_asset')    return (step.params as ShareAssetParams).selections?.length > 0;
        if (step.action === 'comment_asset')  return !!(step.params as CommentParams).fileName;
        if (step.action === 'upload_finals')  return (step.params as UploadFinalsParams).finalMaterialPaths?.length > 0;
        if (step.action === 'comment_finals') return !!(step.params as CommentParams).fileName;
        if (step.action === 'status')         return !!(step.params as StatusParams).deliverableStatus;
        if (step.action === 'hours')          return (step.params as HoursParams).hours > 0;
        return false;
    };

    const enabledSteps = steps.filter(s => s.enabled);
    const readyEnabledSteps = enabledSteps.filter(isParamReady);
    const hasInvalidEnabled = enabledSteps.length > 0 && readyEnabledSteps.length !== enabledSteps.length;

    const executeTimeline = async () => {
        if (!projectUrl || readyEnabledSteps.length === 0) return;
        setExecuting(true); setResults(null);
        try {
            const result = await executeWorkflow({
                projectUrl,
                steps: readyEnabledSteps, // envia só os válidos
                headless: false,
                stopOnError: false
            });
            setResults(result);
        } catch (e) {
            setResults({ success: false, message: (e as Error).message });
        } finally {
            setExecuting(false);
        }
    };

    // Presets
    const presetAssetOnly   = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'asset' })));
    const presetFinalsOnly  = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'finals' })));
    const presetFullFlow    = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'asset' || s.group === 'finals' })));
    const presetStatusOnly  = () => setSteps(p => p.map(s => ({ ...s, enabled: s.action === 'status' })));
    const presetStatusHours = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'extra' })));


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
                        <div className="text-xs text-muted-foreground mb-3">
                            Para executar Upload / Share / Comments faca o preparo (Preparar Arquivos). Você ainda pode configurar tudo agora.
                        </div>
                    )}
                    <div className="flex gap-2 mb-4 flex-wrap">
                        <Button variant="outline" size="sm" onClick={presetFullFlow}>Fluxo Completo</Button>
                        <Button variant="outline" size="sm" onClick={presetAssetOnly}>Apenas Asset Release</Button>
                        <Button variant="outline" size="sm" onClick={presetFinalsOnly}>Apenas Final Materials</Button>
                        <Button variant="outline" size="sm" onClick={presetStatusOnly}>Só Status</Button>
                        <Button variant="outline" size="sm" onClick={presetStatusHours}>Status + Hours</Button>
                        <Button variant="outline" size="sm" onClick={() => setSteps(prev => prev.map(s => ({ ...s, enabled: false })))}>Desabilitar Tudo</Button>
                    </div>

                    {hasInvalidEnabled && (
                        <div className="text-xs text-amber-600 mb-3">
                            Alguns passos habilitados não possuem arquivos/params preparados e serão ignorados.
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Asset */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <FolderOpen className="w-4 h-4" />Asset Release
                                {!stagedPaths && <span className="text-[10px] text-muted-foreground">(aguardando preparo)</span>}
                            </div>
                            {steps.filter(s => s.group === 'asset').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                const ready = isParamReady(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'} ${ready ? 'opacity-100' : 'opacity-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'upload_asset' && 'Upload ZIP'}
                                                    {step.action === 'share_asset' && 'Compartilhar'}
                                                    {step.action === 'comment_asset' && 'Comentar'}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground">
                                                    {step.description}{!ready && ' (pendente preparo)'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Finals */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <FolderOpen className="w-4 h-4" />Final Materials
                                {!stagedPaths && <span className="text-[10px] text-muted-foreground">(aguardando preparo)</span>}
                            </div>
                            {steps.filter(s => s.group === 'finals').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                const ready = isParamReady(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'} ${ready ? 'opacity-100' : 'opacity-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'upload_finals' && 'Upload Arquivos'}
                                                    {step.action === 'comment_finals' && 'Comentar PDF'}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground">
                                                    {step.description}{!ready && ' (pendente preparo)'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Extras */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Settings className="w-4 h-4" />Ações Adicionais
                            </div>
                            {steps.filter(s => s.group === 'extra').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                return (
                                    <div key={idx} className={`ml-6 p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="font-medium">
                                                    {step.action === 'status' && 'Atualizar Status'}
                                                    {step.action === 'hours' && 'Lançar Horas'}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground">{step.description}</div>
                                            </div>
                                        </div>
                                        {showAdvanced && step.enabled && (
                                            <div className="mt-3 pl-7 space-y-3">
                                                {step.action === 'status' && step.params && (step.params as StatusParams).kind === 'status' && (
                                                    <div className="flex items-center gap-3">
                                                        <Label className="text-xs w-24">Status:</Label>
                                                        <Select
                                                            value={(step.params as StatusParams).deliverableStatus}
                                                            onValueChange={v => {
                                                                if (ALLOWED_STATUS.includes(v as AllowedStatus)) {
                                                                    updateStepParam(idx, 'deliverableStatus', v);
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 w-56">
                                                                <SelectValue placeholder="Selecionar" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {ALLOWED_STATUS.map(opt => (
                                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                {step.action === 'hours' && step.params && (step.params as HoursParams).kind === 'hours' && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Horas:</Label>
                                                            <Input type="number" min={0.25} step={0.25} className="h-8 w-32"
                                                                   value={(step.params as HoursParams).hours ?? ''}
                                                                   onChange={e => updateStepParam(idx, 'hours', parseFloat(e.target.value))} />
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Nota:</Label>
                                                            <Input className="h-8"
                                                                   value={(step.params as HoursParams).note ?? ''}
                                                                   onChange={e => updateStepParam(idx, 'note', e.target.value)} />
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Label className="text-xs w-24">Tarefa:</Label>
                                                            <Input className="h-8"
                                                                   value={(step.params as HoursParams).taskName ?? ''}
                                                                   onChange={e => updateStepParam(idx, 'taskName', e.target.value)}
                                                                   placeholder="(opcional)" />
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
                <Button onClick={executeTimeline} disabled={executing || readyEnabledSteps.length === 0}>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    {executing ? 'Executando...' : `Executar (${readyEnabledSteps.length}${hasInvalidEnabled ? ` de ${enabledSteps.length}` : ''})`}
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
        </div>
    );
}