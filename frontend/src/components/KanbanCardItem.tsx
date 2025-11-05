import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useEffect } from 'react';
import { Calendar, User, Tag, TrendingUp } from 'lucide-react';
import type { KanbanCard } from '@/types/kanban';
import { StatusLabels, AssetTypeLabels } from '@/types/kanban';
import { RoundBadge } from './RoundBadge';
import { StudioBadge } from './StudioBadge';
import { getStatusColors, getStudioColors } from '@/lib/kanban-colors';

interface KanbanCardItemProps {
    card: KanbanCard;
    onClick: () => void;
    onUpdate?: () => void;
}

export const KanbanCardItem = ({ card, onClick, onUpdate }: KanbanCardItemProps) => {
    const [currentRound, setCurrentRound] = useState(card.round);
    const [statusColors, setStatusColors] = useState(getStatusColors());
    const [studioColors, setStudioColors] = useState(getStudioColors());
    
    useEffect(() => {
        const handleStorageChange = () => {
            setStatusColors(getStatusColors());
            setStudioColors(getStudioColors());
        };
        
        window.addEventListener('storage', handleStorageChange);
        // Também escutar evento customizado para mudanças na mesma aba
        window.addEventListener('kanban-colors-changed', handleStorageChange);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('kanban-colors-changed', handleStorageChange);
        };
    }, []);
    
    const handleRoundUpdate = (round: number | null) => {
        setCurrentRound(round || undefined);
    };
    
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: card.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const getStatusColor = (status: string) => {
        const colorConfig = statusColors[status];
        if (!colorConfig) return 'bg-gray-900/50 border-gray-600/40 text-gray-400';
        return `${colorConfig.bg} ${colorConfig.border} ${colorConfig.text}`;
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`p-4 rounded-lg bg-background border transition-all ${
                isDragging 
                    ? 'border-primary shadow-xl scale-105' 
                    : 'border-border hover:border-primary/50 hover:shadow-md'
            }`}
            onClick={onClick}
        >
            {/* Header com Status, Round e Studio */}
            <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                    <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(card.status)}`}>
                        {StatusLabels[card.status] || card.status}
                    </span>
                    <RoundBadge 
                        cardId={card.id} 
                        round={currentRound} 
                        onUpdate={handleRoundUpdate}
                    />
                    {card.bi && (
                        <span className="text-xs px-2 py-1 rounded bg-purple-900/50 border border-purple-600/40 text-purple-400">
                            BI
                        </span>
                    )}
                </div>
                <StudioBadge
                    card={card}
                    onSuccess={onUpdate}
                    className={`flex-shrink-0 ${
                        card.studio && studioColors[card.studio]
                            ? `${studioColors[card.studio].bg} ${studioColors[card.studio].border} ${studioColors[card.studio].text} border`
                            : 'bg-gray-700/50 border-gray-600/40 text-gray-400 border'
                    }`}
                />
            </div>

            {/* Atividade */}
            <h4 className="font-medium text-sm mb-2 line-clamp-2 max-w-[250px]">{card.atividade}</h4>

            {/* Metadados */}
            <div className="space-y-1 text-xs text-muted-foreground">
                {card.dsid && (
                    <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        <span>DSID: {card.dsid}</span>
                    </div>
                )}
                {card.cliente && (
                    <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{card.cliente}</span>
                        {card.brand && <span>• {card.brand}</span>}
                    </div>
                )}
                <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                        {AssetTypeLabels[card.tipoAsset]} • {card.numeroAssets} asset{card.numeroAssets > 1 ? 's' : ''}
                    </span>
                </div>
                {card.studio && (
                    <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>Studio: {card.studio}</span>
                    </div>
                )}
            </div>

            {/* Datas */}
            {(card.start || card.prevDeliv) && (
                <div className="mt-3 pt-3 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                        {card.start && (
                            <span className="text-muted-foreground">
                                Início: {formatDate(card.start)}
                            </span>
                        )}
                        {card.prevDeliv && (
                            <span className="text-muted-foreground">
                                Prev: {formatDate(card.prevDeliv)}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Percentuais (se disponíveis) */}
            {(card.diasNaVMLPercent !== null && card.diasNaVMLPercent !== undefined) && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    <div className="flex-1 flex gap-1">
                        <div
                            className="h-1.5 bg-blue-500 rounded"
                            style={{ width: `${card.diasNaVMLPercent}%` }}
                            title={`VML: ${card.diasNaVMLPercent.toFixed(0)}%`}
                        />
                        <div
                            className="h-1.5 bg-amber-500 rounded"
                            style={{ width: `${card.diasNaDellPercent || 0}%` }}
                            title={`Dell: ${(card.diasNaDellPercent || 0).toFixed(0)}%`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
