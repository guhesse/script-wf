import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontRepository } from './workfront.repository';
import {
    CreateProjectDto,
    ProjectResponseDto,
    ProjectHistoryQueryDto,
    ProjectHistoryResponseDto,
    ShareDocumentsDto,
    ShareDocumentsResponseDto,
    DashboardStatsDto,
    LinkStatus,
} from './dto/workfront.dto';
import { ShareAutomationService } from './share-automation.service';
import { CommentService } from '../pdf/comment.service';
import { CommentType, UserTeam } from '../pdf/dto/pdf.dto';
import {
    ShareAndCommentDto,
    ShareAndCommentResponseDto,
    ShareAndCommentProjectResultDto,
    ShareAndCommentItemResultDto,
} from './dto/share-comment.dto';

@Injectable()
export class WorkfrontService {
    private readonly logger = new Logger(WorkfrontService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly workfrontRepository: WorkfrontRepository,
        private readonly shareAutomation: ShareAutomationService,
        private readonly commentService: CommentService,
    ) {}

    async healthCheck(): Promise<any> {
        try {
            const dbHealth = await this.prisma.healthCheck();
            return {
                database: dbHealth ? 'connected' : 'disconnected',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error('Health check failed:', error);
            return {
                database: 'error',
                timestamp: new Date().toISOString(),
                error: error.message,
            };
        }
    }

    /**
     * Salvar/atualizar projeto a partir de uma URL
     */
    async saveProjectFromUrl(
        projectUrl: string,
        additionalData: Partial<CreateProjectDto> = {},
    ): Promise<ProjectResponseDto> {
        try {
            // Extrair ID do projeto da URL se possível
            const projectId = this.extractProjectIdFromUrl(projectUrl);

            const projectData: CreateProjectDto = {
                url: projectUrl,
                projectId,
                title: additionalData.title || null,
                description: additionalData.description || null,
                ...additionalData,
            };

            const project = await this.workfrontRepository.createOrUpdate(projectData);

            // Registrar acesso
            await this.workfrontRepository.recordAccess(project.id, {
                userAgent: additionalData.userAgent,
                ipAddress: additionalData.ipAddress,
            });

            return this.mapProjectToDto(project);
        } catch (error) {
            this.logger.error('Erro no service saveProjectFromUrl:', error);
            throw error;
        }
    }

    /**
     * Listar histórico de projetos
     */
    async getProjectHistory(options: ProjectHistoryQueryDto): Promise<ProjectHistoryResponseDto> {
        try {
            return await this.workfrontRepository.findAll(options);
        } catch (error) {
            this.logger.error('Erro no service getProjectHistory:', error);
            throw error;
        }
    }

    /**
     * Buscar projeto por ID
     */
    async getProjectById(id: string): Promise<ProjectResponseDto | null> {
        try {
            const project = await this.workfrontRepository.findById(id);
            return project ? this.mapProjectToDto(project) : null;
        } catch (error) {
            this.logger.error('Erro no service getProjectById:', error);
            throw error;
        }
    }

    /**
     * Buscar projeto por URL
     */
    async getProjectByUrl(url: string): Promise<ProjectResponseDto | null> {
        try {
            const project = await this.workfrontRepository.findByUrl(url);
            return project ? this.mapProjectToDto(project) : null;
        } catch (error) {
            this.logger.error('Erro no service getProjectByUrl:', error);
            throw error;
        }
    }

    /**
     * Arquivar projeto
     */
    async archiveProject(id: string): Promise<ProjectResponseDto> {
        try {
            const project = await this.workfrontRepository.updateStatus(id, LinkStatus.ARCHIVED);
            return this.mapProjectToDto(project);
        } catch (error) {
            this.logger.error('Erro no service archiveProject:', error);
            throw error;
        }
    }

    /**
     * Deletar projeto
     */
    async deleteProject(id: string): Promise<ProjectResponseDto> {
        try {
            const project = await this.workfrontRepository.delete(id);
            return this.mapProjectToDto(project);
        } catch (error) {
            this.logger.error('Erro no service deleteProject:', error);
            throw error;
        }
    }

    /**
     * Obter estatísticas do dashboard
     */
    async getDashboardStats(): Promise<DashboardStatsDto> {
        try {
            const [stats, mostAccessed] = await Promise.all([
                this.workfrontRepository.getStats(),
                this.workfrontRepository.findMostAccessed(5),
            ]);

            return {
                ...stats,
                mostAccessed,
            };
        } catch (error) {
            this.logger.error('Erro no service getDashboardStats:', error);
            throw error;
        }
    }

    /**
     * Compartilhar documentos e registrar ação
     * TODO: Implementar integração com o sistema de automação
     */
    async shareDocuments(shareData: ShareDocumentsDto): Promise<ShareDocumentsResponseDto> {
        try {
            const { projectUrl, selections, selectedUser = 'carol', userAgent, ipAddress, headless = false } = shareData;

            // 1. Buscar ou criar projeto
            let project = await this.workfrontRepository.findByUrl(projectUrl);
            if (!project) {
                const projectData: CreateProjectDto = {
                    url: projectUrl,
                    userAgent,
                    ipAddress,
                    title: 'Projeto Workfront - Compartilhamento',
                };
                project = await this.workfrontRepository.createOrUpdate(projectData);
            }

            // 2. Registrar acesso
            await this.workfrontRepository.recordAccess(project.id, {
                userAgent,
                ipAddress,
            });

            // 3. Executar automação real com Playwright
            const { results, summary } = await this.shareAutomation.shareDocuments(
                projectUrl,
                selections,
                (selectedUser as any) ?? 'carol',
                headless === true ? true : false, // default para debug: visível
            );

            const successCount = results.filter((r) => r.success).length;
            const errorCount = results.filter((r) => !r.success).length;

            // 4. Atualizar projeto com resultado do compartilhamento
            await this.workfrontRepository.createOrUpdate({
                url: projectUrl,
                description: `Último compartilhamento: ${successCount} sucessos, ${errorCount} erros`,
            });

            return {
                success: errorCount === 0,
                message: `Compartilhamento concluído: ${successCount} sucessos, ${errorCount} erros`,
                project: this.mapProjectToDto(project),
                results,
                summary: summary ?? {
                    total: selections.length,
                    success: successCount,
                    errors: errorCount,
                },
            };
        } catch (error) {
            this.logger.error('Erro no service shareDocuments:', error);
            throw error;
        }
    }

    /**
     * Fluxo combinado: Compartilhar + Comentar (por arquivo) com suporte a múltiplas URLs
     */
    async shareAndComment(payload: ShareAndCommentDto): Promise<ShareAndCommentResponseDto> {
        const headless = payload.headless === true;
        const selectedUser = (payload.selectedUser || UserTeam.CAROL) as UserTeam;
        const commentType = (payload.commentType || CommentType.ASSET_RELEASE) as CommentType;

        // Normalizar para lista de itens (multi-URL) mesmo quando simples
        const items = (payload.items && payload.items.length > 0)
            ? payload.items
            : [{ projectUrl: payload.projectUrl!, selections: payload.selections || [] }];

        const projectResults: ShareAndCommentProjectResultDto[] = [];
        let totalFiles = 0; let totalSuccess = 0; let totalErrors = 0;

        for (const it of items) {
            const { projectUrl, selections } = it;
            const itemResults: ShareAndCommentItemResultDto[] = [];
            let projSuccess = 0; let projErrors = 0;

            // garantir projeto registrado
            let project = await this.workfrontRepository.findByUrl(projectUrl);
            if (!project) {
                project = await this.workfrontRepository.createOrUpdate({ url: projectUrl, title: 'Projeto Workfront' });
            }

            for (const sel of selections) {
                totalFiles++;
                const res: ShareAndCommentItemResultDto = {
                    folder: sel.folder,
                    fileName: sel.fileName,
                    share: { success: false },
                    comment: { success: false },
                };

                // 1) Abrir projeto e selecionar documento uma vez
                try {
                    const opened = await this.shareAutomation.openProjectAndSelectDocument(projectUrl, sel.folder, sel.fileName, headless);

                    // 1a) Share no mesmo contexto
                    try {
                        await this.shareAutomation.shareUsingOpenPage(opened.frame, opened.page, selectedUser as any);
                        res.share = { success: true, message: 'Compartilhado com sucesso' };
                    } catch (err: any) {
                        res.share = { success: false, error: err?.message || 'Erro no compartilhamento' };
                    }

                    // 1b) Comment no mesmo contexto
                    try {
                        const commentOut = await this.commentService.addCommentUsingOpenPage({
                            frameLocator: opened.frame,
                            page: opened.page,
                            fileName: sel.fileName,
                            folderName: sel.folder,
                            commentType,
                            selectedUser,
                        } as any);
                        res.comment = { success: commentOut.success, message: commentOut.message };
                    } catch (err: any) {
                        res.comment = { success: false, error: err?.message || 'Erro ao comentar' };
                    }

                    // fechar navegador dessa iteração
                    try { await opened.page.context().browser()?.close(); } catch {}
                } catch (err: any) {
                    // Falha ao abrir/selecionar
                    res.share = { success: false, error: err?.message || 'Erro ao preparar página' };
                    res.comment = { success: false, error: 'Comentário não executado (falha na preparação)'};
                }

                if (res.share.success && res.comment.success) { projSuccess++; totalSuccess++; } else { projErrors++; totalErrors++; }
                itemResults.push(res);
            }

            projectResults.push({
                projectUrl,
                items: itemResults,
                summary: { total: selections.length, success: projSuccess, errors: projErrors },
            });

            // atualização de descrição resumida
            await this.workfrontRepository.createOrUpdate({
                url: projectUrl,
                description: `Última execução combinado: ${projSuccess} sucessos, ${projErrors} erros`,
            });
        }

        return {
            success: totalErrors === 0,
            message: `Fluxo combinado concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${totalFiles} arquivo(s)`,
            results: projectResults,
            summary: {
                totalProjects: projectResults.length,
                totalFiles,
                success: totalSuccess,
                errors: totalErrors,
            },
        };
    }

    /**
     * Extrair ID do projeto da URL (utilitário)
     */
    extractProjectIdFromUrl(url: string): string | null {
        try {
            // Padrão: /project/ID_DO_PROJETO/
            const match = url.match(/\/project\/([a-f0-9]+)/i);
            return match ? match[1] : null;
        } catch (error) {
            this.logger.warn('Não foi possível extrair ID do projeto da URL:', url);
            return null;
        }
    }

    /**
     * Extrair DSID do título do projeto
     * Formato esperado: 2601G0179_0057_5297982 onde 5297982 é o DSID
     */
    extractDSIDFromTitle(title: string): string | null {
        try {
            if (!title) return null;

            // Buscar padrão de 7 dígitos que representa o DSID
            const match = title.match(/(\d{7})/);
            return match ? match[1] : null;
        } catch (error) {
            this.logger.warn('Não foi possível extrair DSID do título:', title);
            return null;
        }
    }

    /**
     * Validar URL do projeto
     */
    isValidWorkfrontUrl(url: string): boolean {
        try {
            const validPatterns = [
                /experience\.adobe\.com.*workfront.*project/i,
                /workfront\.com.*project/i,
            ];

            return validPatterns.some((pattern) => pattern.test(url));
        } catch (error) {
            return false;
        }
    }

    /**
     * Mapear projeto Prisma para DTO
     */
    private mapProjectToDto(project: any): ProjectResponseDto {
        return {
            id: project.id,
            url: project.url,
            title: project.title,
            description: project.description,
            projectId: project.projectId,
            dsid: project.dsid,
            status: project.status,
            accessedAt: project.accessedAt.toISOString(),
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
            accessCount: project._count?.accessSessions || 0,
        };
    }
}