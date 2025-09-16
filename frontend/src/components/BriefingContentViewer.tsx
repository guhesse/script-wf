import React, { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle,
    Download,
    Search,
    Copy,
    Eye,
    FileText,
    Hash,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Plus,
    RefreshCw,
    Check,
    Trash2,
    CheckSquare,
    Square
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { DELL_COLORS, extractColorsFromText, formatFullColor, rgbString } from '../lib/dellColors';

interface ProjectBriefing {
    id: string;
    title: string;
    dsid: string;
    url: string;
    accessedAt: string;
    briefingDownloads: BriefingDownload[];
}

interface BriefingDownload {
    id: string;
    projectName: string;
    dsid: string;
    totalFiles: number;
    totalSize: number;
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
    createdAt: string;
    pdfFiles: PdfFile[];
}

interface PdfComment {
    page: number;
    type: string;
    author: string;
    content: string;
}

interface PdfFile {
    id: string;
    originalFileName: string;
    originalUrl?: string; // URL original de onde o PDF foi baixado
    fileSize: number;
    pageCount: number;
    hasContent: boolean;
    hasComments: boolean;
    extractedContent?: {
        fullText: string;
        comments: PdfComment[] | string;
        links: string[];
    };
    structuredData?: {
        liveDate?: string;
        vf?: string;
        headline?: string;
        copy?: string;
        description?: string;
        cta?: string;
        backgroundColor?: string;
        copyColor?: string;
        postcopy?: string;
        urn?: string;
        allocadia?: string;
        po?: string;
        formats?: {
            requested?: string[];
            existing?: string[];
            summary?: string;
        };
    };
}

interface ProcessBriefingRequest {
    projectUrls: string[];
    options?: {
        headless?: boolean;
        continueOnError?: boolean;
    };
}

interface Stats {
    totals: {
        projects: number;
        downloads: number;
        pdfs: number;
    };
    statusBreakdown: Record<string, number>;
}

interface ProcessResult {
    successful: Array<{
        projectNumber: number;
        projectId: string;
        url: string;
    }>;
    failed: Array<{
        projectNumber: number;
        url: string;
        error: string;
    }>;
    summary: {
        totalFiles: number;
        totalProjects: number;
    };
}

const BriefingContentViewer: React.FC = () => {
    const [projects, setProjects] = useState<ProjectBriefing[]>([]);
    const [selectedDownload, setSelectedDownload] = useState<BriefingDownload | null>(null);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [stats, setStats] = useState<Stats | null>(null);

    // Estados para processamento de novos briefings
    const [processUrls, setProcessUrls] = useState<string[]>(['']);
    const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

    // Estado para feedback visual dos botões de copiar
    const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

    // Estados para seleção múltipla e exclusão
    const [selectedDownloads, setSelectedDownloads] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showPalette, setShowPalette] = useState(false);

    const loadProjects = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (filterStatus) params.append('status', filterStatus);

            const response = await fetch(`/api/briefing/projects?${params}`);
            const data = await response.json();

            if (data.success) {
                setProjects(data.data.projects);
            } else {
                setError(data.error || 'Erro ao carregar projetos');
            }
        } catch (_err) {
            void _err;
            setError('Erro ao conectar com o servidor');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, filterStatus]);

    const loadStats = useCallback(async () => {
        try {
            const response = await fetch('/api/briefing/stats');
            const data = await response.json();

            if (data.success) {
                setStats(data.data);
            }
        } catch (_err) {
            console.error('Erro ao carregar estatísticas:', _err);
        }
    }, []);

    useEffect(() => {
        const loadData = async () => {
            await loadProjects();
            await loadStats();
        };
        loadData();
    }, [loadProjects, loadStats]);

    const processNewBriefings = async () => {
        const validUrls = processUrls.filter(url => url.trim() !== '');

        if (validUrls.length === 0) {
            setError('Adicione pelo menos uma URL de projeto');
            return;
        }

        try {
            setProcessing(true);
            setError('');
            setProcessResult(null);

            const request: ProcessBriefingRequest = {
                projectUrls: validUrls,
                options: {
                    headless: true,
                    continueOnError: true
                }
            };

            const response = await fetch('/api/briefing/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            const data = await response.json();
            console.log('🔍 Response received:', data);

            if (data.success) {
                console.log('✅ Setting processResult:', data.data);
                setProcessResult(data.data);
                // Recarregar lista de projetos
                await loadProjects();
                await loadStats();
            } else {
                console.error('❌ Process failed:', data.error);
                setError(data.error || 'Erro no processamento');
            }
        } catch (_err) {
            void _err;
            setError('Erro ao conectar com o servidor');
        } finally {
            setProcessing(false);
        }
    };

    const addUrlField = () => {
        setProcessUrls([...processUrls, '']);
    };

    const removeUrlField = (index: number) => {
        const newUrls = processUrls.filter((_, i) => i !== index);
        setProcessUrls(newUrls.length > 0 ? newUrls : ['']);
    };

    const updateUrl = (index: number, value: string) => {
        const newUrls = [...processUrls];
        newUrls[index] = value;
        setProcessUrls(newUrls);
    };

    const copyToClipboard = async (text: string, itemId?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Texto copiado para a área de transferência!');

            // Feedback visual temporário
            if (itemId) {
                setCopiedItems(prev => new Set(prev).add(itemId));
                setTimeout(() => {
                    setCopiedItems(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(itemId);
                        return newSet;
                    });
                }, 2000);
            }
        } catch (err) {
            console.error('Erro ao copiar texto:', err);
            toast.error('Erro ao copiar texto');
        }
    };

    // const parsePostcopy = (postcopyText: string) => {
    //     // Remover prefixo POSTCOPY se existir
    //     const cleanText = postcopyText.replace(/^POSTCOPY:\s*/i, '').trim();

    //     // Padrões conhecidos de campos do POSTCOPY
    //     const fieldPatterns = ['HL:', 'COPY:', 'DESCRIPTION:', 'CTA:', 'HEADLINE:', 'DESC:'];

    //     const parsed: Record<string, string> = {};
    //     const textToProcess = cleanText;

    //     // Processar cada campo conhecido
    //     fieldPatterns.forEach(pattern => {
    //         const regex = new RegExp(`\\b${pattern.replace(':', '')}:\\s*([^]*?)(?=\\b(?:${fieldPatterns.map(p => p.replace(':', '')).join('|')}):|$)`, 'i');
    //         const match = textToProcess.match(regex);

    //         if (match) {
    //             const key = pattern.replace(':', '').toUpperCase();
    //             const value = match[1].trim();
    //             parsed[key] = value;
    //         }
    //     });

    //     // Se não conseguiu fazer parse com padrões, tentar método linha por linha
    //     if (Object.keys(parsed).length === 0) {
    //         const lines = cleanText.split(/\r\n|\r|\n/).filter(line => line.trim());

    //         lines.forEach(line => {
    //             const colonIndex = line.indexOf(':');
    //             if (colonIndex > 0) {
    //                 const key = line.substring(0, colonIndex).trim();
    //                 const value = line.substring(colonIndex + 1).trim();

    //                 // Verificar se é um campo válido (maiúsculas + dois pontos)
    //                 if (key.match(/^[A-Z]+$/)) {
    //                     parsed[key] = value;
    //                 }
    //             }
    //         });
    //     }

    //     return parsed;
    // };

    // Função para processar links DAM removendo a parte de login para download direto
    const processDAMLink = (url: string): string => {
        if (!url.includes('dell-assetshare/login/assetshare/details.html')) {
            return url;
        }

        // Remove a parte '/content/dell-assetshare/login/assetshare/details.html' 
        // mantendo apenas a parte do download direto
        const parts = url.split('/content/dell-assetshare/login/assetshare/details.html');
        if (parts.length === 2) {
            return parts[0] + parts[1];
        }

        return url;
    };

    const toggleDownloadSelection = (downloadId: string) => {
        setSelectedDownloads(prev => {
            const newSet = new Set(prev);
            if (newSet.has(downloadId)) {
                newSet.delete(downloadId);
            } else {
                newSet.add(downloadId);
            }
            return newSet;
        });
    };

    const selectAllDownloads = () => {
        const allDownloadIds = projects.flatMap(project =>
            project.briefingDownloads.map(download => download.id)
        );
        setSelectedDownloads(new Set(allDownloadIds));
    };

    const clearSelection = () => {
        setSelectedDownloads(new Set());
    };

    const deleteSelectedDownloads = async () => {
        if (selectedDownloads.size === 0) return;

        try {
            setIsDeleting(true);
            const downloadIds = Array.from(selectedDownloads);

            const response = await fetch('/api/briefing/downloads', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ downloadIds }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`${data.data.deletedItems} briefing(s) excluído(s) com sucesso!`);
                clearSelection();
                setShowConfirmDialog(false);
                // Recarregar lista
                await loadProjects();
                await loadStats();
            } else {
                toast.error(data.error || 'Erro ao excluir briefings');
            }
        } catch (err) {
            console.error('Erro ao excluir briefings:', err);
            toast.error('Erro ao conectar com o servidor');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleString('pt-BR');
        } catch (_e) {
            void _e;
            return dateString || 'Data inválida';
        }
    };

    const getStatusBadge = (status: string) => {
        const statusMap = {
            PROCESSING: { variant: 'outline' as const, icon: Clock, color: 'text-yellow-600' },
            COMPLETED: { variant: 'default' as const, icon: CheckCircle2, color: 'text-green-600' },
            FAILED: { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' },
            PARTIAL: { variant: 'secondary' as const, icon: AlertTriangle, color: 'text-orange-600' }
        };

        const config = statusMap[status as keyof typeof statusMap] || statusMap.FAILED;
        const Icon = config.icon;

        return (
            <Badge variant={config.variant} className="flex items-center gap-1">
                <Icon className="w-3 h-3" />
                {status}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header com Estatísticas */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-card p-4 border border-border">
                        <div className="text-2xl font-bold text-primary">{stats.totals.projects}</div>
                        <div className="text-sm text-muted-foreground">Projetos</div>
                    </div>
                    <div className="bg-card p-4 border border-border">
                        <div className="text-2xl font-bold text-primary">{stats.totals.downloads}</div>
                        <div className="text-sm text-muted-foreground">Downloads</div>
                    </div>
                    <div className="bg-card p-4 border border-border">
                        <div className="text-2xl font-bold text-primary">{stats.totals.pdfs}</div>
                        <div className="text-sm text-muted-foreground">PDFs Processados</div>
                    </div>
                    <div className="bg-card p-4 border border-border">
                        <div className="text-2xl font-bold text-primary">
                            {stats.statusBreakdown.COMPLETED || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Concluídos</div>
                    </div>
                </div>
            )}

            {/* Seção de Processamento */}
            <div className="bg-card p-6 border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <Download className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Processar Novos Briefings</h2>
                </div>

                <p className="text-muted-foreground mb-6">
                    Extrair conteúdo de PDFs da pasta "05. Briefing" de múltiplos projetos e salvar no banco de dados.
                </p>

                {/* URLs dos Projetos */}
                <div className="space-y-4">
                    <label className="block text-sm font-medium text-foreground">
                        URLs dos Projetos Workfront
                    </label>

                    {processUrls.map((url, index) => (
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
                                disabled={processUrls.length === 1}
                                className="px-3"
                            >
                                <XCircle className="w-4 h-4" />
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
                </div>

                {/* Botão de Processamento */}
                <div className="flex gap-3 mt-6">
                    <Button
                        onClick={processNewBriefings}
                        disabled={processing || processUrls.filter(url => url.trim() !== '').length === 0}
                        className="flex items-center gap-2"
                    >
                        {processing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        {processing ? 'Processando...' : 'Processar Briefings'}
                    </Button>
                </div>

                {/* Resultado do Processamento */}
                {processResult && (
                    <div className="mt-6 p-4 bg-muted border border-border">
                        <h4 className="font-medium mb-2">Resultado do Processamento</h4>
                        <div className="text-sm space-y-1">
                            <div>✅ Sucessos: {processResult.successful?.length || 0}</div>
                            <div>❌ Falhas: {processResult.failed?.length || 0}</div>
                            <div>📄 Total de arquivos: {processResult.summary?.totalFiles || 0}</div>
                        </div>
                    </div>
                )}

                {/* Erros */}
                {error && (
                    <Alert className="mt-4 border-destructive bg-destructive/10">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <div className="text-destructive">{error}</div>
                    </Alert>
                )}
            </div>

            {/* Filtros e Busca */}
            <div className="bg-card p-6 border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <Search className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Briefings Processados</h2>
                </div>

                <div className="flex gap-4 mb-4">
                    <div className="flex-1">
                        <Input
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por título, DSID ou URL..."
                            className="w-full"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-2 border border-border rounded-md bg-background"
                    >
                        <option value="">Todos os status</option>
                        <option value="COMPLETED">Concluído</option>
                        <option value="PROCESSING">Processando</option>
                        <option value="FAILED">Falha</option>
                        <option value="PARTIAL">Parcial</option>
                    </select>
                    <Button onClick={loadProjects} variant="outline">
                        <Search className="w-4 h-4" />
                    </Button>
                </div>

                {/* Controles de Seleção Múltipla */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={selectedDownloads.size === 0 ? selectAllDownloads : clearSelection}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                        >
                            {selectedDownloads.size === 0 ? (
                                <Square className="w-4 h-4" />
                            ) : (
                                <CheckSquare className="w-4 h-4" />
                            )}
                            {selectedDownloads.size === 0 ? 'Selecionar Todos' : `${selectedDownloads.size} Selecionados`}
                        </Button>

                        {selectedDownloads.size > 0 && (
                            <Button
                                onClick={clearSelection}
                                variant="ghost"
                                size="sm"
                            >
                                Limpar Seleção
                            </Button>
                        )}
                    </div>

                    {selectedDownloads.size > 0 && (
                        <Button
                            onClick={() => setShowConfirmDialog(true)}
                            variant="destructive"
                            size="sm"
                            className="flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Excluir {selectedDownloads.size} item(s)
                        </Button>
                    )}
                </div>

                {/* Lista de Projetos */}
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="ml-2">Carregando...</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {projects.map((project) => (
                            <div key={project.id} className="border border-border p-4 hover:bg-muted/50">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3 flex-1">
                                        <button
                                            onClick={() => {
                                                const projectDownloadIds = project.briefingDownloads.map(d => d.id);
                                                const allProjectSelected = projectDownloadIds.every(id => selectedDownloads.has(id));

                                                if (allProjectSelected) {
                                                    // Desmarcar todos do projeto
                                                    setSelectedDownloads(prev => {
                                                        const newSet = new Set(prev);
                                                        projectDownloadIds.forEach(id => newSet.delete(id));
                                                        return newSet;
                                                    });
                                                } else {
                                                    // Marcar todos do projeto
                                                    setSelectedDownloads(prev => {
                                                        const newSet = new Set(prev);
                                                        projectDownloadIds.forEach(id => newSet.add(id));
                                                        return newSet;
                                                    });
                                                }
                                            }}
                                            className="flex-shrink-0 hover:bg-gray-100 p-1 rounded mt-1"
                                        >
                                            {(() => {
                                                const projectDownloadIds = project.briefingDownloads.map(d => d.id);
                                                const selectedCount = projectDownloadIds.filter(id => selectedDownloads.has(id)).length;

                                                if (selectedCount === 0) {
                                                    return <Square className="w-4 h-4" />;
                                                } else if (selectedCount === projectDownloadIds.length) {
                                                    return <CheckSquare className="w-4 h-4 text-blue-600" />;
                                                } else {
                                                    return <div className="w-4 h-4 border-2 border-blue-600 bg-blue-100 rounded" />;
                                                }
                                            })()}
                                        </button>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="font-medium">{project.title || 'Sem título'}</h3>
                                                {project.dsid && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <Hash className="w-3 h-3" />
                                                        {project.dsid}
                                                    </Badge>
                                                )}
                                            </div>
                                            {/* bloco de data de comentário removido (inserido por engano) */}
                                            {/* Downloads do Projeto */}
                                            <div className="space-y-2">
                                                {project.briefingDownloads.map((download) => (
                                                    <div key={download.id} className="bg-muted/30 p-3 border border-border/50">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => toggleDownloadSelection(download.id)}
                                                                    className="flex-shrink-0 hover:bg-gray-100 p-1 rounded"
                                                                >
                                                                    {selectedDownloads.has(download.id) ? (
                                                                        <CheckSquare className="w-4 h-4 text-blue-600" />
                                                                    ) : (
                                                                        <Square className="w-4 h-4" />
                                                                    )}
                                                                </button>
                                                                {getStatusBadge(download.status)}
                                                                <span className="text-sm">
                                                                    {download.totalFiles} arquivo(s) - {formatFileSize(download.totalSize)}
                                                                </span>
                                                            </div>
                                                            <Button
                                                                onClick={() => {
                                                                    setSelectedDownload(download);
                                                                }}
                                                                variant="outline"
                                                                size="sm"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {formatDate(download.createdAt)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {projects.length === 0 && !loading && (
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhum projeto encontrado
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Confirmação para Exclusão */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Trash2 className="w-6 h-6 text-red-600" />
                            <h3 className="text-lg font-semibold">Confirmar Exclusão</h3>
                        </div>
                        <p className="text-gray-600 mb-6">
                            Tem certeza que deseja excluir {selectedDownloads.size} briefing(s) selecionado(s)?
                            Esta ação não pode ser desfeita e removerá todos os dados relacionados.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button
                                onClick={() => setShowConfirmDialog(false)}
                                variant="outline"
                                disabled={isDeleting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={deleteSelectedDownloads}
                                variant="destructive"
                                disabled={isDeleting}
                                className="flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Excluindo...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        Excluir
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal/Detalhes do Download Selecionado */}
            {selectedDownload && (
                <div className="bg-card p-6 border border-border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                            Detalhes: {selectedDownload.projectName}
                        </h3>
                        <Button
                            onClick={() => {
                                setSelectedDownload(null);
                            }}
                            variant="outline"
                            size="sm"
                        >
                            <XCircle className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Lista de PDFs */}
                    <div className="space-y-4">
                        {selectedDownload.pdfFiles && selectedDownload.pdfFiles.length > 0 ? (
                            selectedDownload.pdfFiles.map((pdf) => (
                                <div key={pdf.id} className="border border-border p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            <span className="font-medium">{pdf.originalFileName}</span>
                                            <span className="text-sm text-muted-foreground">
                                                {pdf.pageCount} pág. • {formatFileSize(pdf.fileSize)}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 text-xs">
                                            {pdf.hasContent && (
                                                <Badge variant="secondary">Texto</Badge>
                                            )}
                                            {pdf.hasComments && (
                                                <Badge variant="secondary">Comentários</Badge>
                                            )}
                                            {pdf.structuredData && Object.values(pdf.structuredData).some(v => v) && (
                                                <Badge variant="secondary">Dados Estruturados</Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* URL original do PDF */}
                                    {pdf.originalUrl && (
                                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 flex-1">
                                                    <span className="text-xs font-medium text-blue-700">PDF Original:</span>
                                                    <a
                                                        href={pdf.originalUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-600 hover:underline flex-1 truncate"
                                                    >
                                                        {pdf.originalUrl}
                                                    </a>
                                                </div>
                                                <Button
                                                    onClick={() => copyToClipboard(pdf.originalUrl!, `pdf-url-${pdf.id}`)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center gap-1 h-6 px-2"
                                                >
                                                    {copiedItems.has(`pdf-url-${pdf.id}`) ? (
                                                        <Check className="w-3 h-3 text-green-600" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                    <span className="text-xs">Copiar</span>
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Detalhes do PDF - sempre visíveis */}
                                    <div className="mt-4 space-y-4">
                                        {/* Dados Estruturados */}
                                        {pdf.structuredData && Object.values(pdf.structuredData).some(v => v) && (
                                            <div>
                                                <h4 className="font-medium mb-2">Dados Estruturados</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {Object.entries(pdf.structuredData).map(([key, value]) => {
                                                        if (!value) return null;

                                                        // Filtrar o campo postcopy bruto (mantemos apenas os campos parseados)
                                                        if (key.toLowerCase() === 'postcopy') {
                                                            return null;
                                                        }

                                                        // Filtrar campos PO inválidos (muito curtos ou que parecem pedaços de arquivo/texto)
                                                        if (key.toLowerCase() === 'po') {
                                                            const poValue = String(value).trim();
                                                            // Ignorar se for muito curto, contém extensão de arquivo, ou é apenas uma letra
                                                            if (poValue.length <= 2 ||
                                                                /\.(psd|pdf|jpg|png|zip)$/i.test(poValue) ||
                                                                /^[a-z]$/i.test(poValue) ||
                                                                poValue.includes('-c-') || // padrão de nome de arquivo
                                                                poValue.includes('st-c-')) { // padrão de nome de arquivo
                                                                return null;
                                                            }
                                                        }

                                                        // Tratamento especial para FORMATS
                                                        if (key.toLowerCase() === 'formats' && value && typeof value === 'object') {
                                                            const formats = value as { requested?: string[]; existing?: string[]; summary?: string };
                                                            return (
                                                                <div key={key} className="md:col-span-2">
                                                                    <div className="bg-muted/30 p-4 border border-border/50">
                                                                        <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center justify-between">
                                                                            <span>FORMATOS DE ASSETS</span>
                                                                            <Button
                                                                                onClick={() => copyToClipboard(formats.summary || '', `formats-summary-${pdf.id}`)}
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-7 px-2 text-xs"
                                                                            >
                                                                                {copiedItems.has(`formats-summary-${pdf.id}`) ? (
                                                                                    <Check className="w-3 h-3 text-green-600" />
                                                                                ) : (
                                                                                    <Copy className="w-3 h-3" />
                                                                                )}
                                                                                Copiar Resumo
                                                                            </Button>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                            {formats.requested && formats.requested.length > 0 && (
                                                                                <div className="p-3 border border-border/50 bg-muted/20 rounded">
                                                                                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                                                        <span className="w-2 h-2 bg-primary rounded-full"></span>
                                                                                        Formatos Solicitados
                                                                                    </div>
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {formats.requested.map((format, idx) => (
                                                                                            <span key={idx} className="px-2 py-1 bg-primary/10 text-violet-200 text-xs rounded border border-primary/20 font-mono">
                                                                                                {format}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {formats.existing && formats.existing.length > 0 && (
                                                                                <div className="p-3 border border-border/50 bg-muted/20 rounded">
                                                                                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                                                        <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                                                                                        Formatos Existentes
                                                                                    </div>
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {formats.existing.map((format, idx) => (
                                                                                            <span key={idx} className="px-2 py-1 bg-green-600/10 text-green-300 text-xs rounded border border-green-800 font-mono">
                                                                                                {format}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        // Tratamento especial para POSTCOPY
                                                        // if (key.toLowerCase() === 'postcopy') {
                                                        // const parsedPostcopy = parsePostcopy(String(value));

                                                        // Se conseguiu fazer parse dos campos, mostrar estruturado
                                                        // if (Object.keys(parsedPostcopy).length > 0) {
                                                        //     return (
                                                        //         <div key={key} className="md:col-span-2">
                                                        //             <div className="bg-muted/30 p-4 border border-border/50">
                                                        //                 <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center justify-between">
                                                        //                     <span>POSTCOPY</span>
                                                        //                     <Button
                                                        //                         onClick={() => copyToClipboard(String(value), `postcopy-full-${pdf.id}`)}
                                                        //                         variant="ghost"
                                                        //                         size="sm"
                                                        //                         className="h-7 px-2 text-xs"
                                                        //                     >
                                                        //                         {copiedItems.has(`postcopy-full-${pdf.id}`) ? (
                                                        //                             <Check className="w-3 h-3 text-green-600" />
                                                        //                         ) : (
                                                        //                             <Copy className="w-3 h-3" />
                                                        //                         )}
                                                        //                         Copiar Tudo
                                                        //                     </Button>
                                                        //                 </div>
                                                        //                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        //                     {Object.entries(parsedPostcopy).map(([subKey, subValue]) => (
                                                        //                         <div key={subKey} className="p-3 border border-muted-foreground/20 rounded">
                                                        //                             <div className="text-xs font-medium text-muted-foreground mb-1">
                                                        //                                 {subKey}
                                                        //                             </div>
                                                        //                             <div className="text-sm flex items-start justify-between gap-2">
                                                        //                                 <span className="flex-1 whitespace-pre-wrap">{subValue}</span>
                                                        //                                 <Button
                                                        //                                     onClick={() => copyToClipboard(subValue, `postcopy-${subKey}-${pdf.id}`)}
                                                        //                                     variant="ghost"
                                                        //                                     size="sm"
                                                        //                                     className="h-6 w-6 p-0"
                                                        //                                 >
                                                        //                                     {copiedItems.has(`postcopy-${subKey}-${pdf.id}`) ? (
                                                        //                                         <Check className="w-3 h-3 text-green-600" />
                                                        //                                     ) : (
                                                        //                                         <Copy className="w-3 h-3" />
                                                        //                                     )}
                                                        //                                 </Button>
                                                        //                             </div>
                                                        //                         </div>
                                                        //                     ))}
                                                        //                 </div>
                                                        //             </div>
                                                        //         </div>
                                                        //     );
                                                        // }
                                                        // Se não conseguiu fazer parse, mostrar como texto normal
                                                        // }

                                                        // Garantir que value seja uma string para renderização
                                                        const displayValue = typeof value === 'object'
                                                            ? JSON.stringify(value)
                                                            : String(value);
                                                        const augmentedValue = displayValue;

                                                        const itemId = `structured-${key}-${pdf.id}`;

                                                        const isColorField = ['background', 'backgroundcolor', 'colorcopy', 'color_copy', 'copycolor', 'copy_colour'].includes(key.toLowerCase());
                                                        let colorMeta = undefined;
                                                        if (isColorField) {
                                                            const metas = extractColorsFromText(displayValue);
                                                            if (metas.length > 0) colorMeta = metas[0];
                                                        }

                                                        return (
                                                            <div key={key} className="bg-muted/30 p-3 border border-border/50">
                                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                                    <div className="text-xs font-medium text-muted-foreground">
                                                                        {(() => {
                                                                            // Normalizar nomes de campos
                                                                            const normalizedKey = key.toLowerCase();
                                                                            if (normalizedKey === 'headline' || normalizedKey === 'hl') {
                                                                                return 'Headline';
                                                                            }
                                                                            if (normalizedKey === 'backgroundcolor') {
                                                                                return 'Background Color';
                                                                            }
                                                                            if (normalizedKey === 'colorcopy' || normalizedKey === 'copycolor' || normalizedKey === 'copy_colour') {
                                                                                return 'Color Copy';
                                                                            }
                                                                            if (normalizedKey === 'livedate') {
                                                                                return 'Live Date';
                                                                            }
                                                                            return key.charAt(0).toUpperCase() + key.slice(1);
                                                                        })()}
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        <Button
                                                                            onClick={() => copyToClipboard(String(displayValue), itemId)}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-6 w-6 p-0"
                                                                        >
                                                                            {copiedItems.has(itemId) ? (
                                                                                <Check className="w-3 h-3 text-green-600" />
                                                                            ) : (
                                                                                <Copy className="w-3 h-3" />
                                                                            )}
                                                                        </Button>
                                                                        {colorMeta && (
                                                                            <Button
                                                                                onClick={() => copyToClipboard(formatFullColor(colorMeta), `${itemId}-color`)}
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-6 w-6 p-0"
                                                                            >
                                                                                {copiedItems.has(`${itemId}-color`) ? (
                                                                                    <Check className="w-3 h-3 text-green-600" />
                                                                                ) : (
                                                                                    <span className="w-3 h-3 rounded-sm border border-border" style={{ background: colorMeta.match.hex }} />
                                                                                )}
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm flex flex-col gap-2">
                                                                    <span className="whitespace-pre-wrap break-words">{augmentedValue}</span>
                                                                    {colorMeta && (
                                                                        <div className="text-xs rounded border border-border/50 p-2 flex items-center gap-3 bg-background/60">
                                                                            <div className="w-10 h-10 rounded border border-border shadow-sm" style={{ background: colorMeta.match.hex }} />
                                                                            <div className="grid text-[11px] leading-tight">
                                                                                <span className="font-medium">{colorMeta.match.name}{colorMeta.match.alias ? ` (${colorMeta.match.alias})` : ''}</span>
                                                                                <span>HEX {colorMeta.match.hex}</span>
                                                                                <span>RGB {rgbString(colorMeta.match)}</span>
                                                                                {colorMeta.match.pms && <span>PMS {colorMeta.match.pms}</span>}
                                                                                <span>CMYK {colorMeta.match.cmyk.c}/{colorMeta.match.cmyk.m}/{colorMeta.match.cmyk.y}/{colorMeta.match.cmyk.k}</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Comentários */}
                                        {(() => {
                                            // Parse seguro dos comentários
                                            let comments: PdfComment[] = [];

                                            if (pdf.extractedContent?.comments) {
                                                if (Array.isArray(pdf.extractedContent.comments)) {
                                                    comments = pdf.extractedContent.comments;
                                                } else if (typeof pdf.extractedContent.comments === 'string') {
                                                    try {
                                                        const parsed = JSON.parse(pdf.extractedContent.comments);
                                                        if (Array.isArray(parsed)) {
                                                            comments = parsed;
                                                        }
                                                    } catch (_e) {
                                                        console.error('Erro ao fazer parse dos comentários:', _e);
                                                    }
                                                }
                                            }

                                            return comments.length > 0 ? (
                                                <div>
                                                    <h4 className="font-medium mb-2">Comentários do PDF ({comments.length})</h4>
                                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                                        {comments.map((comment: PdfComment, index: number) => (
                                                            <div key={index} className="bg-muted/30 p-3 border border-border/50">
                                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge variant="outline" className="text-xs">
                                                                            Pág. {comment.page}
                                                                        </Badge>
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            {comment.type}
                                                                        </Badge>
                                                                        <span className="text-xs text-muted-foreground font-medium">
                                                                            {comment.author}
                                                                        </span>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => copyToClipboard(comment.content, `comment-${index}-${pdf.id}`)}
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                    >
                                                                        {copiedItems.has(`comment-${index}-${pdf.id}`) ? (
                                                                            <Check className="w-3 h-3 text-green-600" />
                                                                        ) : (
                                                                            <Copy className="w-3 h-3" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                                <div className="text-sm whitespace-pre-wrap">
                                                                    {comment.content}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()}

                                        {/* Links */}
                                        {(() => {
                                            // Parse seguro dos links
                                            let links: string[] = [];

                                            if (pdf.extractedContent?.links) {
                                                if (Array.isArray(pdf.extractedContent.links)) {
                                                    links = pdf.extractedContent.links;
                                                } else if (typeof pdf.extractedContent.links === 'string') {
                                                    try {
                                                        const parsed = JSON.parse(pdf.extractedContent.links);
                                                        if (Array.isArray(parsed)) {
                                                            links = parsed;
                                                        }
                                                    } catch (_e) {
                                                        console.error('Erro ao fazer parse dos links:', _e);
                                                    }
                                                }
                                            }

                                            return links.length > 0 ? (
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="font-medium">Links Encontrados ({links.length})</h4>
                                                        <Button
                                                            onClick={() => {
                                                                // Processar todos os links removendo a parte de login do DAM
                                                                const processedLinks = links.map(link => processDAMLink(link));
                                                                copyToClipboard(processedLinks.join('\n'), `all-links-${pdf.id}`);
                                                            }}
                                                            variant="outline"
                                                            size="sm"
                                                            className="flex items-center gap-1"
                                                        >
                                                            {copiedItems.has(`all-links-${pdf.id}`) ? (
                                                                <Check className="w-3 h-3 text-green-600" />
                                                            ) : (
                                                                <Copy className="w-3 h-3" />
                                                            )}
                                                            Copiar Todos
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {links.map((link: string, index: number) => (
                                                            <div key={index} className="bg-muted/30 p-3 border border-border/50">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <a
                                                                        href={link}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-primary hover:underline text-sm flex-1 truncate"
                                                                    >
                                                                        {link}
                                                                    </a>
                                                                    <Button
                                                                        onClick={() => copyToClipboard(link, `link-${index}-${pdf.id}`)}
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0"
                                                                    >
                                                                        {copiedItems.has(`link-${index}-${pdf.id}`) ? (
                                                                            <Check className="w-3 h-3 text-green-600" />
                                                                        ) : (
                                                                            <Copy className="w-3 h-3" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()}

                                        {/* Texto Completo */}
                                        {pdf.extractedContent?.fullText && (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-medium">Texto Completo</h4>
                                                    <Button
                                                        onClick={() => copyToClipboard(pdf.extractedContent!.fullText, `fulltext-${pdf.id}`)}
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex items-center gap-1"
                                                    >
                                                        {copiedItems.has(`fulltext-${pdf.id}`) ? (
                                                            <Check className="w-3 h-3 text-green-600" />
                                                        ) : (
                                                            <Copy className="w-3 h-3" />
                                                        )}
                                                        Copiar
                                                    </Button>
                                                </div>
                                                <div className="bg-muted/30 p-4 border border-border/50 max-h-60 overflow-y-auto">
                                                    <pre className="text-sm whitespace-pre-wrap font-mono">
                                                        {pdf.extractedContent.fullText}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Nenhum arquivo PDF encontrado neste briefing</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Paleta de Cores Dell (toggle) */}
            <div className="mt-8 border border-border rounded">
                <div className="flex items-center justify-between p-3 bg-muted/30">
                    <h3 className="font-medium text-sm">Paleta de Cores Dell</h3>
                    <Button variant="outline" size="sm" onClick={() => setShowPalette(p => !p)} className="h-7 px-2 text-xs">
                        {showPalette ? 'Ocultar' : 'Mostrar'}
                    </Button>
                </div>
                {showPalette && (
                    <div className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {DELL_COLORS.map(color => {
                            const itemId = `palette-${color.id}`;
                            return (
                                <div key={color.id} className="border border-border/50 rounded p-2 bg-background/60 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 rounded border border-border shadow-sm" style={{ background: color.hex }} />
                                        <div className="text-[11px] leading-tight flex-1">
                                            <div className="font-medium">{color.name}{color.alias ? ` (${color.alias})` : ''}</div>
                                            <div className="text-muted-foreground">{color.hex}</div>
                                        </div>
                                        <Button
                                            onClick={() => copyToClipboard(formatFullColor({ source: 'name', match: color, input: color.name }), itemId)}
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                        >
                                            {copiedItems.has(itemId) ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                                        <span>RGB</span><span>{rgbString(color).replace('rgb(', '').replace(')', '')}</span>
                                        {color.pms && (<><span>PMS</span><span>{color.pms}</span></>)}
                                        <span>CMYK</span><span>{`${color.cmyk.c}/${color.cmyk.m}/${color.cmyk.y}/${color.cmyk.k}`}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BriefingContentViewer;