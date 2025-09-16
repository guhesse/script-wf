import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BriefingStatsResponseDto } from './dto/briefing-stats.dto';
import { BriefingProjectsResponseDto } from './dto/briefing-projects.dto';
import {
  ProcessProjectsRequestDto,
  ProcessProjectsResponseDto,
  DeleteDownloadsResponseDto,
} from './dto/briefing-operations.dto';
import { BriefingExtractionService } from './briefing-extraction.service';
import { BriefingCommentsAnalysisResponseDto } from './dto/briefing-comments-analysis.dto';

// Função auxiliar para converter BigInt para string recursivamente
function serializeBigInt(obj: any): any {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = serializeBigInt(obj[key]);
      }
    }
    return result;
  }
  return obj;
}

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly briefingExtractionService: BriefingExtractionService,
  ) { }

  async healthCheck(): Promise<any> {
    return {
      service: 'briefing',
      timestamp: new Date().toISOString(),
    };
  }

  async getProjects(search?: string, status?: string): Promise<BriefingProjectsResponseDto> {
    try {
      const where: any = {
        AND: [
          // Filtrar apenas projetos que têm briefingDownloads E que são realmente briefings
          {
            OR: [
              // Projetos que têm briefingDownloads com status COMPLETED
              {
                briefingDownloads: {
                  some: {
                    status: 'COMPLETED',
                  },
                },
              },
              // Projetos que foram especificamente marcados como briefings
              {
                AND: [
                  {
                    briefingDownloads: {
                      some: {},
                    },
                  },
                  // Adicionar critérios específicos para briefings
                  {
                    OR: [
                      { title: { contains: 'brief', mode: 'insensitive' } },
                      { description: { contains: 'brief', mode: 'insensitive' } },
                      { dsid: { not: null } }, // Projetos com DSID normalmente são briefings
                    ],
                  },
                ],
              },
            ],
          },

        ],
      };

      // Filtro de pesquisa
      if (search) {
        // Se a pesquisa é uma URL completa, buscar por URL exata
        if (search.includes('workfront') || search.includes('experience.adobe.com')) {
          where.AND.push({
            url: { equals: search }
          });
        } else {
          // Senão, buscar por título, projectId ou DSID
          where.AND.push({
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { projectId: { contains: search, mode: 'insensitive' } },
              { dsid: { contains: search, mode: 'insensitive' } },
            ],
          });
        }
      }

      // Filtro de status
      if (status) {
        where.AND.push({ status });
      }

      const projects = await this.prisma.workfrontProject.findMany({
        where,
        include: {
          briefingDownloads: {
            include: {
              pdfFiles: {
                include: {
                  extractedContent: true,
                  structuredData: true,
                }
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          _count: {
            select: {
              accessSessions: true,
              briefingDownloads: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      this.logger.log(`Encontrados ${projects.length} projetos de briefing após filtros`);
      if (search) {
        this.logger.debug(`Filtro de pesquisa aplicado: "${search}"`);
      }

      // Log dos projetos encontrados para debug
      projects.forEach(project => {
        this.logger.debug(`Projeto: ${project.title} | Downloads: ${project.briefingDownloads.length} | DSID: ${project.dsid}`);
      });

      const responseData = {
        success: true,
        data: {
          projects: projects.map(project => ({
            id: project.id,
            url: project.url,
            title: project.title,
            description: project.description,
            projectId: project.projectId,
            dsid: project.dsid,
            status: project.status,
            accessedAt: project.accessedAt,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            totalDownloads: project._count.briefingDownloads,
            totalAccess: project._count.accessSessions,
            briefingDownloads: project.briefingDownloads.map(download => ({
              id: download.id,
              projectName: download.projectName,
              dsid: download.dsid,
              totalFiles: download.totalFiles,
              totalSize: download.totalSize.toString(),
              status: download.status,
              createdAt: download.createdAt,
              updatedAt: download.updatedAt,
              fileCount: download.pdfFiles?.length || 0,
              pdfFiles: (download.pdfFiles || []).map(pdf => {
                const extracted = (pdf as any).extractedContent;
                let normalizedComments: any[] = [];
                let plainComments: string[] = [];
                if (extracted && extracted.comments) {
                  const norm = this.normalizeComments(extracted.comments);
                  normalizedComments = norm.normalized;
                  plainComments = norm.plain;
                }
                return {
                  id: pdf.id,
                  originalFileName: pdf.originalFileName,
                  originalUrl: pdf.originalUrl,
                  fileSize: pdf.fileSize.toString(),
                  pageCount: pdf.pageCount,
                  hasContent: pdf.hasContent,
                  hasComments: pdf.hasComments,
                  processedAt: pdf.processedAt,
                  createdAt: pdf.createdAt,
                  extractedContent: extracted ? {
                    hasText: !!extracted.fullText,
                    hasComments: normalizedComments.length > 0,
                    fullText: extracted.fullText || null,
                    comments: normalizedComments,
                    commentsPlain: plainComments,
                    commentCount: normalizedComments.length,
                    links: extracted.links || []
                  } : null,
                  structuredData: (pdf as any).structuredData ? {
                    liveDate: (pdf as any).structuredData.liveDate,
                    vf: (pdf as any).structuredData.vf,
                    headline: (pdf as any).structuredData.headline,
                    copy: (pdf as any).structuredData.copy,
                    description: (pdf as any).structuredData.description,
                    cta: (pdf as any).structuredData.cta,
                    backgroundColor: (pdf as any).structuredData.backgroundColor,
                    copyColor: (pdf as any).structuredData.copyColor,
                    postcopy: (pdf as any).structuredData.postcopy,
                    urn: (pdf as any).structuredData.urn,
                    allocadia: (pdf as any).structuredData.allocadia,
                    po: (pdf as any).structuredData.po,
                    formats: (pdf as any).structuredData.formats
                  } : null,
                };
              }),
            })),
          })),
        },
      };

      // Aplicar serialização segura para garantir que todos os BigInt sejam convertidos
      return serializeBigInt(responseData) as BriefingProjectsResponseDto;
    } catch (error) {
      this.logger.error('Erro ao buscar projetos:', error);
      return {
        success: false,
        error: 'Erro interno do servidor ao buscar projetos',
      };
    }
  }

  async getStats(): Promise<BriefingStatsResponseDto> {
    try {
      const [
        totalProjects,
        totalDownloads,
        totalPdfFiles,
        recentActivity,
        statusDistribution,
      ] = await Promise.all([
        this.prisma.workfrontProject.count(),
        this.prisma.briefingDownload.count(),
        this.prisma.pdfFile.count(),
        this.prisma.workfrontProject.count({
          where: {
            accessedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Última semana
            },
          },
        }),
        this.prisma.workfrontProject.groupBy({
          by: ['status'],
          _count: true,
        }),
      ]);

      return {
        success: true,
        data: {
          totals: {
            projects: totalProjects,
            downloads: totalDownloads,
            pdfs: totalPdfFiles,
          },
          statusBreakdown: statusDistribution.reduce((acc, item) => {
            acc[item.status] = item._count;
            return acc;
          }, {}),
        },
      };
    } catch (error) {
      this.logger.error('Erro ao buscar estatísticas:', error);
      return {
        success: false,
        error: 'Erro interno do servidor ao buscar estatísticas',
      };
    }
  }

  async processProjects(processRequest: ProcessProjectsRequestDto): Promise<ProcessProjectsResponseDto> {
    try {
      this.logger.log('📋 Iniciando processamento de briefings de projetos:', JSON.stringify(processRequest, null, 2));

      const { projectUrls, options = {} } = processRequest;

      if (!projectUrls || !Array.isArray(projectUrls) || projectUrls.length === 0) {
        this.logger.error('ProjectUrls inválido:', projectUrls);
        return {
          success: false,
          error: 'Lista de URLs dos projetos é obrigatória e deve conter pelo menos uma URL',
        };
      }

      this.logger.log(`🔄 Processando ${projectUrls.length} projetos com opções:`, JSON.stringify(options, null, 2));

      // Usar o serviço especializado de extração de briefings
      const result = await this.briefingExtractionService.processProjectsBriefings(
        projectUrls,
        {
          headless: options.headless !== false, // Default true
          continueOnError: options.continueOnError !== false // Default true
        }
      );

      this.logger.log(`✅ Processamento concluído: ${result.successful} sucessos, ${result.failed} falhas`);

      // Converter resultado para o formato esperado pelo DTO
      const formattedResult = {
        successful: result.results?.processedProjects?.map((project, index) => ({
          projectNumber: index + 1,
          projectId: project.projectId,
          url: result.downloadResults?.successful?.[index]?.url || 'URL não disponível'
        })) || [],
        failed: result.downloadResults?.failed?.map(failure => ({
          projectNumber: failure.projectNumber,
          url: failure.url,
          error: failure.error
        })) || [],
        summary: {
          totalFiles: result.summary?.totalFiles || 0,
          totalProjects: result.total || 0
        }
      };

      return {
        success: true,
        data: formattedResult,
      };
    } catch (error) {
      this.logger.error('❌ Erro ao processar projetos:', error);
      return {
        success: false,
        error: 'Erro interno do servidor ao processar projetos',
      };
    }
  }

  /** Normaliza comentários extraídos garantindo estrutura consistente e simplificada */
  private normalizeComments(raw: any): { normalized: any[]; plain: string[] } {
    let arr: any[] = [];
    if (!raw) return { normalized: [], plain: [] };
    if (Array.isArray(raw)) arr = raw; else if (typeof raw === 'object') arr = Object.values(raw).flat();

    const normalizedEnriched = arr.map((c: any, idx: number) => {
      const page = Number(c.page) || 1;
      let author = (c.author || 'Anônimo').toString().trim();

      // Extrair texto do comentário
      let textValue = '';
      const candidates = [c.text, c.content, c.rawContents, c.contents, c.subject];
      for (const cand of candidates) {
        if (cand && typeof cand === 'string' && cand !== '[object Object]' && cand.trim()) {
          textValue = cand.trim();
          break;
        }
      }

      // Normalizar espaços e quebras de linha
      const text = textValue.replace(/\s+/g, ' ').trim();
      if (!text) return null; // filtrar comentários vazios

      // Determinar tipo do comentário
      let type = 'Comentário';
      if (c.type === 'Text' || c.subtype === 'Text' || c.typeFriendly === 'Sticky Note') {
        type = 'Sticky Note';
      } else if (c.subtype) {
        const typeMap: Record<string, string> = {
          'Highlight': 'Destaque',
          'Underline': 'Sublinhado',
          'StrikeOut': 'Riscado',
          'FreeText': 'Texto Livre',
          'Note': 'Nota'
        };
        type = typeMap[c.subtype] || c.subtype;
      }

      return {
        page,
        type,
        author,
        content: text
      };
    }).filter(Boolean); // remover nulls

    // Deduplicação simples baseada em página + conteúdo
    const seen = new Set<string>();
    const deduplicated = normalizedEnriched.filter(c => {
      const key = `${c.page}|${c.content.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Ordenar por página
    deduplicated.sort((a, b) => a.page - b.page);

    const plain = deduplicated.map(c => `Pág.${c.page} - ${c.author}: ${c.content}`);
    return { normalized: deduplicated, plain };
  }

  private formatBr(iso?: string | null) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
    } catch { return null; }
  }

  async deleteDownloads(downloadIds: string[]): Promise<DeleteDownloadsResponseDto> {
    try {
      const deleteResult = await this.prisma.briefingDownload.deleteMany({
        where: {
          id: {
            in: downloadIds,
          },
        },
      });

      return {
        success: true,
        data: {
          deletedItems: deleteResult.count,
        },
      };
    } catch (error) {
      this.logger.error('Erro ao deletar downloads:', error);
      return {
        success: false,
        error: 'Erro interno do servidor ao deletar downloads',
      };
    }
  }

  /**
   * Analisar comentários dos PDFs de um projeto ou download específico
   */
  async analyzeComments(params: { projectId?: string; downloadId?: string; dsid?: string }): Promise<BriefingCommentsAnalysisResponseDto> {
    try {
      const { projectId, downloadId, dsid } = params;

      // Resolver projectId a partir de dsid se fornecido
      let targetProjectId = projectId;
      if (!targetProjectId && dsid) {
        const proj = await this.prisma.workfrontProject.findFirst({ where: { dsid } });
        targetProjectId = proj?.id;
      }

      if (!targetProjectId && !downloadId) {
        return { success: false, error: 'Forneça projectId, downloadId ou dsid', totalPdfs: 0, totalPdfsWithComments: 0, totalComments: 0, authors: [], pages: [], topKeywords: [], mentions: [], structuredCoverage: [], pdfs: [] };
      }

      // Carregar downloads/PDFs
      const downloadFilter: any = downloadId ? { id: downloadId } : { projectId: targetProjectId };
      const downloads = await this.prisma.briefingDownload.findMany({
        where: downloadFilter,
        include: {
          pdfFiles: {
            include: { extractedContent: true, structuredData: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const allPdfs = downloads.flatMap(d => d.pdfFiles);
      const totalPdfs = allPdfs.length;
      const pdfsWithComments = allPdfs.filter(p => p.hasComments && p.extractedContent?.comments);

      // Normalizar comentários em array simples
      interface RawComment { page?: number; author?: string; contents?: string; richText?: string; subject?: string; text?: string; subtype?: string; }
      const comments: Array<{ pdfFileId: string; fileName: string; page: number; author: string; text: string; subtype?: string; }> = [];

      for (const pdf of pdfsWithComments) {
        let raw = pdf.extractedContent?.comments as any;
        if (!raw) continue;
        if (!Array.isArray(raw)) {
          // Caso salvo como objeto, tentar extrair arrays de valores
          if (typeof raw === 'object') {
            raw = Object.values(raw).flat();
          } else {
            continue;
          }
        }
        for (const c of raw as RawComment[]) {
          const text = (c.text || c.contents || c.richText || c.subject || '').toString().trim();
          if (!text) continue;
          const author = (c.author || 'Desconhecido').toString().trim();
          comments.push({
            pdfFileId: pdf.id,
            fileName: pdf.originalFileName,
            page: Number(c.page) || 0,
            author,
            text,
            subtype: c.subtype
          });
        }
      }

      const totalComments = comments.length;

      // Estatísticas por autor
      const authorMap = new Map<string, number>();
      for (const c of comments) authorMap.set(c.author, (authorMap.get(c.author) || 0) + 1);
      const authors = Array.from(authorMap.entries()).map(([author, count]) => ({ author, count })).sort((a, b) => b.count - a.count);

      // Estatísticas por página
      const pageMap = new Map<number, number>();
      for (const c of comments) pageMap.set(c.page, (pageMap.get(c.page) || 0) + 1);
      const pages = Array.from(pageMap.entries()).map(([page, count]) => ({ page, count })).sort((a, b) => a.page - b.page);

      // Keywords simples (remover stopwords básicas)
      const stop = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'de', 'da', 'do', 'e', 'para', 'com', 'on', 'in', 'is', 'é', 'um', 'uma', 'o', 'a', 'as', 'os']);
      const keywordFreq = new Map<string, number>();
      for (const c of comments) {
        c.text.split(/[^A-Za-z0-9À-ÿ]+/).filter(w => w.length > 3).forEach(word => {
          const k = word.toLowerCase();
          if (stop.has(k)) return;
          keywordFreq.set(k, (keywordFreq.get(k) || 0) + 1);
        });
      }
      const topKeywords = Array.from(keywordFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([keyword, count]) => ({ keyword, count }));

      // Mentions específicas (padrões relevantes)
      const mentionPatterns: Array<{ key: string; regex: RegExp }> = [
        { key: 'cta', regex: /\bcta\b/i },
        { key: 'headline', regex: /headline/i },
        { key: 'live date', regex: /live\s+date/i },
        { key: 'vf', regex: /\bvf\b|visual framework/i },
        { key: 'background', regex: /background/i },
        { key: 'urn', regex: /\burn\b/i },
        { key: 'allocadia', regex: /allocadia/i },
        { key: 'po', regex: /\bpo[#:\s]?/i }
      ];
      const mentionCounts = new Map<string, number>();
      for (const c of comments) {
        for (const mp of mentionPatterns) {
          if (mp.regex.test(c.text)) {
            mentionCounts.set(mp.key, (mentionCounts.get(mp.key) || 0) + 1);
          }
        }
      }
      const mentions = Array.from(mentionCounts.entries()).sort((a, b) => b[1] - a[1]).map(([keyword, count]) => ({ keyword, count }));

      // Cobertura de structured data
      const structuredFields = ['liveDate', 'vf', 'headline', 'copy', 'description', 'cta', 'backgroundColor', 'copyColor', 'postcopy', 'urn', 'allocadia', 'po'];
      const coverage: Array<{ field: string; filled: boolean }> = [];
      const anyStructured = allPdfs.map(p => p.structuredData).filter(Boolean) as any[];
      const mergedStructured: any = {};
      for (const sd of anyStructured) {
        for (const f of structuredFields) {
          if (!mergedStructured[f] && sd[f]) mergedStructured[f] = sd[f];
        }
      }
      for (const f of structuredFields) coverage.push({ field: f, filled: !!mergedStructured[f] });

      // Resumo por PDF
      const pdfGroup = new Map<string, { fileName: string; comments: number; pages: Set<number>; authors: Set<string>; }>();
      for (const c of comments) {
        if (!pdfGroup.has(c.pdfFileId)) pdfGroup.set(c.pdfFileId, { fileName: c.fileName, comments: 0, pages: new Set(), authors: new Set() });
        const g = pdfGroup.get(c.pdfFileId)!;
        g.comments++;
        if (c.page) g.pages.add(c.page);
        if (c.author) g.authors.add(c.author);
      }
      const pdfs = Array.from(pdfGroup.entries()).map(([pdfFileId, g]) => ({ pdfFileId, fileName: g.fileName, comments: g.comments, pagesWithComments: g.pages.size, authors: Array.from(g.authors) })).sort((a, b) => b.comments - a.comments);

      // Selecionar briefing principal (heurística replicada) e incluir comentários completos
      const primary = this.selectPrimaryBriefingFromDb(allPdfs);
      let primaryFullComments: any[] = [];
      if (primary && primary.extractedContent?.comments) {
        const raw = primary.extractedContent.comments as any;
        primaryFullComments = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.values(raw).flat() : []);
      }

      return {
        success: true,
        projectId: targetProjectId,
        downloadId,
        dsid: dsid || null,
        totalPdfs,
        totalPdfsWithComments: pdfsWithComments.length,
        totalComments,
        authors,
        pages,
        topKeywords,
        mentions,
        structuredCoverage: coverage,
        pdfs,
        // Campo adicional não documentado no DTO original (mantido opcional)
        // Fornece comentários completos do briefing principal para UI detalhada
        // Evita quebrar clientes existentes pois apenas adiciona dado extra
        // Caso precise formalizar em Swagger, adicionar no DTO depois
        ...(primary ? { primaryBriefing: { pdfFileId: primary.id, fileName: primary.originalFileName, comments: primaryFullComments } } : {})
      } as any;
    } catch (error) {
      this.logger.error('Erro na análise de comentários:', error);
      return { success: false, error: 'Erro interno ao analisar comentários', totalPdfs: 0, totalPdfsWithComments: 0, totalComments: 0, authors: [], pages: [], topKeywords: [], mentions: [], structuredCoverage: [], pdfs: [] };
    }
  }

  /** Heurística para selecionar briefing principal entre PDFs já persistidos */
  private selectPrimaryBriefingFromDb(pdfs: any[]) {
    if (!pdfs || !pdfs.length) return null;
    const scored = pdfs.map(p => {
      const name = (p.originalFileName || '').toLowerCase();
      let score = 0; const reasons: string[] = [];
      if (name.includes('briefing')) { score += 100; reasons.push('contains_briefing'); }
      else if (name.includes('brief')) { score += 70; reasons.push('contains_brief'); }
      if (p.hasComments) { score += 40; reasons.push('has_comments'); }
      if (p.hasContent) { score += 20; reasons.push('has_text'); }
      if (name.length <= 45) { score += 10; reasons.push('length_ok'); }
      const underscoreCount = (name.match(/_/g) || []).length;
      if (underscoreCount > 10) { score -= (underscoreCount - 10) * 2; reasons.push('underscore_penalty'); }
      p._score = score; p._scoreReason = reasons.join('|');
      return p;
    }).sort((a, b) => b._score - a._score);
    this.logger.log('🏅 Ranking (analyzeComments) PDFs:');
    scored.forEach((p, i) => this.logger.log(`  ${i + 1}. ${p.originalFileName} score=${p._score} (${p._scoreReason})`));
    return scored[0];
  }
}