// Sistema de cores personalizáveis para Status e Studio

export interface ColorConfig {
    bg: string;
    border: string;
    text: string;
}

// Cores padrão para Status
export const defaultStatusColors: Record<string, ColorConfig> = {
    BACKLOG: {
        bg: 'bg-slate-900/50',
        border: 'border-slate-600/40',
        text: 'text-slate-400',
    },
    FILES_TO_STUDIO: {
        bg: 'bg-blue-900/50',
        border: 'border-blue-600/40',
        text: 'text-blue-400',
    },
    REVISAO_TEXTO: {
        bg: 'bg-purple-900/50',
        border: 'border-purple-600/40',
        text: 'text-purple-400',
    },
    REVIEW_DELL: {
        bg: 'bg-yellow-900/50',
        border: 'border-yellow-600/40',
        text: 'text-yellow-400',
    },
    FINAL_MATERIAL: {
        bg: 'bg-orange-900/50',
        border: 'border-orange-600/40',
        text: 'text-orange-400',
    },
    ASSET_RELEASE: {
        bg: 'bg-cyan-900/50',
        border: 'border-cyan-600/40',
        text: 'text-cyan-400',
    },
    COMPLETED: {
        bg: 'bg-green-900/50',
        border: 'border-green-600/40',
        text: 'text-green-400',
    },
};

// Cores padrão para Studio
export const defaultStudioColors: Record<string, ColorConfig> = {
    'Sem Studio': {
        bg: 'bg-gray-700/50',
        border: 'border-gray-600/40',
        text: 'text-gray-400',
    },
    'Rô': {
        bg: 'bg-pink-900/50',
        border: 'border-pink-600/40',
        text: 'text-pink-400',
    },
    'Tay': {
        bg: 'bg-indigo-900/50',
        border: 'border-indigo-600/40',
        text: 'text-indigo-400',
    },
    'Gus': {
        bg: 'bg-emerald-900/50',
        border: 'border-emerald-600/40',
        text: 'text-emerald-400',
    },
};

// Função para obter cores do localStorage ou usar padrão
export const getStatusColors = (): Record<string, ColorConfig> => {
    const stored = localStorage.getItem('kanban-status-colors');
    return stored ? JSON.parse(stored) : defaultStatusColors;
};

export const getStudioColors = (): Record<string, ColorConfig> => {
    const stored = localStorage.getItem('kanban-studio-colors');
    return stored ? JSON.parse(stored) : defaultStudioColors;
};

// Função para salvar cores
export const saveStatusColors = (colors: Record<string, ColorConfig>) => {
    localStorage.setItem('kanban-status-colors', JSON.stringify(colors));
};

export const saveStudioColors = (colors: Record<string, ColorConfig>) => {
    localStorage.setItem('kanban-studio-colors', JSON.stringify(colors));
};

// Paleta de cores disponíveis
export const colorPalette = [
    { name: 'Slate', value: { bg: 'bg-slate-900/50', border: 'border-slate-600/40', text: 'text-slate-400' } },
    { name: 'Gray', value: { bg: 'bg-gray-900/50', border: 'border-gray-600/40', text: 'text-gray-400' } },
    { name: 'Red', value: { bg: 'bg-red-900/50', border: 'border-red-600/40', text: 'text-red-400' } },
    { name: 'Orange', value: { bg: 'bg-orange-900/50', border: 'border-orange-600/40', text: 'text-orange-400' } },
    { name: 'Amber', value: { bg: 'bg-amber-900/50', border: 'border-amber-600/40', text: 'text-amber-400' } },
    { name: 'Yellow', value: { bg: 'bg-yellow-900/50', border: 'border-yellow-600/40', text: 'text-yellow-400' } },
    { name: 'Lime', value: { bg: 'bg-lime-900/50', border: 'border-lime-600/40', text: 'text-lime-400' } },
    { name: 'Green', value: { bg: 'bg-green-900/50', border: 'border-green-600/40', text: 'text-green-400' } },
    { name: 'Emerald', value: { bg: 'bg-emerald-900/50', border: 'border-emerald-600/40', text: 'text-emerald-400' } },
    { name: 'Teal', value: { bg: 'bg-teal-900/50', border: 'border-teal-600/40', text: 'text-teal-400' } },
    { name: 'Cyan', value: { bg: 'bg-cyan-900/50', border: 'border-cyan-600/40', text: 'text-cyan-400' } },
    { name: 'Sky', value: { bg: 'bg-sky-900/50', border: 'border-sky-600/40', text: 'text-sky-400' } },
    { name: 'Blue', value: { bg: 'bg-blue-900/50', border: 'border-blue-600/40', text: 'text-blue-400' } },
    { name: 'Indigo', value: { bg: 'bg-indigo-900/50', border: 'border-indigo-600/40', text: 'text-indigo-400' } },
    { name: 'Violet', value: { bg: 'bg-violet-900/50', border: 'border-violet-600/40', text: 'text-violet-400' } },
    { name: 'Purple', value: { bg: 'bg-purple-900/50', border: 'border-purple-600/40', text: 'text-purple-400' } },
    { name: 'Fuchsia', value: { bg: 'bg-fuchsia-900/50', border: 'border-fuchsia-600/40', text: 'text-fuchsia-400' } },
    { name: 'Pink', value: { bg: 'bg-pink-900/50', border: 'border-pink-600/40', text: 'text-pink-400' } },
    { name: 'Rose', value: { bg: 'bg-rose-900/50', border: 'border-rose-600/40', text: 'text-rose-400' } },
];
