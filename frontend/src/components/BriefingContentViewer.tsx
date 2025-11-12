import React, { useState, useEffect } from 'react';
import {
    AlertTriangle,
    Download,
    Search,
    Copy,
    Eye,
    FileText,
    Loader2,
    Plus,
    RefreshCw,
    Check,
    Trash2,
    CheckSquare,
    Square,
    X
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

interface LinkComparison {
    success: boolean;
    summary?: {
        totalLinks: number;
        uniqueLinks: number;
        duplicates: number;
        downloadsAnalyzed: number;
    };
    links?: Array<{
        url: string;
        processedUrl: string;
        count: number;
        isDuplicate: boolean;
        occurrences: Array<{
            dsid: string;
            projectTitle: string;
            fileName: string;
        }>;
    }>;
    error?: string;
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

    // Estados para processamento em lote com feedback visual
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [currentProcessingUrl, setCurrentProcessingUrl] = useState<string>('');
    const [processedUrls, setProcessedUrls] = useState<Set<string>>(new Set());
    const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

    // Estado para feedback visual dos botões de copiar
    const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

    // Estados para seleção múltipla e exclusão
    const [selectedDownloads, setSelectedDownloads] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showPalette, setShowPalette] = useState(false);

    // Estados para comparação de links
    const [showLinkComparison, setShowLinkComparison] = useState(false);
    const [linkComparison, setLinkComparison] = useState<LinkComparison | null>(null);
    const [isComparingLinks, setIsComparingLinks] = useState(false);
    const [useProcessedLinks, setUseProcessedLinks] = useState(true); // true = links reduzidos, false = links completos

    // Estados para download DAM
    const [isDownloadingFromDAM, setIsDownloadingFromDAM] = useState(false);
    const [damDownloadProgress, setDamDownloadProgress] = useState({ current: 0, total: 0 });
    const [selectedLinksToDownload, setSelectedLinksToDownload] = useState<Set<string>>(new Set());

    // Debug: Log do estado de seleção
    console.log('🎯 Estado atual - selectedDownloads.size:', selectedDownloads.size, 'Array:', Array.from(selectedDownloads));

    const loadProjects = async () => {
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
    };

    const loadStats = async () => {
        try {
            const response = await fetch('/api/briefing/stats');
            const data = await response.json();

            if (data.success) {
                setStats(data.data);
            }
        } catch (_err) {
            console.error('Erro ao carregar estatísticas:', _err);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            await loadProjects();
            await loadStats();
        };
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Carrega apenas uma vez ao montar

    const processNewBriefings = async () => {
        const validUrls = processUrls.filter(url => url.trim() !== '');

        if (validUrls.length === 0) {
            setError('Adicione pelo menos uma URL de projeto');
            return;
        }

        try {
            setBatchProcessing(true);
            setProcessing(true);
            setError('');
            setProcessResult(null);
            setProcessedUrls(new Set());
            setFailedUrls(new Set());
            setBatchProgress({ current: 0, total: validUrls.length });

            console.log(`� Iniciando processamento SSE de ${validUrls.length} URLs...`);

            // Conectar ao SSE endpoint
            const urlsParam = encodeURIComponent(validUrls.join(','));
            const eventSource = new EventSource(`/api/briefing/process/stream?urls=${urlsParam}`);

            const results = {
                successful: [] as ProcessResult['successful'],
                failed: [] as ProcessResult['failed'],
                totalFiles: 0
            };

            eventSource.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('📨 SSE Event:', message);

                    switch (message.type) {
                        case 'start':
                            console.log('🚀 Processamento iniciado:', message.data);
                            toast.info(`Processando ${message.data.total} projeto(s)...`);
                            break;

                        case 'project-start':
                            console.log(`🔄 Projeto ${message.data.projectNumber} iniciado`);
                            setCurrentProcessingUrl(message.data.url); // Marcar URL atual
                            setBatchProgress({
                                current: message.data.current - 1,
                                total: message.data.total
                            });
                            break;

                        case 'project-success':
                            console.log(`✅ Projeto ${message.data.projectNumber} concluído`);
                            results.successful.push({
                                projectNumber: message.data.projectNumber,
                                projectId: message.data.dsid || 'unknown',
                                url: message.data.url
                            });
                            results.totalFiles += message.data.filesProcessed || 0;
                            setProcessedUrls(prev => new Set([...prev, message.data.url]));
                            setCurrentProcessingUrl(''); // Limpar URL atual
                            setBatchProgress({
                                current: message.data.projectNumber,
                                total: validUrls.length
                            });
                            toast.success(`✅ Projeto ${message.data.projectNumber} processado (DSID: ${message.data.dsid})`);
                            break;

                        case 'project-fail':
                            console.log(`❌ Projeto ${message.data.projectNumber} falhou:`, message.data.error);
                            results.failed.push({
                                projectNumber: message.data.projectNumber,
                                url: message.data.url,
                                error: message.data.error
                            });
                            setFailedUrls(prev => new Set([...prev, message.data.url]));
                            setCurrentProcessingUrl(''); // Limpar URL atual
                            setBatchProgress({
                                current: message.data.projectNumber,
                                total: validUrls.length
                            });
                            toast.error(`❌ Projeto ${message.data.projectNumber} falhou`);
                            break;

                        case 'completed': {
                            console.log('🎉 Processamento concluído:', message.data);
                            setProcessResult({
                                successful: message.data.successful,
                                failed: message.data.failed,
                                summary: message.data.summary
                            });

                            // Feedback final
                            const successCount = message.data.successful.length;
                            const failCount = message.data.failed.length;

                            if (failCount === 0) {
                                toast.success(`🎉 Todos os ${successCount} projetos processados com sucesso!`);
                            } else if (successCount === 0) {
                                toast.error('❌ Nenhum projeto foi processado com sucesso');
                            } else {
                                toast.warning(`⚠️ ${successCount} sucesso(s), ${failCount} falha(s)`);
                            }

                            // Recarregar dados
                            loadProjects();
                            loadStats();

                            eventSource.close();
                            setProcessing(false);
                            setBatchProcessing(false);
                            break;
                        }

                        case 'error':
                            console.error('💥 Erro no SSE:', message.data.message);
                            setError(message.data.message);
                            toast.error(message.data.message);
                            eventSource.close();
                            setProcessing(false);
                            setBatchProcessing(false);
                            break;
                    }
                } catch (err) {
                    console.error('Erro ao processar mensagem SSE:', err);
                }
            };

            eventSource.onerror = (error) => {
                console.error('💥 Erro na conexão SSE:', error);
                setError('Erro na conexão com o servidor');
                toast.error('Conexão perdida com o servidor');
                eventSource.close();
                setProcessing(false);
                setBatchProcessing(false);
            };

        } catch (err) {
            console.error('💥 Erro ao iniciar processamento:', err);
            setError('Erro ao iniciar processamento');
            toast.error('Erro ao iniciar processamento');
            setProcessing(false);
            setBatchProcessing(false);
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

    // Extrai múltiplas URLs de um texto colado (padronizado com BulkDownload e OverviewExtractor)
    const parsePastedUrls = (text: string): string[] => {
        if (!text) return [];
        const rawParts = text.split(/\s+|,|;|\n|\r/g).map(s => s.trim()).filter(Boolean);
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
        if (urls.length <= 1) return;
        e.preventDefault();

        const unique = new Set<string>();
        const current = [...processUrls];
        for (const u of current) unique.add(u);

        const toInsert: string[] = [];
        urls.forEach(u => {
            if (!unique.has(u)) {
                unique.add(u);
                toInsert.push(u);
            }
        });

        if (toInsert.length === 0) return;
        current[index] = toInsert[0];
        if (toInsert.length > 1) {
            current.splice(index + 1, 0, ...toInsert.slice(1));
        }
        setProcessUrls(current.filter(x => x !== ''));
    };

    // Comparar links de briefings selecionados
    const compareSelectedLinks = async () => {
        if (selectedDownloads.size === 0) {
            toast.error('Selecione pelo menos um briefing para comparar links');
            return;
        }

        try {
            setIsComparingLinks(true);
            setError('');

            const response = await fetch('/api/briefing/links/compare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    downloadIds: Array.from(selectedDownloads),
                    processLinks: useProcessedLinks  // Enviar preferência de processamento
                }),
            });

            const data = await response.json();

            if (data.success) {
                setLinkComparison(data);
                setShowLinkComparison(true);
                toast.success('Links comparados com sucesso!');
            } else {
                setError(data.error || 'Erro ao comparar links');
                toast.error(data.error || 'Erro ao comparar links');
            }
        } catch (err) {
            console.error('Erro ao comparar links:', err);
            setError('Erro ao conectar com o servidor');
            toast.error('Erro ao conectar com o servidor');
        } finally {
            setIsComparingLinks(false);
        }
    };

    // Baixar links únicos ou duplicados do DAM
    const downloadLinksFromDAM = async (linksType: 'all' | 'duplicates' | 'selected') => {
        if (!linkComparison?.links) {
            toast.error('Nenhum link disponível para download');
            return;
        }

        try {
            setIsDownloadingFromDAM(true);

            let linksToDownload: string[] = [];

            // Filtrar links baseado no tipo
            if (linksType === 'selected') {
                // Baixar apenas os selecionados
                linksToDownload = Array.from(selectedLinksToDownload);

                if (linksToDownload.length === 0) {
                    toast.warning('Selecione pelo menos um link para baixar');
                    setIsDownloadingFromDAM(false);
                    return;
                }
            } else if (linksType === 'all') {
                linksToDownload = linkComparison.links.map(l => l.processedUrl);
            } else if (linksType === 'duplicates') {
                linksToDownload = linkComparison.links.filter(l => l.isDuplicate).map(l => l.processedUrl);
            }

            if (linksToDownload.length === 0) {
                toast.warning('Nenhum link para baixar');
                setIsDownloadingFromDAM(false);
                return;
            }

            setDamDownloadProgress({ current: 0, total: linksToDownload.length });

            toast.info(`Iniciando download de ${linksToDownload.length} arquivo(s) do DAM...`);

            const response = await fetch('/api/dam/download/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    urls: linksToDownload,
                    options: {
                        outputDir: 'temp/dam-downloads'
                    }
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`Download concluído! ${data.successful}/${data.total} arquivos baixados com sucesso`);

                if (data.failed > 0) {
                    toast.warning(`${data.failed} arquivo(s) falharam no download`);
                }
            } else {
                toast.error(data.error || 'Erro ao baixar arquivos do DAM');
            }
        } catch (err) {
            console.error('Erro ao baixar do DAM:', err);
            toast.error('Erro ao conectar com o servidor');
        } finally {
            setIsDownloadingFromDAM(false);
            setDamDownloadProgress({ current: 0, total: 0 });
        }
    };

    // Controlar seleção de links individuais
    const toggleLinkSelection = (url: string) => {
        setSelectedLinksToDownload(prev => {
            const newSet = new Set(prev);
            if (newSet.has(url)) {
                newSet.delete(url);
            } else {
                newSet.add(url);
            }
            return newSet;
        });
    };

    // Selecionar/Desselecionar todos os links
    const toggleSelectAllLinks = () => {
        if (!linkComparison?.links) return;

        if (selectedLinksToDownload.size === linkComparison.links.length) {
            // Se todos estão selecionados, desselecionar todos
            setSelectedLinksToDownload(new Set());
        } else {
            // Selecionar todos
            const allUrls = linkComparison.links.map(l => l.processedUrl);
            setSelectedLinksToDownload(new Set(allUrls));
        }
    };

    // Selecionar apenas duplicados
    const selectOnlyDuplicates = () => {
        if (!linkComparison?.links) return;
        const duplicateUrls = linkComparison.links.filter(l => l.isDuplicate).map(l => l.processedUrl);
        setSelectedLinksToDownload(new Set(duplicateUrls));
    };

    // Limpar seleção quando abrir/fechar modal
    useEffect(() => {
        if (showLinkComparison && linkComparison?.links) {
            // Auto-selecionar todos os links quando abrir o modal
            const allUrls = linkComparison.links.map(l => l.processedUrl);
            setSelectedLinksToDownload(new Set(allUrls));
        } else {
            setSelectedLinksToDownload(new Set());
        }
    }, [showLinkComparison, linkComparison]);

    // Formatar links agrupados por DSID
    const formatLinksGroupedByDSID = (linksToFormat: LinkComparison['links']): string => {
        if (!linksToFormat || linksToFormat.length === 0) return '';

        // Agrupar links por DSID
        const linksByDSID = new Map<string, Set<string>>();
        const sharedLinks: string[] = [];

        linksToFormat.forEach(link => {
            // Usar sempre processedUrl (que é igual ao url original se processLinks=false)
            const linkUrl = link.processedUrl;

            if (link.isDuplicate) {
                // Link compartilhado - adicionar à lista de compartilhados
                if (!sharedLinks.includes(linkUrl)) {
                    sharedLinks.push(linkUrl);
                }
            } else {
                // Link único - adicionar ao DSID específico
                const dsid = link.occurrences[0]?.dsid || 'Desconhecido';
                if (!linksByDSID.has(dsid)) {
                    linksByDSID.set(dsid, new Set());
                }
                linksByDSID.get(dsid)!.add(linkUrl);
            }
        });

        let output = '';

        // Links únicos por DSID
        const sortedDSIDs = Array.from(linksByDSID.keys()).sort();
        sortedDSIDs.forEach(dsid => {
            const links = Array.from(linksByDSID.get(dsid)!);
            output += `${dsid}:\n`;
            links.forEach(link => {
                output += `${link}\n`;
            });
            output += '\n';
        });

        // Links compartilhados
        if (sharedLinks.length > 0) {
            const sharedDSIDs = new Set<string>();
            linksToFormat
                .filter(l => l.isDuplicate)
                .forEach(l => {
                    l.occurrences.forEach(occ => sharedDSIDs.add(occ.dsid));
                });

            const sortedSharedDSIDs = Array.from(sharedDSIDs).sort();
            output += `${sortedSharedDSIDs.join(', ')}:\n`;
            output += `Links compartilhados\n`;
            sharedLinks.forEach(link => {
                output += `${link}\n`;
            });
        }

        return output.trim();
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

    const toggleDownloadSelection = (downloadId: string) => {
        setSelectedDownloads(prev => {
            const newSet = new Set(prev);
            if (newSet.has(downloadId)) {
                newSet.delete(downloadId);
            } else {
                newSet.add(downloadId);
            }
            console.log('📋 Downloads selecionados:', Array.from(newSet));
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
                                onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => handlePasteUrls(e, index)}
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
                                <X className="w-4 h-4" />
                            </Button>
                            <Button
                                onClick={addUrlField}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}


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

                {/* Progresso do Processamento em Lote */}
                {batchProcessing && batchProgress.total > 0 && (
                    <div className="mt-6 p-4 bg-muted border border-border">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h4 className="font-medium mb-1 flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                    Processamento em Lote em Andamento
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    O backend está processando {batchProgress.total} projeto(s) em paralelo...
                                </p>
                            </div>
                            <Badge variant="outline" className="text-lg px-3 py-1">
                                {batchProgress.total} projeto(s)
                            </Badge>
                        </div>

                        {/* Grid de URLs sendo processadas */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                            {processUrls.filter(url => url.trim() !== '').map((url, index) => {
                                const isProcessed = processedUrls.has(url);
                                const isFailed = failedUrls.has(url);
                                const isCurrent = currentProcessingUrl === url;

                                return (
                                    <div
                                        key={index}
                                        className={`p-3 border rounded-lg transition-all ${isProcessed
                                                ? 'bg-green-900/30 border-green-700'
                                                : isFailed
                                                    ? 'bg-red-900/30 border-red-700'
                                                    : isCurrent
                                                        ? 'bg-blue-900/40 border-blue-600 shadow-lg ring-2 ring-blue-500/50 animate-pulse'
                                                        : 'bg-muted/50 border-border'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-xs font-bold">
                                                #{index + 1}
                                            </div>
                                            <Badge
                                                variant={
                                                    isProcessed ? 'default' :
                                                        isFailed ? 'destructive' :
                                                            isCurrent ? 'outline' :
                                                                'secondary'
                                                }
                                                className={`text-[10px] h-5 px-1.5 flex items-center gap-1 ${isProcessed ? 'bg-green-600 hover:bg-green-700 text-white' :
                                                        isCurrent ? 'bg-blue-500 text-white' : ''
                                                    }`}
                                            >
                                                {isProcessed ? (
                                                    <>
                                                        <Check className="w-3 h-3" />
                                                        <span>OK</span>
                                                    </>
                                                ) : isFailed ? (
                                                    <>
                                                        <X className="w-3 h-3" />
                                                        <span>Falhou</span>
                                                    </>
                                                ) : isCurrent ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        <span>Processando</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Aguardando</span>
                                                    </>
                                                )}
                                            </Badge>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground truncate" title={url}>
                                            {url.split('/').slice(-2).join('/') || 'URL'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Barra de progresso */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Progresso Geral</span>
                                <span className="font-medium">
                                    {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                >
                                    {batchProgress.current > 0 && (
                                        <span className="text-[10px] text-white font-bold">
                                            {batchProgress.current}/{batchProgress.total}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Estatísticas em tempo real */}
                            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
                                <div className="text-center">
                                    <div className="text-lg font-bold text-green-600">{processedUrls.size}</div>
                                    <div className="text-[10px] text-muted-foreground">Sucessos</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-lg font-bold text-red-600">{failedUrls.size}</div>
                                    <div className="text-[10px] text-muted-foreground">Falhas</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-lg font-bold text-gray-600">
                                        {batchProgress.total - batchProgress.current}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">Restantes</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Resultado do Processamento */}
                {processResult && (
                    <div className="mt-6 space-y-4">
                        {/* Resumo */}
                        <div className="p-4 bg-muted border border-border">
                            <h4 className="font-medium mb-3">Resumo do Processamento</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-green-900/20 p-3 rounded border border-green-800">
                                    <div className="text-2xl font-bold text-green-400">
                                        {processResult.successful?.length || 0}
                                    </div>
                                    <div className="text-xs text-green-300">✅ Sucessos</div>
                                </div>
                                <div className="bg-red-900/20 p-3 rounded border border-red-800">
                                    <div className="text-2xl font-bold text-red-400">
                                        {processResult.failed?.length || 0}
                                    </div>
                                    <div className="text-xs text-red-300">❌ Falhas</div>
                                </div>
                                <div className="bg-blue-900/20 p-3 rounded border border-blue-800">
                                    <div className="text-2xl font-bold text-blue-400">
                                        {processResult.summary?.totalFiles || 0}
                                    </div>
                                    <div className="text-xs text-blue-300">📄 Total de PDFs</div>
                                </div>
                            </div>
                        </div>

                        {/* Detalhes dos Sucessos */}
                        {processResult.successful && processResult.successful.length > 0 && (
                            <div className="p-4 bg-green-900/20 border border-green-800">
                                <h4 className="font-medium mb-3 text-green-400">Projetos Processados com Sucesso</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {processResult.successful.map((item, index) => (
                                        <div key={index} className="text-sm bg-muted/50 p-2 rounded border border-green-900/50">
                                            <div className="flex items-center gap-2">
                                                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                                                <span className="font-medium">Projeto #{item.projectNumber}</span>
                                                <span className="text-muted-foreground truncate" title={item.url}>
                                                    {item.url}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Detalhes das Falhas */}
                        {processResult.failed && processResult.failed.length > 0 && (
                            <div className="p-4 bg-red-900/20 border border-red-800">
                                <h4 className="font-medium mb-3 text-red-400">Projetos com Falhas</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {processResult.failed.map((item, index) => (
                                        <div key={index} className="text-sm bg-muted/50 p-2 rounded border border-red-900/50">
                                            <div className="flex items-start gap-2">
                                                <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium">Projeto #{item.projectNumber}</span>
                                                        <span className="text-muted-foreground text-xs truncate" title={item.url}>
                                                            {item.url}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-red-300 bg-red-950/50 p-1 rounded">
                                                        {item.error}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                    {/* DEBUG: Contador de selecionados */}
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {selectedDownloads.size} selecionado(s)
                    </span>
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
                        <div className="flex flex-col gap-2">

                            <div className="flex gap-2">
                                <Button
                                    onClick={compareSelectedLinks}
                                    variant="default"
                                    size="sm"
                                    disabled={isComparingLinks}
                                    className="flex items-center gap-2"
                                >
                                    {isComparingLinks ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <FileText className="w-4 h-4" />
                                    )}
                                    Comparar Links
                                </Button>
                                <Button
                                    onClick={() => setShowConfirmDialog(true)}
                                    variant="destructive"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Excluir {selectedDownloads.size} item(s)
                                </Button>
                            </div>
                        </div>
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
                            project.briefingDownloads.map((download) => (
                                <div key={download.id} className="border border-border hover:bg-muted/30 transition-colors">
                                    {/* Header do Card */}
                                    <div className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1">
                                            {/* Checkbox de Seleção */}
                                            <button
                                                onClick={() => {
                                                    console.log('🔘 Clicou no checkbox do download:', download.id);
                                                    toggleDownloadSelection(download.id);
                                                }}
                                                className="flex-shrink-0 hover:bg-gray-100 p-1 rounded"
                                            >
                                                {selectedDownloads.has(download.id) ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                                ) : (
                                                    <Square className="w-5 h-5" />
                                                )}
                                            </button>

                                            {/* Informações Principais */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {/* DSID Badge */}
                                                    {download.dsid && (
                                                        <Badge variant="outline" className="flex items-center gap-1 font-mono text-base">
                                                            {download.dsid}
                                                        </Badge>
                                                    )}
                                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                        <span>{formatFileSize(download.totalSize)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Botão de Expandir/Recolher */}
                                            <Button
                                                onClick={() => {
                                                    if (selectedDownload?.id === download.id) {
                                                        setSelectedDownload(null);
                                                    } else {
                                                        setSelectedDownload(download);
                                                    }
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="flex items-center gap-2"
                                            >
                                                <Eye className="w-4 h-4" />
                                                {selectedDownload?.id === download.id ? 'Ocultar' : 'Ver Detalhes'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Conteúdo Expandido (continua com os PDFs) */}
                                    {selectedDownload?.id === download.id && selectedDownload.pdfFiles && selectedDownload.pdfFiles.length > 0 && (
                                        <div className="border-t border-border p-4">
                                            <div className="space-y-4">
                                                {selectedDownload.pdfFiles.map((pdf) => (
                                                    <div key={pdf.id} className="p-4">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <FileText className="w-4 h-4" />
                                                                <span className="font-mono text-sm font-medium">{pdf.originalFileName}</span>
                                                            </div>
                                                            <div className="flex gap-2 text-xs">
                                                                <Badge variant="outline">{formatFileSize(pdf.fileSize)}</Badge>
                                                                <Badge variant="outline">{pdf.pageCount} pág(s)</Badge>
                                                                {pdf.hasContent && <Badge variant="default">Com Conteúdo</Badge>}
                                                                {pdf.hasComments && <Badge variant="secondary">Comentários</Badge>}
                                                            </div>
                                                        </div>

                                                        {/* URL original do PDF */}
                                                        {pdf.originalUrl && (
                                                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span className="text-xs font-medium text-blue-700 shrink-0">PDF Original:</span>
                                                                        <a
                                                                            href={pdf.originalUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-xs text-blue-600 hover:underline truncate"
                                                                        >
                                                                            {pdf.originalUrl}
                                                                        </a>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => copyToClipboard(pdf.originalUrl!, `pdf-url-${pdf.id}`)}
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="flex items-center gap-1 h-7 px-2 shrink-0"
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

                                                        {/* Dados Estruturados */}
                                                        {pdf.structuredData && Object.values(pdf.structuredData).some(v => v) && (
                                                            <div className="mb-4">
                                                                <h4 className="font-medium mb-3 text-sm">Dados Estruturados</h4>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    {Object.entries(pdf.structuredData).map(([key, value]) => {
                                                                        if (!value) return null;
                                                                        if (key.toLowerCase() === 'postcopy') return null;

                                                                        // Tratamento especial para FORMATS
                                                                        if (key.toLowerCase() === 'formats' && value && typeof value === 'object') {
                                                                            const formats = value as { requested?: string[]; existing?: string[]; summary?: string };
                                                                            return (
                                                                                <div key={key} className="md:col-span-2">
                                                                                    <div className="bg-muted/30 p-4 border border-border/50 rounded">
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

                                                                        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                                                                        const itemId = `structured-${key}-${pdf.id}`;

                                                                        const isColorField = ['background', 'backgroundcolor', 'colorcopy', 'color_copy', 'copycolor', 'copy_colour'].includes(key.toLowerCase());
                                                                        let colorMeta = undefined;
                                                                        if (isColorField) {
                                                                            const metas = extractColorsFromText(displayValue);
                                                                            if (metas.length > 0) colorMeta = metas[0];
                                                                        }

                                                                        return (
                                                                            <div key={key} className="bg-muted/30 p-3 border border-border/50 rounded">
                                                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                                                    <div className="text-xs font-medium text-muted-foreground">
                                                                                        {(() => {
                                                                                            const normalizedKey = key.toLowerCase();
                                                                                            if (normalizedKey === 'headline' || normalizedKey === 'hl') return 'Headline';
                                                                                            if (normalizedKey === 'backgroundcolor') return 'Background Color';
                                                                                            if (normalizedKey === 'colorcopy' || normalizedKey === 'copycolor' || normalizedKey === 'copy_colour') return 'Color Copy';
                                                                                            if (normalizedKey === 'livedate') return 'Live Date';
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
                                                                                    <span className="whitespace-pre-wrap break-words">{displayValue}</span>
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
                                                            let comments: PdfComment[] = [];
                                                            if (pdf.extractedContent?.comments) {
                                                                if (Array.isArray(pdf.extractedContent.comments)) {
                                                                    comments = pdf.extractedContent.comments;
                                                                } else if (typeof pdf.extractedContent.comments === 'string') {
                                                                    try {
                                                                        const parsed = JSON.parse(pdf.extractedContent.comments);
                                                                        if (Array.isArray(parsed)) comments = parsed;
                                                                    } catch (_e) {
                                                                        console.error('Erro ao fazer parse dos comentários:', _e);
                                                                    }
                                                                }
                                                            }

                                                            return comments.length > 0 ? (
                                                                <div className="mb-4">
                                                                    <h4 className="font-medium mb-3 text-sm">Comentários do PDF ({comments.length})</h4>
                                                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                                                        {comments.map((comment: PdfComment, index: number) => (
                                                                            <div key={index} className="bg-muted/30 p-3 border border-border/50 rounded">
                                                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <Badge variant="outline" className="text-xs">Pág. {comment.page}</Badge>
                                                                                        <Badge variant="secondary" className="text-xs">{comment.type}</Badge>
                                                                                        <span className="text-xs text-muted-foreground font-medium">{comment.author}</span>
                                                                                    </div>
                                                                                    <Button
                                                                                        onClick={() => copyToClipboard(comment.content, `comment-${index}-${pdf.id}`)}
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-6 w-6 p-0 shrink-0"
                                                                                    >
                                                                                        {copiedItems.has(`comment-${index}-${pdf.id}`) ? (
                                                                                            <Check className="w-3 h-3 text-green-600" />
                                                                                        ) : (
                                                                                            <Copy className="w-3 h-3" />
                                                                                        )}
                                                                                    </Button>
                                                                                </div>
                                                                                <div className="text-sm whitespace-pre-wrap">{comment.content}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : null;
                                                        })()}

                                                        {/* Links */}
                                                        {(() => {
                                                            let links: string[] = [];
                                                            if (pdf.extractedContent?.links) {
                                                                if (Array.isArray(pdf.extractedContent.links)) {
                                                                    links = pdf.extractedContent.links;
                                                                } else if (typeof pdf.extractedContent.links === 'string') {
                                                                    try {
                                                                        const parsed = JSON.parse(pdf.extractedContent.links);
                                                                        if (Array.isArray(parsed)) links = parsed;
                                                                    } catch (_e) {
                                                                        console.error('Erro ao fazer parse dos links:', _e);
                                                                    }
                                                                }
                                                            }

                                                            return links.length > 0 ? (
                                                                <div className="mb-4">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <h4 className="font-medium text-sm">Links Encontrados ({links.length})</h4>
                                                                        <Button
                                                                            onClick={() => {
                                                                                copyToClipboard(links.join('\n'), `all-links-${pdf.id}`);
                                                                            }}
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="flex items-center gap-1 h-7 px-2"
                                                                        >
                                                                            {copiedItems.has(`all-links-${pdf.id}`) ? (
                                                                                <Check className="w-3 h-3 text-green-600" />
                                                                            ) : (
                                                                                <Copy className="w-3 h-3" />
                                                                            )}
                                                                            <span className="text-xs">Copiar Todos</span>
                                                                        </Button>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {links.map((link: string, index: number) => (
                                                                            <div key={index} className="bg-muted/30 p-3 border border-border/50 rounded flex items-center justify-between gap-2">
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
                                                                                    className="h-6 w-6 p-0 shrink-0"
                                                                                >
                                                                                    {copiedItems.has(`link-${index}-${pdf.id}`) ? (
                                                                                        <Check className="w-3 h-3 text-green-600" />
                                                                                    ) : (
                                                                                        <Copy className="w-3 h-3" />
                                                                                    )}
                                                                                </Button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : null;
                                                        })()}

                                                        {/* Texto Completo */}
                                                        {pdf.extractedContent?.fullText && (
                                                            <div>
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <h4 className="font-medium text-sm">Texto Completo</h4>
                                                                    <Button
                                                                        onClick={() => copyToClipboard(pdf.extractedContent!.fullText, `fulltext-${pdf.id}`)}
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="flex items-center gap-1 h-7 px-2"
                                                                    >
                                                                        {copiedItems.has(`fulltext-${pdf.id}`) ? (
                                                                            <Check className="w-3 h-3 text-green-600" />
                                                                        ) : (
                                                                            <Copy className="w-3 h-3" />
                                                                        )}
                                                                        <span className="text-xs">Copiar</span>
                                                                    </Button>
                                                                </div>
                                                                <div className="bg-muted/30 p-4 border border-border/50 rounded max-h-60 overflow-y-auto">
                                                                    <pre className="text-sm whitespace-pre-wrap font-mono">
                                                                        {pdf.extractedContent.fullText}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
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
                <div className="fixed inset-0 bg-black/50 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-muted rounded-lg p-6 max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Trash2 className="w-6 h-6 text-red-600" />
                            <h3 className="text-lg font-semibold">Confirmar Exclusão</h3>
                        </div>
                        <p className=" mb-6">
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


            {/* Modal de Comparação de Links */}
            {showLinkComparison && linkComparison && (
                <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-muted rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="p-6 border-b border-border">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-6 h-6 text-primary" />
                                    <h3 className="text-lg font-semibold">Comparação de Links</h3>
                                </div>
                                <Button
                                    onClick={() => setShowLinkComparison(false)}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Estatísticas */}
                            {linkComparison.summary && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                                        <div className="text-2xl font-bold text-blue-700">{linkComparison.summary.totalLinks}</div>
                                        <div className="text-xs text-blue-600">Total de Links</div>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded border border-green-200">
                                        <div className="text-2xl font-bold text-green-700">{linkComparison.summary.uniqueLinks}</div>
                                        <div className="text-xs text-green-600">Links Únicos</div>
                                    </div>
                                    <div className="bg-orange-50 p-3 rounded border border-orange-200">
                                        <div className="text-2xl font-bold text-orange-700">{linkComparison.summary.duplicates}</div>
                                        <div className="text-xs text-orange-600">Duplicados</div>
                                    </div>
                                    <div className="bg-purple-50 p-3 rounded border border-purple-200">
                                        <div className="text-2xl font-bold text-purple-700">{linkComparison.summary.downloadsAnalyzed}</div>
                                        <div className="text-xs text-purple-600">Briefings Analisados</div>
                                    </div>
                                </div>
                            )}

                            {/* Switch de Formato de Links */}
                            <div className="flex items-center justify-between gap-3 mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-blue-900">
                                        Formato dos Links:
                                    </span>
                                    <span className="text-xs text-blue-600">
                                        {useProcessedLinks ? 'Reduzidos (sem /login)' : 'Completos (originais)'}
                                    </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useProcessedLinks}
                                        onChange={(e) => setUseProcessedLinks(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    <span className="ml-3 text-sm font-medium text-gray-700">
                                        {useProcessedLinks ? 'Reduzidos' : 'Completos'}
                                    </span>
                                </label>
                            </div>

                            {/* Controles de Seleção */}
                            <div className="flex items-center gap-2 mt-4 p-3 bg-gray-100 rounded border border-gray-300">
                                <div className="flex items-center gap-2 flex-1">
                                    <Button
                                        onClick={toggleSelectAllLinks}
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-2"
                                    >
                                        {selectedLinksToDownload.size === linkComparison.links?.length ? (
                                            <>
                                                <CheckSquare className="w-4 h-4" />
                                                Desselecionar Todos
                                            </>
                                        ) : (
                                            <>
                                                <Square className="w-4 h-4" />
                                                Selecionar Todos
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        onClick={selectOnlyDuplicates}
                                        variant="outline"
                                        size="sm"
                                        disabled={(linkComparison.summary?.duplicates || 0) === 0}
                                        className="flex items-center gap-2"
                                    >
                                        <CheckSquare className="w-4 h-4" />
                                        Apenas Duplicados
                                    </Button>
                                    <div className="text-sm text-gray-600 ml-auto">
                                        {selectedLinksToDownload.size} de {linkComparison.links?.length || 0} selecionados
                                    </div>
                                </div>
                            </div>

                            {/* Botões de Ação */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                <Button
                                    onClick={() => {
                                        const formattedLinks = formatLinksGroupedByDSID(linkComparison.links);
                                        copyToClipboard(formattedLinks, 'all-compared-links');
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    {copiedItems.has('all-compared-links') ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                    Copiar Todos Agrupados ({linkComparison.summary?.uniqueLinks || 0})
                                </Button>
                                <Button
                                    onClick={() => {
                                        const duplicateLinks = linkComparison.links?.filter(l => l.isDuplicate) || [];
                                        const formattedDuplicates = formatLinksGroupedByDSID(duplicateLinks);
                                        copyToClipboard(formattedDuplicates, 'duplicate-links');
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    {copiedItems.has('duplicate-links') ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                    Copiar Duplicados Agrupados ({linkComparison.summary?.duplicates || 0})
                                </Button>

                                {/* Divisor */}
                                <div className="w-px h-8 bg-border"></div>

                                {/* Botões de Download DAM */}
                                <Button
                                    onClick={() => downloadLinksFromDAM('selected')}
                                    disabled={isDownloadingFromDAM || selectedLinksToDownload.size === 0}
                                    variant="default"
                                    size="sm"
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                                >
                                    {isDownloadingFromDAM ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Baixando {damDownloadProgress.current}/{damDownloadProgress.total}...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Baixar Selecionados ({selectedLinksToDownload.size})
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={() => downloadLinksFromDAM('all')}
                                    disabled={isDownloadingFromDAM}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    {isDownloadingFromDAM ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Baixar Todos ({linkComparison.summary?.uniqueLinks || 0})
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={() => downloadLinksFromDAM('duplicates')}
                                    disabled={isDownloadingFromDAM || (linkComparison.summary?.duplicates || 0) === 0}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    {isDownloadingFromDAM ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Baixar Apenas Duplicados ({linkComparison.summary?.duplicates || 0})
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Lista de Links */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-3">
                                {linkComparison.links?.map((link, index) => (
                                    <div
                                        key={index}
                                        className={`p-4 rounded border ${link.isDuplicate
                                            ? 'bg-orange-50 border-orange-200'
                                            : 'bg-gray-50 border-gray-200'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3 mb-2">
                                            {/* Checkbox de Seleção */}
                                            <div className="flex items-center pt-1">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedLinksToDownload.has(link.processedUrl)}
                                                    onChange={() => toggleLinkSelection(link.processedUrl)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <a
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 hover:underline break-all"
                                                >
                                                    {link.processedUrl}
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge
                                                    variant={link.isDuplicate ? 'destructive' : 'default'}
                                                    className="text-xs"
                                                >
                                                    {link.count}x
                                                </Badge>
                                                <Button
                                                    onClick={() => copyToClipboard(link.processedUrl, `link-${index}`)}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                >
                                                    {copiedItems.has(`link-${index}`) ? (
                                                        <Check className="w-3 h-3 text-green-600" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Ocorrências */}
                                        {link.isDuplicate && (
                                            <div className="mt-2 pl-4 border-l-2 border-orange-300">
                                                <div className="text-xs font-medium text-gray-600 mb-1">
                                                    Encontrado em:
                                                </div>
                                                <div className="space-y-1">
                                                    {link.occurrences.map((occ, occIndex) => (
                                                        <div key={occIndex} className="text-xs text-gray-600">
                                                            <span className="font-mono font-medium">{occ.dsid}</span>
                                                            {' - '}
                                                            <span>{occ.fileName}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {(!linkComparison.links || linkComparison.links.length === 0) && (
                                    <div className="text-center py-8 text-gray-500">
                                        Nenhum link encontrado nos briefings selecionados
                                    </div>
                                )}
                            </div>
                        </div>
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