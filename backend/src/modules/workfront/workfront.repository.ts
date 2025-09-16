import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontProject, LinkStatus, Prisma } from '@prisma/client';
import {
    CreateProjectDto,
    ProjectResponseDto,
    ProjectHistoryQueryDto,
    ProjectHistoryResponseDto,
    DashboardStatsDto,
} from './dto/workfront.dto';

@Injectable()
export class WorkfrontRepository {
    private readonly logger = new Logger(WorkfrontRepository.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Criar um novo projeto ou atualizar existente
     */
    async createOrUpdate(projectData: CreateProjectDto): Promise<WorkfrontProject> {
        try {
            const { url, title, description, projectId, dsid } = projectData;

            // Usar upsert para criar ou atualizar baseado na URL
            return await this.prisma.workfrontProject.upsert({
                where: { url },
                update: {
                    title,
                    description,
                    projectId,
                    dsid,
                    accessedAt: new Date(),
                    updatedAt: new Date(),
                },
                create: {
                    url,
                    title,
                    description,
                    projectId,
                    dsid,
                    status: LinkStatus.ACTIVE,
                },
            });
        } catch (error: any) {
            this.logger.error('Erro ao criar/atualizar projeto:', error);
            throw new Error(`Erro ao salvar projeto: ${error.message}`);
        }
    }

    /**
     * Buscar projeto por URL
     */
    async findByUrl(url: string): Promise<WorkfrontProject | null> {
        try {
            return await this.prisma.workfrontProject.findUnique({
                where: { url },
                include: {
                    accessSessions: {
                        orderBy: { accessedAt: 'desc' },
                        take: 10, // Últimas 10 sessões
                    },
                },
            });
        } catch (error: any) {
            this.logger.error('Erro ao buscar projeto por URL:', error);
            throw new Error(`Erro ao buscar projeto: ${error.message}`);
        }
    }

    /**
     * Buscar projeto por ID
     */
    async findById(id: string): Promise<WorkfrontProject | null> {
        try {
            return await this.prisma.workfrontProject.findUnique({
                where: { id },
                include: {
                    accessSessions: {
                        orderBy: { accessedAt: 'desc' },
                        take: 10,
                    },
                },
            });
        } catch (error: any) {
            this.logger.error('Erro ao buscar projeto por ID:', error);
            throw new Error(`Erro ao buscar projeto: ${error.message}`);
        }
    }

    /**
     * Listar todos os projetos com paginação
     */
    async findAll(options: ProjectHistoryQueryDto): Promise<ProjectHistoryResponseDto> {
        try {
            const { page = 1, limit = 20, status } = options;
            const skip = (page - 1) * limit;

            const whereClause: Prisma.WorkfrontProjectWhereInput = status ? { status } : {};

            const [projects, total] = await Promise.all([
                this.prisma.workfrontProject.findMany({
                    where: whereClause,
                    orderBy: { accessedAt: 'desc' },
                    skip,
                    take: limit,
                    include: {
                        _count: {
                            select: { accessSessions: true },
                        },
                    },
                }),
                this.prisma.workfrontProject.count({
                    where: whereClause,
                }),
            ]);

            // Transformar dados para incluir accessCount
            const transformedProjects: ProjectResponseDto[] = projects.map((project) => ({
                id: project.id,
                url: project.url,
                title: project.title,
                description: project.description,
                projectId: project.projectId,
                dsid: project.dsid,
                status: project.status,
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
                accessedAt: project.accessedAt.toISOString(),
                accessCount: project._count.accessSessions,
            }));

            return {
                projects: transformedProjects,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error: any) {
            this.logger.error('Erro ao listar projetos:', error);
            throw new Error(`Erro ao listar projetos: ${error.message}`);
        }
    }

    /**
     * Atualizar status do projeto
     */
    async updateStatus(id: string, status: LinkStatus): Promise<WorkfrontProject> {
        try {
            return await this.prisma.workfrontProject.update({
                where: { id },
                data: { status, updatedAt: new Date() },
            });
        } catch (error: any) {
            this.logger.error('Erro ao atualizar status:', error);
            throw new Error(`Erro ao atualizar status: ${error.message}`);
        }
    }

    /**
     * Deletar projeto
     */
    async delete(id: string): Promise<WorkfrontProject> {
        try {
            return await this.prisma.workfrontProject.delete({
                where: { id },
            });
        } catch (error: any) {
            this.logger.error('Erro ao deletar projeto:', error);
            throw new Error(`Erro ao deletar projeto: ${error.message}`);
        }
    }

    /**
     * Registrar acesso ao projeto
     */
    async recordAccess(
        projectId: string,
        accessData: { userAgent?: string; ipAddress?: string } = {},
    ): Promise<void> {
        try {
            const { userAgent, ipAddress } = accessData;

            // Primeiro, atualizar o accessedAt do projeto
            await this.prisma.workfrontProject.update({
                where: { id: projectId },
                data: { accessedAt: new Date() },
            });

            // Depois, criar sessão de acesso
            await this.prisma.accessSession.create({
                data: {
                    projectId,
                    userAgent,
                    ipAddress,
                },
            });
        } catch (error: any) {
            this.logger.error('Erro ao registrar acesso:', error);
            throw new Error(`Erro ao registrar acesso: ${error.message}`);
        }
    }

    /**
     * Buscar projetos mais acessados
     */
    async findMostAccessed(limit: number = 10): Promise<ProjectResponseDto[]> {
        try {
            const projects = await this.prisma.workfrontProject.findMany({
                orderBy: { accessedAt: 'desc' },
                take: limit,
                include: {
                    _count: {
                        select: { accessSessions: true },
                    },
                },
            });

            return projects.map((project) => ({
                id: project.id,
                url: project.url,
                title: project.title,
                description: project.description,
                projectId: project.projectId,
                dsid: project.dsid,
                status: project.status,
                createdAt: project.createdAt.toISOString(),
                updatedAt: project.updatedAt.toISOString(),
                accessedAt: project.accessedAt.toISOString(),
                accessCount: project._count.accessSessions,
            }));
        } catch (error: any) {
            this.logger.error('Erro ao buscar projetos mais acessados:', error);
            throw new Error(`Erro ao buscar projetos mais acessados: ${error.message}`);
        }
    }

    /**
     * Buscar estatísticas dos projetos
     */
    async getStats(): Promise<Omit<DashboardStatsDto, 'mostAccessed'>> {
        try {
            const [totalProjects, activeProjects, totalAccesses, recentAccesses] = await Promise.all([
                this.prisma.workfrontProject.count(),
                this.prisma.workfrontProject.count({ where: { status: LinkStatus.ACTIVE } }),
                this.prisma.accessSession.count(),
                this.prisma.accessSession.count({
                    where: {
                        accessedAt: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24 horas
                        },
                    },
                }),
            ]);

            return {
                totalProjects,
                activeProjects,
                totalAccesses,
                recentAccesses,
            };
        } catch (error: any) {
            this.logger.error('Erro ao buscar estatísticas:', error);
            throw new Error(`Erro ao buscar estatísticas: ${error.message}`);
        }
    }
}