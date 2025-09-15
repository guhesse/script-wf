// src/routes/briefingRoutes.js

import express from 'express';
import briefingController from '../controllers/briefingController.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     BriefingProcessRequest:
 *       type: object
 *       required:
 *         - projectUrls
 *       properties:
 *         projectUrls:
 *           type: array
 *           items:
 *             type: string
 *           description: URLs dos projetos Workfront
 *         options:
 *           type: object
 *           properties:
 *             headless:
 *               type: boolean
 *               default: true
 *               description: Executar browser em modo headless
 *             continueOnError:
 *               type: boolean
 *               default: true
 *               description: Continuar processamento mesmo com erros
 */

/**
 * @swagger
 * /api/briefing/process:
 *   post:
 *     summary: Processar briefings de múltiplos projetos
 *     tags: [Briefing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BriefingProcessRequest'
 *     responses:
 *       200:
 *         description: Processamento iniciado com sucesso
 *       400:
 *         description: Dados de entrada inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/process', briefingController.processProjectsBriefings);

/**
 * @swagger
 * /api/briefing/projects:
 *   get:
 *     summary: Listar projetos com briefings processados
 *     tags: [Briefing]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Buscar por título, DSID ou URL
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, ARCHIVED, EXPIRED, ERROR]
 *         description: Filtrar por status
 *     responses:
 *       200:
 *         description: Lista de projetos retornada com sucesso
 */
router.get('/projects', briefingController.getProjectsWithBriefings);

/**
 * @swagger
 * /api/briefing/projects/{projectId}:
 *   get:
 *     summary: Obter detalhes de um projeto específico
 *     tags: [Briefing]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Detalhes do projeto retornados com sucesso
 *       404:
 *         description: Projeto não encontrado
 */
router.get('/projects/:projectId', briefingController.getProjectDetails);

/**
 * @swagger
 * /api/briefing/downloads/{downloadId}:
 *   get:
 *     summary: Obter detalhes de um download específico
 *     tags: [Briefing]
 *     parameters:
 *       - in: path
 *         name: downloadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do download
 *     responses:
 *       200:
 *         description: Detalhes do download retornados com sucesso
 *       404:
 *         description: Download não encontrado
 */
router.get('/downloads/:downloadId', briefingController.getDownloadDetails);

/**
 * @swagger
 * /api/briefing/search:
 *   get:
 *     summary: Buscar conteúdo extraído dos PDFs
 *     tags: [Briefing]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Termo de busca
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [text, comments, structured, all]
 *           default: all
 *         description: Tipo de conteúdo para buscar
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
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filtrar por projeto específico
 *       - in: query
 *         name: dsid
 *         schema:
 *           type: string
 *         description: Filtrar por DSID específico
 *     responses:
 *       200:
 *         description: Resultados da busca retornados com sucesso
 *       400:
 *         description: Parâmetro de busca obrigatório
 */
router.get('/search', briefingController.searchContent);

/**
 * @swagger
 * /api/briefing/stats:
 *   get:
 *     summary: Obter estatísticas dos briefings processados
 *     tags: [Briefing]
 *     responses:
 *       200:
 *         description: Estatísticas retornadas com sucesso
 */
router.get('/stats', briefingController.getStats);

/**
 * @swagger
 * /api/briefing/downloads:
 *   delete:
 *     summary: Deletar múltiplos downloads e todos os dados relacionados
 *     tags: [Briefing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - downloadIds
 *             properties:
 *               downloadIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: IDs dos downloads para deletar
 *     responses:
 *       200:
 *         description: Downloads deletados com sucesso
 *       400:
 *         description: Lista de IDs é obrigatória
 *       404:
 *         description: Nenhum download encontrado
 */
router.delete('/downloads', briefingController.deleteBriefingDownloads);

/**
 * @swagger
 * /api/briefing/downloads/{downloadId}:
 *   delete:
 *     summary: Deletar um download e todos os dados relacionados
 *     tags: [Briefing]
 *     parameters:
 *       - in: path
 *         name: downloadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do download
 *     responses:
 *       200:
 *         description: Download deletado com sucesso
 *       404:
 *         description: Download não encontrado
 */
router.delete('/downloads/:downloadId', briefingController.deleteDownload);

export default router;