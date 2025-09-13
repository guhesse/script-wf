// src/routes/workfrontRoutes.js
import express from 'express';
import workfrontController from '../controllers/workfrontController.js';

const router = express.Router();

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Fazer login no Workfront
 *     tags: [Autenticação]
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Erro no login
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
router.post('/login', workfrontController.login.bind(workfrontController));

/**
 * @swagger
 * /api/login-status:
 *   get:
 *     summary: Verificar status do login
 *     tags: [Autenticação]
 *     responses:
 *       200:
 *         description: Status do login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 loggedIn:
 *                   type: boolean
 *                 lastLogin:
 *                   type: string
 *                   format: date-time
 *                 hoursAge:
 *                   type: number
 */
router.get('/login-status', workfrontController.getLoginStatus.bind(workfrontController));

/**
 * @swagger
 * /api/clear-cache:
 *   post:
 *     summary: Limpar cache do navegador
 *     tags: [Autenticação]
 *     responses:
 *       200:
 *         description: Cache limpo com sucesso
 */
router.post('/clear-cache', workfrontController.clearCache.bind(workfrontController));

/**
 * @swagger
 * /api/extract-documents:
 *   post:
 *     summary: Extrair documentos de um projeto
 *     tags: [Projetos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectUrl
 *             properties:
 *               projectUrl:
 *                 type: string
 *                 description: URL do projeto no Workfront
 *                 example: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents"
 *     responses:
 *       200:
 *         description: Documentos extraídos com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 folders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WorkfrontFolder'
 *                 totalFolders:
 *                   type: number
 *                 totalFiles:
 *                   type: number
 *                 project:
 *                   $ref: '#/components/schemas/WorkfrontProject'
 */
router.post('/extract-documents', workfrontController.extractDocuments.bind(workfrontController));

/**
 * @swagger
 * /api/extract-documents-stream/{projectId}:
 *   get:
 *     summary: Extrair documentos com progresso em tempo real
 *     tags: [Projetos]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do projeto
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL do projeto (URL encoded)
 *     responses:
 *       200:
 *         description: Stream de eventos do progresso da extração
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/extract-documents-stream/:projectId', workfrontController.extractDocumentsStream.bind(workfrontController));

/**
 * @swagger
 * /api/share-documents:
 *   post:
 *     summary: Compartilhar documentos selecionados
 *     tags: [Projetos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectUrl
 *               - selections
 *               - users
 *             properties:
 *               projectUrl:
 *                 type: string
 *               selections:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ShareSelection'
 *               users:
 *                 type: array
 *                 items:
 *                   type: string
 *               selectedUser:
 *                 type: string
 *                 enum: [carol, giovana]
 *                 default: carol
 *     responses:
 *       200:
 *         description: Documentos compartilhados com sucesso
 */
router.post('/share-documents', workfrontController.shareDocuments.bind(workfrontController));

/**
 * @swagger
 * /api/add-comment:
 *   post:
 *     summary: Adicionar comentário em um documento
 *     tags: [Comentários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectUrl
 *               - fileName
 *             properties:
 *               projectUrl:
 *                 type: string
 *                 description: URL do projeto no Workfront
 *                 example: "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents"
 *               folderName:
 *                 type: string
 *                 description: Nome da pasta (opcional)
 *                 example: "Asset Release"
 *               fileName:
 *                 type: string
 *                 description: Nome do arquivo
 *                 example: "documento.pdf"
 *               commentType:
 *                 type: string
 *                 enum: [assetRelease, finalMaterials, approval]
 *                 default: assetRelease
 *                 description: Tipo de comentário
 *               selectedUser:
 *                 type: string
 *                 enum: [carol, giovana, test]
 *                 default: test
 *                 description: Equipe para mencionar
 *               headless:
 *                 type: boolean
 *                 default: true
 *                 description: Executar em modo headless
 *     responses:
 *       200:
 *         description: Comentário adicionado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 commentText:
 *                   type: string
 *                 mentionedUsers:
 *                   type: number
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/add-comment', workfrontController.addComment.bind(workfrontController));

/**
 * @swagger
 * /api/comment/preview:
 *   post:
 *     summary: Preview do comentário antes de enviar
 *     tags: [Comentários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - commentType
 *               - selectedUser
 *             properties:
 *               commentType:
 *                 type: string
 *                 enum: [assetRelease, finalMaterials, approval]
 *               selectedUser:
 *                 type: string
 *                 enum: [carol, giovana, test]
 *     responses:
 *       200:
 *         description: Preview do comentário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 commentText:
 *                   type: string
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.post('/comment/preview', workfrontController.getCommentPreview.bind(workfrontController));

/**
 * @swagger
 * /api/bulk-download:
 *   post:
 *     summary: Download em massa de briefings de múltiplos projetos
 *     tags: [Download em Massa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectUrls
 *             properties:
 *               projectUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de URLs dos projetos Workfront
 *                 example: 
 *                   - "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/project1/documents"
 *                   - "https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/project2/documents"
 *               downloadPath:
 *                 type: string
 *                 description: Caminho personalizado para download (opcional)
 *                 example: "C:/Downloads/Briefings"
 *               headless:
 *                 type: boolean
 *                 default: true
 *                 description: Executar em modo headless (sem interface gráfica)
 *               continueOnError:
 *                 type: boolean
 *                 default: true
 *                 description: Continuar processamento mesmo se houver erro em um projeto
 *     responses:
 *       200:
 *         description: Download em massa concluído
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 total:
 *                   type: number
 *                   description: Total de projetos processados
 *                 successful:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                       projectNumber:
 *                         type: number
 *                       projectName:
 *                         type: string
 *                       filesDownloaded:
 *                         type: number
 *                       totalSize:
 *                         type: number
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                       projectNumber:
 *                         type: number
 *                       error:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalFiles:
 *                       type: number
 *                     totalSize:
 *                       type: number
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/bulk-download', workfrontController.bulkDownloadBriefings.bind(workfrontController));

/**
 * @swagger
 * /api/bulk-download/preview:
 *   post:
 *     summary: Preview do download em massa antes de executar
 *     tags: [Download em Massa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectUrls
 *             properties:
 *               projectUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de URLs dos projetos
 *     responses:
 *       200:
 *         description: Preview do download em massa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preview:
 *                   type: object
 *                   properties:
 *                     totalProjects:
 *                       type: number
 *                     targetFolder:
 *                       type: string
 *                     downloadPath:
 *                       type: string
 *                     estimatedTime:
 *                       type: string
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           number:
 *                             type: number
 *                           url:
 *                             type: string
 *                           status:
 *                             type: string
 */
router.post('/bulk-download/preview', workfrontController.getBulkDownloadPreview.bind(workfrontController));

/**
 * @swagger
 * /api/projects/history:
 *   get:
 *     summary: Obter histórico de projetos
 *     tags: [Histórico]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Itens por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, ARCHIVED, COMPLETED]
 *         description: Filtrar por status
 *     responses:
 *       200:
 *         description: Lista de projetos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectHistoryResponse'
 */
router.get('/projects/history', workfrontController.getProjectHistory.bind(workfrontController));

/**
 * @swagger
 * /api/projects/by-url:
 *   get:
 *     summary: Buscar projeto por URL
 *     tags: [Projetos]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL do projeto (URL encoded)
 *     responses:
 *       200:
 *         description: Projeto encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 project:
 *                   $ref: '#/components/schemas/WorkfrontProject'
 */
router.get('/projects/by-url', workfrontController.getProjectByUrl.bind(workfrontController));

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Obter projeto por ID
 *     tags: [Projetos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Projeto encontrado
 *       404:
 *         description: Projeto não encontrado
 */
router.get('/projects/:id', workfrontController.getProjectById.bind(workfrontController));

/**
 * @swagger
 * /api/projects/{id}/archive:
 *   patch:
 *     summary: Arquivar projeto
 *     tags: [Projetos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Projeto arquivado com sucesso
 */
router.patch('/projects/:id/archive', workfrontController.archiveProject.bind(workfrontController));

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Deletar projeto
 *     tags: [Projetos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Projeto deletado com sucesso
 */
router.delete('/projects/:id', workfrontController.deleteProject.bind(workfrontController));

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Obter estatísticas do dashboard
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Estatísticas do sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 */
router.get('/dashboard/stats', workfrontController.getDashboardStats.bind(workfrontController));

export default router;