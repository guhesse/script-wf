import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { kanbanService } from '@/services/kanbanService';

interface RoundBadgeProps {
    cardId: string;
    round?: number;
    onUpdate: (round: number | null) => void;
}

export const RoundBadge = ({ cardId, round, onUpdate }: RoundBadgeProps) => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleRoundClick = async (roundNumber: number) => {
        if (round === roundNumber) return; // Não faz nada se clicar no mesmo round
        try {
            setSaving(true);
            await kanbanService.updateCard(cardId, { round: roundNumber });
            onUpdate(roundNumber);
        } catch (error) {
            console.error('Erro ao atualizar round:', error);
            toast.error('Erro ao atualizar round');
        } finally {
            setSaving(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-900/50 border border-indigo-600/40 text-indigo-400 text-xs hover:bg-indigo-900/70 transition-colors group cursor-pointer"
                >
                    {`R${round ?? 1}`}
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-56"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            >
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground mb-3">
                        Selecione o Round
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                            <button
                                key={num}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRoundClick(num);
                                }}
                                disabled={saving}
                                className={`
                                    px-2 py-1.5 rounded text-xs font-medium transition-all
                                    ${round === num
                                        ? 'bg-indigo-600 text-white border-2 border-indigo-400 shadow-md'
                                        : 'bg-background border border-border hover:bg-accent hover:border-primary/50'
                                    }
                                    ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                            >
                                R{num}
                            </button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
