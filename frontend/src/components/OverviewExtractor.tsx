import React, { useState } from 'react';
import { AlertTriangle, FileJson, Copy, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';

interface ExtractedData {
    forSpreadsheet?: Record<string, string>;
    processingInfo?: {
        originalFieldCount: number;
        cleanedFieldCount: number;
        extractedKeyFields: number;
    };
    [key: string]: unknown;
}

interface BatchResult {
    url: string;
    success: boolean;
    data?: ExtractedData;
    error?: string;
}

interface BatchResponse {
    success: boolean;
    total: number;
    successful: number;
    failed: number;
    results: BatchResult[];
    errors?: BatchResult[];
}

interface ProgressItem {
    projectNumber: number;
    status: 'pending' | 'running' | 'success' | 'fail';
    percent: number;
    dsid?: string;
    stage?: string;
}

const OverviewExtractor: React.FC = () => {
    const [projectUrls, setProjectUrls] = useState<string[]>(['']);
    const [loading, setLoading] = useState(false);
    const [batchResults, setBatchResults] = useState<BatchResponse | null>(null);
    const [progressList, setProgressList] = useState<ProgressItem[]>([]);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string>('');

    const { extractOverviewBatch } = useWorkfrontApi();

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
        const current = [...projectUrls];
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
        setProjectUrls(current.filter(x => x !== ''));
    };

    const getValidUrls = () => {
        return projectUrls.filter(url => url.trim() !== '');
    };

    // Normaliza URL para /overview
    const normalizeToOverviewUrl = (url: string): string => {
        // Remove qualquer rota após o ID do projeto e adiciona /overview
        const baseUrlMatch = url.match(/(.*\/project\/[a-f0-9]+)/i);
        if (baseUrlMatch) {
            return `${baseUrlMatch[1]}/overview`;
        }
        return url;
    };

    const handleExtractBatch = async () => {
        const validUrls = getValidUrls();

        if (validUrls.length === 0) {
            setError('Adicione pelo menos uma URL de projeto');
            return;
        }

        try {
            setError('');
            setBatchResults(null);
            setLoading(true);

            // Normaliza todas as URLs para /overview
            const normalizedUrls = validUrls.map(url => normalizeToOverviewUrl(url));

            // Pré-popula progresso
            setProgressList(normalizedUrls.map((_, i) => ({
                projectNumber: i + 1,
                status: 'pending',
                percent: 0,
                stage: 'Aguardando'
            })));

            const result = await extractOverviewBatch(normalizedUrls);

            // Atualiza progresso com resultados (comparando com URLs normalizadas)
            setProgressList(normalizedUrls.map((normalizedUrl, i) => {
                const resultItem = result.results.find((r: BatchResult) => r.url === normalizedUrl);
                return {
                    projectNumber: i + 1,
                    status: resultItem?.success ? 'success' : 'fail',
                    percent: 100,
                    dsid: resultItem?.data?.forSpreadsheet?.DSID,
                    stage: resultItem?.success ? 'Concluído' : 'Falha'
                };
            }));

            setBatchResults(result as BatchResponse);
        } catch (err) {
            console.error('Erro ao extrair em lote:', err);
            setError('Erro ao processar extração em lote');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyBatchForSpreadsheet = () => {
        if (batchResults && batchResults.results) {
            const rows = batchResults.results
                .filter(r => r.success && r.data?.forSpreadsheet)
                .map(r => {
                    const data = r.data!.forSpreadsheet!;
                    const values = Object.values(data);

                    // Converte URL de /overview para /documents para o link
                    const documentsUrl = r.url.replace('/overview', '/documents');

                    // Cria array de valores, adicionando hyperlinks no DSID e ATIVIDADE
                    // SEM TRUNCAR - copia os valores completos
                    return Object.keys(data).map((key, index) => {
                        const value = values[index] as string;

                        // Adiciona hyperlink no DSID
                        if (key === 'DSID' && value) {
                            return `=HYPERLINK("${documentsUrl}", "${value}")`;
                        }

                        // Adiciona hyperlink na ATIVIDADE (valor completo, sem truncar)
                        if (key === 'ATIVIDADE' && value) {
                            return `=HYPERLINK("${documentsUrl}", "${value}")`;
                        }

                        // Retorna valor completo sem truncar
                        return value;
                    }).join('\t');
                });

            navigator.clipboard.writeText(rows.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };


    return (
        <div className="space-y-6">
            <div className="bg-card p-6 border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <FileJson className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Extrator de Overview</h2>
                </div>

                <p className="text-muted-foreground mb-6">
                    Extraia informações da aba Overview de múltiplos projetos simultaneamente (3 por vez).
                    <br />
                    Os resultados serão automaticamente <strong>ordenados por DSID crescente</strong>.
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
                        <div className="leading-4">
                            Dica: você pode <strong>Ctrl + V</strong> várias URLs de uma vez
                            (separe por quebra de linha, espaço, vírgula ou ponto e vírgula).
                        </div>
                    </div>
                </div>

                {/* Botão de Ação */}
                <div className="flex gap-3 mt-6">
                    <Button
                        onClick={handleExtractBatch}
                        variant="default"
                        disabled={loading || getValidUrls().length === 0}
                        className="flex items-center gap-2"
                    >
                        <FileJson className="w-4 h-4" />
                        {loading ? 'Extraindo...' : 'Extrair Dados'}
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

            {/* Progresso por projeto */}
            {(loading || progressList.length > 0) && (
                <div className="bg-card p-6 border border-border">
                    <h3 className="text-lg font-semibold text-card-foreground mb-4">Progresso</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {progressList.map((p) => (
                            <div
                                key={p.projectNumber}
                                className={`p-3 border rounded-lg transition-all ${p.status === 'success'
                                        ? 'bg-green-950/50 border-green-700'
                                        : p.status === 'fail'
                                            ? 'bg-destructive/10 border-destructive'
                                            : 'bg-muted border-border'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold truncate">
                                        {p.dsid ? `DSID ${p.dsid}` : `#${p.projectNumber}`}
                                    </div>
                                    <Badge
                                        variant={
                                            p.status === 'success' ? 'default' :
                                                p.status === 'fail' ? 'destructive' :
                                                    'outline'
                                        }
                                        className="text-[10px] h-5 px-1.5"
                                    >
                                        {p.status === 'success' ? '✓' :
                                            p.status === 'fail' ? '✗' :
                                                p.status === 'running' ? '⏳' : '○'}
                                    </Badge>
                                </div>
                                <div className={`h-1.5 rounded-full overflow-hidden ${p.status === 'success' ? 'bg-green-950' : 'bg-background'
                                    } border border-border`}>
                                    <div
                                        className={`h-full transition-all duration-300 ${p.status === 'fail' ? 'bg-destructive' :
                                                p.status === 'success' ? 'bg-green-600' :
                                                    'bg-primary'
                                            }`}
                                        style={{ width: `${Math.max(0, Math.min(100, p.percent))}%` }}
                                    ></div>
                                </div>
                                <div className="mt-2 text-[10px] text-muted-foreground truncate" title={p.stage}>
                                    {p.stage || (
                                        p.status === 'success' ? 'Concluído' :
                                            p.status === 'fail' ? 'Falha' :
                                                'Processando'
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Resultado */}
            {batchResults && (
                <div className="bg-card p-6 border border-border">
                    <h3 className="text-lg font-semibold mb-4 text-card-foreground">
                        Resultado da Extração
                    </h3>

                    {/* Resumo */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-4 bg-muted border border-border">
                            <div className="text-2xl font-bold text-primary">
                                {batchResults.successful}
                            </div>
                            <div className="text-sm text-muted-foreground">Sucessos</div>
                        </div>
                        <div className="text-center p-4 bg-muted border border-border">
                            <div className="text-2xl font-bold text-destructive">
                                {batchResults.failed}
                            </div>
                            <div className="text-sm text-muted-foreground">Falhas</div>
                        </div>
                        <div className="text-center p-4 bg-muted border border-border">
                            <div className="text-2xl font-bold text-primary">
                                {batchResults.total}
                            </div>
                            <div className="text-sm text-muted-foreground">Total</div>
                        </div>
                    </div>

                    {/* Tabela Unificada com Todos os Dados */}
                    {batchResults.successful > 0 && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <FileJson className="w-4 h-4" />
                                    Dados Extraídos
                                </h4>
                                {/* Botões de Cópia - Estilo Tabs */}
                                {batchResults.successful > 0 && (
                                    <div >
                                        <div className="inline-flex rounded-md shadow-sm border border-border overflow-hidden">
                                            <Button
                                                size="sm"
                                                variant={copied ? "default" : "outline"}
                                                onClick={handleCopyBatchForSpreadsheet}
                                                disabled={copied}
                                                className="rounded-none border-r border-border flex-1"
                                            >
                                                {copied ? (
                                                    <>
                                                        <Check className="mr-2 h-4 w-4" />
                                                        Copiado!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="mr-2 h-4 w-4" />
                                                        Copiar Todos
                                                    </>
                                                )}
                                            </Button>
                                            {/* <Button
                                                size="sm"
                                                variant={copied ? "default" : "outline"}
                                                onClick={handleCopyBatchWithLabels}
                                                disabled={copied}
                                                className="rounded-none flex-1"
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                Com Cabeçalhos
                                            </Button> */}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="border border-border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto max-h-[600px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-muted z-10">
                                            <TableRow>
                                                {(() => {
                                                    const firstSuccess = batchResults.results.find(
                                                        r => r.success && r.data?.forSpreadsheet
                                                    );
                                                    if (!firstSuccess?.data?.forSpreadsheet) return null;
                                                    return Object.keys(firstSuccess.data.forSpreadsheet).map(
                                                        (key) => (
                                                            <TableHead key={key} className="font-bold whitespace-nowrap text-[10px]">
                                                                {key}
                                                            </TableHead>
                                                        )
                                                    );
                                                })()}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {batchResults.results
                                                .filter(r => r.success && r.data?.forSpreadsheet)
                                                .map((project, index) => {
                                                    const firstSuccess = batchResults.results.find(
                                                        r => r.success && r.data?.forSpreadsheet
                                                    );
                                                    const columnKeys = firstSuccess?.data?.forSpreadsheet
                                                        ? Object.keys(firstSuccess.data.forSpreadsheet)
                                                        : [];

                                                    return (
                                                        <TableRow key={index} className="hover:bg-muted/50">
                                                            {Object.values(project.data!.forSpreadsheet!).map(
                                                                (value, cellIndex) => {
                                                                    const columnName = columnKeys[cellIndex];
                                                                    const stringValue = value as string;

                                                                    // Truncar ATIVIDADE em 50 caracteres
                                                                    const displayValue = columnName === 'ATIVIDADE' && stringValue.length > 50
                                                                        ? `${stringValue.substring(0, 50)}...`
                                                                        : stringValue;

                                                                    return (
                                                                        <TableCell
                                                                            key={cellIndex}
                                                                            className="font-mono text-[10px] whitespace-nowrap"
                                                                            title={columnName === 'ATIVIDADE' ? stringValue : undefined}
                                                                        >
                                                                            {displayValue}
                                                                        </TableCell>
                                                                    );
                                                                }
                                                            )}
                                                        </TableRow>
                                                    );
                                                })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                                💡 Role horizontalmente para ver todas as colunas.
                                Use os botões acima para copiar para o Google Sheets.
                            </div>
                        </div>
                    )}

                    {/* Projetos com Falha */}
                    {batchResults.failed > 0 && (
                        <div>
                            <h4 className="font-medium text-destructive mb-3">
                                ❌ Projetos com Falha
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {batchResults.errors?.map((project, index) => (
                                    <div key={index} className="p-3 bg-muted border border-border">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="text-sm text-foreground font-mono break-all">
                                                    {project.url}
                                                </div>
                                                <div className="text-xs text-destructive mt-1">
                                                    {project.error}
                                                </div>
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

export default OverviewExtractor;
