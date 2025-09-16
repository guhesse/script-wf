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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WorkfrontService } from './workfront.service';
import { PdfService } from '../pdf/pdf.service';
import { CommentService } from '../pdf/comment.service';
import { ExtractionService } from '../pdf/extraction.service';
import {
  CreateProjectDto,
  ProjectResponseDto,
  ProjectHistoryQueryDto,
  ProjectHistoryResponseDto,
  ShareDocumentsDto,
  ShareDocumentsResponseDto,
  DashboardStatsDto,
} from './dto/workfront.dto';
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

@ApiTags('Projetos')
@Controller('api')
export class WorkfrontController {
  constructor(
    private readonly workfrontService: WorkfrontService,
    private readonly pdfService: PdfService,
    private readonly commentService: CommentService,
    private readonly extractionService: ExtractionService,
  ) {}

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
}