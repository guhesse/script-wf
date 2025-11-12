import { Controller, Get, Post, Delete, Query, Body, Sse, MessageEvent } from '@nestjs/common';
import { BriefingPptService } from './briefing-ppt.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { BriefingService } from './briefing.service';
import { BriefingCommentsAnalysisResponseDto } from './dto/briefing-comments-analysis.dto';
import { BriefingStatsResponseDto } from './dto/briefing-stats.dto';
import { BriefingProjectsResponseDto } from './dto/briefing-projects.dto';
import {
  ProcessProjectsRequestDto,
  ProcessProjectsResponseDto,
  DeleteDownloadsRequestDto,
  DeleteDownloadsResponseDto,
} from './dto/briefing-operations.dto';
import { Observable } from 'rxjs';

@ApiTags('Briefing')
@Controller('api/briefing')
export class BriefingController {
  constructor(private readonly briefingService: BriefingService, private readonly pptService: BriefingPptService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check para o serviço de briefing' })
  async healthCheck() {
    return {
      status: 'ok',
      service: 'briefing',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('projects')
  @ApiOperation({ summary: 'Listar projetos de briefing' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, type: BriefingProjectsResponseDto })
  async getProjects(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ): Promise<BriefingProjectsResponseDto> {
    return this.briefingService.getProjects(search, status);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas dos briefings' })
  @ApiResponse({ status: 200, type: BriefingStatsResponseDto })
  async getStats(): Promise<BriefingStatsResponseDto> {
    return this.briefingService.getStats();
  }

  @Post('process')
  @ApiOperation({ summary: 'Processar briefings de projetos' })
  @ApiResponse({ status: 200, type: ProcessProjectsResponseDto })
  async processProjects(
    @Body() processRequest: ProcessProjectsRequestDto,
  ): Promise<ProcessProjectsResponseDto> {
    return this.briefingService.processProjects(processRequest);
  }

  @Sse('process/stream')
  @ApiOperation({ summary: 'Processar briefings com SSE (Server-Sent Events)' })
  processProjectsStream(@Query('urls') urls: string): Observable<MessageEvent> {
    const projectUrls = urls.split(',').filter(url => url.trim());
    return this.briefingService.processProjectsWithSSE(projectUrls);
  }

  @Delete('downloads')
  @ApiOperation({ summary: 'Deletar downloads selecionados' })
  @ApiResponse({ status: 200, type: DeleteDownloadsResponseDto })
  async deleteDownloads(
    @Body() deleteRequest: DeleteDownloadsRequestDto,
  ): Promise<DeleteDownloadsResponseDto> {
    return this.briefingService.deleteDownloads(deleteRequest.downloadIds);
  }

  @Get('comments/analysis')
  @ApiOperation({ summary: 'Analisar comentários de PDFs (por projectId, downloadId ou dsid)' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'downloadId', required: false })
  @ApiQuery({ name: 'dsid', required: false })
  @ApiResponse({ status: 200, type: BriefingCommentsAnalysisResponseDto })
  async analyzeComments(
    @Query('projectId') projectId?: string,
    @Query('downloadId') downloadId?: string,
    @Query('dsid') dsid?: string,
  ): Promise<BriefingCommentsAnalysisResponseDto> {
    return this.briefingService.analyzeComments({ projectId, downloadId, dsid });
  }

  @Get('ppt/mock')
  @ApiOperation({ summary: 'Gerar PPT de 1 slide mockado (salva em disco temporário)' })
  async generateMockPpt() {
    const mockData = {
      dsid: '5479874',
      structuredData: {
        week: 'W10',
        liveDate: 'Oct 10 – Oct 31',
        vf: 'Microsoft JMA',
        headline: 'WIREFRAME – AWARD WINNING INNOVATION',
        copy: 'Explore breakthrough solutions that drive measurable impact across your organization.',
        description: 'This campaign highlights key differentiators and value props with a clean visual hierarchy.',
        cta: 'Learn More',
      },
      taskName: 'FY26Q3W10_CSG_CON_5479874_R1'
    };
    const os = await import('os');
    const path = await import('path');
    const tmpDir = path.join(os.tmpdir(), 'wf-ppt-mock');
    const result = await this.pptService.generateBriefingPpt({
      dsid: mockData.dsid,
      structuredData: mockData.structuredData,
      taskName: mockData.taskName,
      headline: mockData.structuredData.headline,
      copy: mockData.structuredData.copy,
      description: mockData.structuredData.description,
      cta: mockData.structuredData.cta,
      vf: mockData.structuredData.vf,
      liveDate: mockData.structuredData.liveDate
    }, { outputDir: tmpDir });
    return { success: true, mock: true, ppt: { fileName: result.fileName, path: result.path, sizeBytes: result.sizeBytes } };
  }

  @Post('links/compare')
  @ApiOperation({ summary: 'Comparar e retornar links únicos de briefings selecionados' })
  @ApiQuery({ name: 'downloadIds', required: true, type: [String], description: 'IDs dos downloads para comparar links' })
  @ApiQuery({ name: 'processLinks', required: false, type: Boolean, description: 'Se true, processa links DAM (padrão: true)' })
  async compareLinks(
    @Body() body: { downloadIds: string[]; processLinks?: boolean },
  ) {
    return this.briefingService.compareLinks(body.downloadIds, body.processLinks ?? true);
  }
}