import { useState, useEffect } from 'react';
import { Plus, Filter, BarChart3, Calendar, Eye, EyeOff, Menu, X } from 'lucide-react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { kanbanService } from '@/services/kanbanService';
import type { KanbanCard, KanbanFilters, KanbanStats } from '@/types/kanban';
import { StatusLabels } from '@/types/kanban';
import { KanbanCardForm } from './KanbanCardForm';
import { KanbanCardItem } from './KanbanCardItem';
import { DroppableColumn } from './KanbanColumn';
import { ColorCustomizationPanel } from './ColorCustomizationPanel';

export const KanbanBoard = () => {
    const [cards, setCards] = useState<KanbanCard[]>([]);
    const [stats, setStats] = useState<KanbanStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<KanbanFilters>({});
    const [showFilters, setShowFilters] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showCardForm, setShowCardForm] = useState(false);
    const [selectedCard, setSelectedCard] = useState<KanbanCard | undefined>(undefined);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [colorKey, setColorKey] = useState(0); // Para forçar re-render quando cores mudarem

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 8px de movimento antes de iniciar o drag
            },
        })
    );

    useEffect(() => {
        loadCards();
        loadStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadCards = async (appliedFilters?: KanbanFilters) => {
        try {
            setLoading(true);
            const data = await kanbanService.getCards(appliedFilters || filters);
            setCards(data);
        } catch (error) {
            console.error('Erro ao carregar cards:', error);
            toast.error('Erro ao carregar cards do Kanban');
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const data = await kanbanService.getStats();
            setStats(data);
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        }
    };

    const handleFilterChange = (key: keyof KanbanFilters, value: string) => {
        const newFilters = { ...filters, [key]: value || undefined };
        setFilters(newFilters);
        loadCards(newFilters);
    };

    const clearFilters = () => {
        setFilters({});
        loadCards({});
    };

    const handleOpenCreateForm = () => {
        setSelectedCard(undefined);
        setShowCardForm(true);
    };

    const handleOpenEditForm = (card: KanbanCard) => {
        setSelectedCard(card);
        setShowCardForm(true);
    };

    const handleCloseForm = () => {
        setShowCardForm(false);
        setSelectedCard(undefined);
    };

    const handleFormSuccess = () => {
        loadCards();
        loadStats();
    };

    const handleColorsChange = () => {
        setColorKey(prev => prev + 1);
        window.dispatchEvent(new Event('kanban-colors-changed'));
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const cardId = active.id as string;
        const newStatus = over.id as string;

        // Encontrar o card sendo movido
        const card = cards.find(c => c.id === cardId);
        if (!card) return;

        // Se o status for o mesmo, não fazer nada
        if (card.status === newStatus) return;

        try {
            // Atualizar otimisticamente a UI
            setCards(prev =>
                prev.map(c => c.id === cardId ? { ...c, status: newStatus as KanbanCard['status'] } : c)
            );

            // Fazer a chamada à API
            await kanbanService.moveCard(cardId, {
                columnId: newStatus,
                position: 0,
                status: newStatus as KanbanCard['status'],
            });

            toast.success('Card movido com sucesso!');
            loadStats(); // Atualizar estatísticas
        } catch (error) {
            console.error('Erro ao mover card:', error);
            toast.error('Erro ao mover card');
            // Reverter em caso de erro
            loadCards();
        }
    };

    // Agrupar cards por status
    const groupedCards = cards.reduce((acc, card) => {
        const key = card.status;
        if (!acc[key]) acc[key] = [];
        acc[key].push(card);
        return acc;
    }, {} as Record<string, KanbanCard[]>);

    // Ordenar grupos por ordem lógica de status
    const statusOrder = ['BACKLOG', 'FILES_TO_STUDIO', 'REVISAO_TEXTO', 'REVIEW_DELL', 'FINAL_MATERIAL', 'ASSET_RELEASE', 'COMPLETED'];

    // Criar todas as colunas na ordem, mesmo vazias
    const allColumns = statusOrder.map(status => ({
        status,
        cards: groupedCards[status] || []
    }));

    // Filtrar colunas vazias se a opção estiver ativa
    const sortedGroups = hideEmptyColumns
        ? allColumns.filter(col => col.cards.length > 0)
        : allColumns; return (
            <div className="space-y-6 overflow-x-hidden max-w-[100vw] min-w-0">
                {/* Header com ações */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            title={sidebarCollapsed ? "Mostrar menu" : "Ocultar menu"}
                        >
                            {sidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
                        </Button>
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Kanban Board</h2>
                            <p className="text-muted-foreground">
                                Gerencie seus jobs e acompanhe o progresso
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                        {/* Seletor de Data */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent text-sm outline-none cursor-pointer"
                            />
                        </div>

                        {/* Toggle Colunas Vazias */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHideEmptyColumns(!hideEmptyColumns)}
                            title={hideEmptyColumns ? "Mostrar colunas vazias" : "Ocultar colunas vazias"}
                        >
                            {hideEmptyColumns ? (
                                <><EyeOff className="h-4 w-4 mr-2" />Vazias Ocultas</>
                            ) : (
                                <><Eye className="h-4 w-4 mr-2" />Mostrar Todas</>
                            )}
                        </Button>

                        <ColorCustomizationPanel onColorsChange={handleColorsChange} />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowStats(!showStats)}
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Estatísticas
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            Filtros
                        </Button>
                        <Button size="sm" onClick={handleOpenCreateForm}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Card
                        </Button>
                    </div>
                </div>

                {/* Estatísticas */}
                {showStats && stats && (
                    <Card className="bg-card/50 backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-lg">Estatísticas do Board</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-lg bg-background/50 border border-border">
                                    <div className="text-2xl font-bold">{stats.total}</div>
                                    <div className="text-sm text-muted-foreground">Total de Cards</div>
                                </div>
                                {stats.byStatus.slice(0, 3).map((item) => (
                                    <div key={item.status} className="p-4 rounded-lg bg-background/50 border border-border">
                                        <div className="text-2xl font-bold">{item.count}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {StatusLabels[item.status as keyof typeof StatusLabels] || item.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Painel de Filtros */}
                {showFilters && (
                    <Card className="bg-card/50 backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-lg flex justify-between items-center">
                                <span>Filtros</span>
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    Limpar Filtros
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Semana</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: W1, W3..."
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                                        value={filters.week || ''}
                                        onChange={(e) => handleFilterChange('week', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Quarter</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Q3..."
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                                        value={filters.quarter || ''}
                                        onChange={(e) => handleFilterChange('quarter', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Cliente</label>
                                    <input
                                        type="text"
                                        placeholder="Nome do cliente..."
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                                        value={filters.cliente || ''}
                                        onChange={(e) => handleFilterChange('cliente', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Brand</label>
                                    <input
                                        type="text"
                                        placeholder="Nome da marca..."
                                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                                        value={filters.brand || ''}
                                        onChange={(e) => handleFilterChange('brand', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Board - Colunas por Status com Drag and Drop */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="relative w-full max-w-[80vw] min-w-100 overflow-x-hidden">
                            <ScrollArea className="w-full max-w-[100vw] h-[calc(100vh-230px)]">
                                <div className="flex gap-4 pb-3 min-w-max">
                                    {sortedGroups.length === 0 ? (
                                        <Card className="w-full">
                                            <CardContent className="flex flex-col items-center justify-center py-12">
                                                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                                                <h3 className="text-lg font-medium mb-2">Nenhum card encontrado</h3>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Comece criando seu primeiro card
                                                </p>
                                                <Button size="sm" onClick={handleOpenCreateForm}>
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Criar Primeiro Card
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        sortedGroups.map((col) => (
                                            <DroppableColumn
                                                key={col.status}
                                                id={col.status}
                                                title={StatusLabels[col.status as keyof typeof StatusLabels] || col.status}
                                                cards={col.cards}
                                                onCardClick={handleOpenEditForm}
                                                onCardUpdate={loadCards}
                                            />
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </div>

                        <DragOverlay>
                            {activeId ? (
                                <div className="opacity-90 rotate-3 scale-105 shadow-2xl">
                                    <KanbanCardItem
                                        card={cards.find(c => c.id === activeId)!}
                                        onClick={() => { }}
                                    />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}

                {/* Modal de Criação/Edição de Card */}
                <KanbanCardForm
                    open={showCardForm}
                    onClose={handleCloseForm}
                    onSuccess={handleFormSuccess}
                    card={selectedCard}
                />
            </div>
        );
};
