// Dell Brand Color System
// Fonte: especificações fornecidas (HEX, RGB, CMYK aproximado, PMS)
// Estrutura: id, name, alias (quando houver), hex, rgb, cmyk, pms, family, level

export interface DellColor {
  id: string;
  name: string;
  alias?: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  cmyk: { c: number; m: number; y: number; k: number };
  pms?: string;
  family: string;
  level?: string;
}

const parseRGB = (r: number, g: number, b: number) => ({ r, g, b });
const parseCMYK = (c: number, m: number, y: number, k: number) => ({ c, m, y, k });

export const DELL_COLORS: DellColor[] = [
  { id: 'dell-blue', name: 'Dell Blue', hex: '#0672CB', rgb: parseRGB(6,114,203), cmyk: parseCMYK(94,43,0,0), pms: '2174C', family: 'core' },
  { id: 'ocean', name: 'Ocean', alias: 'Blue 800', hex: '#00468B', rgb: parseRGB(0,70,139), cmyk: parseCMYK(100,82,17,4), pms: '2945C', family: 'blue', level: '800' },
  { id: 'midnight', name: 'Midnight', hex: '#0D2155', rgb: parseRGB(13,33,85), cmyk: parseCMYK(100,72,0,73), pms: '2767C', family: 'blue' },
  { id: 'forest', name: 'Forest', alias: 'Teal 800', hex: '#0B7C84', rgb: parseRGB(11,124,132), cmyk: parseCMYK(86,35,44,8), pms: '2461', family: 'teal', level: '800' },
  { id: 'teal', name: 'Teal', alias: 'Teal 900', hex: '#044E52', rgb: parseRGB(4,78,82), cmyk: parseCMYK(92,52,57,36), pms: '7715C', family: 'teal', level: '900' },
  { id: 'plum', name: 'Plum', alias: 'Purple 800', hex: '#66278F', rgb: parseRGB(102,39,143), cmyk: parseCMYK(75,100,2,0), pms: '527C', family: 'purple', level: '800' },
  { id: 'dusk', name: 'Dusk', alias: 'Purple 900', hex: '#40155C', rgb: parseRGB(64,21,92), cmyk: parseCMYK(86,100,29,26), pms: '3583C', family: 'purple', level: '900' },
  { id: 'black', name: 'Black', hex: '#000000', rgb: parseRGB(0,0,0), cmyk: parseCMYK(75,68,67,90), pms: 'Black 6C', family: 'neutral' },
  { id: 'cosmos', name: 'Cosmos', alias: 'Slate 700', hex: '#1D2C3B', rgb: parseRGB(29,44,59), cmyk: parseCMYK(80,72,52,55), pms: '2168C', family: 'slate', level: '700' },
  { id: 'raven', name: 'Raven', alias: 'Slate 500', hex: '#40586D', rgb: parseRGB(64,88,109), cmyk: parseCMYK(79,60,41,20), pms: '5405C', family: 'slate', level: '500' },
  { id: 'mist', name: 'Mist', alias: 'Slate 200', hex: '#C5D4E3', rgb: parseRGB(197,212,227), cmyk: parseCMYK(21,10,0,4), pms: '643C', family: 'slate', level: '200' },
  { id: 'white', name: 'White', hex: '#FFFFFF', rgb: parseRGB(255,255,255), cmyk: parseCMYK(0,0,0,0), family: 'neutral' },
  { id: 'quartz', name: 'Quartz', alias: 'Gray 200', hex: '#F0F0F0', rgb: parseRGB(240,240,240), cmyk: parseCMYK(0,0,0,6), pms: 'Cool Gray 1C', family: 'gray', level: '200' },
  { id: 'titanium', name: 'Titanium', alias: 'Gray 400', hex: '#D2D2D2', rgb: parseRGB(210,210,210), cmyk: parseCMYK(0,0,0,18), pms: 'Cool Gray 4C', family: 'gray', level: '400' },
  { id: 'steel', name: 'Steel', alias: 'Gray 500', hex: '#B6B6B6', rgb: parseRGB(182,182,182), cmyk: parseCMYK(0,0,0,29), pms: 'Cool Gray 6C', family: 'gray', level: '500' }
];

// Índice rápido por HEX normalizado
const hexIndex: Record<string, DellColor> = {};
DELL_COLORS.forEach(c => { hexIndex[c.hex.toLowerCase()] = c; });

export function findColorByHex(input?: string): DellColor | undefined {
  if (!input) return undefined;
  const hex = input.trim().toLowerCase();
  // Garantir formato #xxxxxx
  const normalized = hex.startsWith('#') ? hex : ('#' + hex);
  return hexIndex[normalized];
}

export function normalizePossibleColorName(name?: string): DellColor | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return DELL_COLORS.find(c => c.name.toLowerCase() === n || c.alias?.toLowerCase() === n || c.id === n);
}

export function rgbString(c: DellColor) {
  return `${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}`;
}
export function cmykString(c: DellColor) {
  return `cmyk${c.cmyk.c}, ${c.cmyk.m}%, ${c.cmyk.y}%, ${c.cmyk.k}%`;
}

export interface ResolvedColorMeta {
  source: 'hex' | 'name' | 'alias';
  match: DellColor;
  input: string;
}

export function resolveColorToken(token?: string): ResolvedColorMeta | undefined {
  if (!token) return undefined;
  const directHex = findColorByHex(token);
  if (directHex) return { source: 'hex', match: directHex, input: token };
  const byName = normalizePossibleColorName(token);
  if (byName) return { source: 'name', match: byName, input: token };
  // Tentar se token está dentro de uma frase (ex: "Background: Cosmos | Copy: White")
  const words = token.split(/[^a-zA-Z0-9#]+/).filter(Boolean);
  for (const w of words) {
    const h = findColorByHex(w);
    if (h) return { source: 'hex', match: h, input: token };
    const n = normalizePossibleColorName(w);
    if (n) return { source: 'name', match: n, input: token };
  }
  return undefined;
}

export function extractColorsFromText(text?: string): ResolvedColorMeta[] {
  if (!text) return [];
  const results: ResolvedColorMeta[] = [];
  const seen = new Set<string>();
  // Separar por linhas e delimitadores
  const tokens = text.split(/[,;\n\r|]+/).map(t => t.trim()).filter(Boolean);
  for (const token of tokens) {
    const meta = resolveColorToken(token);
    if (meta && !seen.has(meta.match.id)) {
      seen.add(meta.match.id);
      results.push(meta);
    }
  }
  return results;
}

export function formatFullColor(meta: ResolvedColorMeta) {
  const c = meta.match;
  return `${c.name}${c.alias ? ` (${c.alias})` : ''} | HEX ${c.hex} | RGB ${rgbString(c)} | ${c.pms ? `PMS ${c.pms} | ` : ''}${cmykString(c)}`;
}
