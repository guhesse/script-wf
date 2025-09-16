// Backend Dell color palette + normalization helpers
export interface DellBackendColor {
    id: string;
    name: string;
    alias?: string;
    hex: string;
    synonyms: string[]; // lower-case synonyms (no accents)
}

export const DELL_BACKEND_COLORS: DellBackendColor[] = [
    { id: 'cosmos', name: 'Cosmos', alias: 'Slate 700', hex: '#1D2C3B', synonyms: ['cosmos', 'slate700', 'slate-700', 'slate_700'] },
    { id: 'white', name: 'White', hex: '#FFFFFF', synonyms: ['white', 'branco'] },
    { id: 'midnight', name: 'Midnight', hex: '#0D2155', synonyms: ['midnight'] },
    { id: 'ocean', name: 'Ocean', alias: 'Blue 800', hex: '#00468B', synonyms: ['ocean', 'blue800', 'blue-800', 'blue_800'] },
    { id: 'dell-blue', name: 'Dell Blue', hex: '#0672CB', synonyms: ['dellblue', 'dell-blue', 'dell_blue'] },
    { id: 'forest', name: 'Forest', alias: 'Teal 800', hex: '#0B7C84', synonyms: ['forest', 'teal800', 'teal-800', 'teal_800'] },
    { id: 'teal', name: 'Teal', alias: 'Teal 900', hex: '#044E52', synonyms: ['teal', 'teal900', 'teal-900', 'teal_900'] },
    { id: 'plum', name: 'Plum', alias: 'Purple 800', hex: '#66278F', synonyms: ['plum', 'purple800', 'purple-800', 'purple_800'] },
    { id: 'dusk', name: 'Dusk', alias: 'Purple 900', hex: '#40155C', synonyms: ['dusk', 'purple900', 'purple-900', 'purple_900'] },
    { id: 'raven', name: 'Raven', alias: 'Slate 500', hex: '#40586D', synonyms: ['raven', 'slate500', 'slate-500'] },
    { id: 'mist', name: 'Mist', alias: 'Slate 200', hex: '#C5D4E3', synonyms: ['mist', 'slate200', 'slate-200'] },
    { id: 'quartz', name: 'Quartz', alias: 'Gray 200', hex: '#F0F0F0', synonyms: ['quartz', 'gray200', 'grey200', 'gray-200', 'grey-200'] },
    { id: 'titanium', name: 'Titanium', alias: 'Gray 400', hex: '#D2D2D2', synonyms: ['titanium', 'gray400', 'grey400', 'gray-400', 'grey-400'] },
    { id: 'steel', name: 'Steel', alias: 'Gray 500', hex: '#B6B6B6', synonyms: ['steel', 'gray500', 'grey500', 'gray-500', 'grey-500'] },
    { id: 'black', name: 'Black', hex: '#000000', synonyms: ['black', 'preto'] }
];

const synonymIndex: Record<string, DellBackendColor> = {};
for (const c of DELL_BACKEND_COLORS) {
    for (const s of c.synonyms) synonymIndex[s.toLowerCase()] = c;
    synonymIndex[c.name.toLowerCase()] = c;
    if (c.alias) synonymIndex[c.alias.toLowerCase()] = c;
}

function normalizeToken(raw?: string): string {
    if (!raw) return '';
    return raw.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

export function canonicalizeColorName(input?: string): string | null {
    if (!input) return null;
    const token = normalizeToken(input);
    const match = synonymIndex[token];
    if (!match) return capitalizeFirst(input.trim());
    return match.alias ? `${match.name} (${match.alias})` : match.name;
}

export function getColorMeta(input?: string): { canonical: string; hex: string } | null {
    if (!input) return null;
    const token = normalizeToken(input);
    const match = synonymIndex[token];
    if (!match) return null;
    const canonical = match.alias ? `${match.name} (${match.alias})` : match.name;
    return { canonical, hex: match.hex };
}

function capitalizeFirst(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
