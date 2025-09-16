// src/controllers/briefingController.js

import pdfContentExtractionService from '../services/pdfContentExtractionService.js';
import prisma from '../database/prisma.js';

export class BriefingController {
    
    /**
     * POST /api/briefing/process
     * Processar PDFs de briefings de múltiplos projetos
     */
    async processProjectsBriefings(req, res) {
        try {
            const { projectUrls, options = {} } = req.body;

            // Validar entrada
            if (!Array.isArray(projectUrls) || projectUrls.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Lista de URLs de projetos é obrigatória'
                });
            }

            console.log(`📋 Iniciando processamento de ${projectUrls.length} projetos...`);

            // Processar projetos
            const result = await pdfContentExtractionService.processProjectsBriefings(
                projectUrls,
                {
                    headless: options.headless !== false, // Default true
                    continueOnError: options.continueOnError !== false // Default true
                }
            );

            res.json({
                success: true,
                message: 'Processamento concluído com sucesso',
                data: result
            });

        } catch (error) {
            console.error('❌ Erro no processamento de briefings:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/briefing/projects
     * Listar todos os projetos com briefings processados
     */
    async getProjectsWithBriefings(req, res) {
        try {
            const { page = 1, limit = 20, search, status } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            // Construir filtros
            const where = {};
            
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { dsid: { contains: search, mode: 'insensitive' } },
                    { url: { contains: search, mode: 'insensitive' } }
                ];
            }

            if (status) {
                where.status = status;
            }

            // Buscar projetos com briefings
            const [projects, total] = await Promise.all([
                prisma.workfrontProject.findMany({
                    where: {
                        ...where,
                        briefingDownloads: {
                            some: {} // Apenas projetos que têm briefings
                        }
                    },
                    include: {
                        briefingDownloads: {
                            include: {
                                pdfFiles: {
                                    include: {
                                        extractedContent: true,
                                        structuredData: true
                                    }
                                }
                            },
                            orderBy: { createdAt: 'desc' }
                        },
                        _count: {
                            select: {
                                briefingDownloads: true
                            }
                        }
                    },
                    orderBy: { accessedAt: 'desc' },
                    skip,
                    take: parseInt(limit)
                }),
                prisma.workfrontProject.count({
                    where: {
                        ...where,
                        briefingDownloads: {
                            some: {}
                        }
                    }
                })
            ]);

            // Transformar BigInt em Number para serialização JSON
            const transformBigInt = (obj) => {
                if (obj === null || obj === undefined) return obj;
                if (typeof obj === 'bigint') return Number(obj);
                if (Array.isArray(obj)) return obj.map(transformBigInt);
                if (typeof obj === 'object') {
                    const transformed = {};
                    for (const [key, value] of Object.entries(obj)) {
                        // Parse de JSON strings nos comentários
                        if (key === 'comments' && typeof value === 'string') {
                            try {
                                transformed[key] = JSON.parse(value);
                            } catch {
                                transformed[key] = value;
                            }
                        } else {
                            transformed[key] = transformBigInt(value);
                        }
                    }
                    return transformed;
                }
                return obj;
            };

            res.json({
                success: true,
                data: {
                    projects: transformBigInt(projects),
                    pagination: {
                        current: parseInt(page),
                        total: Math.ceil(total / parseInt(limit)),
                        count: projects.length,
                        totalRecords: total
                    }
                }
            });

        } catch (error) {
            console.error('❌ Erro ao buscar projetos:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/briefing/projects/:projectId
     * Obter detalhes de um projeto específico com todos os briefings
     */
    async getProjectDetails(req, res) {
        try {
            const { projectId } = req.params;

            const project = await prisma.workfrontProject.findUnique({
                where: { id: projectId },
                include: {
                    briefingDownloads: {
                        include: {
                            pdfFiles: {
                                include: {
                                    extractedContent: true,
                                    structuredData: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });

            if (!project) {
                return res.status(404).json({
                    success: false,
                    error: 'Projeto não encontrado'
                });
            }

            res.json({
                success: true,
                data: project
            });

        } catch (error) {
            console.error('❌ Erro ao buscar detalhes do projeto:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/briefing/downloads/:downloadId
     * Obter detalhes de um download específico com todos os PDFs
     */
    async getDownloadDetails(req, res) {
        try {
            const { downloadId } = req.params;

            const download = await prisma.briefingDownload.findUnique({
                where: { id: downloadId },
                include: {
                    project: true,
                    pdfFiles: {
                        include: {
                            extractedContent: true,
                            structuredData: true
                        },
                        orderBy: { originalFileName: 'asc' }
                    }
                }
            });

            if (!download) {
                return res.status(404).json({
                    success: false,
                    error: 'Download não encontrado'
                });
            }

            res.json({
                success: true,
                data: download
            });

        } catch (error) {
            console.error('❌ Erro ao buscar detalhes do download:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/briefing/search
     * Buscar conteúdo extraído dos PDFs
     */
    async searchContent(req, res) {
        try {
            const {
                q: query,
                type = 'all', // 'text', 'comments', 'structured', 'all'
                page = 1,
                limit = 20,
                projectId,
                dsid
            } = req.query;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Parâmetro de busca "q" é obrigatório'
                });
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);

            // Construir filtros
            const where = {};
            
            if (projectId) {
                where.project = { id: projectId };
            }

            if (dsid) {
                where.project = { dsid: dsid };
            }

            // Buscar baseado no tipo
            const results = [];
            const _unusedTotal = 0;

            if (type === 'all' || type === 'text') {
                // Buscar em texto completo
                const textResults = await prisma.pdfExtractedContent.findMany({
                    where: {
                        fullText: {
                            contains: query,
                            mode: 'insensitive'
                        },
                        pdfFile: {
                            download: where
                        }
                    },
                    include: {
                        pdfFile: {
                            include: {
                                download: {
                                    include: {
                                        project: true
                                    }
                                }
                            }
                        }
                    },
                    skip,
                    take: parseInt(limit)
                });

                results.push(...textResults.map(r => ({
                    type: 'text',
                    content: r.fullText,
                    file: r.pdfFile,
                    project: r.pdfFile.download.project,
                    match: this.extractMatchContext(r.fullText, query)
                })));
            }

            if (type === 'all' || type === 'structured') {
                // Buscar em dados estruturados
                const structuredResults = await prisma.pdfStructuredData.findMany({
                    where: {
                        OR: [
                            { liveDate: { contains: query, mode: 'insensitive' } },
                            { vf: { contains: query, mode: 'insensitive' } },
                            { headlineCopy: { contains: query, mode: 'insensitive' } },
                            { copy: { contains: query, mode: 'insensitive' } },
                            { description: { contains: query, mode: 'insensitive' } },
                            { cta: { contains: query, mode: 'insensitive' } },
                            { backgroundColor: { contains: query, mode: 'insensitive' } },
                            { copyColor: { contains: query, mode: 'insensitive' } },
                            { postcopy: { contains: query, mode: 'insensitive' } },
                            { urn: { contains: query, mode: 'insensitive' } },
                            { allocadia: { contains: query, mode: 'insensitive' } },
                            { po: { contains: query, mode: 'insensitive' } }
                        ],
                        pdfFile: {
                            download: where
                        }
                    },
                    include: {
                        pdfFile: {
                            include: {
                                download: {
                                    include: {
                                        project: true
                                    }
                                }
                            }
                        }
                    },
                    skip: results.length === 0 ? skip : 0,
                    take: parseInt(limit) - results.length
                });

                results.push(...structuredResults.map(r => ({
                    type: 'structured',
                    data: r,
                    file: r.pdfFile,
                    project: r.pdfFile.download.project,
                    matchedField: this.findMatchedStructuredField(r, query)
                })));
            }

            // Contar total (aproximado)
            const _total = results.length;

            res.json({
                success: true,
                data: {
                    results,
                    query,
                    type,
                    pagination: {
                        current: parseInt(page),
                        count: results.length,
                        hasMore: results.length === parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('❌ Erro na busca de conteúdo:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/briefing/stats
     * Obter estatísticas dos briefings processados
     */
    async getStats(req, res) {
        try {
            const [
                totalProjects,
                totalDownloads,
                totalPdfs,
                recentActivity
            ] = await Promise.all([
                // Total de projetos com briefings
                prisma.workfrontProject.count({
                    where: {
                        briefingDownloads: {
                            some: {}
                        }
                    }
                }),
                // Total de downloads
                prisma.briefingDownload.count(),
                // Total de PDFs processados
                prisma.pdfFile.count(),
                // Atividade recente (últimos 7 dias)
                prisma.briefingDownload.findMany({
                    where: {
                        createdAt: {
                            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                        }
                    },
                    include: {
                        project: true,
                        _count: {
                            select: {
                                pdfFiles: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);

            // Estatísticas por status
            const statusStats = await prisma.briefingDownload.groupBy({
                by: ['status'],
                _count: {
                    id: true
                }
            });

            // Top DSIDs mais processados
            const topDsids = await prisma.workfrontProject.findMany({
                where: {
                    dsid: { not: null },
                    briefingDownloads: {
                        some: {}
                    }
                },
                select: {
                    dsid: true,
                    _count: {
                        select: {
                            briefingDownloads: true
                        }
                    }
                },
                orderBy: {
                    briefingDownloads: {
                        _count: 'desc'
                    }
                },
                take: 5
            });

            // Função para transformar BigInt em Number
            const transformBigInt = (obj) => {
                if (obj === null || obj === undefined) return obj;
                if (typeof obj === 'bigint') return Number(obj);
                if (Array.isArray(obj)) return obj.map(transformBigInt);
                if (typeof obj === 'object') {
                    const transformed = {};
                    for (const [key, value] of Object.entries(obj)) {
                        transformed[key] = transformBigInt(value);
                    }
                    return transformed;
                }
                return obj;
            };

            res.json({
                success: true,
                data: transformBigInt({
                    totals: {
                        projects: totalProjects,
                        downloads: totalDownloads,
                        pdfs: totalPdfs
                    },
                    statusBreakdown: statusStats.reduce((acc, stat) => {
                        acc[stat.status] = stat._count.id;
                        return acc;
                    }, {}),
                    topDsids,
                    recentActivity
                })
            });

        } catch (error) {
            console.error('❌ Erro ao buscar estatísticas:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * DELETE /api/briefing/downloads/:downloadId
     * Deletar um download e todos os dados relacionados
     */
    async deleteDownload(req, res) {
        try {
            const { downloadId } = req.params;

            // Verificar se o download existe
            const download = await prisma.briefingDownload.findUnique({
                where: { id: downloadId }
            });

            if (!download) {
                return res.status(404).json({
                    success: false,
                    error: 'Download não encontrado'
                });
            }

            // Deletar download (cascade deletará PDFs e conteúdo relacionado)
            await prisma.briefingDownload.delete({
                where: { id: downloadId }
            });

            res.json({
                success: true,
                message: 'Download deletado com sucesso'
            });

        } catch (error) {
            console.error('❌ Erro ao deletar download:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Métodos auxiliares
    extractMatchContext(text, query, contextLength = 100) {
        if (!text || !query) return null;

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);
        
        if (index === -1) return null;

        const start = Math.max(0, index - contextLength);
        const end = Math.min(text.length, index + query.length + contextLength);
        
        return {
            before: text.substring(start, index),
            match: text.substring(index, index + query.length),
            after: text.substring(index + query.length, end),
            position: index
        };
    }

    findMatchedStructuredField(structuredData, query) {
        const lowerQuery = query.toLowerCase();
        const fields = [
            'liveDate', 'vf', 'headlineCopy', 'copy', 'description',
            'cta', 'backgroundColor', 'copyColor', 'postcopy', 'urn', 'allocadia', 'po'
        ];

        for (const field of fields) {
            const value = structuredData[field];
            if (value && value.toLowerCase().includes(lowerQuery)) {
                return {
                    field,
                    value,
                    label: this.getFieldLabel(field)
                };
            }
        }

        return null;
    }

    getFieldLabel(field) {
        const labels = {
            liveDate: 'Data de Lançamento',
            vf: 'Visual Framework',
            headlineCopy: 'Título',
            copy: 'Texto Principal',
            description: 'Descrição',
            cta: 'Call to Action',
            background: 'Background',
            colorCopy: 'Texto Colorido',
            postcopy: 'Pós-texto',
            urn: 'URN',
            allocadia: 'Allocadia',
            po: 'Purchase Order'
        };
        return labels[field] || field;
    }

    /**
     * DELETE /api/briefing/downloads
     * Excluir downloads de briefing por IDs
     */
    async deleteBriefingDownloads(req, res) {
        try {
            const { downloadIds } = req.body;

            if (!downloadIds || !Array.isArray(downloadIds) || downloadIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Lista de IDs de downloads é obrigatória'
                });
            }

            // Verificar se os downloads existem
            const existingDownloads = await prisma.briefingDownload.findMany({
                where: {
                    id: {
                        in: downloadIds
                    }
                },
                include: {
                    pdfFiles: {
                        include: {
                            extractedContent: true,
                            structuredData: true
                        }
                    }
                }
            });

            if (existingDownloads.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Nenhum download encontrado com os IDs fornecidos'
                });
            }

            // Usar transação para garantir consistência
            const deletedData = await prisma.$transaction(async (tx) => {
                // Coletar IDs dos PDFs para deletar conteúdo relacionado
                const pdfFileIds = existingDownloads.flatMap(
                    download => download.pdfFiles.map(pdf => pdf.id)
                );

                // Deletar conteúdo extraído dos PDFs
                const deletedContent = await tx.pdfExtractedContent.deleteMany({
                    where: {
                        pdfFileId: {
                            in: pdfFileIds
                        }
                    }
                });

                // Deletar dados estruturados dos PDFs
                const deletedStructured = await tx.pdfStructuredData.deleteMany({
                    where: {
                        pdfFileId: {
                            in: pdfFileIds
                        }
                    }
                });

                // Deletar arquivos PDF
                const deletedPdfs = await tx.pdfFile.deleteMany({
                    where: {
                        downloadId: {
                            in: downloadIds
                        }
                    }
                });

                // Deletar downloads de briefing
                const deletedDownloads = await tx.briefingDownload.deleteMany({
                    where: {
                        id: {
                            in: downloadIds
                        }
                    }
                });

                return {
                    deletedDownloads: deletedDownloads.count,
                    deletedPdfs: deletedPdfs.count,
                    deletedContent: deletedContent.count,
                    deletedStructured: deletedStructured.count
                };
            });

            console.log(`🗑️ Briefings excluídos:`, {
                downloads: deletedData.deletedDownloads,
                pdfs: deletedData.deletedPdfs,
                content: deletedData.deletedContent,
                structured: deletedData.deletedStructured
            });

            res.json({
                success: true,
                message: `${deletedData.deletedDownloads} briefing(s) excluído(s) com sucesso`,
                data: {
                    deletedItems: deletedData.deletedDownloads,
                    deletedPdfs: deletedData.deletedPdfs,
                    deletedContent: deletedData.deletedContent + deletedData.deletedStructured
                }
            });

        } catch (error) {
            console.error('❌ Erro ao excluir briefings:', error.message);
            res.status(500).json({
                success: false,
                error: 'Erro interno do servidor ao excluir briefings'
            });
        }
    }
}

export default new BriefingController();
