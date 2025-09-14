// src/controllers/workfrontController.js
import workfrontProjectService from '../services/workfrontProjectService.js';
import authenticationService from '../services/authenticationService.js';
import documentExtractionService from '../services/documentExtractionService.js';
import documentSharingService from '../services/documentSharingService.js';
import documentCommentService from '../services/documentCommentService.js';
import documentBulkDownloadService from '../services/documentBulkDownloadService.js';

export class WorkfrontController {
    /**
     * Fazer login no Workfront
     */
    async login(req, res) {
        try {
            console.log('🔑 Iniciando processo de login...');

            const result = await authenticationService.login();

            console.log('✅ Login concluído com sucesso');
            res.json({
                success: true,
                message: 'Login realizado com sucesso! Você pode fechar a janela do browser.',
                ...result
            });
        } catch (error) {
            console.error('❌ Erro no login:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Verificar status do login
     */
    async getLoginStatus(req, res) {
        try {
            const status = await authenticationService.checkLoginStatus();
            res.json(status);
        } catch (error) {
            console.error('❌ Erro ao verificar status do login:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Extrair documentos de um projeto com streaming
     */
    async extractDocumentsStream(req, res) {
        try {
            const { projectId } = req.params;
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({
                    success: false,
                    message: 'URL do projeto é obrigatória'
                });
            }

            const projectUrl = decodeURIComponent(url);

            // Validar URL
            if (!documentExtractionService.isValidWorkfrontUrl(projectUrl)) {
                return res.status(400).json({
                    success: false,
                    message: 'URL do projeto inválida. Use uma URL do Workfront.'
                });
            }

            // Configurar SSE
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            const sendEvent = (step, message, progress, data = null) => {
                const event = {
                    step,
                    message,
                    progress,
                    timestamp: new Date().toISOString(),
                    data
                };
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            };

            try {
                console.log('📁 Iniciando extração com streaming para:', projectUrl);

                sendEvent('starting', 'Iniciando extração de documentos...', 0);

                // Usar o novo serviço de extração
                const result = await documentExtractionService.extractDocuments(projectUrl, {
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip || req.connection.remoteAddress,
                    headless: true,
                    onProgress: (step, message, progress, data) => {
                        sendEvent(step, message, progress, data);
                    }
                });

                // Salvar projeto no histórico
                const project = await workfrontProjectService.saveProjectFromUrl(projectUrl, {
                    title: result.projectTitle,
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip || req.connection.remoteAddress
                });

                sendEvent('completed', 'Extração concluída com sucesso', 100, {
                    folders: result.folders,
                    totalFolders: result.totalFolders,
                    totalFiles: result.totalFiles,
                    project: {
                        id: project.id,
                        url: project.url,
                        title: project.title
                    }
                });

            } catch (error) {
                console.error('❌ Erro na extração com streaming:', error.message);
                sendEvent('error', error.message, 0);
            } finally {
                res.end();
            }

        } catch (error) {
            console.error('❌ Erro no streaming:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    async extractDocuments(req, res) {
        try {
            const { projectUrl } = req.body;

            if (!projectUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'URL do projeto é obrigatória'
                });
            }

            // Validar URL
            if (!workfrontProjectService.isValidWorkfrontUrl(projectUrl)) {
                return res.status(400).json({
                    success: false,
                    message: 'URL do projeto inválida. Use uma URL do Workfront.'
                });
            }

            console.log('📁 Extraindo documentos de:', projectUrl);

            const result = await workfrontProjectService.extractAndSaveDocuments(projectUrl, {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip || req.connection.remoteAddress,
                headless: true
            });

            console.log('✅ Documentos extraídos e salvos com sucesso');

            res.json({
                success: true,
                ...result.extraction,
                project: {
                    id: result.project.id,
                    url: result.project.url,
                    title: result.project.title
                }
            });
        } catch (error) {
            console.error('❌ Erro na extração:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Compartilhar documentos selecionados
     */
    async shareDocuments(req, res) {
        try {
            const { projectUrl, selections, users, selectedUser = 'carol' } = req.body;

            if (!projectUrl || !selections || !users) {
                return res.status(400).json({
                    success: false,
                    message: 'URL do projeto, seleções e usuários são obrigatórios'
                });
            }

            // Validar URL
            if (!documentSharingService.validateShareInputs) {
                // Usar validação básica se método não existe
                if (!documentExtractionService.isValidWorkfrontUrl(projectUrl)) {
                    return res.status(400).json({
                        success: false,
                        message: 'URL do projeto inválida. Use uma URL do Workfront.'
                    });
                }
            }

            console.log('📤 Compartilhando documentos selecionados...');
            console.log('URL:', projectUrl);
            console.log('Seleções:', selections.length);
            console.log('Equipe selecionada:', selectedUser);

            // Usar o novo serviço de compartilhamento
            const result = await documentSharingService.shareDocuments(
                projectUrl,
                selections,
                {
                    selectedUser,
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip || req.connection.remoteAddress,
                    headless: false // Visível para permitir interação se necessário
                }
            );

            // Registrar acesso no projeto
            try {
                await workfrontProjectService.saveProjectFromUrl(projectUrl, {
                    title: 'Compartilhamento realizado',
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip || req.connection.remoteAddress
                });
            } catch (projectError) {
                console.warn('⚠️ Erro ao registrar acesso ao projeto:', projectError.message);
            }

            console.log('📊 Resultado final do compartilhamento:', result.summary);

            res.json(result);
        } catch (error) {
            console.error('❌ Erro durante compartilhamento:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno durante compartilhamento',
                error: error.message
            });
        }
    }

    /**
     * Obter histórico de projetos
     */
    async getProjectHistory(req, res) {
        try {
            const { page = 1, limit = 20, status } = req.query;

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                status
            };

            const result = await workfrontProjectService.getProjectHistory(options);

            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('❌ Erro ao buscar histórico:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obter projeto por ID
     */
    async getProjectById(req, res) {
        try {
            const { id } = req.params;

            const project = await workfrontProjectService.getProjectById(id);

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Projeto não encontrado'
                });
            }

            res.json({
                success: true,
                project
            });
        } catch (error) {
            console.error('❌ Erro ao buscar projeto:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obter projeto por URL
     */
    async getProjectByUrl(req, res) {
        try {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({
                    success: false,
                    message: 'URL é obrigatória'
                });
            }

            const project = await workfrontProjectService.getProjectByUrl(decodeURIComponent(url));

            res.json({
                success: true,
                project
            });
        } catch (error) {
            console.error('❌ Erro ao buscar projeto por URL:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Arquivar projeto
     */
    async archiveProject(req, res) {
        try {
            const { id } = req.params;

            const project = await workfrontProjectService.archiveProject(id);

            res.json({
                success: true,
                message: 'Projeto arquivado com sucesso',
                project
            });
        } catch (error) {
            console.error('❌ Erro ao arquivar projeto:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Deletar projeto
     */
    async deleteProject(req, res) {
        try {
            const { id } = req.params;

            await workfrontProjectService.deleteProject(id);

            res.json({
                success: true,
                message: 'Projeto deletado com sucesso'
            });
        } catch (error) {
            console.error('❌ Erro ao deletar projeto:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obter estatísticas do dashboard
     */
    async getDashboardStats(req, res) {
        try {
            const stats = await workfrontProjectService.getDashboardStats();

            res.json({
                success: true,
                stats
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
     * Limpar cache do navegador
     */
    async clearCache(req, res) {
        try {
            const result = await authenticationService.clearSession();
            res.json(result);
        } catch (error) {
            console.error('❌ Erro ao limpar cache:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao limpar cache',
                error: error.message
            });
        }
    }

    /**
     * Adicionar comentário em um documento
     */
    async addComment(req, res) {
        try {
            console.log('💬 Requisição para adicionar comentário recebida');

            const {
                projectUrl,
                folderName,
                fileName,
                commentType = 'assetRelease',
                selectedUser = 'test',
                headless = true
            } = req.body;

            // Validação básica
            if (!projectUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'URL do projeto é obrigatória'
                });
            }

            if (!fileName) {
                return res.status(400).json({
                    success: false,
                    error: 'Nome do arquivo é obrigatório'
                });
            }

            console.log(`📝 Adicionando comentário no documento: ${fileName}`);
            console.log(`🏷️ Tipo: ${commentType}, Equipe: ${selectedUser}`);

            const result = await documentCommentService.addComment(
                projectUrl,
                folderName,
                fileName,
                commentType,
                selectedUser,
                { headless }
            );

            console.log('✅ Comentário adicionado com sucesso');
            res.json({
                success: true,
                ...result
            });

        } catch (error) {
            console.error('❌ Erro ao adicionar comentário:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obter preview do comentário
     */
    async getCommentPreview(req, res) {
        try {
            const { commentType, selectedUser } = req.body;

            if (!commentType || !selectedUser) {
                return res.status(400).json({
                    success: false,
                    error: 'commentType e selectedUser são obrigatórios'
                });
            }

            const commentText = documentCommentService.getCommentPreview(commentType, selectedUser);
            const users = documentCommentService.getUsersForComment(selectedUser);

            res.json({
                success: true,
                commentText,
                users,
                availableTypes: documentCommentService.getAvailableCommentTypes(),
                availableTeams: documentCommentService.getAvailableTeams()
            });

        } catch (error) {
            console.error('❌ Erro ao gerar preview:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Download em massa de briefings de múltiplos projetos
     */
    async bulkDownloadBriefings(req, res) {
        try {
            console.log('📦 Requisição para download em massa recebida');

            // Verificar se usuário está logado ANTES de processar
            const loginStatus = await authenticationService.checkLoginStatus();
            if (!loginStatus.loggedIn) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuário não logado. Faça login primeiro antes de usar o download em massa.',
                    loginRequired: true
                });
            }

            const {
                projectUrls,
                downloadPath,
                headless = true,
                continueOnError = true
            } = req.body;

            // Validação básica
            if (!projectUrls || !Array.isArray(projectUrls) || projectUrls.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Lista de URLs de projetos é obrigatória e deve conter pelo menos uma URL'
                });
            }

            console.log(`📋 Iniciando download em massa de ${projectUrls.length} projetos`);

            const result = await documentBulkDownloadService.bulkDownloadBriefings(
                projectUrls,
                {
                    downloadPath,
                    headless,
                    continueOnError
                }
            );

            // Registrar acessos aos projetos
            try {
                for (const projectUrl of projectUrls) {
                    await workfrontProjectService.saveProjectFromUrl(projectUrl, {
                        title: 'Download em massa realizado',
                        userAgent: req.get('User-Agent'),
                        ipAddress: req.ip || req.connection.remoteAddress
                    });
                }
            } catch (projectError) {
                console.warn('⚠️ Erro ao registrar acessos aos projetos:', projectError.message);
            }

            console.log('✅ Download em massa concluído');
            console.log(`📊 Resumo: ${result.successful.length}/${result.total} projetos processados com sucesso`);
            console.log(`📁 Total de arquivos baixados: ${result.summary.totalFiles}`);

            res.json({
                success: true,
                message: 'Download em massa concluído',
                ...result
            });

        } catch (error) {
            console.error('❌ Erro no download em massa:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obter preview do download em massa
     */
    async getBulkDownloadPreview(req, res) {
        try {
            const { projectUrls } = req.body;

            if (!projectUrls || !Array.isArray(projectUrls) || projectUrls.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Lista de URLs de projetos é obrigatória'
                });
            }

            const preview = documentBulkDownloadService.getDownloadPreview(projectUrls);

            res.json({
                success: true,
                preview
            });

        } catch (error) {
            console.error('❌ Erro ao gerar preview do download:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Extrair texto e comentários de arquivos PDF
     */
    async extractPdfContent(req, res) {
        try {
            console.log('📄 Requisição para extração de PDF recebida');

            const { pdfFilePath } = req.body;

            if (!pdfFilePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Caminho do arquivo PDF é obrigatório'
                });
            }

            console.log(`📄 Extraindo conteúdo do PDF: ${pdfFilePath}`);

            const result = await documentBulkDownloadService.extractPdfContent(pdfFilePath);

            console.log('✅ Extração de PDF concluída');
            res.json({
                success: true,
                message: 'Conteúdo extraído com sucesso',
                ...result
            });

        } catch (error) {
            console.error('❌ Erro na extração de PDF:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Processar todos os PDFs em uma pasta de projeto
     */
    async processPdfsInProject(req, res) {
        try {
            console.log('📁 Requisição para processar PDFs de projeto recebida');

            const { projectPath, projectName } = req.body;

            if (!projectPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Caminho do projeto é obrigatório'
                });
            }

            console.log(`📁 Processando PDFs do projeto: ${projectName || 'Projeto sem nome'}`);

            const results = await documentBulkDownloadService.processPdfsInProject(
                projectPath,
                projectName || 'projeto'
            );

            const summary = {
                totalPdfs: results.length,
                successful: results.filter(r => r.hasContent).length,
                failed: results.filter(r => r.error).length,
                totalCharacters: results.reduce((sum, r) => sum + (r.textLength || 0), 0)
            };

            console.log('✅ Processamento de PDFs concluído');
            console.log(`📊 Resumo: ${summary.successful}/${summary.totalPdfs} PDFs processados com sucesso`);

            res.json({
                success: true,
                message: 'Processamento de PDFs concluído',
                summary,
                results
            });

        } catch (error) {
            console.error('❌ Erro no processamento de PDFs:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Buscar dados estruturados de PDFs processados
     */
    async getStructuredData(req, res) {
        try {
            console.log('📄 Requisição para buscar dados estruturados recebida');

            const { projectPath } = req.query;

            if (!projectPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Caminho do projeto é obrigatório'
                });
            }

            const structuredDataList = await documentBulkDownloadService.getStructuredDataFromProject(projectPath);

            console.log(`✅ Encontrados ${structuredDataList.length} arquivos com dados estruturados`);

            res.json({
                success: true,
                data: structuredDataList
            });

        } catch (error) {
            console.error('❌ Erro ao buscar dados estruturados:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

export default new WorkfrontController();
