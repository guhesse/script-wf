import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { kanbanService } from '@/services/kanbanService';
import type { KanbanCard } from '@/types/kanban';

interface StudioBadgeProps {
  card: KanbanCard;
  onSuccess?: () => void;
  className?: string;
}

const STUDIO_OPTIONS = ['Sem Studio', 'Rô', 'Tay', 'Gus'] as const;

export function StudioBadge({ card, onSuccess, className = '' }: StudioBadgeProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleStudioClick = async (newStudio: string) => {
    const displayStudio = card.studio || 'Sem Studio';
    if (displayStudio === newStudio) return; // Não faz nada se clicar no mesmo studio
    
    try {
      setSaving(true);
      await kanbanService.updateCard(card.id, {
        studio: newStudio === 'Sem Studio' ? undefined : newStudio,
      });
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Erro ao atualizar studio:', error);
      toast.error('Erro ao atualizar studio');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const displayStudio = card.studio || 'Sem Studio';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:opacity-80 transition-colors cursor-pointer ${className}`}
        >
          {displayStudio}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-3">
            Selecione o Studio
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {STUDIO_OPTIONS.map((studio) => (
              <button
                key={studio}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStudioClick(studio);
                }}
                disabled={saving}
                className={`
                  px-2 py-1.5 rounded text-xs font-medium transition-all
                  ${displayStudio === studio
                    ? 'bg-primary text-primary-foreground border-2 border-primary shadow-md'
                    : 'bg-background border border-border hover:bg-accent hover:border-primary/50'
                  }
                  ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {studio}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
