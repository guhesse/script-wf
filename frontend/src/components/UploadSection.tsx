import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Archive,
    Upload,
    FileArchive,
    FileText,
    FileVideo,
    FileImage,
    Trash2,
    UserCheck,
    Link,
} from 'lucide-react';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import { useAppAuth } from '@/hooks/useAppAuth';
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

interface UploadInfo {
    fileName: string;
    uploadId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    cdnUrl: string;
    storagePath: string;
}

export default function UploadSection({ projectUrl, setProjectUrl, selectedUser, setSelectedUser, currentProject }: UploadSectionProps) {
    const [assetZip, setAssetZip] = useState<File | null>(null);
    const [finalMaterials, setFinalMaterials] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [stagedPaths, setStagedPaths] = useState<{ assetZip?: string; finalMaterials?: string[] } | null>(null);
    // estado de execução direta removido; execução ocorre via Timeline
    const zipInputRef = useRef<HTMLInputElement>(null);
    const finalsInputRef = useRef<HTMLInputElement>(null);

    const { getActiveUploadJob, cancelUploadJob } = useWorkfrontApi();
    const { token } = useAppAuth();
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<string | null>(null);

    const hasPdfInFinals = useMemo(() => finalMaterials.some(isPdf), [finalMaterials]);
    const isValidUrl = (url: string) => !!url && url.includes('workfront');

    const toArray = (files: FileList | File[]): File[] => Array.from(files instanceof FileList ? Array.from(files) : files);

    const onDropZip = (files: FileList | File[]) => {
        const arr = toArray(files);
        const firstZip = arr.find(isZip) || null;
        if (firstZip) setAssetZip(firstZip);
    };

    const onDropFinals = (files: FileList | File[]) => {
        const arr = toArray(files);
        const accepted = arr.filter(f => isPdf(f) || isImage(f) || isVideo(f));
        setFinalMaterials(prev => {
            // evitar duplicatas por nome + tamanho
            const map = new Map<string, File>();
            [...prev, ...accepted].forEach(f => map.set(`${f.name}-${f.size}`, f));
            return Array.from(map.values());
        });
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
                    setJobStatus(job.status);
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
                    setJobStatus(job.status);
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
                        throw new Error(`Erro no upload de ${file.name}: ${uploadResponse.statusText}`);
                    }

                    // Capturar o caminho real retornado pelo servidor
                    const uploadResult = await uploadResponse.json();
                    realPaths.push(uploadResult.path);
                    
                    console.log(`✅ Arquivo ${file.name} enviado para: ${uploadResult.path}`);
                }

                // Usar os caminhos REAIS retornados pelo servidor
                const assetZipPath = realPaths.find(path => path.toLowerCase().endsWith('.zip'));
                const finalMaterialPaths = realPaths.filter(path => !path.toLowerCase().endsWith('.zip'));
                
                const staged = {
                    assetZip: assetZipPath,
                    finalMaterials: finalMaterialPaths
                };
                
                console.log('🐛 Staged paths:', staged);

                setStagedPaths(staged);
                if (result.jobId) {
                    setJobId(result.jobId);
                    setJobStatus('staged');
                }

                console.log('Arquivos enviados para servidor:', result);
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
            setJobStatus('canceled');
        }
    };

    return (
        <div className="space-y-6">
            {/* URL do Projeto */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Link className="w-4 h-4 text-primary" />
                        URL do Projeto (Documentos Workfront)
                    </CardTitle>
                </CardHeader>
                <CardContent>
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

                    <div className="flex gap-3">
                        <Input
                            type="url"
                            value={projectUrl}
                            onChange={(e) => setProjectUrl(e.target.value)}
                            placeholder="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/..."
                            className="flex-1"
                        />
                    </div>
                    {projectUrl && !isValidUrl(projectUrl) && (
                        <p className="text-destructive text-sm mt-2">URL deve ser da página de documentos do Workfront</p>
                    )}
                </CardContent>
            </Card>

            {/* Seleção de Equipe */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <UserCheck className="w-4 h-4 text-primary" />
                        Selecionar Equipe para Comentário
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Button variant={selectedUser === 'carol' ? 'default' : 'secondary'} onClick={() => setSelectedUser('carol')} className="flex-1 justify-start">
                            <UserCheck className="mr-2 h-4 w-4" /> Equipe Completa (Carolina)
                            <Badge variant="secondary" className="ml-2">7 pessoas</Badge>
                        </Button>
                        <Button variant={selectedUser === 'giovana' ? 'default' : 'secondary'} onClick={() => setSelectedUser('giovana')} className="flex-1 justify-start">
                            <UserCheck className="mr-2 h-4 w-4" /> Equipe Reduzida (Giovana)
                            <Badge variant="secondary" className="ml-2">3 pessoas</Badge>
                        </Button>
                        <Button variant={selectedUser === 'test' ? 'default' : 'secondary'} onClick={() => setSelectedUser('test')} className="flex-1 justify-start">
                            <UserCheck className="mr-2 h-4 w-4" /> Teste (Gustavo)
                            <Badge variant="secondary" className="ml-2">1 pessoa</Badge>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Zona: Asset Release (ZIP) */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Archive className="w-4 h-4 text-primary" />
                        Asset Release (ZIP)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); onDropZip(e.dataTransfer.files); }}
                        className="rounded border border-dashed border-border p-6 text-center bg-muted/40 hover:bg-muted transition-colors"
                    >
                        <div className="flex flex-col items-center gap-2">
                            <FileArchive className="w-8 h-8 text-primary" />
                            <div className="text-sm text-muted-foreground">Arraste 1 arquivo .zip aqui ou</div>
                            <div>
                                <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files && onDropZip(e.target.files)} />
                                <Button variant="secondary" onClick={() => zipInputRef.current?.click()}>
                                    <Upload className="w-4 h-4 mr-2" /> Selecionar ZIP
                                </Button>
                            </div>
                        </div>
                    </div>

                    {assetZip && (
                        <div className="mt-3 flex items-center justify-between rounded border border-border p-3">
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
                    )}
                </CardContent>
            </Card>

            {/* Zona: Final Materials */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Upload className="w-4 h-4 text-primary" />
                        Final Materials (PDF obrigatório; MP4/PNG opcionais)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); onDropFinals(e.dataTransfer.files); }}
                        className="rounded border border-dashed border-border p-6 text-center bg-muted/40 hover:bg-muted transition-colors"
                    >
                        <div className="flex flex-col items-center gap-2">
                            <FileText className="w-5 h-5" />
                            <div className="text-sm text-muted-foreground">Arraste PDFs, PNGs e MP4s ou</div>
                            <div>
                                <input
                                    ref={finalsInputRef}
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.mkv"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => e.target.files && onDropFinals(e.target.files)}
                                />
                                <Button variant="secondary" onClick={() => finalsInputRef.current?.click()}>
                                    <Upload className="w-4 h-4 mr-2" /> Selecionar Arquivos
                                </Button>
                            </div>
                        </div>
                    </div>

                    {finalMaterials.length > 0 && (
                        <div className="mt-3 space-y-2">
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
                    )}

                    {!hasPdfInFinals && finalMaterials.length > 0 && (
                        <Alert className="mt-3 border-destructive/20 bg-destructive/10">
                            <AlertDescription>Inclua pelo menos 1 arquivo PDF nos Final Materials.</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* Timeline Section - agora sempre visível para permitir Status/Horas sem arquivos */}
            <TimelineSection
                projectUrl={projectUrl}
                selectedUser={selectedUser}
                stagedPaths={stagedPaths}
            />

            {/* Ações - modificado */}
            <div className="space-y-4">
                {/* Etapa 1: Preparar arquivos */}
                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleSubmit}
                        disabled={!assetZip || finalMaterials.length === 0 || !hasPdfInFinals || !isValidUrl(projectUrl) || submitting}
                    >
                        <Upload className="w-4 h-4 mr-2" /> {stagedPaths ? 'Arquivos Preparados ✓' : 'Preparar Arquivos'}
                    </Button>
                    <Button variant="outline" onClick={clearAll} disabled={submitting}>Limpar</Button>
                    {jobId && (
                        <Button variant="destructive" onClick={handleCancel} disabled={submitting}>Cancelar</Button>
                    )}
                </div>

                {/* Mensagem informativa quando arquivos estão preparados */}
                {stagedPaths && (
                    <Alert className="border-primary/20 bg-primary/5">
                        <AlertDescription className="text-sm">
                            ✅ Arquivos preparados{jobStatus ? ` (Status: ${jobStatus})` : ''}! Use a Timeline para configurar Upload / Share / Comments ou apenas Status / Hours.
                        </AlertDescription>
                    </Alert>
                )}
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
