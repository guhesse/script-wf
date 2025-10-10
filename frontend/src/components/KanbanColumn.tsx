import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { KanbanCard } from '@/types/kanban';
import { KanbanCardItem } from './KanbanCardItem';

interface DroppableColumnProps {
    id: string;
    title: string;
    cards: KanbanCard[];
    onCardClick: (card: KanbanCard) => void;
    onCardUpdate?: () => void;
}

export const DroppableColumn = ({ id, title, cards, onCardClick, onCardUpdate }: DroppableColumnProps) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <Card
            ref={setNodeRef}
            className={`bg-card/50 backdrop-blur transition-all min-h-[400px] w-80 flex-shrink-0 flex flex-col ${isOver ? 'ring-2 ring-primary bg-primary/5 scale-[1.02]' : ''
                }`}
        >
            <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-base flex items-center justify-between">
                    <span>{title}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                        {cards.length} {cards.length === 1 ? 'card' : 'cards'}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-3">
                <ScrollArea className="h-full">
                    <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {cards.length === 0 ? (
                            <div className="flex items-center justify-center text-center py-12 text-sm text-muted-foreground border-2 border-dashed border-border/50 rounded-lg min-h-[900px]">
                                <div>
                                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Solte o card aqui</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {cards.map((card) => (
                                    <KanbanCardItem
                                        key={card.id}
                                        card={card}
                                        onClick={() => onCardClick(card)}
                                        onUpdate={onCardUpdate}
                                    />
                                ))}
                            </div>
                        )}
                    </SortableContext>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
