import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Upload, UploadCloud, Share2, MessageSquare, Activity, Clock, FolderOpen, Workflow } from 'lucide-react';
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
    onPlanChange?: (plan: Array<{ action: string; subtype?: 'zip' | 'finals'; params?: Record<string, unknown>; label: string }>) => void;
    onExecuteReady?: (fn: () => Promise<void>, stats: { readyCount: number; totalCount: number; hasInvalid: boolean }) => void;
}

const WORKFLOW_ICONS: Record<WorkflowAction, React.ComponentType<{ className?: string }>> = {
    upload_asset: Upload,
    share_asset: Share2,
    comment_asset: MessageSquare,
    upload_finals: UploadCloud,
    comment_finals: MessageSquare,
    status: Activity,
    hours: Clock,
};

const ALLOWED_STATUS = ['Round 1 Review', 'Round 2 Review', 'Extra Round Review', 'Delivered'] as const;
type AllowedStatus = typeof ALLOWED_STATUS[number];

export default function TimelineSection({ projectUrl, selectedUser, stagedPaths, onPlanChange, onExecuteReady }: TimelineSectionProps) {
    // Passos base sempre presentes (params podem ser preenchidos depois)
    const baseSteps: WorkflowStep[] = [
        { action: 'upload_asset', enabled: false, params: { kind: 'upload_asset', assetZipPath: '', selectedUser }, description: 'Upload do ZIP para Asset Release', folder: 'Asset Release', group: 'asset' },
        { action: 'share_asset', enabled: false, params: { kind: 'share_asset', selections: [], selectedUser }, description: 'Compartilhar ZIP', folder: 'Asset Release', group: 'asset' },
        { action: 'comment_asset', enabled: false, params: { kind: 'comment_asset', folder: 'Asset Release', fileName: '', commentType: 'assetRelease', selectedUser }, description: 'Comentário Asset Release', folder: 'Asset Release', group: 'asset' },
        { action: 'upload_finals', enabled: false, params: { kind: 'upload_finals', finalMaterialPaths: [], selectedUser }, description: 'Upload de finais', folder: 'Final Materials', group: 'finals' },
        { action: 'comment_finals', enabled: false, params: { kind: 'comment_finals', folder: 'Final Materials', fileName: '', commentType: 'finalMaterials', selectedUser }, description: 'Comentário PDF Final', folder: 'Final Materials', group: 'finals' },
        { action: 'status', enabled: false, params: { kind: 'status', deliverableStatus: 'Round 1 Review' }, description: 'Atualizar status', group: 'extra' },
        { action: 'hours', enabled: false, params: { kind: 'hours', hours: 1, note: '', taskName: '' }, description: 'Lançar horas', group: 'extra' },
    ];

    const [steps, setSteps] = useState<WorkflowStep[]>(baseSteps);
    const [showAdvanced] = useState(false);
    const { executeWorkflow } = useWorkfrontApi();

    // Usa ref para armazenar executeWorkflow sem causar re-renders
    const executeWorkflowRef = useRef(executeWorkflow);
    useEffect(() => {
        executeWorkflowRef.current = executeWorkflow;
    }, [executeWorkflow]);

    // Refs para rastrear últimos valores enviados (evitar chamadas desnecessárias)
    const lastStatsRef = useRef<{ readyCount: number; totalCount: number; hasInvalid: boolean } | null>(null);

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
            const clone: Record<string, unknown> = { ...(s.params as Record<string, unknown>) };
            clone[key] = value;
            return { ...s, params: clone };
        }));

    // Valida se um passo tem params suficientes para execução
    const isParamReady = (step: WorkflowStep) => {
        if (!step.params) return false;
        if (step.action === 'upload_asset') return !!(step.params as UploadAssetParams).assetZipPath;
        if (step.action === 'share_asset') return (step.params as ShareAssetParams).selections?.length > 0;
        if (step.action === 'comment_asset') return !!(step.params as CommentParams).fileName;
        if (step.action === 'upload_finals') return (step.params as UploadFinalsParams).finalMaterialPaths?.length > 0;
        if (step.action === 'comment_finals') return !!(step.params as CommentParams).fileName;
        if (step.action === 'status') return !!(step.params as StatusParams).deliverableStatus;
        if (step.action === 'hours') return (step.params as HoursParams).hours > 0;
        return false;
    };

    const enabledSteps = steps.filter(s => s.enabled);
    const readyEnabledSteps = enabledSteps.filter(isParamReady);
    const hasInvalidEnabled = enabledSteps.length > 0 && readyEnabledSteps.length !== enabledSteps.length;

    // Notifica o pai sobre mudanças no plano (apenas quando steps mudam)
    useEffect(() => {
        const enabled = steps.filter(s => s.enabled);
        const ready = enabled.filter(isParamReady);
        const hasInvalid = enabled.length > 0 && ready.length !== enabled.length;

        if (onPlanChange) {
            const plan = ready.map(s => {
                let mappedAction: string = s.action;
                let subtype: 'zip' | 'finals' | undefined = undefined;
                if (s.action === 'upload_asset') { mappedAction = 'upload'; subtype = 'zip'; }
                if (s.action === 'upload_finals') { mappedAction = 'upload'; subtype = 'finals'; }
                if (s.action === 'share_asset') mappedAction = 'share';
                if (s.action === 'comment_asset' || s.action === 'comment_finals') mappedAction = 'comment';
                const params = (s.params || {}) as Record<string, unknown>;
                const label = (() => {
                    if (mappedAction === 'upload' && subtype === 'zip') return 'Upload Zip';
                    if (mappedAction === 'upload' && subtype === 'finals') return 'Upload Finais';
                    if (mappedAction === 'share') return 'Share';
                    if (mappedAction === 'comment') return 'Comment';
                    if (mappedAction === 'status') return 'Status';
                    if (mappedAction === 'hours') return 'Hours';
                    return mappedAction;
                })();
                return { action: mappedAction, subtype, params, label };
            });
            onPlanChange(plan);
        }

        // Notifica função de execução se disponível
        if (onExecuteReady) {
            const newStats = {
                readyCount: ready.length,
                totalCount: enabled.length,
                hasInvalid: hasInvalid
            };

            // Só chama se os stats mudaram
            const lastStats = lastStatsRef.current;
            const statsChanged = !lastStats ||
                lastStats.readyCount !== newStats.readyCount ||
                lastStats.totalCount !== newStats.totalCount ||
                lastStats.hasInvalid !== newStats.hasInvalid;

            if (statsChanged) {
                lastStatsRef.current = newStats;
                const execute = async () => {
                    const frontendSteps = ready.map(s => ({
                        action: s.action,
                        enabled: s.enabled,
                        params: s.params ? { ...(s.params as Record<string, unknown>) } : undefined
                    }));
                    return executeWorkflowRef.current({
                        projectUrl,
                        steps: frontendSteps,
                        headless: false,
                        stopOnError: false
                    });
                };
                onExecuteReady(execute, newStats);
            }
        }
    }, [steps, onPlanChange, onExecuteReady, projectUrl]);

    // Presets
    const presetReleaseFinal = () =>
        setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'asset' || s.group === 'finals' })));
    const presetFullFlow = () => setSteps(p => p.map(s => ({ ...s, enabled: true })));
    const presetStatusHours = () => setSteps(p => p.map(s => ({ ...s, enabled: s.group === 'extra' })));


    return (
        <div className="space-y-6">

            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-card-foreground">
                        <div className="flex items-center gap-3">
                            <Workflow className="w-4 h-4 text-primary" />
                            Fluxo de Trabalho
                        </div>
                        <div className="flex gap-2 mb-4 flex-wrap cursor-pointer">
                            <Badge variant="outline" onClick={presetFullFlow}>Completo</Badge>
                            <Badge variant="outline" onClick={presetReleaseFinal}>Release + Final</Badge>
                            <Badge variant="outline" onClick={presetStatusHours}>Status + Hours</Badge>
                            <Badge variant="outline" onClick={() => setSteps(prev => prev.map(s => ({ ...s, enabled: false })))}>Nenhum</Badge>
                        </div>

                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!stagedPaths && (
                        <div className="text-xs text-muted-foreground mb-3">
                            Para executar Upload / Share / Comments faca o preparo (Preparar Arquivos).
                        </div>
                    )}

                    {hasInvalidEnabled && (
                        <div className="text-xs text-amber-600 mb-3">
                            Alguns passos habilitados não possuem arquivos/params preparados e serão ignorados.
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Asset */}
                        <div className="space-y-2">
                            {steps.filter(s => s.group === 'asset').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                const ready = isParamReady(step);
                                return (
                                    <div key={idx} className={`p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'} ${ready ? 'opacity-100' : 'opacity-50'}`}>
                                        <div className="flex items-center gap-3 ">
                                            <Checkbox className="cursor-pointer" checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm ">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium ">
                                                        {step.action === 'upload_asset' && 'Upload Zip'}
                                                        {step.action === 'share_asset' && 'Compartilhar'}
                                                        {step.action === 'comment_asset' && 'Comentar PDF'}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                                                        <FolderOpen className="w-3 h-3" />Asset Release
                                                    </Badge>
                                                    {!ready && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">pendente preparo</Badge>}
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Finals */}
                        <div className="space-y-2">
                            {steps.filter(s => s.group === 'finals').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                const ready = isParamReady(step);
                                return (
                                    <div key={idx} className={`p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'} ${ready ? 'opacity-100' : 'opacity-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox className="cursor-pointer" checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium">
                                                        {step.action === 'upload_finals' && 'Upload Arquivos'}
                                                        {step.action === 'comment_finals' && 'Comentar PDF'}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                                                        <FolderOpen className="w-3 h-3" />Final Materials
                                                    </Badge>
                                                    {!ready && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">pendente preparo</Badge>}
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Extras */}
                        <div className="space-y-4">
                            {steps.filter(s => s.group === 'extra').map(step => {
                                const Icon = WORKFLOW_ICONS[step.action];
                                const idx = steps.indexOf(step);
                                return (
                                    <div key={idx} className={`p-3 border rounded-lg transition-opacity ${step.enabled ? 'bg-card' : 'bg-muted'}`}>
                                        <div className="flex items-center gap-3">
                                            <Checkbox className="cursor-pointer" checked={step.enabled} onCheckedChange={() => toggleStep(idx)} />
                                            <Icon className="w-4 h-4 text-primary" />
                                            <div className="flex-1 text-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium">
                                                        {step.action === 'status' && 'Atualizar Status'}
                                                        {step.action === 'hours' && 'Lançar Horas'}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                                                        <Settings className="w-3 h-3" />Ações Adicionais
                                                    </Badge>
                                                </div>
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
                                                            <Input type="text" className="h-8 w-32"
                                                                value={(step.params as HoursParams).hours?.toString().replace('.', ',') ?? ''}
                                                                onChange={e => {
                                                                    const raw = e.target.value.replace(/[^0-9.,]/g, '');
                                                                    const normalized = raw.replace(',', '.');
                                                                    const num = parseFloat(normalized) || 0;
                                                                    updateStepParam(idx, 'hours', num);
                                                                }} />
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
        </div>
    );
}