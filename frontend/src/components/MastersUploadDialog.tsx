import { useState, useRef, useEffect } from 'react';
import type { DragEvent } from 'react';
import { useMastersApi } from '@/hooks/useMastersApi';
import type { MasterEditableType } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './ui/dialog';
import { RefreshCcw, Trash2, ImagePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const editableTypeOptions: MasterEditableType[] = ['STATIC', 'ANIMATED', 'VIDEO', 'TEMPLATE', 'DOCUMENT', 'OTHER'];

interface Props {
    onUploaded?: () => void;
}

export const MastersUploadDialog = ({ onUploaded }: Props) => {
    const { uploadMaster } = useMastersApi();
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);           // Arquivo principal
    const [title, setTitle] = useState('');
    const [brand, setBrand] = useState('dell');
    const [editableType, setEditableType] = useState<MasterEditableType>('STATIC');
    const [tags, setTags] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [metaLoading, setMetaLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [thumbFile, setThumbFile] = useState<File | null>(null); // Miniatura obrigatória agora
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [previewBase64, setPreviewBase64] = useState<string | null>(null); // base64 da miniatura
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const thumbInputRef = useRef<HTMLInputElement | null>(null);
    const [dragMain, setDragMain] = useState(false);
    const [dragThumb, setDragThumb] = useState(false); // drag para área da miniatura (preview principal)

    const toggleTag = (t: string) => {
        setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    };

    const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
    });

    const handleSubmit = async () => {
        if (!file || !thumbFile) return; // Miniatura é requisito
        setIsSubmitting(true);
        try {
            let customPreview = previewBase64;
            if (!customPreview && thumbFile) {
                customPreview = await fileToBase64(thumbFile);
            }
            await uploadMaster({ file, title: title || file.name.replace(/\.[^.]+$/, ''), brand, editableType, tags, previewBase64: customPreview || undefined, description });
            setOpen(false);
            setFile(null); setTitle(''); setTags([]);
            setDescription('');
            setThumbFile(null); setThumbUrl(null); setPreviewBase64(null);
            onUploaded?.();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Carregar meta
    useEffect(() => {
        if (!open) return;
        (async () => {
            setMetaLoading(true);
            try {
                const res = await fetch('/api/masters/meta/all');
                const json = await res.json();
                if (json.tags) setAvailableTags(json.tags);
            } catch { /* ignore */ }
            finally { setMetaLoading(false); }
        })();
    }, [open]);

    // Auto popular título ao selecionar arquivo principal
    useEffect(() => { if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, '')); }, [file, title]);

    // Suporte a colar imagem (Ctrl+V) como miniatura
    useEffect(() => {
        if (!open) return;
        const handler = (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const items = Array.from(e.clipboardData.items);
            const imgItem = items.find(it => it.type.startsWith('image/'));
            if (imgItem) {
                const fileObj = imgItem.getAsFile();
                if (fileObj) {
                    setThumbFile(fileObj);
                    fileToBase64(fileObj).then(b64 => setPreviewBase64(b64));
                }
            }
        };
        window.addEventListener('paste', handler as any);
        return () => window.removeEventListener('paste', handler as any);
    }, [open]);

    // Preview de miniatura custom
    useEffect(() => {
        if (!thumbFile) { setThumbUrl(null); return; }
        const url = URL.createObjectURL(thumbFile);
        setThumbUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [thumbFile]);

    const onMainDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'dragenter' || e.type === 'dragover') setDragMain(true); else if (e.type === 'dragleave') setDragMain(false); };
    const onMainDrop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragMain(false); if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]); };
    const onThumbDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'dragenter' || e.type === 'dragover') setDragThumb(true); else if (e.type === 'dragleave') setDragThumb(false); };
    const onThumbDrop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragThumb(false); if (e.dataTransfer.files?.[0]) { const f = e.dataTransfer.files[0]; if (f.type.startsWith('image/')) { setThumbFile(f); fileToBase64(f).then(b64 => setPreviewBase64(b64)); } } };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={buttonVariants({ variant: 'default', size: 'sm' })}>Novo Master</DialogTrigger>
            <DialogContent className="max-w-5xl p-0 overflow-hidden">
                <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b">
                    <DialogTitle className="text-lg font-semibold">Upload de Master</DialogTitle>
                    <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition text-sm">✕</button>
                </div>
                <div className="grid grid-cols-12 gap-6 px-6 pb-6 pt-4">
                    {/* Coluna Preview (Esquerda) */}
                    <div className="col-span-5 flex flex-col gap-5">
                        {/* Área principal: agora é a dropzone da miniatura */}
                        <div
                            onDragEnter={onThumbDrag}
                            onDragLeave={onThumbDrag}
                            onDragOver={onThumbDrag}
                            onDrop={onThumbDrop}
                            className={`relative border rounded-lg aspect-video flex items-center justify-center overflow-hidden transition bg-muted/10 ${dragThumb ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : ''}`}
                        >
                            <input ref={thumbInputRef} type="file" accept="image/png,image/jpeg" className="hidden" id="thumb-hidden-input" onChange={async e => { const f = e.target.files?.[0]; setThumbFile(f || null); if (f) { const b64 = await fileToBase64(f); setPreviewBase64(b64); } else { setPreviewBase64(null); } }} />
                            {thumbUrl ? (
                                <img src={thumbUrl} alt="miniatura" className="object-contain w-full h-full" />
                            ) : (
                                <label htmlFor="thumb-hidden-input" className="cursor-pointer flex flex-col items-center gap-2 text-xs text-muted-foreground px-4 text-center select-none">
                                    <ImagePlus className="h-8 w-8 opacity-60" />
                                    <span>Arraste ou clique para enviar a miniatura (PNG/JPG até ~1MB)</span>
                                    <span className="text-[10px] opacity-60">Ela representará o Master na galeria</span>
                                </label>
                            )}
                            {thumbUrl && (
                                <div className="absolute top-2 right-2 flex gap-1">
                                    <Button size="icon" variant="secondary" className="h-8 w-8" title="Trocar" onClick={() => thumbInputRef.current?.click()}>
                                        <RefreshCcw className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="secondary" className="h-8 w-8 text-destructive" title="Limpar" onClick={() => { setThumbFile(null); setThumbUrl(null); setPreviewBase64(null); }}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                        {/* Lista agora só com o arquivo principal */}
                        <ul className="flex flex-col gap-4">
                            <li className={`border rounded-lg p-4 text-sm transition ${dragMain ? 'border-primary bg-primary/5' : 'border-border'}`}
                                onDragEnter={onMainDrag} onDragLeave={onMainDrag} onDragOver={onMainDrag} onDrop={onMainDrop}>
                                <div className="flex items-start justify-between mb-2">
                                    <span className="font-medium">Arquivo principal</span>
                                    {file && <div className="flex gap-1"> <Button size="icon" variant="ghost" className="h-7 w-7" title="Trocar" onClick={() => fileInputRef.current?.click()}><RefreshCcw className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Limpar" onClick={() => setFile(null)}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
                                </div>
                                <input ref={fileInputRef} type="file" className="hidden" id="input-master-file" onChange={e => setFile(e.target.files?.[0] || null)} />
                                {!file && (
                                    <label htmlFor="input-master-file" className="block cursor-pointer text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center hover:bg-muted/40">
                                        Arraste aqui ou clique para selecionar (PSD, AI, PDF, ZIP, MP4...)
                                    </label>
                                )}
                                {file && (
                                    <div className="flex items-center gap-3">
                                        {thumbUrl && <div className="h-10 w-14 rounded-sm overflow-hidden bg-muted flex items-center justify-center border"><img src={thumbUrl} alt="thumb mini" className="object-cover w-full h-full" /></div>}
                                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                                            <div className="truncate" title={file.name}>{file.name}</div>
                                            <div className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'tipo desconhecido'}</div>
                                        </div>
                                    </div>
                                )}
                            </li>
                        </ul>
                    </div>

                    {/* Coluna Metadados (Direita) */}
                    <div className="col-span-7 flex flex-col gap-6">
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-12">
                                <label className="text-xs uppercase tracking-wide text-muted-foreground">Nome do arquivo</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título descritivo" className="mt-1" />
                            </div>
                            <div className="col-span-6">
                                <label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de asset</label>
                                <Select value={editableType} onValueChange={v => setEditableType(v as MasterEditableType)}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                                    <SelectContent>{editableTypeOptions.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-6">
                                <label className="text-xs uppercase tracking-wide text-muted-foreground">Marca</label>
                                <Select value={brand} onValueChange={v => setBrand(v)}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Marca" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dell">Dell</SelectItem>
                                        <SelectItem value="alienware">Alienware</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Resumo, contexto, variações, notas de uso..."
                                className="mt-1 w-full min-h-[90px] resize-y rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                maxLength={2000}
                            />
                            <div className="text-[10px] text-muted-foreground mt-1 flex justify-end">{description.length}/2000</div>
                        </div>
                        <div>
                            <label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {availableTags.map(t => {
                                    const active = tags.includes(t);
                                    return <Badge key={t} onClick={() => toggleTag(t)} className={`cursor-pointer px-3 py-1 text-[11px] rounded-full border transition ${active ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{t}</Badge>;
                                })}
                                {metaLoading && <span className="text-xs text-muted-foreground">Carregando...</span>}
                                {!availableTags.length && !metaLoading && <span className="text-xs text-muted-foreground">Nenhuma tag</span>}
                            </div>
                        </div>
                        <div className="mt-auto flex justify-end pt-4">
                            <Button disabled={!file || !thumbFile || isSubmitting} onClick={handleSubmit} className="min-w-[200px] h-11 text-base">
                                {isSubmitting ? 'Enviando...' : 'Fazer upload'}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MastersUploadDialog;
