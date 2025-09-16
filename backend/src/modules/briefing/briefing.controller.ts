import { Controller, Get, Post, Delete, Query, Body } from '@nestjs/common';
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

@ApiTags('Briefing')
@Controller('api/briefing')
export class BriefingController {
  constructor(private readonly briefingService: BriefingService) {}

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
}