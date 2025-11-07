import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Sse,
  UploadedFiles,
  UseInterceptors,
  Logger,
  UseGuards,
  Res,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import type { Express, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WorkfrontService } from './workfront.service';
import { PdfService } from '../pdf/pdf.service';
import { CommentService } from '../pdf/comment.service';
import { ExtractionService } from '../pdf/extraction.service';
import {
  CreateProjectDto,
  ProjectHistoryQueryDto,
  ProjectHistoryResponseDto,
  ShareDocumentsDto,
  ShareDocumentsResponseDto,
  DashboardStatsDto,
  ProjectResponseDto,
} from './dto/workfront.dto';
import { StatusAutomationService } from './status-automation.service';
import { HoursAutomationService } from './hours-automation.service';
import { UpdateWorkStatusDto, LogHoursDto } from './dto/work-status-hours.dto';
import {
  ExecuteUploadDto,
  UploadExecutionResponseDto,
} from './dto/upload-automation.dto';
import {
  ExtractPdfDto,
  ExtractPdfResponseDto,
  ProcessPdfsDto,
  ProcessPdfsResponseDto,
  StructuredDataQueryDto,
  StructuredDataResponseDto,
  BulkDownloadDto,
  BulkDownloadResponseDto,
  BulkDownloadPreviewResponseDto,
  ExtractDocumentsDto,
  ExtractDocumentsResponseDto,
  AddCommentDto,
  AddCommentResponseDto,
  CommentPreviewDto,
  CommentPreviewResponseDto,
} from '../pdf/dto/pdf.dto';
import { Observable } from 'rxjs';
import { BulkProgressService } from '../pdf/bulk-progress.service';
import { DocumentBulkDownloadService } from '../../download/document-bulk-download.service';
import { ShareAutomationService } from './share-automation.service';
import { UploadAutomationService } from './upload-automation.service';
import { spawnSync } from 'child_process';
import { TimelineService } from './timeline.service';
import { UploadJobsService } from './upload-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { resolveHeadless } from './utils/headless.util';
import { BunnyUploadUrlService } from '../../services/bunny-upload-url.service';

// Helper function para obter data local (standalone para uso em Multer)
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@ApiTags('Projetos')
@Controller('api')
export class WorkfrontController {
  private readonly logger = new Logger(WorkfrontController.name);

  constructor(
    private readonly workfrontService: WorkfrontService,
    private readonly shareAutomationService: ShareAutomationService,
    private readonly uploadAutomationService: UploadAutomationService,
    private readonly pdfService: PdfService,
    private readonly commentService: CommentService,
    private readonly extractionService: ExtractionService,
    private readonly progressService: BulkProgressService,
    private readonly bulkService: DocumentBulkDownloadService,
    private readonly statusAutomation: StatusAutomationService,
    private readonly hoursAutomation: HoursAutomationService,
    private readonly timelineService: TimelineService,
    private readonly uploadJobs: UploadJobsService,
    private readonly bunnyUploadService: BunnyUploadUrlService,
  ) { }

  @Get('health')
  @ApiOperation({ summary: 'Health check do sistema' })
  @ApiResponse({ status: 200, description: 'Sistema funcionando' })
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      service: 'workfront-nestjs',
    };
  }

  // ===== ROTAS DE PROJETOS =====

  @Get('projects/history')
  @ApiOperation({ summary: 'Obter histórico de projetos' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiResponse({
    status: 200,
    description: 'Lista de projetos',
    type: ProjectHistoryResponseDto,
  })
  async getProjectHistory(@Query() query: ProjectHistoryQueryDto): Promise<ProjectHistoryResponseDto> {
    try {
      return await this.workfrontService.getProjectHistory(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('projects/by-url')
  @ApiOperation({ summary: 'Buscar projeto por URL' })
  @ApiQuery({ name: 'url', required: true, description: 'URL do projeto (URL encoded)' })
  @ApiResponse({
    status: 200,
    description: 'Projeto encontrado',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        project: { $ref: '#/components/schemas/ProjectResponseDto' },
      },
    },
  })
  async getProjectByUrl(@Query('url') url: string) {
    try {
      if (!url) {
        throw new HttpException('URL é obrigatória', HttpStatus.BAD_REQUEST);
      }

      const project = await this.workfrontService.getProjectByUrl(decodeURIComponent(url));

      return {
        success: true,
        project,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Obter projeto por ID' })
  @ApiParam({ name: 'id', description: 'ID do projeto' })
  @ApiResponse({
    status: 200,
    description: 'Projeto encontrado',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Projeto não encontrado' })
  async getProjectById(@Param('id') id: string): Promise<ProjectResponseDto> {
    try {
      const project = await this.workfrontService.getProjectById(id);

      if (!project) {
        throw new HttpException('Projeto não encontrado', HttpStatus.NOT_FOUND);
      }

      return project;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('projects/:id/archive')
  @ApiOperation({ summary: 'Arquivar projeto' })
  @ApiParam({ name: 'id', description: 'ID do projeto' })
  @ApiResponse({
    status: 200,
    description: 'Projeto arquivado com sucesso',
    type: ProjectResponseDto,
  })
  async archiveProject(@Param('id') id: string): Promise<ProjectResponseDto> {
    try {
      return await this.workfrontService.archiveProject(id);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: 'Deletar projeto' })
  @ApiParam({ name: 'id', description: 'ID do projeto' })
  @ApiResponse({
    status: 200,
    description: 'Projeto deletado com sucesso',
    type: ProjectResponseDto,
  })
  async deleteProject(@Param('id') id: string): Promise<ProjectResponseDto> {
    try {
      return await this.workfrontService.deleteProject(id);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Obter estatísticas do dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas do sistema',
    type: DashboardStatsDto,
  })
  async getDashboardStats(): Promise<{ success: boolean; stats: DashboardStatsDto }> {
    try {
      const stats = await this.workfrontService.getDashboardStats();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('share-documents')
  @ApiOperation({ summary: 'Compartilhar documentos selecionados' })
  @ApiResponse({
    status: 200,
    description: 'Documentos compartilhados com sucesso',
    type: ShareDocumentsResponseDto,
  })
  async shareDocuments(@Body() shareData: ShareDocumentsDto): Promise<ShareDocumentsResponseDto> {
    try {
      return await this.workfrontService.shareDocuments(shareData);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('debug-share-modal')
  @ApiOperation({ 
    summary: '[DEBUG] Testa múltiplas estratégias de abertura do modal de compartilhamento',
    description: 'Endpoint de debug que testa diferentes abordagens para abrir o modal com screenshots e logs detalhados. Recarrega a página entre cada estratégia.'
  })
  @ApiResponse({
    status: 200,
    description: 'Relatório de debug gerado com sucesso',
  })
  async debugShareModal(
    @Body() debugData: {
      projectUrl: string;
      folderName?: string;
      fileName: string;
      headless?: boolean;
    }
  ) {
    try {
      this.logger.log('🐛 Iniciando debug intensivo do modal de compartilhamento...');
      
      const result = await this.shareAutomationService.debugShareModalStrategies(
        debugData.projectUrl,
        debugData.folderName || 'root',
        debugData.fileName,
        debugData.headless !== undefined ? debugData.headless : true, // Debug sempre visível por padrão
      );

      return {
        success: true,
        message: 'Debug concluído',
        ...result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Erro durante debug: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('debug/screenshots')
  @ApiOperation({ summary: '[DEBUG] Listar screenshots de debug disponíveis' })
  @ApiResponse({ status: 200, description: 'Lista de screenshots com metadata' })
  async listDebugScreenshots() {
    try {
      const debugDir = path.join(process.cwd(), 'automation_debug', 'share_modal');
      
      try {
        await fs.access(debugDir);
      } catch {
        return {
          success: true,
          screenshots: [],
          message: 'Nenhum screenshot encontrado. Execute /api/debug-share-modal primeiro.',
        };
      }

      const files = await fs.readdir(debugDir);
      const screenshots = await Promise.all(
        files
          .filter(f => f.endsWith('.png'))
          .map(async (filename) => {
            const filepath = path.join(debugDir, filename);
            const stats = await fs.stat(filepath);
            
            // Parse filename: 001_2025-11-07T14-30-45-123Z_context.png
            const match = filename.match(/^(\d+)_(.+?)_(.+)\.png$/);
            const sequence = match ? match[1] : '000';
            const timestamp = match ? match[2] : '';
            const context = match ? match[3] : filename.replace('.png', '');

            return {
              filename,
              sequence: parseInt(sequence),
              timestamp: timestamp.replace(/T|Z/g, ' ').replace(/-/g, ':'),
              context: context.replace(/_/g, ' '),
              size: stats.size,
              created: stats.ctime,
              url: `/api/debug/screenshots/${filename}`,
            };
          })
      );

      screenshots.sort((a, b) => b.sequence - a.sequence);

      return {
        success: true,
        total: screenshots.length,
        screenshots,
        directory: debugDir,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('debug/screenshots')
  @ApiOperation({ summary: '[DEBUG] Limpar todos os screenshots' })
  @ApiResponse({ status: 200, description: 'Screenshots removidos com sucesso' })
  async clearDebugScreenshots() {
    try {
      const debugDir = path.join(process.cwd(), 'automation_debug', 'share_modal');
      
      try {
        const files = await fs.readdir(debugDir);
        const deletePromises = files
          .filter(f => f.endsWith('.png'))
          .map(f => fs.unlink(path.join(debugDir, f)));
        
        await Promise.all(deletePromises);
        
        return {
          success: true,
          message: `${deletePromises.length} screenshot(s) removido(s)`,
          deleted: deletePromises.length,
        };
      } catch {
        return {
          success: true,
          message: 'Nenhum screenshot para remover',
          deleted: 0,
        };
      }
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('debug/screenshots/:filename')
  @ApiOperation({ summary: '[DEBUG] Baixar screenshot específico' })
  @ApiParam({ name: 'filename', description: 'Nome do arquivo de screenshot' })
  @ApiResponse({ status: 200, description: 'Imagem PNG' })
  async getDebugScreenshot(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    try {
      // Sanitiza filename para evitar path traversal
      const safeName = path.basename(filename);
      if (!safeName.endsWith('.png')) {
        throw new HttpException('Arquivo inválido', HttpStatus.BAD_REQUEST);
      }

      const filepath = path.join(
        process.cwd(),
        'automation_debug',
        'share_modal',
        safeName,
      );

      try {
        await fs.access(filepath);
      } catch {
        throw new HttpException('Screenshot não encontrado', HttpStatus.NOT_FOUND);
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(filepath);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('debug/viewer')
  @ApiOperation({ summary: '[DEBUG] Interface web para visualizar screenshots' })
  @ApiResponse({ status: 200, description: 'HTML viewer' })
  async debugScreenshotViewer(@Res() res: Response) {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Debug Screenshots</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:12px;margin-bottom:30px;box-shadow:0 10px 30px rgba(0,0,0,.3)}h1{font-size:32px;margin-bottom:10px;color:#fff}.subtitle{color:rgba(255,255,255,.9);font-size:16px}.controls{background:#1a1a1a;padding:20px;border-radius:8px;margin-bottom:20px;display:flex;gap:15px;align-items:center;flex-wrap:wrap}button{background:#667eea;color:#fff;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}button:hover{background:#5568d3;transform:translateY(-2px);box-shadow:0 4px 12px rgba(102,126,234,.4)}button:disabled{background:#333;cursor:not-allowed;transform:none}.btn-download{background:#10b981}button.btn-download:hover{background:#059669}.btn-clear{background:#ef4444}button.btn-clear:hover{background:#dc2626}.stats{display:flex;gap:20px;margin-left:auto;font-size:14px;color:#888}.stat-item{display:flex;align-items:center;gap:8px}.stat-value{color:#667eea;font-weight:600}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:20px}.screenshot-card{background:#1a1a1a;border-radius:12px;overflow:hidden;transition:transform .2s,box-shadow .2s;border:1px solid #333}.screenshot-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(0,0,0,.5);border-color:#667eea}.screenshot-img{width:100%;height:250px;object-fit:cover;cursor:pointer;background:#0a0a0a}.screenshot-info{padding:16px}.screenshot-sequence{display:inline-block;background:#667eea;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:8px}.screenshot-context{font-size:14px;color:#e0e0e0;margin-bottom:8px;font-weight:500}.screenshot-timestamp{font-size:12px;color:#888}.screenshot-size{font-size:12px;color:#666;margin-top:4px}.loading{text-align:center;padding:60px;font-size:18px;color:#888}.spinner{border:3px solid #333;border-top:3px solid #667eea;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}.lightbox{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.95);z-index:1000;align-items:center;justify-content:center;padding:20px}.lightbox.active{display:flex}.lightbox-img{max-width:95%;max-height:95%;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.8)}.lightbox-close{position:absolute;top:20px;right:20px;font-size:40px;color:#fff;cursor:pointer;background:rgba(0,0,0,.5);width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .2s}.lightbox-close:hover{background:rgba(102,126,234,.8);transform:rotate(90deg)}.empty-state{text-align:center;padding:80px 20px;color:#666}.empty-state-icon{font-size:64px;margin-bottom:20px}.empty-state-title{font-size:24px;margin-bottom:10px;color:#888}.empty-state-text{font-size:16px;line-height:1.6}</style></head><body><div class="header"><h1>🐛 Debug Screenshots</h1><div class="subtitle">Visualização de screenshots de automação do Workfront</div></div><div class="controls"><button onclick="loadScreenshots()">🔄 Recarregar</button><button class="btn-download" onclick="downloadAllImages()">📥 Baixar Todas</button><button class="btn-clear" onclick="clearAllScreenshots()">🗑️ Limpar Tudo</button><div class="stats"><div class="stat-item"><span>Total:</span><span class="stat-value"id="totalCount">0</span></div><div class="stat-item"><span>Última atualização:</span><span class="stat-value"id="lastUpdate">-</span></div></div></div><div id="gallery"class="gallery"></div><div class="lightbox"id="lightbox"onclick="closeLightbox()"><div class="lightbox-close">×</div><img class="lightbox-img"id="lightboxImg"onclick="event.stopPropagation()"></div><script>let currentScreenshots=[];async function loadScreenshots(){const gallery=document.getElementById('gallery');gallery.innerHTML='<div class="loading"><div class="spinner"></div>Carregando screenshots...</div>';try{const response=await fetch('/api/debug/screenshots');const data=await response.json();currentScreenshots=data.screenshots||[];document.getElementById('totalCount').textContent=data.total||0;document.getElementById('lastUpdate').textContent=new Date().toLocaleTimeString('pt-BR');if(!currentScreenshots||currentScreenshots.length===0){gallery.innerHTML=\`<div class="empty-state"><div class="empty-state-icon">📸</div><div class="empty-state-title">Nenhum screenshot encontrado</div><div class="empty-state-text">Execute o endpoint <code>/api/debug-share-modal</code> para gerar screenshots de debug.</div></div>\`;return}gallery.innerHTML=currentScreenshots.map(s=>\`<div class="screenshot-card"><img class="screenshot-img"src="\${s.url}"alt="\${s.context}"onclick="openLightbox('\${s.url}')"loading="lazy"><div class="screenshot-info"><span class="screenshot-sequence">#\${s.sequence}</span><div class="screenshot-context">\${s.context}</div><div class="screenshot-timestamp">⏰ \${s.timestamp}</div><div class="screenshot-size">📦 \${formatBytes(s.size)}</div></div></div>\`).join('')}catch(error){gallery.innerHTML=\`<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Erro ao carregar screenshots</div><div class="empty-state-text">\${error.message}</div></div>\`}}async function downloadAllImages(){if(!currentScreenshots||currentScreenshots.length===0){alert('Nenhum screenshot para baixar!');return}const btn=event.target;btn.disabled=true;btn.textContent='⏳ Baixando...';try{for(let i=0;i<currentScreenshots.length;i++){const s=currentScreenshots[i];btn.textContent=\`⏳ Baixando \${i+1}/\${currentScreenshots.length}...\`;const response=await fetch(s.url);const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=s.filename;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);await new Promise(r=>setTimeout(r,100))}btn.textContent='✅ Download Concluído!';setTimeout(()=>{btn.disabled=false;btn.textContent='📥 Baixar Todas'},2000)}catch(error){alert('Erro ao baixar: '+error.message);btn.disabled=false;btn.textContent='📥 Baixar Todas'}}async function clearAllScreenshots(){if(!confirm('Tem certeza que deseja limpar todos os screenshots?\\n\\nEsta ação não pode ser desfeita.')){return}const btn=event.target;btn.disabled=true;btn.textContent='⏳ Limpando...';try{const response=await fetch('/api/debug/screenshots',{method:'DELETE'});const data=await response.json();if(data.success){btn.textContent=\`✅ \${data.deleted} removido(s)!\`;setTimeout(()=>{btn.disabled=false;btn.textContent='🗑️ Limpar Tudo';loadScreenshots()},2000)}else{throw new Error(data.message)}}catch(error){alert('Erro ao limpar: '+error.message);btn.disabled=false;btn.textContent='🗑️ Limpar Tudo'}}function formatBytes(bytes){if(bytes===0)return'0 Bytes';const k=1024;const sizes=['Bytes','KB','MB'];const i=Math.floor(Math.log(bytes)/Math.log(k));return Math.round(bytes/Math.pow(k,i)*100)/100+' '+sizes[i]}function openLightbox(url){document.getElementById('lightboxImg').src=url;document.getElementById('lightbox').classList.add('active')}function closeLightbox(){document.getElementById('lightbox').classList.remove('active')}setInterval(loadScreenshots,30000);loadScreenshots();document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLightbox()})</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Post('share-and-comment')
  @ApiOperation({ summary: 'Executar fluxo combinado: compartilhar e comentar arquivos selecionados' })
  async shareAndComment(@Body() body: any) {
    try {
      return await this.workfrontService.shareAndComment(body);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS DE PDF =====

  @Post('extract-pdf')
  @ApiOperation({ summary: 'Extrair texto e comentários de um arquivo PDF' })
  @ApiResponse({
    status: 200,
    description: 'Conteúdo extraído com sucesso',
    type: ExtractPdfResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Caminho do arquivo é obrigatório' })
  @ApiResponse({ status: 500, description: 'Erro na extração' })
  async extractPdfContent(@Body() extractDto: ExtractPdfDto): Promise<ExtractPdfResponseDto> {
    try {
      return await this.pdfService.extractPdfContent(extractDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== EXPORTAR RESULTADOS (ZIP) =====
  @Get('bulk-download/export')
  @ApiOperation({ summary: 'Exportar pasta gerada (downloads) como ZIP' })
  @ApiQuery({ name: 'folder', required: false, description: 'Nome da pasta dentro de downloads (ex.: DSID ou nome do projeto)' })
  @ApiQuery({ name: 'dsid', required: false, description: 'DSID do projeto (atalho para folder)' })
  @ApiQuery({ name: 'name', required: false, description: 'Nome do projeto (atalho para folder)' })
  async exportFolderZip(
    @Query('folder') folder?: string,
    @Query('dsid') dsid?: string,
    @Query('name') name?: string,
    @Res() res?: Response,
  ) {
    try {
      const basePath = path.join(process.cwd(), 'downloads');
      const target = (folder || dsid || name || '').toString().trim();
      if (!target) {
        throw new HttpException('Informe ?folder=, ?dsid= ou ?name=', HttpStatus.BAD_REQUEST);
      }

      const projectPath = path.join(basePath, target);
      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) {
          throw new HttpException('Destino não é um diretório', HttpStatus.BAD_REQUEST);
        }
      } catch (e) {
        throw new HttpException(`Pasta não encontrada: ${projectPath}`, HttpStatus.NOT_FOUND);
      }

      // Carregar archiver sob demanda para evitar erro caso não instalado
      const archiverMod = await import('archiver');
      const archiver = (archiverMod as any).default || archiverMod;

      const safeName = target.replace(/[^a-zA-Z0-9-_\.]+/g, '_');
      const fileName = `${safeName}.zip`;

      // Cabeçalhos de download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Criar zip e streamar
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err: Error) => {
        this.logger.error('Erro ao compactar pasta:', err.message);
        try { res.status(500).end(`Erro ao compactar: ${err.message}`); } catch {}
      });
      archive.pipe(res as any);
      archive.directory(projectPath, false);
      await archive.finalize();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('process-pdfs')
  @ApiOperation({ summary: 'Processar todos os PDFs em uma pasta de projeto' })
  @ApiResponse({
    status: 200,
    description: 'PDFs processados com sucesso',
    type: ProcessPdfsResponseDto,
  })
  async processPdfsInProject(@Body() processDto: ProcessPdfsDto): Promise<ProcessPdfsResponseDto> {
    try {
      return await this.pdfService.processPdfsInProject(processDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('structured-data')
  @ApiOperation({ summary: 'Buscar dados estruturados de PDFs processados' })
  @ApiQuery({ name: 'projectPath', required: true, description: 'Caminho para a pasta do projeto' })
  @ApiResponse({
    status: 200,
    description: 'Dados estruturados encontrados',
    type: StructuredDataResponseDto,
  })
  async getStructuredData(@Query('projectPath') projectPath: string): Promise<StructuredDataResponseDto> {
    try {
      if (!projectPath) {
        throw new HttpException('Caminho do projeto é obrigatório', HttpStatus.BAD_REQUEST);
      }

      return await this.pdfService.getStructuredData({ projectPath });
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS DE DOWNLOAD EM MASSA =====

  @Get('select-folder')
  @ApiOperation({ summary: 'Abrir seletor de pasta do Windows (com caixa para colar caminho) e retornar o selecionado' })
  @ApiResponse({ status: 200, description: 'Caminho selecionado retornado' })
  async selectFolder(@Query('initial') initial?: string) {
    try {
      // Apenas Windows: usa PowerShell + System.Windows.Forms.FolderBrowserDialog
      const isWin = process.platform === 'win32';
      if (!isWin) {
        throw new HttpException('Selecionador nativo disponível apenas no Windows', HttpStatus.BAD_REQUEST);
      }

      const psScript = [
        "$ErrorActionPreference='Stop';",
        '$code = @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public static class FolderPicker {',
        '  [ComImport]',
        '  [Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]',
        '  private class FileOpenDialog {}',
        '  [ComImport]',
        '  [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]',
        '  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
        '  private interface IFileDialog {',
        '    int Show(IntPtr parent);',
        '    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);',
        '    void SetFileTypeIndex(uint iFileType);',
        '    void GetFileTypeIndex(out uint piFileType);',
        '    void Advise(IntPtr pfde, out uint pdwCookie);',
        '    void Unadvise(uint dwCookie);',
        '    void SetOptions(uint fos);',
        '    void GetOptions(out uint pfos);',
        '    void SetDefaultFolder(IShellItem psi);',
        '    void SetFolder(IShellItem psi);',
        '    void GetFolder(out IShellItem ppsi);',
        '    void GetCurrentSelection(out IShellItem ppsi);',
        '    void SetFileName(string pszName);',
        '    void GetFileName(out IntPtr ppszName);',
        '    void SetTitle(string pszTitle);',
        '    void SetOkButtonLabel(string pszText);',
        '    void SetFileNameLabel(string pszLabel);',
        '    void GetResult(out IShellItem ppsi);',
        '    void AddPlace(IShellItem psi, int fdap);',
        '    void SetDefaultExtension(string pszDefaultExtension);',
        '    void Close(int hr);',
        '    void SetClientGuid(ref Guid guid);',
        '    void ClearClientData();',
        '    void SetFilter(IntPtr pFilter);',
        '  }',
        '  [ComImport]',
        '  [Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]',
        '  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
        '  private interface IShellItem {',
        '    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);',
        '    void GetParent(out IShellItem ppsi);',
        '    void GetDisplayName(uint sigdnName, out IntPtr ppszName);',
        '    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);',
        '    void Compare(IShellItem psi, uint hint, out int piOrder);',
        '  }',
        '  private const uint FOS_PICKFOLDERS = 0x00000020;',
        '  private const uint FOS_FORCEFILESYSTEM = 0x00000040;',
        '  private const uint SIGDN_FILESYSPATH = 0x80058000;',
        '  public static string PickFolder(string title) {',
        '    var dialog = (IFileDialog)new FileOpenDialog();',
        '    uint options; dialog.GetOptions(out options);',
        '    options |= FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM; dialog.SetOptions(options);',
        '    if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);',
        '    int hr = dialog.Show(IntPtr.Zero);',
        '    if (hr != 0) return null;',
        '    IShellItem result; dialog.GetResult(out result);',
        '    IntPtr psz; result.GetDisplayName(SIGDN_FILESYSPATH, out psz);',
        '    string path = Marshal.PtrToStringUni(psz);',
        '    Marshal.FreeCoTaskMem(psz);',
        '    return path;',
        '  }',
        '}',
        '"@;',
        'Add-Type -TypeDefinition $code -Language CSharp;',
        "$title = 'Escolha a pasta para download';",
        '$p = [FolderPicker]::PickFolder($title);',
        'if ($p) { [Console]::Out.WriteLine($p) }'
      ].join(' ');

      const res = spawnSync('powershell', ['-NoProfile', '-STA', '-Command', psScript], {
        encoding: 'utf8',
      });

      const stdout = (res.stdout || '').trim();
      const stderr = (res.stderr || '').trim();

      if (res.error || res.status !== 0) {
        // Fall through to legacy dialog below
      }

      if (stdout) {
        return { success: true, canceled: false, path: stdout };
      }

      // Fallback: Shell.Application com NEWDIALOGSTYLE + EDITBOX e pasta inicial se fornecida
      const root = (initial && initial.trim()) ? initial.trim().replace(/`/g, '``').replace(/"/g, '\"') : '';
      const psShell = [
        "$ErrorActionPreference='Stop';",
        '$shell = New-Object -ComObject Shell.Application;',
        '$flags = 0x1 -bor 0x10 -bor 0x40;',
        "$title = 'Escolha a pasta para download';",
        root ? `$root = "${root}";` : '$root = 0;',
        '$folder = $shell.BrowseForFolder(0, $title, $flags, $root);',
        'if ($null -ne $folder) { [Console]::Out.WriteLine($folder.Self.Path) }'
      ].join(' ');

      const resShell = spawnSync('powershell', ['-NoProfile', '-STA', '-Command', psShell], { encoding: 'utf8' });
      const sel = (resShell.stdout || '').trim();
      return { success: true, canceled: !sel, path: sel };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('bulk-download')
  @ApiOperation({ summary: 'Download em massa de briefings de múltiplos projetos' })
  @ApiResponse({
    status: 200,
    description: 'Download em massa concluído',
    type: BulkDownloadResponseDto,
  })
  async bulkDownloadBriefings(@Body() downloadDto: BulkDownloadDto): Promise<BulkDownloadResponseDto> {
    try {
      return await this.pdfService.bulkDownloadBriefings(downloadDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('bulk-download/preview')
  @ApiOperation({ summary: 'Preview do download em massa antes de executar' })
  @ApiResponse({
    status: 200,
    description: 'Preview do download em massa',
    type: BulkDownloadPreviewResponseDto,
  })
  async getBulkDownloadPreview(@Body() body: { projectUrls: string[] }): Promise<BulkDownloadPreviewResponseDto> {
    try {
      if (!body.projectUrls || !Array.isArray(body.projectUrls)) {
        throw new HttpException('Lista de URLs de projetos é obrigatória', HttpStatus.BAD_REQUEST);
      }

      return this.pdfService.getBulkDownloadPreview(body.projectUrls);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS DE BULK DOWNLOAD COM PROGRESSO (SSE) =====

  @Post('bulk-download/start')
  @ApiOperation({ summary: 'Iniciar bulk download com progresso via SSE' })
  @ApiResponse({ status: 200, description: 'Operação iniciada', schema: { type: 'object', properties: { success: { type: 'boolean' }, operationId: { type: 'string' } } } })
  async startBulkDownload(@Body() downloadDto: BulkDownloadDto) {
    const operationId = `bulk_${Date.now()}`;
    // iniciar em background (não bloquear request)
    setTimeout(() => {
      this.bulkService.startBulkWithProgress(operationId, downloadDto.projectUrls, downloadDto).catch(err => {
        this.progressService.emit(operationId, { type: 'error', data: { message: err.message } });
        this.progressService.complete(operationId);
      });
    }, 0);
    return { success: true, operationId };
  }

  @Sse('bulk-download/stream/:operationId')
  @ApiOperation({ summary: 'Stream SSE do progresso de uma operação de bulk' })
  @ApiParam({ name: 'operationId', description: 'ID da operação retornado no start' })
  sseBulk(@Param('operationId') operationId: string): Observable<any> {
    return new Observable((subscriber) => {
      // garantir que exista um stream
      this.progressService.create(operationId);
      const sub = this.progressService.observe(operationId).subscribe({
        next: (evt) => subscriber.next({ data: JSON.stringify(evt) }),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
      // limpar quando cliente desconectar
      return () => sub.unsubscribe();
    });
  }

  @Post('bulk-download/cancel/:operationId/:projectNumber')
  @ApiOperation({ summary: 'Cancelar processamento de um projeto em uma operação' })
  @ApiParam({ name: 'operationId' })
  @ApiParam({ name: 'projectNumber' })
  async cancelProject(
    @Param('operationId') operationId: string,
    @Param('projectNumber') projectNumber: string,
  ) {
    const pn = Number(projectNumber);
    if (!pn || pn < 1) return { success: false, message: 'projectNumber inválido' };
    this.progressService.cancel(operationId, pn);
    return { success: true };
  }

  // ===== ROTAS DE EXTRAÇÃO DE DOCUMENTOS =====

  @Post('extract-documents')
  @ApiOperation({ summary: 'Extrair documentos de um projeto' })
  @ApiResponse({
    status: 200,
    description: 'Documentos extraídos com sucesso',
    type: ExtractDocumentsResponseDto,
  })
  async extractDocuments(@Body() extractDto: ExtractDocumentsDto): Promise<ExtractDocumentsResponseDto> {
    try {
      return await this.extractionService.extractDocuments(extractDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('extract-documents-stream/:projectId')
  @ApiOperation({ summary: 'Extrair documentos com progresso em tempo real' })
  @ApiParam({ name: 'projectId', description: 'ID do projeto' })
  @ApiQuery({ name: 'url', required: true, description: 'URL do projeto (URL encoded)' })
  @ApiResponse({
    status: 200,
    description: 'Stream de eventos do progresso da extração',
    content: {
      'text/event-stream': {
        schema: { type: 'string' },
      },
    },
  })
  @Sse('extract-documents-stream/:projectId')
  async extractDocumentsStream(
    @Param('projectId') projectId: string,
    @Query('url') url: string,
  ): Promise<Observable<any>> {
    try {
      if (!url) {
        throw new HttpException('URL do projeto é obrigatória', HttpStatus.BAD_REQUEST);
      }

      // TODO: Implementar SSE real
      // Por enquanto, retornar observable simples
      return new Observable((observer) => {
        observer.next({ data: JSON.stringify({ status: 'started', projectId }) });

        setTimeout(() => {
          observer.next({ data: JSON.stringify({ status: 'processing', progress: 50 }) });
        }, 1000);

        setTimeout(() => {
          observer.next({ data: JSON.stringify({ status: 'completed', progress: 100 }) });
          observer.complete();
        }, 2000);
      });
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS DE COMENTÁRIOS =====

  @Post('add-comment')
  @ApiOperation({ summary: 'Adicionar comentário em um documento' })
  @ApiResponse({
    status: 200,
    description: 'Comentário adicionado com sucesso',
    type: AddCommentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 500, description: 'Erro interno do servidor' })
  async addComment(@Body() commentDto: AddCommentDto): Promise<AddCommentResponseDto> {
    try {
      return await this.commentService.addComment(commentDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('comment/preview')
  @ApiOperation({ summary: 'Preview do comentário antes de enviar' })
  @ApiResponse({
    status: 200,
    description: 'Preview do comentário',
    type: CommentPreviewResponseDto,
  })
  async getCommentPreview(@Body() previewDto: CommentPreviewDto): Promise<CommentPreviewResponseDto> {
    try {
      return this.commentService.getCommentPreview(previewDto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS DE UPLOAD (staging) =====
  @Post('upload/prepare')
  @ApiOperation({ summary: 'Preparar upload de arquivos para diretório temporário local' })
  @UseGuards(JwtAuthGuard)
  async prepareUpload(
    @Body() body: {
      files: Array<{ name: string; size: number; type?: string }>;
      projectUrl: string;
      selectedUser: 'carol' | 'giovana' | 'test';
      jobId?: string;
    },
    @CurrentUser() user?: AuthUser
  ) {
    try {
      if (!body.projectUrl) {
        throw new HttpException('projectUrl é obrigatório', HttpStatus.BAD_REQUEST);
      }

      if (!body.files || body.files.length === 0) {
        throw new HttpException('Lista de arquivos é obrigatória', HttpStatus.BAD_REQUEST);
      }

      // Validação de regra: >=1 zip (Asset Release), >=1 pdf e >=1 outro formato
      const lower = (s?: string) => (s || '').toLowerCase();
      const zips = body.files.filter(f => lower(f.name).endsWith('.zip'));
      const pdfs = body.files.filter(f => lower(f.name).endsWith('.pdf'));
      const others = body.files.filter(f => !lower(f.name).endsWith('.zip') && !lower(f.name).endsWith('.pdf'));
      if (zips.length === 0 || pdfs.length === 0 || others.length === 0) {
        const missing: string[] = [];
        if (zips.length === 0) missing.push('1 arquivo ZIP');
        if (pdfs.length === 0) missing.push('1 arquivo PDF');
        if (others.length === 0) missing.push('1 arquivo de outro formato (imagem/vídeo/etc.)');
        throw new HttpException(`Arquivos insuficientes: adicione ${missing.join(', ')}`, HttpStatus.BAD_REQUEST);
      }

      const userId = user?.userId || 'anonymous';
      const uploadUrls: Array<{
        fileName: string;
        uploadId: string;
        uploadUrl: string;
        headers: Record<string, string>;
        localPath: string;
        storagePath: string;
      }> = [];

      // Timestamp base para todos os uploads desta sessão (timezone local)
      const timestamp = this.getLocalDateString();

      // Gerar paths locais para cada arquivo (SEM prefixo temp_)
      for (const fileInfo of body.files) {
        const uploadId = crypto.randomUUID().slice(0, 8); // ID único por arquivo
        const tempFileName = fileInfo.name; // Nome original sem prefixo
        
        // Usar subdiretório por uploadId para evitar colisões
        const fileDir = path.join(process.cwd(), 'temp', 'staging', timestamp, uploadId);
        const localPath = path.join(fileDir, tempFileName);
        const relativePath = path.relative(process.cwd(), localPath);

        uploadUrls.push({
          fileName: fileInfo.name,
          uploadId,
          uploadUrl: `/api/upload/${uploadId}`, // Endpoint para receber o arquivo
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          localPath: relativePath,
          storagePath: relativePath
        });

        this.logger.log(`Preparado upload local: ${relativePath} (ID: ${uploadId})`);
      }

      // Criar job de upload para rastreamento
      const job = this.uploadJobs.createJob({ 
        userId, 
        projectUrl: body.projectUrl, 
        staged: {
          // Simular paths locais para compatibilidade com sistema existente
          assetZip: uploadUrls.find(u => u.fileName.toLowerCase().endsWith('.zip'))?.storagePath,
          finalMaterials: uploadUrls.filter(u => !u.fileName.toLowerCase().endsWith('.zip')).map(u => u.storagePath)
        }
      });

      return {
        success: true,
        uploads: uploadUrls,
        jobId: job.id,
        expiresInMinutes: 120,
        message: `Uploads temporários preparados para ${uploadUrls.length} arquivos`
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload/:uploadId')
  @ApiOperation({ summary: 'Receber arquivo via upload multipart' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 }
  ], {
    storage: diskStorage({
      destination: async (req, file, cb) => {
        try {
          const uploadId = req.params.uploadId;
          const timestamp = getLocalDateString(); // Usar timezone local standalone
          // Usar subdiretório único por uploadId para evitar colisões
          const tempDir = path.join(process.cwd(), 'temp', 'staging', timestamp, uploadId);
          
          // Garantir que o diretório existe
          await fs.mkdir(tempDir, { recursive: true });
          
          console.log(`📁 Diretório preparado: ${tempDir}`);
          cb(null, tempDir);
        } catch (error) {
          console.error('❌ Erro ao criar diretório:', error);
          cb(error as Error, '');
        }
      },
      filename: (req, file, cb) => {
        // Salvar com nome original (SEM prefixo uploadId)
        const filename = file.originalname;
        console.log(`📄 Arquivo original recebido: "${file.originalname}"`);
        console.log(`📄 Arquivo será salvo como: "${filename}"`);
        cb(null, filename);
      }
    })
  }))
  async receiveUpload(
    @Param('uploadId') uploadId: string,
    @UploadedFiles() files: { file?: Express.Multer.File[] },
    @CurrentUser() user?: AuthUser
  ) {
    try {
      this.logger.log(`📥 Recebendo upload para ID: ${uploadId}`);
      this.logger.log(`📝 Arquivos recebidos:`, files);

      if (!files.file || files.file.length === 0) {
        this.logger.error(`❌ Nenhum arquivo enviado para uploadId: ${uploadId}`);
        throw new HttpException('Nenhum arquivo enviado', HttpStatus.BAD_REQUEST);
      }

      const uploadedFile = files.file[0];
      this.logger.log(`✅ Arquivo recebido: ${uploadedFile.filename} (${uploadedFile.size} bytes)`);
      this.logger.log(`📁 Salvo em: ${uploadedFile.path}`);
      
      // Verificar se o arquivo foi realmente salvo
      try {
        const stats = await fs.stat(uploadedFile.path);
        this.logger.log(`🔍 Arquivo confirmado no disco: ${stats.size} bytes`);
      } catch (statError) {
        this.logger.error(`❌ Arquivo não encontrado no disco: ${uploadedFile.path}`, statError);
      }

      // Agendar limpeza após 10 minutos
      setTimeout(() => {
        this.cleanupTempFile(uploadedFile.path);
      }, 10 * 60 * 1000); // 10 minutos

      return {
        success: true,
        uploadId,
        fileName: uploadedFile.originalname,
        size: uploadedFile.size,
        path: uploadedFile.path
      };
    } catch (error) {
      this.logger.error(`❌ Erro no upload ${uploadId}:`, error);
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async cleanupTempFile(filePath: string) {
    try {
      await fs.unlink(filePath);
      this.logger.log(`Arquivo temporário removido: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Falha ao remover arquivo temporário ${filePath}:`, error.message);
    }
  }

  @Delete('upload/clear-prepared')
  @ApiOperation({ summary: 'Limpar arquivos preparados (staging) e jobs staged do usuário' })
  @ApiResponse({ status: 200, description: 'Arquivos limpos com sucesso' })
  async clearPreparedFiles(@CurrentUser() user?: AuthUser) {
    try {
      const userId = user?.userId || 'anonymous';
      
      // Obter job ativo do usuário (se existir)
      const activeJob = this.uploadJobs.getActiveJobForUser(userId);
      
      const deletedFiles: string[] = [];
      const errors: string[] = [];
      
      // Se há job ativo com arquivos staged
      if (activeJob && activeJob.status === 'staged') {
        const allPaths = [
          activeJob.staged.assetZip,
          ...(activeJob.staged.finalMaterials || [])
        ].filter(Boolean) as string[];
        
        for (const relativePath of allPaths) {
          try {
            const absolutePath = path.resolve(process.cwd(), relativePath);
            
            // Verificar se arquivo existe antes de deletar
            try {
              await fs.access(absolutePath);
              await fs.unlink(absolutePath);
              deletedFiles.push(relativePath);
              this.logger.log(`🗑️ Arquivo deletado: ${relativePath}`);
            } catch {
              // Arquivo não existe, apenas registrar
              this.logger.warn(`⚠️ Arquivo não encontrado (já foi deletado?): ${relativePath}`);
            }
            
            // Tentar deletar diretório pai (se vazio)
            try {
              const dir = path.dirname(absolutePath);
              await fs.rmdir(dir);
              this.logger.log(`📁 Diretório vazio removido: ${dir}`);
            } catch {
              // Diretório não vazio ou não existe, ignorar
            }
          } catch (err) {
            errors.push(`Erro ao deletar ${relativePath}: ${(err as Error).message}`);
            this.logger.error(`❌ Erro ao deletar ${relativePath}:`, err);
          }
        }
        
        // Cancelar o job
        this.uploadJobs.cancel(activeJob.id, userId);
        this.logger.log(`✅ Job ${activeJob.id} cancelado e arquivos limpos`);
      }
      
      // Limpar diretórios antigos (>24h) do staging
      try {
        const stagingDir = path.join(process.cwd(), 'temp', 'staging');
        const dirs = await fs.readdir(stagingDir).catch(() => []);
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        
        for (const dirName of dirs) {
          const dirPath = path.join(stagingDir, dirName);
          const stats = await fs.stat(dirPath).catch(() => null);
          
          if (stats && stats.isDirectory() && stats.mtimeMs < cutoff) {
            await fs.rm(dirPath, { recursive: true, force: true });
            this.logger.log(`🗑️ Diretório antigo removido: ${dirName}`);
          }
        }
      } catch (err) {
        this.logger.warn(`⚠️ Erro ao limpar diretórios antigos: ${(err as Error).message}`);
      }
      
      return {
        success: true,
        deletedFiles: deletedFiles.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `${deletedFiles.length} arquivo(s) deletado(s)${activeJob ? ', job cancelado' : ''}`
      };
    } catch (error) {
      this.logger.error('❌ Erro ao limpar arquivos:', error);
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload/generate-direct-url')
  @ApiOperation({ summary: 'Gerar URL para upload direto ao Bunny CDN (arquivos grandes)' })
  @UseGuards(JwtAuthGuard)
  async generateDirectUploadUrl(
    @Body() body: { fileName: string; brand?: string; subfolder?: string },
    @CurrentUser() user?: AuthUser
  ) {
    try {
      if (!body.fileName) {
        throw new HttpException('fileName é obrigatório', HttpStatus.BAD_REQUEST);
      }

      const result = await this.bunnyUploadService.generateSignedUploadUrl({
        fileName: body.fileName,
        brand: body.brand || 'temp',
        subfolder: body.subfolder || 'staging',
        expiresInMinutes: 60 // URL válida por 1 hora
      });

      if (!result.success) {
        throw new HttpException(result.error || 'Erro ao gerar URL', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        success: true,
        uploadId: result.uploadId,
        uploadUrl: result.uploadUrl,
        headers: result.headers,
        storagePath: result.storagePath,
        cdnUrl: result.cdnUrl,
        message: 'URL de upload direto gerada com sucesso'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload/execute')
  @ApiOperation({ summary: 'Executar automação de upload no Workfront usando paths salvos' })
  @ApiResponse({
    status: 200,
    description: 'Automação executada com sucesso',
    type: UploadExecutionResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  async executeUpload(@Body() executeDto: ExecuteUploadDto & { jobId?: string }, @Query('debugHeadless') debugHeadless?: string, @CurrentUser() user?: AuthUser): Promise<UploadExecutionResponseDto & { jobId?: string }> {
    try {
  const { projectUrl, selectedUser, assetZipPath, finalMaterialPaths, jobId } = executeDto;
      const userId = user?.userId || 'anonymous';
      if (jobId) this.uploadJobs.markExecuting(jobId);

      this.logger.log(`🚀 Executando upload automation: ${assetZipPath} + ${finalMaterialPaths.length} finals`);

      const result = await this.uploadAutomationService.executeUploadPlan({
        projectUrl,
        selectedUser,
        assetZipPath,
        finalMaterialPaths,
        headless: resolveHeadless({ override: process.env.NODE_ENV === 'development' ? debugHeadless : undefined, allowOverride: true }),
      });
      if (jobId) this.uploadJobs.markCompleted(jobId, result.summary || result.message);
      return { ...result, jobId };
    } catch (error) {
      const jobId = (executeDto as any)?.jobId;
      if (jobId) this.uploadJobs.markFailed(jobId, (error as any)?.message);
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: (error as Error).message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===== NOVOS ENDPOINTS: STATUS & HORAS =====
  @Post('work/update-status')
  @ApiOperation({ summary: 'Atualizar status (Loc | Status) do projeto' })
  async updateStatus(@Body() body: UpdateWorkStatusDto) {
    try {
  const res = await this.statusAutomation.updateWorkStatus({ projectUrl: body.projectUrl, statusLabel: body.statusLabel });
      return { success: res.success, message: res.message };
    } catch (e: any) {
      throw new HttpException({ success: false, message: e?.message || 'Falha ao atualizar status' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('work/log-hours')
  @ApiOperation({ summary: 'Lançar horas em uma tarefa (primeira ou pelo nome)' })
  async logHours(@Body() body: LogHoursDto, @Query('debugHeadless') debugHeadless?: string) {
    try {
  return await this.hoursAutomation.logHours({ projectUrl: body.projectUrl, hours: body.hours, note: body.note, taskName: body.taskName, headless: resolveHeadless({ override: process.env.NODE_ENV === 'development' ? debugHeadless : undefined, allowOverride: true }) });
    } catch (e: any) {
      throw new HttpException({ success: false, message: e?.message || 'Falha ao lançar horas' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===== NOVO ENDPOINT: TIMELINE/WORKFLOW =====
  @Post('workflow/execute')
  @ApiOperation({ summary: 'Executar workflow customizado de ações' })
  @ApiResponse({
    status: 200,
    description: 'Workflow executado',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        results: { type: 'array' },
        summary: { type: 'object' }
      }
    }
  })
  @UseGuards(JwtAuthGuard)
  async executeWorkflow(@Body() body: any, @Query('debugHeadless') debugHeadless?: string, @CurrentUser() user?: AuthUser) {
    try {
  const { projectUrl, steps, stopOnError } = body;
      
      if (!projectUrl) {
        throw new HttpException('projectUrl é obrigatório', HttpStatus.BAD_REQUEST);
      }
      
      if (!steps || !Array.isArray(steps) || steps.length === 0) {
        throw new HttpException('steps deve ser um array não vazio', HttpStatus.BAD_REQUEST);
      }

      // SANITIZAR: Remover prefixos temp_ antigos dos nomes de arquivo
      const sanitizedSteps = this.sanitizeWorkflowSteps(steps);

      const result = await this.timelineService.executeWorkflow({
        projectUrl,
        steps: sanitizedSteps,
        headless: resolveHeadless({ override: process.env.NODE_ENV === 'development' ? debugHeadless : undefined, allowOverride: true }),
        stopOnError: stopOnError || false,
        userId: user?.userId,
        jobId: body.jobId,
      });

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== JOBS DE UPLOAD (persistência simples) =====
  @UseGuards(JwtAuthGuard)
  @Get('upload/jobs/active')
  async getActiveJob(@CurrentUser() user?: AuthUser) {
    const job = this.uploadJobs.getActiveJobForUser(user?.userId || 'anonymous');
    this.logger.log(`[debug] getActiveJob user=${user?.userId || 'anon'} roles=${user?.roles?.join(',') || ''}`);
    return { success: true, job: job || null };
  }

  @UseGuards(JwtAuthGuard)
  @Get('upload/jobs/:id')
  async getJob(@Param('id') id: string, @CurrentUser() user?: AuthUser, @Query('admin') admin?: string) {
    const job = this.uploadJobs.getJob(id, user?.userId || 'anonymous', admin === 'true');
    if (!job) return { success: false, message: 'Job não encontrado' };
    return { success: true, job };
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload/jobs/:id/cancel')
  async cancelJob(@Param('id') id: string, @CurrentUser() user?: AuthUser, @Query('admin') admin?: string) {
    const ok = this.uploadJobs.cancel(id, user?.userId || 'anonymous', admin === 'true');
    return { success: ok };
  }

  @UseGuards(JwtAuthGuard)
  @Get('upload/jobs/search')
  async searchJobs(@Query('q') q: string, @CurrentUser() user?: AuthUser, @Query('admin') admin?: string) {
    if (!q) return { success: true, results: [] };
    const results = this.uploadJobs.search(q, user?.userId, admin === 'true');
    return { success: true, results };
  }

  @Post('workflow/preview')
  @ApiOperation({ summary: 'Preview de workflow antes de executar' })
  async previewWorkflow(@Body() body: any) {
    try {
      const { type, projectUrl, params } = body;
      
      let config;
      if (type === 'share-comment') {
        config = this.timelineService.createShareAndCommentWorkflow(
          projectUrl,
          params.selections,
          params.selectedUser
        );
      } else if (type === 'upload') {
        config = this.timelineService.createUploadWorkflow(
          projectUrl,
          params.assetZipPath,
          params.finalMaterialPaths,
          params.selectedUser
        );
      } else {
        throw new HttpException('Tipo de workflow inválido', HttpStatus.BAD_REQUEST);
      }

      return {
        success: true,
        config,
        message: 'Preview do workflow gerado'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===== ROTAS ADMINISTRATIVAS DE LIMPEZA =====
  
  @Get('admin/temp-uploads/stats')
  @ApiOperation({ summary: 'Estatísticas de uploads temporários [ADMIN]' })
  @UseGuards(JwtAuthGuard)
  async getTempUploadStats(@CurrentUser() user?: AuthUser) {
    try {
      const stats = await this.bunnyUploadService.getStats();
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('admin/temp-uploads/cleanup')
  @ApiOperation({ summary: 'Executar limpeza manual de uploads temporários [ADMIN]' })
  @UseGuards(JwtAuthGuard)
  async manualCleanup(
    @Body() body?: { includeUsedFiles?: boolean; usedFilesOlderThanHours?: number },
    @CurrentUser() user?: AuthUser
  ) {
    try {
      // Importar o serviço aqui para evitar dependência circular
      const { CleanupSchedulerService } = await import('../../services/cleanup-scheduler.service');
      const cleanupService = new CleanupSchedulerService(this.bunnyUploadService);
      
      const result = await cleanupService.manualCleanup(body || {});
      
      return {
        success: true,
        result,
        message: `Limpeza manual concluída: ${result.totalDeleted} arquivos removidos`
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Sanitiza steps do workflow removendo prefixos temp_ antigos dos nomes de arquivo
   * Isso garante compatibilidade com jobs/requests antigos que tinham o prefixo
   */
  private sanitizeWorkflowSteps(steps: any[]): any[] {
    return steps.map(step => {
      if (!step.params) return step;

      const sanitizedParams = { ...step.params };

      // Sanitizar fileName (usado em share, comment)
      if (sanitizedParams.fileName && typeof sanitizedParams.fileName === 'string') {
        sanitizedParams.fileName = this.removeOldTempPrefix(sanitizedParams.fileName);
      }

      // Sanitizar assetZipPath (usado em upload)
      if (sanitizedParams.assetZipPath && typeof sanitizedParams.assetZipPath === 'string') {
        sanitizedParams.assetZipPath = this.updateFilePath(sanitizedParams.assetZipPath);
      }

      // Sanitizar finalMaterialPaths (array usado em upload)
      if (Array.isArray(sanitizedParams.finalMaterialPaths)) {
        sanitizedParams.finalMaterialPaths = sanitizedParams.finalMaterialPaths.map(
          (p: string) => this.updateFilePath(p)
        );
      }

      // Sanitizar selections (array usado em share)
      if (Array.isArray(sanitizedParams.selections)) {
        sanitizedParams.selections = sanitizedParams.selections.map((sel: any) => ({
          ...sel,
          fileName: sel.fileName ? this.removeOldTempPrefix(sel.fileName) : sel.fileName
        }));
      }

      return { ...step, params: sanitizedParams };
    });
  }

  /**
   * Remove prefixo temp_TIMESTAMP_HASH_ de nomes de arquivo (somente nome, não path)
   */
  private removeOldTempPrefix(fileName: string): string {
    const match = fileName.match(/^temp_\d+_[a-f0-9]+_(.+)$/);
    return match ? match[1] : fileName;
  }

  /**
   * Atualiza path completo removendo prefixo do basename e corrigindo estrutura de diretório
   */
  private updateFilePath(filePath: string): string {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const cleanName = this.removeOldTempPrefix(basename);
    
    // Se o path contém estrutura antiga (temp/staging/YYYY-MM-DD/arquivo.ext)
    // transformar para nova estrutura (temp/staging/YYYY-MM-DD/uploadId/arquivo.ext)
    const parts = dir.split(path.sep);
    const stagingIdx = parts.indexOf('staging');
    
    if (stagingIdx >= 0 && stagingIdx + 1 < parts.length) {
      // Tem data após staging
      const dateFolder = parts[stagingIdx + 1];
      
      // Se não tem uploadId folder após date (estrutura antiga)
      if (stagingIdx + 2 >= parts.length || parts[stagingIdx + 2] === basename) {
        // Gerar uploadId para estrutura nova
        const uploadId = crypto.randomUUID().slice(0, 8);
        const newDir = parts.slice(0, stagingIdx + 2).concat([uploadId]).join(path.sep);
        return path.join(newDir, cleanName);
      }
    }
    
    // Path já está correto ou não é temp/staging, apenas limpar nome
    return path.join(dir, cleanName);
  }

  @Post('upload/mark-used/:uploadId')
  @ApiOperation({ summary: 'Marcar upload temporário como utilizado' })
  @UseGuards(JwtAuthGuard)
  async markUploadAsUsed(
    @Param('uploadId') uploadId: string,
    @CurrentUser() user?: AuthUser
  ) {
    try {
      const success = await this.bunnyUploadService.markAsUsed(uploadId);
      return {
        success,
        message: success ? 'Upload marcado como utilizado' : 'Falha ao marcar upload'
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: (error as Error).message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Retorna data local no formato YYYY-MM-DD (não usa UTC) */
  private getLocalDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}