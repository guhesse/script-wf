import { useEffect, useState } from 'react';
import { useMastersApi } from '@/hooks/useMastersApi';
import type { MasterAsset, MasterFileType, MasterEditableType } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Download } from 'lucide-react';
import MastersUploadDialog from './MastersUploadDialog';

const fileTypeOptions: MasterFileType[] = ['PSD', 'AI', 'INDD', 'XD', 'FIGMA', 'PDF', 'JPG', 'PNG', 'MP4', 'OTHER'];
const editableTypeOptions: MasterEditableType[] = ['STATIC', 'ANIMATED', 'VIDEO', 'TEMPLATE', 'DOCUMENT', 'OTHER'];

export const MastersGallery = () => {
    const { isLoading, data, listMasters } = useMastersApi();
    const [search, setSearch] = useState('');
    const [brand, setBrand] = useState('');
    // Usamos 'ALL' para representar filtro não aplicado (Radix Select não aceita value="")
    const [fileType, setFileType] = useState<string>('ALL');
    const [editableType, setEditableType] = useState<string>('ALL');
    const [page, setPage] = useState(1);
    // Upload rápido substituído pelo modal avançado

    useEffect(() => {
        listMasters({
            search,
            brand,
            fileType: fileType !== 'ALL' ? fileType as MasterFileType : undefined,
            editableType: editableType !== 'ALL' ? editableType as MasterEditableType : undefined,
            page,
            pageSize: 24,
        });
    }, [search, brand, fileType, editableType, page, listMasters]);

    const assets = data?.items || [];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">Masters</h2>
                <p className="text-sm text-muted-foreground">Base central de arquivos principais para desdobramentos.</p>
            </div>

            {/* Filtros */}
            <div className="grid gap-4 md:grid-cols-5">
                <Input placeholder="Busca (título, arquivo, marca)" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
                <Input placeholder="Marca" value={brand} onChange={(e) => { setPage(1); setBrand(e.target.value); }} />
                <Select value={fileType} onValueChange={(v) => { setPage(1); setFileType(v); }}>
                    <SelectTrigger><SelectValue placeholder="Tipo Arquivo" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Todos</SelectItem>
                        {fileTypeOptions.map(ft => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={editableType} onValueChange={(v) => { setPage(1); setEditableType(v); }}>
                    <SelectTrigger><SelectValue placeholder="Tipo Editável" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Todos</SelectItem>
                        {editableTypeOptions.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => { setSearch(''); setBrand(''); setFileType('ALL'); setEditableType('ALL'); setPage(1); }}>Limpar</Button>
                </div>
            </div>

            <div className="flex justify-end">
                <MastersUploadDialog onUploaded={() => listMasters({ page: 1, pageSize: data?.pagination.pageSize || 24 })} />
            </div>

            {/* Grid */}
            {isLoading && !assets.length && (
                <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {assets.map(asset => <MasterCard key={asset.id} asset={asset} />)}
            </div>

            {/* Paginação */}
            {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border text-sm">
                    <span>Página {data.pagination.page} de {data.pagination.totalPages} (Total {data.pagination.total})</span>
                    <div className="space-x-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                        <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

const MasterCard = ({ asset }: { asset: MasterAsset }) => {
    const sizeMB = (asset.fileSize / (1024 * 1024)).toFixed(2);
    return (
        <div className="group relative rounded border border-border bg-card/50 p-3 flex flex-col gap-2 hover:shadow-sm">
            <div className="aspect-video w-full bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground overflow-hidden">
                {asset.previewImageUrl ? (
                    <img src={asset.previewImageUrl} alt={asset.title} className="object-contain w-full h-full" />
                ) : (
                    <span className="opacity-60">Sem preview</span>
                )}
            </div>
            <div className="space-y-1">
                <div className="font-medium text-sm line-clamp-2" title={asset.title}>{asset.title}</div>
                <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{asset.fileType}</span>
                    <span>{sizeMB} MB</span>
                </div>
                {asset.brand && <div className="text-xs">{asset.brand}</div>}
                <div className="flex flex-wrap gap-1 pt-1">
                    {asset.tags.slice(0, 4).map(t => <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0">{t}</Badge>)}
                    {asset.tags.length > 4 && <Badge variant="outline" className="text-[10px] px-1 py-0">+{asset.tags.length - 4}</Badge>}
                </div>
            </div>
            <div className="mt-auto flex gap-2 pt-2">
                <Button asChild size="sm" variant="outline" className="w-full">
                    <a href={asset.bunnyCdnUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1" />Download</a>
                </Button>
            </div>
        </div>
    );
};

export default MastersGallery;
