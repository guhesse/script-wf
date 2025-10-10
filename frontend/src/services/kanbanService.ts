import type {
  KanbanCard,
  CreateKanbanCardDto,
  UpdateKanbanCardDto,
  MoveKanbanCardDto,
  KanbanFilters,
  KanbanStats,
} from '@/types/kanban';

const getAuthHeaders = (): Record<string, string> => {
  try {
    const token = localStorage.getItem('app_jwt_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

export const kanbanService = {
  /**
   * Criar novo card
   */
  async createCard(data: CreateKanbanCardDto): Promise<KanbanCard> {
    const response = await fetch('/api/kanban/cards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro ao criar card' }));
      throw new Error(error.message || 'Erro ao criar card');
    }

    return response.json();
  },

  /**
   * Listar cards com filtros
   */
  async getCards(filters?: KanbanFilters): Promise<KanbanCard[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }

    const url = `/api/kanban/cards${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar cards');
    }

    return response.json();
  },

  /**
   * Buscar card por ID
   */
  async getCard(id: string): Promise<KanbanCard> {
    const response = await fetch(`/api/kanban/cards/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Card não encontrado');
    }

    return response.json();
  },

  /**
   * Atualizar card
   */
  async updateCard(id: string, data: UpdateKanbanCardDto): Promise<KanbanCard> {
    const response = await fetch(`/api/kanban/cards/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro ao atualizar card' }));
      throw new Error(error.message || 'Erro ao atualizar card');
    }

    return response.json();
  },

  /**
   * Mover card (drag and drop)
   */
  async moveCard(id: string, data: MoveKanbanCardDto): Promise<KanbanCard> {
    const response = await fetch(`/api/kanban/cards/${id}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro ao mover card' }));
      throw new Error(error.message || 'Erro ao mover card');
    }

    return response.json();
  },

  /**
   * Deletar card
   */
  async deleteCard(id: string): Promise<void> {
    const response = await fetch(`/api/kanban/cards/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro ao deletar card' }));
      throw new Error(error.message || 'Erro ao deletar card');
    }
  },

  /**
   * Obter estatísticas do board
   */
  async getStats(): Promise<KanbanStats> {
    const response = await fetch('/api/kanban/stats', {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar estatísticas');
    }

    return response.json();
  },
};
