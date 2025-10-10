import { useState } from 'react';
import { X, Info, Calendar as CalendarIcon, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { kanbanService } from '@/services/kanbanService';
import type { KanbanCard, KanbanStatus, VFType, AssetType, WorkfrontFrente, FiscalYear } from '@/types/kanban';
import {
    KanbanStatusOptions,
    VFTypeOptions,
    AssetTypeOptions,
    WorkfrontFrenteOptions,
    FiscalYearOptions,
} from '@/types/kanban';

// Opções pré-definidas para dropdowns
const CLIENTE_OPTIONS = ['Carolina', 'Giovana'];
const BRAND_OPTIONS = [
    'Dell', 'Alienware'
];
const STUDIO_OPTIONS = ['Sem Studio', 'Rô', 'Tay', 'Gus'] as const;
const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => `W${i + 1}`);
const QUARTER_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4'];

interface KanbanCardFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    card?: KanbanCard;
}

export const KanbanCardForm = ({ open, onClose, onSuccess, card }: KanbanCardFormProps) => {
    const isEditing = !!card;
    const [loading, setLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        atividade: card?.atividade || '',
        dsid: card?.dsid || '',
        status: (card?.status || 'PENDING') as KanbanStatus,
        bi: card?.bi || false,
        cliente: card?.cliente || '',
        brand: card?.brand || '',
        studio: card?.studio || '',
        week: card?.week || '',
        quarter: card?.quarter || '',
        vf: (card?.vf || 'NO_VF') as VFType,
        tipoAsset: (card?.tipoAsset || 'ESTATICO') as AssetType,
        numeroAssets: card?.numeroAssets || 1,
        frente: (card?.frente || 'SOCIAL') as WorkfrontFrente,
        fy: (card?.fy || 'FY25') as FiscalYear,
        start: card?.start || '',
        prevDeliv: card?.prevDeliv || '',
        realDeliv: card?.realDeliv || '',
        entregaR1VML: card?.entregaR1VML || '',
        feedbackR1Dell: card?.feedbackR1Dell || '',
        entregaR2VML: card?.entregaR2VML || '',
        feedbackR2Dell: card?.feedbackR2Dell || '',
        entregaR3VML: card?.entregaR3VML || '',
        feedbackR3Dell: card?.feedbackR3Dell || '',
        entregaR4VML: card?.entregaR4VML || '',
        feedbackR4Dell: card?.feedbackR4Dell || '',
        anotacoes: card?.anotacoes || '',
    });

    const handleChange = (field: string, value: string | number | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.atividade.trim()) {
            toast.error('O campo Atividade é obrigatório');
            return;
        }

        try {
            setLoading(true);
            
            const payload = {
                ...formData,
                numeroAssets: Number(formData.numeroAssets),
                // Converter strings vazias para undefined
                start: formData.start || undefined,
                prevDeliv: formData.prevDeliv || undefined,
                realDeliv: formData.realDeliv || undefined,
                entregaR1VML: formData.entregaR1VML || undefined,
                feedbackR1Dell: formData.feedbackR1Dell || undefined,
                entregaR2VML: formData.entregaR2VML || undefined,
                feedbackR2Dell: formData.feedbackR2Dell || undefined,
                entregaR3VML: formData.entregaR3VML || undefined,
                feedbackR3Dell: formData.feedbackR3Dell || undefined,
                entregaR4VML: formData.entregaR4VML || undefined,
                feedbackR4Dell: formData.feedbackR4Dell || undefined,
            };

            if (isEditing && card) {
                await kanbanService.updateCard(card.id, payload);
                toast.success('Card atualizado com sucesso!');
            } else {
                await kanbanService.createCard(payload);
                toast.success('Card criado com sucesso!');
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Erro ao salvar card:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar card';
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>{isEditing ? 'Editar Card' : 'Novo Card'}</span>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="basic" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="basic">
                                <Info className="h-4 w-4 mr-2" />
                                Básico
                            </TabsTrigger>
                            <TabsTrigger value="client">
                                <Users className="h-4 w-4 mr-2" />
                                Cliente
                            </TabsTrigger>
                            <TabsTrigger value="config">
                                <Settings className="h-4 w-4 mr-2" />
                                Config
                            </TabsTrigger>
                            <TabsTrigger value="dates">
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                Datas
                            </TabsTrigger>
                        </TabsList>

                        {/* Aba: Informações Básicas */}
                        <TabsContent value="basic" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-sm font-medium mb-2 block">
                                        Atividade <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.atividade}
                                        onChange={(e) => handleChange('atividade', e.target.value)}
                                        placeholder="Nome da atividade..."
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">DSID</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.dsid}
                                        onChange={(e) => handleChange('dsid', e.target.value)}
                                        placeholder="Ex: DSID-1234"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Status</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.status}
                                        onChange={(e) => handleChange('status', e.target.value)}
                                    >
                                        {KanbanStatusOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-sm font-medium mb-2 block">Anotações</label>
                                    <textarea
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border min-h-[100px]"
                                        value={formData.anotacoes}
                                        onChange={(e) => handleChange('anotacoes', e.target.value)}
                                        placeholder="Observações adicionais..."
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Aba: Cliente e Projeto */}
                        <TabsContent value="client" className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Cliente</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.cliente}
                                        onChange={(e) => handleChange('cliente', e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {CLIENTE_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Brand</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.brand}
                                        onChange={(e) => handleChange('brand', e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {BRAND_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Studio</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.studio}
                                        onChange={(e) => handleChange('studio', e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {STUDIO_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Frente</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.frente}
                                        onChange={(e) => handleChange('frente', e.target.value)}
                                    >
                                        {WorkfrontFrenteOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Aba: Configurações */}
                        <TabsContent value="config" className="space-y-4 mt-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Tipo de VF</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.vf}
                                        onChange={(e) => handleChange('vf', e.target.value)}
                                    >
                                        {VFTypeOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Tipo de Asset</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.tipoAsset}
                                        onChange={(e) => handleChange('tipoAsset', e.target.value)}
                                    >
                                        {AssetTypeOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Número de Assets</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.numeroAssets}
                                        onChange={(e) => handleChange('numeroAssets', parseInt(e.target.value) || 1)}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Week</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.week}
                                        onChange={(e) => handleChange('week', e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {WEEK_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Quarter</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.quarter}
                                        onChange={(e) => handleChange('quarter', e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {QUARTER_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Fiscal Year</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                        value={formData.fy}
                                        onChange={(e) => handleChange('fy', e.target.value)}
                                    >
                                        {FiscalYearOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Aba: Datas */}
                        <TabsContent value="dates" className="space-y-4 mt-4">
                            <div className="space-y-6">
                                {/* Datas Principais */}
                                <div>
                                    <h4 className="text-sm font-semibold mb-3">Datas Principais</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">Início</label>
                                            <input
                                                type="date"
                                                className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                                value={formData.start}
                                                onChange={(e) => handleChange('start', e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-sm font-medium mb-2 block">Previsão</label>
                                            <input
                                                type="date"
                                                className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                                value={formData.prevDeliv}
                                                onChange={(e) => handleChange('prevDeliv', e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-sm font-medium mb-2 block">Entrega Real</label>
                                            <input
                                                type="date"
                                                className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                                value={formData.realDeliv}
                                                onChange={(e) => handleChange('realDeliv', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Rounds */}
                                {[1, 2, 3, 4].map(round => (
                                    <div key={round}>
                                        <h4 className="text-sm font-semibold mb-3">Round {round}</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">Entrega R{round} VML</label>
                                                <input
                                                    type="date"
                                                    className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                                    value={formData[`entregaR${round}VML` as keyof typeof formData] as string}
                                                    onChange={(e) => handleChange(`entregaR${round}VML`, e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">Feedback R{round} Dell</label>
                                                <input
                                                    type="date"
                                                    className="w-full px-3 py-2 rounded-md bg-background border border-border"
                                                    value={formData[`feedbackR${round}Dell` as keyof typeof formData] as string}
                                                    onChange={(e) => handleChange(`feedbackR${round}Dell`, e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Salvando...' : isEditing ? 'Atualizar' : 'Criar Card'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
