import { PrismaClient, KanbanStatus, VFType, AssetType, WorkfrontFrente, FiscalYear } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ImportCard {
    DATA?: string;
    ATIVIDADE?: string;
    STATUS?: string;
    STUDIO?: string;
    'TIPO DE MDF'?: string;
    CLIENT?: string;
    'TIPO DE ASSET'?: string;
    'QUANTIDADE DE ASSETS'?: string | number;
    WEEK?: string;
    QUARTER?: string;
    FRENTE?: string;
    FY?: string;

    // Campos opcionais que podem existir
    BI?: string;
    Anotações?: string;
    DSID?: string;
    VF?: string;
    Brand?: string;
    Start?: string;
    'Real Deliv'?: string;
    'Prev Deliv'?: string;
    'Entrega R1 VML'?: string;
    'Feedback R1 Dell'?: string;
    'Entrega R2 VML'?: string;
    'Feedback R2 Dell'?: string;
    'Entrega R3 VML'?: string;
    'Feedback R3 Dell'?: string;
    'Entrega R4 VML'?: string;
    'Feedback R4 Dell'?: string;
    'Dias start-R1 VML'?: string | number;
    'Dias R1 VML-R1 Dell'?: string | number;
    'Dias R1 Dell-R2 VML'?: string | number;
    'Dias R2 VML-R2 Dell'?: string | number;
    'Dias R2 Dell-R3 VML'?: string | number;
    'Dias R3 VML-R3 Dell'?: string | number;
    'Dias R3 Dell-R4 VML'?: string | number;
    'Dias R4 VML-R4 Dell'?: string | number;
    'Dias na VML %'?: string | number;
    'Dias na Dell %'?: string | number;
}// Mapeamento de status do CSV para o enum do banco
const statusMapping: Record<string, KanbanStatus> = {
    'Backlog': KanbanStatus.BACKLOG,
    'Files to Studio': KanbanStatus.FILES_TO_STUDIO,
    'Revisão de Texto': KanbanStatus.REVISAO_TEXTO,
    'Review Dell': KanbanStatus.REVIEW_DELL,
    'Final Material': KanbanStatus.FINAL_MATERIAL,
    'Asset Release': KanbanStatus.ASSET_RELEASE,
    'Completed': KanbanStatus.COMPLETED,
    // Mapeamento de valores antigos se existirem no CSV
    'R1 Review Dell': KanbanStatus.REVIEW_DELL,
    'R2 Review Dell': KanbanStatus.REVIEW_DELL,
    'R3 Review Dell': KanbanStatus.REVIEW_DELL,
    'R4 Review Dell': KanbanStatus.REVIEW_DELL,
    'In Progress': KanbanStatus.FILES_TO_STUDIO,
    'Canceled': KanbanStatus.BACKLOG,
    'Pending': KanbanStatus.BACKLOG,
};

const vfMapping: Record<string, VFType> = {
    'No VF': VFType.NO_VF,
    'Microsoft JMA CS': VFType.MICROSOFT_JMA_CS,
    'Other': VFType.OTHER,
};

const assetTypeMapping: Record<string, AssetType> = {
    'Estático': AssetType.ESTATICO,
    'Vídeo': AssetType.VIDEO,
    'Video': AssetType.VIDEO,
    'Wireframe': AssetType.WIREFRAME,
    'GIF': AssetType.GIF,
    'Story': AssetType.STORY,
    'Moldura': AssetType.MOLDURA,
    'AW Story': AssetType.AW_STORY,
    'HTML': AssetType.HTML,
    'Outro': AssetType.OTHER,
};

const frenteMapping: Record<string, WorkfrontFrente> = {
    'OOH': WorkfrontFrente.OTHER,
    'Social': WorkfrontFrente.SOCIAL,
    'Email': WorkfrontFrente.EMAIL,
    'E-mail': WorkfrontFrente.EMAIL,
    'Banner': WorkfrontFrente.DISPLAY,
    'Display': WorkfrontFrente.DISPLAY,
    'Landing Page': WorkfrontFrente.LANDING_PAGE,
    'Print': WorkfrontFrente.PRINT,
}; const fyMapping: Record<string, FiscalYear> = {
    'FY25': FiscalYear.FY25,
    'FY26': FiscalYear.FY26,
    'FY27': FiscalYear.FY27,
    'FY28': FiscalYear.FY28,
};

function parseDate(dateStr?: string): Date | undefined {
    if (!dateStr || dateStr.trim() === '' || dateStr === '-') return undefined;

    // Tentar parsear diferentes formatos
    // Formato: DD/MM/YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        const [, day, month, year] = dmyMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Formato: YYYY-MM-DD
    const ymdMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
        const [, year, month, day] = ymdMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Tentar parse direto
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseNumber(value?: string | number): number | undefined {
    if (value === undefined || value === null || value === '' || value === '-') return undefined;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(num) ? undefined : num;
}

function parseBoolean(value?: string): boolean {
    if (!value) return false;
    const normalized = value.toLowerCase().trim();
    return normalized === 'sim' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

async function importData(jsonPath: string) {
    try {
        console.log('📂 Lendo arquivo JSON...');
        console.log(`📁 Caminho: ${jsonPath}`);

        if (!fs.existsSync(jsonPath)) {
            throw new Error(`❌ Arquivo não encontrado: ${jsonPath}`);
        }

        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const data: ImportCard[] = JSON.parse(jsonContent);

        console.log(`📊 Encontrados ${data.length} registros para importar\n`);

        let imported = 0;
        let skipped = 0;
        let errors = 0;
        const errorDetails: Array<{ index: number; error: string }> = [];

        for (const [index, item] of data.entries()) {
            try {
                // Validação básica - precisa ter pelo menos atividade
                if (!item.ATIVIDADE || item.ATIVIDADE.trim() === '') {
                    skipped++;
                    continue;
                }                // Mapear status
                const status = item.STATUS ? (statusMapping[item.STATUS] || KanbanStatus.BACKLOG) : KanbanStatus.BACKLOG;
                const vf = item.VF ? (vfMapping[item.VF] || VFType.NO_VF) : VFType.NO_VF;
                const tipoAsset = item['TIPO DE ASSET'] ? (assetTypeMapping[item['TIPO DE ASSET']] || AssetType.OTHER) : AssetType.OTHER;
                const frente = item.FRENTE ? (frenteMapping[item.FRENTE] || WorkfrontFrente.OTHER) : WorkfrontFrente.OTHER;
                const fy = item.FY ? (fyMapping[item.FY] || undefined) : undefined;

                // Dados do card
                const cardData = {
                    bi: parseBoolean(item.BI),
                    anotacoes: item.Anotações || null,
                    start: parseDate(item.DATA || item.Start),
                    realDeliv: parseDate(item['Real Deliv']),
                    prevDeliv: parseDate(item['Prev Deliv']),
                    dsid: item.DSID || null,
                    atividade: item.ATIVIDADE,
                    status,
                    studio: item.STUDIO || null,
                    vf,
                    tipoAsset,
                    numeroAssets: parseNumber(item['QUANTIDADE DE ASSETS']) || 1,
                    cliente: item.CLIENT || null,
                    brand: item.Brand || item['TIPO DE MDF'] || null,
                    week: item.WEEK || null,
                    quarter: item.QUARTER || null,
                    frente,
                    fy,
                    entregaR1VML: parseDate(item['Entrega R1 VML']),
                    feedbackR1Dell: parseDate(item['Feedback R1 Dell']),
                    entregaR2VML: parseDate(item['Entrega R2 VML']),
                    feedbackR2Dell: parseDate(item['Feedback R2 Dell']),
                    entregaR3VML: parseDate(item['Entrega R3 VML']),
                    feedbackR3Dell: parseDate(item['Feedback R3 Dell']),
                    entregaR4VML: parseDate(item['Entrega R4 VML']),
                    feedbackR4Dell: parseDate(item['Feedback R4 Dell']),
                    diasStartR1VML: parseNumber(item['Dias start-R1 VML']),
                    diasR1VMLR1Dell: parseNumber(item['Dias R1 VML-R1 Dell']),
                    diasR1DellR2VML: parseNumber(item['Dias R1 Dell-R2 VML']),
                    diasR2VMLR2Dell: parseNumber(item['Dias R2 VML-R2 Dell']),
                    diasR2DellR3VML: parseNumber(item['Dias R2 Dell-R3 VML']),
                    diasR3VMLR3Dell: parseNumber(item['Dias R3 VML-R3 Dell']),
                    diasR3DellR4VML: parseNumber(item['Dias R3 Dell-R4 VML']),
                    diasR4VMLR4Dell: parseNumber(item['Dias R4 VML-R4 Dell']),
                    diasNaVMLPercent: parseNumber(item['Dias na VML %']),
                    diasNaDellPercent: parseNumber(item['Dias na Dell %']),
                    position: index, // Manter ordem do CSV
                };

                await prisma.kanbanCard.create({
                    data: cardData,
                });

                imported++;

                // Log apenas a cada 10 registros ou se for o último
                if (imported % 10 === 0 || index === data.length - 1) {
                    console.log(`✅ Importados: ${imported}/${data.length} | Pulados: ${skipped} | Erros: ${errors}`);
                }

            } catch (error) {
                errors++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                errorDetails.push({
                    index: index + 1,
                    error: `${item.ATIVIDADE?.substring(0, 50) || 'sem atividade'} - ${errorMsg}`,
                });
            }
        }

        console.log('\n📊 Resumo da importação:');
        console.log(`   ✅ Importados: ${imported}`);
        console.log(`   ⏭️  Pulados: ${skipped}`);
        console.log(`   ❌ Erros: ${errors}`);
        console.log(`   📦 Total processado: ${data.length}`);

        if (errorDetails.length > 0) {
            console.log('\n❌ Detalhes dos erros:');
            errorDetails.slice(0, 10).forEach(({ index, error }) => {
                console.log(`   [${index}] ${error}`);
            });
            if (errorDetails.length > 10) {
                console.log(`   ... e mais ${errorDetails.length - 10} erros`);
            }
        }
    } catch (error) {
        console.error('❌ Erro fatal na importação:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Executar importação
const jsonPath = process.argv[2] || path.join(__dirname, '..', '..', 'csvjson.json');

console.log('\n🚀 IMPORTAÇÃO DE DADOS DO KANBAN');
console.log('========================================\n');

importData(jsonPath)
    .then(() => {
        console.log('\n✅ Importação concluída com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Falha na importação:', error);
        process.exit(1);
    });
