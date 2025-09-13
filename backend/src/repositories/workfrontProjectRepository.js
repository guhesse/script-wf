// src/repositories/workfrontProjectRepository.js
import prisma from '../database/prisma.js';

export class WorkfrontProjectRepository {
  /**
   * Criar um novo projeto ou atualizar existente
   */
  async createOrUpdate(projectData) {
    try {
      const { url, title, description, projectId, dsid } = projectData;

      // Usar upsert para criar ou atualizar baseado na URL
      return await prisma.workfrontProject.upsert({
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
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      console.error('Erro ao criar/atualizar projeto:', error);
      throw new Error(`Erro ao salvar projeto: ${error.message}`);
    }
  }

  /**
   * Buscar projeto por URL
   */
  async findByUrl(url) {
    try {
      return await prisma.workfrontProject.findUnique({
        where: { url },
        include: {
          accessSessions: {
            orderBy: { accessedAt: 'desc' },
            take: 10, // Últimas 10 sessões
          },
        },
      });
    } catch (error) {
      console.error('Erro ao buscar projeto por URL:', error);
      throw new Error(`Erro ao buscar projeto: ${error.message}`);
    }
  }

  /**
   * Buscar projeto por ID
   */
  async findById(id) {
    try {
      return await prisma.workfrontProject.findUnique({
        where: { id },
        include: {
          accessSessions: {
            orderBy: { accessedAt: 'desc' },
            take: 10,
          },
        },
      });
    } catch (error) {
      console.error('Erro ao buscar projeto por ID:', error);
      throw new Error(`Erro ao buscar projeto: ${error.message}`);
    }
  }

  /**
   * Listar todos os projetos com paginação
   */
  async findAll(options = {}) {
    try {
      const { page = 1, limit = 20, status = 'ACTIVE' } = options;
      const skip = (page - 1) * limit;

      const [projects, total] = await Promise.all([
        prisma.workfrontProject.findMany({
          where: status ? { status } : {},
          orderBy: { accessedAt: 'desc' },
          skip,
          take: limit,
          include: {
            _count: {
              select: { accessSessions: true },
            },
          },
        }),
        prisma.workfrontProject.count({
          where: status ? { status } : {},
        }),
      ]);

      // Transformar dados para incluir accessCount
      const transformedProjects = projects.map(project => ({
        id: project.id,
        url: project.url,
        title: project.title,
        projectId: project.projectId,
        dsid: project.dsid,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        lastAccessedAt: project.accessedAt.toISOString(),
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
    } catch (error) {
      console.error('Erro ao listar projetos:', error);
      throw new Error(`Erro ao listar projetos: ${error.message}`);
    }
  }

  /**
   * Atualizar status do projeto
   */
  async updateStatus(id, status) {
    try {
      return await prisma.workfrontProject.update({
        where: { id },
        data: { status, updatedAt: new Date() },
      });
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      throw new Error(`Erro ao atualizar status: ${error.message}`);
    }
  }

  /**
   * Deletar projeto
   */
  async delete(id) {
    try {
      return await prisma.workfrontProject.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Erro ao deletar projeto:', error);
      throw new Error(`Erro ao deletar projeto: ${error.message}`);
    }
  }

  /**
   * Registrar acesso ao projeto
   */
  async recordAccess(projectId, accessData = {}) {
    try {
      const { userAgent, ipAddress } = accessData;

      // Primeiro, atualizar o accessedAt do projeto
      await prisma.workfrontProject.update({
        where: { id: projectId },
        data: { accessedAt: new Date() },
      });

      // Depois, criar sessão de acesso
      return await prisma.accessSession.create({
        data: {
          projectId,
          userAgent,
          ipAddress,
        },
      });
    } catch (error) {
      console.error('Erro ao registrar acesso:', error);
      throw new Error(`Erro ao registrar acesso: ${error.message}`);
    }
  }

  /**
   * Buscar projetos mais acessados
   */
  async findMostAccessed(limit = 10) {
    try {
      return await prisma.workfrontProject.findMany({
        orderBy: { accessedAt: 'desc' },
        take: limit,
        include: {
          _count: {
            select: { accessSessions: true },
          },
        },
      });
    } catch (error) {
      console.error('Erro ao buscar projetos mais acessados:', error);
      throw new Error(`Erro ao buscar projetos mais acessados: ${error.message}`);
    }
  }

  /**
   * Buscar estatísticas dos projetos
   */
  async getStats() {
    try {
      const [totalProjects, activeProjects, totalAccesses, recentAccesses] = await Promise.all([
        prisma.workfrontProject.count(),
        prisma.workfrontProject.count({ where: { status: 'ACTIVE' } }),
        prisma.accessSession.count(),
        prisma.accessSession.count({
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
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      throw new Error(`Erro ao buscar estatísticas: ${error.message}`);
    }
  }
}

export default new WorkfrontProjectRepository();