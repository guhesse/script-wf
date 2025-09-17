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
import { BulkProgressService } from '../pdf/bulk-progress.service';
import { DocumentBulkDownloadService } from '../../download/document-bulk-download.service';
import { spawnSync } from 'child_process';

@ApiTags('Projetos')
@Controller('api')
export class WorkfrontController {
  constructor(
    private readonly workfrontService: WorkfrontService,
    private readonly pdfService: PdfService,
    private readonly commentService: CommentService,
    private readonly extractionService: ExtractionService,
    private readonly progressService: BulkProgressService,
    private readonly bulkService: DocumentBulkDownloadService,
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
}