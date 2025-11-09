import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontService } from '../workfront/workfront.service';
import { CommentEnhancementService } from './comment-enhancement.service';
import {
    ExtractDocumentsDto,
    ExtractDocumentsResponseDto,
} from './dto/pdf.dto';
import {
    EnhanceExtractionDto,
    EnhanceExtractionResponseDto
} from './dto/ai-processing.dto';
import { chromium } from 'playwright';

@Injectable()
export class ExtractionService {
    private readonly logger = new Logger(ExtractionService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => WorkfrontService))
        private readonly workfrontService: WorkfrontService,
        private readonly commentEnhancement: CommentEnhancementService,
    ) { }

    /**
     * Extrair documentos de um projeto
     */
    async extractDocuments(extractDto: ExtractDocumentsDto): Promise<ExtractDocumentsResponseDto> {
        try {
            const { projectUrl, headless } = extractDto;

            this.logger.log(`📂 Extraindo documentos do projeto: ${projectUrl}`);
            this.logger.log(`🎭 Modo headless: ${headless}`);

            // Salvar projeto no histórico
            const project = await this.workfrontService.saveProjectFromUrl(projectUrl, {
                title: 'Extração de documentos',
                description: 'Documentos extraídos via API',
            });

            // Implementação real com Playwright (baseada no legado)
            const start = Date.now();
            const browser = await chromium.launch({ headless: headless ?? false, args: (headless ?? false) ? [] : ['--start-maximized'] });
            try {
                const context = await browser.newContext({ storageState: 'wf_state.json', viewport: null });
                const page = await context.newPage();
                await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
                await page.waitForTimeout(2000);

                const targetFolders = ['Asset Release', 'Final Materials'];
                const folders: Array<{ name: string; files: Array<{ name: string; type: string; url?: string }> }> = [];

                for (const folderName of targetFolders) {
                    try {
                        const btn = frameLocator.getByRole('button', { name: new RegExp(folderName, 'i') })
                            .or(frameLocator.getByText(folderName))
                            .first();
                        await btn.waitFor({ timeout: 5000 });
                        await btn.click();
                        await page.waitForTimeout(3000);

                        const files = await this.extractFilesFromFolder(frameLocator);
                        folders.push({ name: folderName, files });
                    } catch (e: any) {
                        this.logger.warn(`Pasta "${folderName}" não encontrada: ${e?.message}`);
                    }
                }

                const totalFiles = folders.reduce((acc, f) => acc + (f.files?.length || 0), 0);
                const took = `${((Date.now() - start) / 1000).toFixed(2)} segundos`;

                const result: ExtractDocumentsResponseDto = {
                    success: true,
                    message: 'Documentos extraídos com sucesso',
                    totalFolders: folders.length,
                    totalFiles,
                    // Atenção: nosso DTO antigo usava objeto; o frontend espera array de WorkfrontFolder
                    folders: folders as any,
                    project,
                    processingTime: took,
                } as any;

                this.logger.log(`✅ Extração concluída: ${totalFiles} arquivos em ${folders.length} pastas`);
                return result;
            } catch (e) {
                throw e;
            } finally {
                await browser.close();
            }

        } catch (error) {
            this.logger.error(`❌ Erro na extração de documentos: ${error.message}`);
            throw new Error(`Falha na extração: ${error.message}`);
        }
    }

    private async extractFilesFromFolder(frameLocator: any): Promise<Array<{ name: string; type: string; url?: string }>> {
        const files: Array<{ name: string; type: string; url?: string }> = [];
        try {
            await frameLocator.locator('body').waitFor({ timeout: 3000 });
            // Estratégia 1: containers específicos
            const containers = frameLocator.locator('[data-testid="standard-item-container"]');
            const n = await containers.count();
            for (let i = 0; i < n; i++) {
                try {
                    const c = containers.nth(i);
                    const link = c.locator('a.doc-item-link').first();
                    if (await link.isVisible()) {
                        const fileName = (await link.textContent())?.trim();
                        const href = await link.getAttribute('href');
                        if (fileName) files.push({ name: fileName, type: this.getFileTypeFromName(fileName), url: href || undefined });
                    }
                } catch { }
            }
            // Estratégia 2: fallback
            if (files.length === 0) {
                const links = frameLocator.locator('a[href*="document"], a.doc-item-link');
                const m = await links.count();
                for (let i = 0; i < m; i++) {
                    try {
                        const l = links.nth(i);
                        const text = (await l.textContent())?.trim();
                        const href = await l.getAttribute('href');
                        if (text && text.includes('.') && text.length > 5) files.push({ name: text, type: this.getFileTypeFromName(text), url: href || undefined });
                    } catch { }
                }
            }
        } catch (e) {
            this.logger.warn(`Erro ao extrair arquivos: ${(e as Error).message}`);
        }
        return files;
    }

    private getFileTypeFromName(fileName: string) {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const map: Record<string, string> = {
            pdf: 'PDF', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
            doc: 'Document', docx: 'Document', xls: 'Spreadsheet', xlsx: 'Spreadsheet',
            ppt: 'Presentation', pptx: 'Presentation', zip: 'Archive', rar: 'Archive',
            mp4: 'Video', avi: 'Video', mov: 'Video',
        };
        return map[ext] || 'Document';
    }

    /**
     * Extrair documentos com progresso em tempo real (SSE)
     */
    async extractDocumentsStream(projectId: string, projectUrl: string): Promise<any> {
        try {
            this.logger.log(`🔄 Iniciando extração com stream para projeto: ${projectId}`);

            // TODO: Implementar Server-Sent Events (SSE) para progresso em tempo real
            // Por enquanto, retornar dados simulados

            return {
                message: 'Stream de extração iniciado',
                projectId,
                projectUrl,
                status: 'processing',
            };

        } catch (error) {
            this.logger.error(`❌ Erro na extração com stream: ${error.message}`);
            throw new Error(`Falha na extração com stream: ${error.message}`);
        }
    }

    /**
     * Extrair comentários de texto com IA enhancement
     */
    async extractCommentsWithAI(
        text: string,
        documentContext?: string,
        useAI: boolean = true
    ): Promise<EnhanceExtractionResponseDto> {
        try {
            this.logger.log(`🔍 Extraindo comentários de texto (${text.length} chars)`);

            // 1. Extração tradicional usando regex/parsing
            const extractedComments = this.extractCommentsTraditional(text);

            // 2. Se IA está habilitada, tentar melhorar
            if (useAI) {
                const enhanceDto: EnhanceExtractionDto = {
                    originalText: text,
                    extractedComments,
                    useAIEnhancement: true,
                    confidenceThreshold: 0.7,
                    documentContext
                };

                return await this.commentEnhancement.enhanceExtraction(enhanceDto);
            } else {
                // Retornar apenas extração tradicional
                return {
                    success: true,
                    aiEnhanced: false,
                    extractedData: {
                        feedback: extractedComments,
                        actionItems: extractedComments.filter(c =>
                            /\b(alterar|mudar|corrigir|ajustar|revisar)\b/i.test(c)
                        ),
                        approvalStatus: 'pending',
                        priority: 'medium',
                        categories: ['general'],
                        mentions: []
                    } as any,
                    originalConfidence: 0.8,
                    finalConfidence: 0.8,
                    originalComments: extractedComments,
                    processingTime: 0,
                    processingDetails: {
                        originalMethod: 'parsing',
                        triggeredEnhancement: false,
                        reason: 'IA desabilitada pelo usuário'
                    }
                };
            }

        } catch (error) {
            this.logger.error(`❌ Erro na extração de comentários: ${error.message}`);
            throw new Error(`Falha na extração de comentários: ${error.message}`);
        }
    }

    /**
     * Extração tradicional de comentários usando regex
     */
    private extractCommentsTraditional(text: string): string[] {
        const comments: string[] = [];

        // Padrões comuns de comentários em PDFs
        const patterns = [
            // Comentários com prefixos
            /(?:comentário|comment|feedback|observação):\s*(.+?)(?:\n|$)/gi,
            // Linhas que começam com "-" ou "•"
            /^[\-•]\s*(.+?)$/gm,
            // Texto entre parênteses ou colchetes (possíveis comentários)
            /[\(\[]((?:(?![\)\]]).)+)[\)\]]/g,
            // Frases que parecem feedback
            /\b(?:alterar|mudar|corrigir|ajustar|revisar|remover|adicionar)\b.+?(?:\.|$)/gi,
            // Menções de aprovação/rejeição
            /\b(?:aprovado|rejeitado|ok|não ok|aprovação|rejeição)\b.+?(?:\.|$)/gi,
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const cleaned = match.replace(/^[\-•\(\[\s]+|[\)\]\s]+$/g, '').trim();
                    if (cleaned.length > 5 && !comments.includes(cleaned)) {
                        comments.push(cleaned);
                    }
                }
            }
        }

        // Filtrar comentários muito curtos ou genéricos
        return comments.filter(comment =>
            comment.length > 10 &&
            !/^(sim|não|ok|test|página|page|\d+)$/i.test(comment.trim())
        );
    }

    /**
     * Verificar se IA está disponível para processamento
     */
    async isAIAvailable(): Promise<boolean> {
        return this.commentEnhancement.isAvailable();
    }

    /**
     * Extrair informações da aba Overview de um projeto
     */
    async extractOverview(overviewUrl: string): Promise<any> {
        this.logger.log(`📋 Extraindo overview de: ${overviewUrl}`);

        const browser = await chromium.launch({
            headless: false,
            args: ['--start-maximized']
        });

        try {
            const context = await browser.newContext({
                storageState: 'wf_state.json',
                viewport: null
            });
            const page = await context.newPage();

            await page.goto(overviewUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(6000);

            // Localizar o iframe do Workfront
            const frameLocator = page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first();
            await page.waitForTimeout(2000);

            // Rolar até o final da página primeiro para carregar todo o conteúdo
            this.logger.log('📜 Rolando até o final da página...');
            await frameLocator.locator('body').evaluate((body) => {
                body.scrollTop = body.scrollHeight;
            });
            await page.waitForTimeout(2000);

            // Expandir os 3 dropdowns de BAIXO PARA CIMA (começando pelo Overview do final)
            this.logger.log('🔽 Expandindo dropdowns de baixo para cima...');

            const dropdownTexts = [
                'Overview',           // Este é o último, mais importante
                'loc | Statuses',
                'cnc | loc | MDF Form',
            ];

            for (const dropdownText of dropdownTexts) {
                try {
                    // Para o dropdown "Overview", pegar o ÚLTIMO (que está no final da página)
                    const isOverview = dropdownText === 'Overview';
                    
                    let dropdownButton;
                    if (isOverview) {
                        // Pegar o ÚLTIMO botão Overview (usando .last() ao invés de .first())
                        dropdownButton = frameLocator
                            .getByRole('button', { name: new RegExp(dropdownText, 'i') })
                            .or(frameLocator.getByText(dropdownText, { exact: true }))
                            .or(frameLocator.locator(`button:has-text("${dropdownText}")`))
                            .last(); // ÚLTIMO Overview da página
                    } else {
                        // Para outros dropdowns, manter busca normal
                        dropdownButton = frameLocator
                            .getByRole('button', { name: new RegExp(dropdownText.replace(/[|]/g, '\\|'), 'i') })
                            .or(frameLocator.getByText(dropdownText))
                            .or(frameLocator.locator(`button:has-text("${dropdownText}")`))
                            .first();
                    }

                    await dropdownButton.waitFor({ timeout: 3000, state: 'visible' });
                    
                    // Scroll até o elemento antes de clicar
                    await dropdownButton.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);
                    
                    await dropdownButton.click();
                    this.logger.log(`✅ Dropdown "${dropdownText}" expandido`);
                    await page.waitForTimeout(1500); // Aguardar conteúdo carregar
                } catch (e) {
                    this.logger.warn(`⚠️ Dropdown "${dropdownText}" não encontrado ou já expandido: ${e.message}`);
                }
            }

            this.logger.log('📊 Extraindo dados após expansão dos dropdowns...');
            await page.waitForTimeout(2000); // Tempo para todo o conteúdo carregar

            // Extrair todos os campos e labels da página Overview
            const overviewData = await frameLocator.locator('body').evaluate((body) => {
                const data: Record<string, any> = {};

                // Tentar diferentes seletores comuns para campos do Workfront
                const selectors = [
                    // Campos com label e valor
                    { label: '[data-test-id*="label"], .label, label', value: '[data-test-id*="value"], .value, .field-value' },
                    // Campos de formulário
                    { label: '.form-label', value: '.form-control, input, textarea, select' },
                    // Campos customizados do Workfront
                    { label: '[class*="Label"]', value: '[class*="Value"]' },
                ];

                // Extrair dados estruturados
                selectors.forEach(({ label: labelSel, value: valueSel }) => {
                    const labels = body.querySelectorAll(labelSel);
                    labels.forEach((labelEl) => {
                        const labelText = labelEl.textContent?.trim();
                        if (!labelText) return;

                        // Tentar encontrar o valor associado
                        let valueEl = labelEl.nextElementSibling;
                        if (valueEl && valueEl.matches(valueSel)) {
                            const valueText = valueEl.textContent?.trim() ||
                                (valueEl as HTMLInputElement).value?.trim();
                            if (valueText) {
                                data[labelText] = valueText;
                            }
                        }

                        // Tentar encontrar dentro do mesmo container
                        const parent = labelEl.parentElement;
                        if (parent) {
                            const valueInParent = parent.querySelector(valueSel);
                            if (valueInParent) {
                                const valueText = valueInParent.textContent?.trim() ||
                                    (valueInParent as HTMLInputElement).value?.trim();
                                if (valueText && valueText !== labelText) {
                                    data[labelText] = valueText;
                                }
                            }
                        }
                    });
                });

                // Extrair todos os campos de texto visíveis como fallback
                const allTextElements = body.querySelectorAll('div, span, p, td');
                const rawFields: string[] = [];
                allTextElements.forEach((el) => {
                    const text = el.textContent?.trim();
                    if (text && text.length > 0 && text.length < 200) {
                        rawFields.push(text);
                    }
                });

                return {
                    structuredData: data,
                    rawFields: [...new Set(rawFields)], // Remove duplicatas
                    extractedAt: new Date().toISOString(),
                };
            });

            this.logger.log(`✅ Overview extraído: ${Object.keys(overviewData.structuredData).length} campos estruturados`);

            return overviewData;

        } catch (error) {
            this.logger.error(`❌ Erro ao extrair overview: ${error.message}`);
            throw new Error(`Falha na extração do overview: ${error.message}`);
        } finally {
            await browser.close();
        }
    }

    /**
     * Processar e limpar dados extraídos do Overview
     * Remove duplicatas, fragmentos e organiza campos importantes
     */
    async processOverviewData(rawData: any): Promise<any> {
        const rawFields = rawData.rawFields || [];

        // Campos-chave que queremos extrair (regex patterns)
        const fieldPatterns = {
            // Capturar nome do projeto: linha que começa com "Project" seguida do código
            projectName: /Project\s+(260\d[A-Z]\d+_\d+_\d+[^\s]+)/i,
            projectOwner: /Project Owner\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
            status: /Status\s*(Current|Approved|Planning|Complete|Approved - Final)/i,
            plannedCompletionDate: /Planned Completion Date\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i,
            percentComplete: /Percent Complete\s*(\d+%)/i,
            referenceNumber: /Reference Number\s*(\d+)/i,
            trackingId: /Tracking ID\s*([A-Z]+-[A-Z]+-[A-Z]+-\d+)/i,
            region: /Region\s*(?:Latin America - )?([A-Z]+)/i,
            country: /LATAM Cluster Countries\s*([A-Z]{2})/i,
            customerSegment: /Customer Segment\s*(Consumer|Corporate|Gamer|Small Business|Medium Business)/i,
            assetType: /Asset Type\s*(?!Level)(Social|Online|Physical|Email|Document)/i,
            exposureDate: /Exposure Date\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i,
            businessObjective: /Business Objective\??\s*(Business As Usual|Campaign|Product Launch)/i,
            tagProgram: /Tag Program\s*(\d{7}\s*-[^T]+?)(?:Tag Deliverable|$)/i,
            tagDeliverableUrn: /Tag Deliverable URN\s*(Social - \d+_\d+)/i,
            vendorFunding: /Vendor Funding Program\s*([^T]+?)(?:Translation|$)/i,
            agencyOwner: /Agency Owner\s*(?:Calculated)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
            projectRequestor: /Project Requestor\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
            languages: /Languages\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
            fiscalWeek: /Fiscal Week of Quarter\s*(W\d+)/i,
            fiscalQuarter: /fiscal year and quarter\s*(\d{4})/i,
            fiscalYearQuarterWeek: /Fiscal Year, Quarter and Week\s*(\d{4}W\d+)/i,
            vehicleCode: /Vehicle Code calc\s*([a-z]+)/i,
            studio: /Asset Source Creative Agency Organization\s*([A-Z]+)/i,
        };

        const extracted: Record<string, string> = {};
        const fullText = rawFields.join(' ');

        // Extrair cada campo usando regex
        for (const [key, pattern] of Object.entries(fieldPatterns)) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                extracted[key] = match[1].trim();
            }
        }

        // Parsing especial do nome do projeto para extrair informações estruturadas
        const projectFullName = extracted.projectName || '';
        const projectNameMatch = projectFullName.match(/260\d[A-Z]\d+_\d+_(\d+)_([a-z]{2})_([a-z]{3})_([a-z]{3})_fy(\d{2})q(\d)w(\d)_([a-z]+)_([^_]+)_([^_\s]+)/i);

        let parsedProjectInfo: any = {};

        if (projectNameMatch) {
            const [, dsid, country, bu, segment, fy, quarter, week, vehicle, campaign, creative] = projectNameMatch;
            parsedProjectInfo = {
                dsid,
                country: country?.toUpperCase(),
                businessUnit: bu?.toUpperCase(),
                segment: segment?.toUpperCase(),
                fiscalYear: `FY${fy}`,
                quarter: `Q${quarter}`,
                week: `W${week}`,
                vehicle: vehicle?.toUpperCase(),
                campaign,
                creative,
            };
        }

        // Extrair DSID do Reference Number se não encontrado no nome
        const dsid = parsedProjectInfo.dsid || extracted.referenceNumber || 'N/A';

        // Extrair primeiro nome do Project Owner para CLIENTE
        const clienteFullName = extracted.projectOwner || '';
        const clienteFirstName = clienteFullName.split(' ')[0] || 'N/A';

        // Formatar data de DD/MM
        const formatDateToDDMM = (dateStr?: string): string => {
            if (!dateStr) return 'N/A';
            const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
            if (!match) return dateStr;
            const monthMap: Record<string, string> = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            };
            const day = match[2].padStart(2, '0');
            const month = monthMap[match[1]] || '01';
            return `${day}/${month}`;
        };

        // Montar objeto no formato da planilha
        const forSpreadsheet = {
            'B.I': '', // Será preenchido manualmente
            'ANOTAÇÕES': '', // Será preenchido manualmente
            'START': '', // Será preenchido manualmente
            'REAL DELIV.': '', // Será preenchido manualmente
            'PREV DELIV.': formatDateToDDMM(extracted.plannedCompletionDate),
            'DSID': dsid,
            'ATIVIDADE': projectFullName || 'N/A',
            'STATUS': 'Files to Studio',
            'STUDIO': 'Rô', // Fixo conforme solicitado
            'VF': this.extractVendorFundingShort(extracted.vendorFunding),
            'T. DE ASSET': 'Vídeo', // Fixo conforme solicitado
            'N. DE ASSETS': '1', // Default, pode ser ajustado
            'CLIENTE': clienteFirstName,
            'BRAND': this.extractBrand(extracted.tagProgram),
            'WEEK': parsedProjectInfo.week || extracted.fiscalWeek || 'N/A',
            'QUARTER': parsedProjectInfo.quarter || this.extractQuarter(extracted.fiscalQuarter) || 'N/A',
            'FRENTE': this.mapVehicleToFrente(extracted.assetType, extracted.vehicleCode),
            'FY': parsedProjectInfo.fiscalYear || this.extractFY(extracted.fiscalQuarter) || 'N/A',
        };

        // Limpar rawFields: remover fragmentos, duplicatas e lixo
        const cleanedRawFields = rawFields
            .filter((text: string) => {
                if (!text || text.length < 3) return false;
                if (/^[A-Za-z]{1,3}$/.test(text)) return false;
                if (/^(Show options|Remove|Open date picker|Click to start|Copyright|Add)/.test(text)) return false;
                if (/^\d+\/\d+$/.test(text)) return false;
                return true;
            })
            .filter((text: string, index: number, arr: string[]) => arr.indexOf(text) === index)
            .slice(0, 200);

        return {
            ...rawData,
            cleanedRawFields,
            extractedFields: extracted,
            parsedProjectInfo,
            forSpreadsheet,
            processingInfo: {
                originalFieldCount: rawFields.length,
                cleanedFieldCount: cleanedRawFields.length,
                extractedKeyFields: Object.keys(extracted).length,
            }
        };
    }

    /**
     * Extrair sigla do Vendor Funding
     */
    private extractVendorFundingShort(vendorFunding?: string): string {
        if (!vendorFunding) return 'N/A';
        const match = vendorFunding.match(/Microsoft JMA.*?\(([^)]+)\)/i);
        return match ? match[1] : vendorFunding.substring(0, 10);
    }

    /**
     * Mapear tipo de asset
     */
    private mapAssetType(assetType?: string): string {
        if (!assetType) return 'N/A';
        const typeMap: Record<string, string> = {
            'Social': 'Wireframe',
            'Online': 'Banner',
            'Email': 'Email',
            'Physical': 'Print',
        };
        return typeMap[assetType] || assetType;
    }

    /**
     * Extrair BRAND do Tag Program
     */
    private extractBrand(tagProgram?: string): string {
        if (!tagProgram) return 'N/A';
        // Extrair sigla entre parênteses ou depois de "_"
        const match = tagProgram.match(/Campaign_([^_\s]+)/i);
        return match ? match[1].substring(0, 2).toUpperCase() : 'AW';
    }

    /**
     * Extrair Quarter do fiscal year
     */
    private extractQuarter(fiscalYearQuarter?: string): string {
        if (!fiscalYearQuarter) return 'N/A';
        const match = fiscalYearQuarter.match(/\d{2}0([1-4])/);
        return match ? `Q${match[1]}` : 'N/A';
    }

    /**
     * Extrair FY do fiscal year
     */
    private extractFY(fiscalYearQuarter?: string): string {
        if (!fiscalYearQuarter) return 'N/A';
        const match = fiscalYearQuarter.match(/(\d{2})\d{2}/);
        return match ? `FY${match[1]}` : 'N/A';
    }

    /**
     * Mapear vehicle para FRENTE
     */
    private mapVehicleToFrente(assetType?: string, vehicleCode?: string): string {
        if (vehicleCode === 'sm' || assetType === 'Social') return 'Social';
        if (vehicleCode === 'on' || assetType === 'Online') return 'Online';
        if (vehicleCode === 'em' || assetType === 'Email') return 'Email';
        return 'Social'; // Default
    }
}