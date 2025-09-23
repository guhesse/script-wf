import { Injectable, Logger } from '@nestjs/common';
// Import será resolvido dinamicamente para lidar com diferentes formatos de export

/**
 * Serviço responsável por gerar um PPT de 1 slide com base nas informações estruturadas do briefing.
 * - Cabeçalho (titulo do slide) no formato: VML FY26Q3W10 CSG CON 5479874 (R1)
 *   * VML fixo
 *   * Sufixo (R1) fixo
 *   * Parte variável (ex: FY26Q3W10 CSG CON 5479874) construída a partir de dados ou fallback
 * - Corpo: texto em Calibri 14 com labels em bold e duas primeiras linhas em azul (ênfase 1)
 * (Removido base64/testMode: agora sempre salva arquivo físico)
 */
export interface BriefingPptData {
    dsid?: string | null; // ex: 5479874
    // Campos estruturados
    week?: string; // ex: W10
    wireframeTitle?: string; // ex: WIREFRAME –  AWARD WINNING INOVATION
    liveDate?: string | null; // ex: Oct, 10  – Oct, 31
    vf?: string | null; // ex: Microsoft JMA
    headline?: string | null; // Headline Copy
    copy?: string | null; // Copy
    description?: string | null; // Description
    cta?: string | null; // CTA
    // Possível origem de dados brutos (structuredData de PDF)
    structuredData?: any;
    // Nome da tarefa Workfront (para derivar tokens)
    taskName?: string;
    // Campo CSG/segment; quando não presente tentar deduzir do taskName
    csg?: string | null;
    // Canal/CON etc
    channel?: string | null; // ex: CON
}

export interface GeneratePptOptions {
    outputDir?: string; // caminho para salvar
    fileName?: string; // nome desejado do arquivo
}

export interface GeneratePptResult {
    fileName: string;
    path: string;
    sizeBytes?: number;
}

@Injectable()
export class BriefingPptService {
    private readonly logger = new Logger(BriefingPptService.name);

    private async loadPptLib(): Promise<any> {
        // Cache simples em runtime
        const g: any = globalThis as any;
        if (g.__pptxLib) return g.__pptxLib;
        let mod: any = null;
        const candidates: any[] = [];
        try {
            mod = await import('pptxgenjs');
            candidates.push(mod, mod?.default, (mod as any).PptxGenJS, (mod as any).default?.PptxGenJS);
        } catch (e) {
            this.logger.error('Falha ao importar pptxgenjs via import(): ' + (e as Error).message);
        }
        // Tentar require comum (caso transpile CommonJS)
        if (!mod) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const req = require('pptxgenjs');
                candidates.push(req, req?.default, req?.PptxGenJS);
            } catch (e) {
                this.logger.error('Falha ao carregar pptxgenjs via require(): ' + (e as Error).message);
            }
        }
        const valid = candidates.find(c => typeof c === 'function');
        if (!valid) {
            throw new Error('Não foi possível resolver construtor de PptxGenJS (exports incompatíveis)');
        }
        g.__pptxLib = valid; // cache
        return valid;
    }

    private ensureLayout(pptx: any) {
        // Se já definimos nosso layout custom 33x19, não sobrescreve
        try { if (pptx.layout === 'WF_33x19CM') return; } catch { }
        // Mantém lógica anterior apenas se nenhum layout custom tiver sido definido
        const candidates = ['LAYOUT_16x9', '16x9'];
        for (const c of candidates) {
            try { pptx.layout = c; if (pptx.layout === c) return; } catch { }
        }
        try {
            if (typeof pptx.defineLayout === 'function') {
                pptx.defineLayout({ name: 'WF_16x9', width: 13.33, height: 7.5 });
                pptx.layout = 'WF_16x9';
                return;
            }
        } catch { }
        try {
            if (pptx?.presLayout && !pptx.presLayout.width) {
                pptx.presLayout.width = 13.33; pptx.presLayout.height = 7.5;
            } else if (pptx?._presLayout && !pptx._presLayout.width) {
                pptx._presLayout.width = 13.33; pptx._presLayout.height = 7.5;
            }
        } catch { }
    }

    async generateBriefingPpt(data: BriefingPptData, options: GeneratePptOptions = {}): Promise<GeneratePptResult> {
        // Mesclar structuredData se fornecido
        const sd = data.structuredData || {};
        const week = data.week || this.deriveWeek(sd) || 'W?';
        const wireframeTitle = data.wireframeTitle || sd.headline || data.headline || 'WIREFRAME – SEM TÍTULO';

        const liveDate = data.liveDate || sd.liveDate || null;
        const vf = data.vf || sd.vf || null;
        const headline = data.headline || sd.headline || null;
        const copy = data.copy || sd.copy || null;
        const description = data.description || sd.description || null;
        const cta = data.cta || sd.cta || null;

        // Derivar CSG / Channel tokens a partir do taskName se não fornecidos
        const derivedTokens = this.deriveTokensFromTaskName(data.taskName);
        const csg = data.csg || derivedTokens.csg || 'CSG';
        const channel = data.channel || derivedTokens.channel || 'CON';

        const dsid = data.dsid || derivedTokens.dsid || '0000000';

        // Montar header principal (slide title)
        // Exemplo alvo: VML FY26Q3W10 CSG CON 5479874 (R1)
        const adv = this.parseAdvancedHeaderTokens(data.taskName || '', { dsid, csg, channel });
        const fiscalWeek = adv.fiscal || this.deriveFiscalWeekToken(data.taskName) || ('FY??Q?' + week);
        const header = `VML ${fiscalWeek.toUpperCase()} ${(adv.csg || csg).toUpperCase()} ${(adv.channel || channel).toUpperCase()} ${(adv.dsid || dsid)} (R1)`;

        const PptxCtor = await this.loadPptLib();
        const pptx = new PptxCtor();
        // Layout requerido 33x19 cm (converter para polegadas: /2.54)
        const widthIn = +(33.867 / 2.54).toFixed(2);  // ~12.99
        const heightIn = +(19.05 / 2.54).toFixed(2); // ~7.48
        try {
            if (typeof (pptx as any).defineLayout === 'function') {
                (pptx as any).defineLayout({ name: 'WF_33x19CM', width: widthIn, height: heightIn });
                (pptx as any).layout = 'WF_33x19CM';
            } else {
                // fallback: ajustar dimensões diretamente se estrutura interna existir
                if ((pptx as any).presLayout) { (pptx as any).presLayout.width = widthIn; (pptx as any).presLayout.height = heightIn; }
                if ((pptx as any)._presLayout) { (pptx as any)._presLayout.width = widthIn; (pptx as any)._presLayout.height = heightIn; }
            }
        } catch { /* ignore erros de layout */ }
        // NÃO chamar ensureLayout agora para não sobrescrever nosso layout custom.

        // Definir master slide com placeholders (title, body, heroImage)
        let masterName = 'WF_BRIEFING_MASTER';
        let masterOk = false;
        try {
            if (typeof pptx.defineSlideMaster === 'function') {
                pptx.defineSlideMaster({
                    title: masterName,
                    background: { color: 'DEEBF7' },
                    objects: [
                        // Removido placeholder de título para evitar duplicidade
                        { placeholder: { options: { name: 'body', type: 'body', x: 0.5, y: 1.1, w: 5.8, h: '80%' }, text: '' } },
                        { placeholder: { options: { name: 'heroImage', type: 'image', x: 6.7, y: 1.1, w: 6.3, h: '80%' }, text: '' } },
                    ],
                });
                masterOk = true;
            }
        } catch { /* fallback para modo manual */ }

        const slide = masterOk ? pptx.addSlide({ masterName }) : pptx.addSlide();
        if (!masterOk) {
            try { slide.background = { fill: 'DEEBF7' } as any; } catch { }
        }
        // Adicionar título sempre manualmente para evitar visual de placeholder
        slide.addText(header, { x: 0.5, y: 0.5, w: 7.0, h: 0.5, fontFace: 'Calibri', fontSize: 18, bold: true, color: '000000' });

        // Corpo: construir linhas conforme especificação
        // Duas primeiras linhas em azul ênfase 1: W10 e wireframeTitle
        const lines: Array<{ text: string; color?: string; boldLabel?: boolean; }[]> = [];
        lines.push([{ text: week, color: '2F5597', boldLabel: true }]);
        lines.push([{ text: wireframeTitle, color: '2F5597', boldLabel: true }]);

        // Demais linhas: label em bold + valor em preto
        const pushLabelValue = (label: string, value?: string | null) => {
            if (!value) return;
            lines.push([
                { text: `${label}: `, boldLabel: true },
                { text: value }
            ]);
        };

        pushLabelValue('Live Date', this.formatLiveDate(liveDate));
        pushLabelValue('VF', vf || undefined);
        pushLabelValue('Headline Copy', headline || undefined);
        pushLabelValue('Copy', copy || undefined);
        pushLabelValue('Description', description || undefined);
        pushLabelValue('CTA', cta || undefined);

        // Montar runs com espaçamento de parágrafo (paraSpaceBefore=10) e lineSpacing ~1.5
        // Removemos os múltiplos '\n' artificiais e usamos recursos de parágrafo da lib.
        const bodyTextRuns: any[] = [];
        lines.forEach((segments, idx) => {
            segments.forEach((seg, sIdx) => {
                const opts: any = {
                    fontFace: 'Calibri', fontSize: 14, color: seg.color || '000000', lineSpacingMultiple: 1.5,
                    breakLine: false,
                };
                if (seg.boldLabel) opts.bold = true;
                // Aplicar espaçamento antes apenas para parágrafos após o primeiro
                if (sIdx === 0 && idx > 0) {
                    opts.paraSpaceBefore = 10; // ~10pt antes
                }
                bodyTextRuns.push({ text: seg.text, options: opts });
            });
            // Forçar quebra de linha ao final do parágrafo
            const lastRun = bodyTextRuns[bodyTextRuns.length - 1];
            if (lastRun) lastRun.options.breakLine = true;
        });

        if (masterOk) {
            // Preencher placeholder body
            try { slide.addText(bodyTextRuns, { placeholder: 'body', lineSpacingMultiple: 1.5 }); } catch { /* fallback abaixo */ }
        }
        if (!masterOk) {
            slide.addText(bodyTextRuns, { x: 0.5, y: 1.4, w: 6.6, h: 5.5, lineSpacingMultiple: 1.5 });
            // Placeholder manual simples (texto) se master não disponível
            try {
                slide.addText('IMAGE\nPLACEHOLDER', {
                    x: 8.3, y: 1.3, w: 4.9, h: 4.2, align: 'center', valign: 'middle', fontFace: 'Calibri', fontSize: 16, bold: true, color: '999999', fill: { color: 'FFFFFF' }, line: { color: '999999', width: 1 }
                });
            } catch { }
        } else {
            // Inserir texto dentro do placeholder de imagem como label (não adiciona imagem real ainda)
            // Não inserir texto dentro do placeholder de imagem – deixá-lo vazio para futura imagem real
            try { /* placeholder heroImage vazio */ } catch { }
        }

        // Exportar
        const fileName = options.fileName || this.buildFileName({ dsid, week, csg, channel });

        // Gerar binário do PPT considerando diferenças de versão da lib.
        // Tentativas em ordem: writeBuffer(), write('arraybuffer'), write('base64')
        let nodeBuffer: Buffer | null = null;
        try {
            // Versões mais novas podem expor writeBuffer()
            if (typeof (pptx as any).writeBuffer === 'function') {
                const ab = await (pptx as any).writeBuffer();
                nodeBuffer = Buffer.from(ab);
            }
        } catch { /* ignorar e tentar próxima estratégia */ }
        if (!nodeBuffer) {
            try {
                const arr = await (pptx as any).write({ outputType: 'arraybuffer' });
                if (arr instanceof ArrayBuffer) nodeBuffer = Buffer.from(arr); else if (Array.isArray(arr)) nodeBuffer = Buffer.from(arr);
            } catch { /* tentar próxima */ }
        }
        if (!nodeBuffer) {
            const b64 = await (pptx as any).write({ outputType: 'base64' });
            nodeBuffer = Buffer.from(b64, 'base64');
        }
        const fs = await import('fs/promises');
        const path = await import('path');
        const dir = options.outputDir || process.cwd();
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, fileName + '.pptx');
        await fs.writeFile(filePath, nodeBuffer);
        return { fileName: fileName + '.pptx', path: filePath, sizeBytes: nodeBuffer.byteLength };
    }

    private buildFileName(tokens: { dsid: string; week: string; csg: string; channel: string; }) {
        const safe = (v: string) => v.replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 40) || 'X';
        return `brief_${safe(tokens.week)}_${safe(tokens.csg)}_${safe(tokens.channel)}_${safe(tokens.dsid)}`;
    }

    private formatLiveDate(liveDate?: string | null) {
        if (!liveDate) return undefined;
        // Se já contém ' - ' ou ' – ' devolver direto
        if (/\b\w+\s*,?\s*\d{1,2}\b.*?\b\w+\s*,?\s*\d{1,2}\b/.test(liveDate)) return liveDate; // heurística simples
        return liveDate;
    }

    private deriveWeek(sd: any): string | undefined {
        if (!sd) return undefined;
        // Procurar tokens W\d+ no headline ou copy
        const sources = [sd.headline, sd.copy, sd.description].filter(Boolean).join(' ');
        const m = sources.match(/\bW(\d{1,2})\b/i);
        if (m) return 'W' + m[1];
        return undefined;
    }

    private deriveFiscalWeekToken(taskName?: string): string | undefined {
        if (!taskName) return undefined;
        const m = taskName.match(/FY\d{2}Q\dW\d{1,2}/i); // ex: FY26Q3W10
        return m ? m[0].toUpperCase() : undefined;
    }

    private deriveTokensFromTaskName(taskName?: string): { dsid?: string; csg?: string; channel?: string } {
        if (!taskName) return {};
        const parts = taskName.split(/[_-]+/).filter(Boolean);
        // DSID: primeira sequência de 6-8 dígitos
        const dsid = parts.find(p => /^\d{6,8}$/.test(p));
        // CSG: token 'csg' seguido potencialmente de outro token de 2-5 letras (heurística) => manter CSG
        const csg = parts.find(p => /^csg$/i.test(p)) ? 'CSG' : undefined;
        // Channel: procurar CON, SOC, CRM, etc.
        const channel = parts.find(p => /^(con|soc|crm|seo|sem|dsp)$/i.test(p));
        return { dsid, csg, channel: channel ? channel.toUpperCase() : undefined };
    }

    // Parsing avançado: extrai fiscal week (antes de _sm), CSG, canal e dsid de um nome de tarefa longo
    private parseAdvancedHeaderTokens(taskName: string, seed: { dsid: string; csg: string; channel: string }): { fiscal?: string; csg?: string; channel?: string; dsid?: string } {
        if (!taskName) return {};
        const parts = taskName.split(/[_]+/).filter(Boolean);
        let fiscal: string | undefined; let fiscalIdx = -1;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (/^fy\d{2}q\dw\d{1,2}$/i.test(p)) {
                const next = parts[i + 1]?.toLowerCase();
                if (next === 'sm' || !fiscal) { fiscal = p.toUpperCase(); fiscalIdx = i; }
            }
        }
        if (!fiscal) return {};
        let foundCsg: string | undefined;
        let foundChannel: string | undefined;
        for (let j = fiscalIdx - 1; j >= 0; j--) {
            const t = parts[j].toLowerCase();
            if (!foundChannel && /^(con|soc|crm|seo|sem|dsp)$/.test(t)) foundChannel = t.toUpperCase();
            if (!foundCsg && t === 'csg') foundCsg = 'CSG';
            if (foundCsg && foundChannel) break;
        }
        let foundDsid = seed.dsid;
        if (!foundDsid) {
            const numeric = parts.find(p => /^\d{6,8}$/.test(p));
            if (numeric) foundDsid = numeric;
        }
        return { fiscal, csg: foundCsg, channel: foundChannel, dsid: foundDsid };
    }
}
