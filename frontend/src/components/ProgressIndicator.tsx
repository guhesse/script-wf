import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Search,
    FolderOpen,
    FileText,
    CheckCircle,
    AlertCircle,
    Loader2
} from 'lucide-react';

interface ProgressStep {
    step: string;
    message: string;
    progress: number;
    timestamp: string;
    data?: unknown;
}

interface ProgressIndicatorProps {
    isVisible: boolean;
    currentStep: ProgressStep | null;
    steps: ProgressStep[];
}

export const ProgressIndicator = ({ isVisible, currentStep, steps }: ProgressIndicatorProps) => {
    if (!isVisible) return null;

    // Saneamento defensivo: filtrar itens malformados para evitar runtime errors
    const safeSteps: ProgressStep[] = Array.isArray(steps)
        ? steps.filter(s => !!s && typeof s.step === 'string' && typeof s.message === 'string')
        : [];

    const getStepIcon = (step: string, isCompleted: boolean, isCurrent: boolean) => {
        const iconProps = {
            className: `h-5 w-5 ${isCurrent ? 'animate-spin' : ''} ${isCompleted ? 'text-green-600' : isCurrent ? 'text-blue-600' : 'text-gray-400'
                }`
        };

        switch (step) {
            case 'connecting':
            case 'loading':
            case 'finding-frame':
                return isCurrent ? <Loader2 {...iconProps} /> : <Search {...iconProps} />;
            case 'accessing-folder':
                return isCurrent ? <Loader2 {...iconProps} /> : <FolderOpen {...iconProps} />;
            case 'scanning-files':
                return isCurrent ? <Loader2 {...iconProps} /> : <FileText {...iconProps} />;
            case 'folder-complete':
            case 'completed':
                return <CheckCircle {...iconProps} />;
            case 'folder-empty':
            case 'folder-error':
            case 'error':
                return <AlertCircle {...iconProps} />;
            default:
                return isCurrent ? <Loader2 {...iconProps} /> : <Search {...iconProps} />;
        }
    };

    const getStepTitle = (step: string) => {
        const titles: Record<string, string> = {
            'connecting': 'Conectando ao Workfront',
            'loading': 'Carregando projeto',
            'finding-frame': 'Localizando interface',
            'accessing-folder': 'Acessando pasta',
            'scanning-files': 'Verificando arquivos',
            'folder-complete': 'Pasta processada',
            'folder-empty': 'Pasta vazia',
            'folder-error': 'Erro na pasta',
            'completed': 'Concluído',
            'error': 'Erro'
        };
        return titles[step] || step;
    };

    const getProgressColor = (progress: number) => {
        if (progress < 30) return 'bg-red-500';
        if (progress < 60) return 'bg-yellow-500';
        if (progress < 100) return 'bg-blue-500';
        return 'bg-green-500';
    };

    const uniqueSteps = safeSteps.reduce((acc, step) => {
        const key = `${step.step}-${step.message}`;
        if (!acc.has(key)) {
            acc.set(key, step);
        }
        return acc;
    }, new Map<string, ProgressStep>());

    const uniqueStepsList = Array.from(uniqueSteps.values());

    return (
        <Card className=" border-l-blue-500 bg-blue-50">
            <CardHeader>
                <CardTitle className="flex items-center text-blue-700">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Extraindo Documentos
                    {currentStep && (
                        <Badge variant="outline" className="ml-2">
                            {currentStep.progress}%
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* Barra de Progresso */}
                {currentStep && (
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">
                                {getStepTitle(currentStep.step)}
                            </span>
                            <span className="text-sm text-gray-500">
                                {currentStep.progress}%
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 -full h-2">
                            <div
                                className={`h-2 -full transition-all duration-300 ${getProgressColor(currentStep.progress)}`}
                                style={{ width: `${currentStep.progress}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                            {currentStep.message}
                        </p>
                    </div>
                )}

                {/* Lista de Passos */}
                <div className="space-y-3">
                    <h4 className="font-semibold text-gray-700 text-sm">Progresso detalhado:</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {uniqueStepsList.map((step, index) => {
                            const stepKey = step?.step || '';
                            const isCompleted = stepKey === 'completed' || stepKey === 'folder-complete';
                            const isCurrent = currentStep?.step === stepKey && currentStep?.message === step.message;
                            const isError = stepKey.includes('error');
                            const tsDate = step.timestamp ? new Date(step.timestamp) : null;
                            const tsValid = tsDate && !isNaN(tsDate.getTime());

                            return (
                                <div
                                    key={`${step.step}-${step.message}-${index}`}
                                    className={`flex items-start space-x-3 p-2 -lg transition-all ${isCurrent
                                        ? 'bg-blue-100 border border-blue-300'
                                        : isCompleted
                                            ? 'bg-green-50 border border-green-200'
                                            : isError
                                                ? 'bg-red-50 border border-red-200'
                                                : 'bg-gray-50'
                                        }`}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        {getStepIcon(step.step, isCompleted, isCurrent)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${isError ? 'text-red-700' : isCompleted ? 'text-green-700' : isCurrent ? 'text-blue-700' : 'text-gray-700'
                                            }`}>
                                            {step.message}
                                        </p>
                                        {tsValid && (
                                            <p className="text-xs text-gray-500">
                                                {tsDate!.toLocaleTimeString()}
                                            </p>
                                        )}
                                        {(() => {
                                            if (step.data && typeof step.data === 'object' && step.data !== null && 'totalFiles' in step.data) {
                                                const total = (step.data as { totalFiles: number }).totalFiles;
                                                return (
                                                    <Badge variant="secondary" className="mt-1 text-xs">
                                                        {String(total)} arquivo{Number(total) === 1 ? '' : 's'}
                                                    </Badge>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    {step.progress > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                            {step.progress}%
                                        </Badge>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Status Atual */}
                {currentStep && currentStep.step !== 'completed' && currentStep.step !== 'error' && (
                    <div className="mt-4 p-3 bg-blue-100 -lg border border-blue-200">
                        <div className="flex items-center space-x-2">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">
                                Processando... {currentStep.message}
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};