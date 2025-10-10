import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { KanbanService } from './kanban.service';
import {
  CreateKanbanCardDto,
  UpdateKanbanCardDto,
  MoveKanbanCardDto,
  KanbanCardResponseDto,
} from './dto/kanban-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Kanban')
@Controller('api/kanban')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Post('cards')
  @Roles('ADMIN', 'EDITOR')
  @ApiOperation({ summary: 'Criar novo card no Kanban' })
  @ApiResponse({ status: 201, description: 'Card criado com sucesso', type: KanbanCardResponseDto })
  async create(@Body() createDto: CreateKanbanCardDto, @Request() req): Promise<KanbanCardResponseDto> {
    const userId = req.user?.sub || req.user?.id;
    return this.kanbanService.create(createDto, userId);
  }

  @Get('cards')
  @ApiOperation({ summary: 'Listar todos os cards com filtros opcionais' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'week', required: false, description: 'Filtrar por semana' })
  @ApiQuery({ name: 'quarter', required: false, description: 'Filtrar por quarter' })
  @ApiQuery({ name: 'fy', required: false, description: 'Filtrar por ano fiscal' })
  @ApiQuery({ name: 'cliente', required: false, description: 'Filtrar por cliente' })
  @ApiQuery({ name: 'brand', required: false, description: 'Filtrar por marca' })
  @ApiQuery({ name: 'frente', required: false, description: 'Filtrar por frente' })
  @ApiQuery({ name: 'columnId', required: false, description: 'Filtrar por coluna' })
  @ApiResponse({ status: 200, description: 'Lista de cards', type: [KanbanCardResponseDto] })
  async findAll(
    @Query('status') status?: string,
    @Query('week') week?: string,
    @Query('quarter') quarter?: string,
    @Query('fy') fy?: string,
    @Query('cliente') cliente?: string,
    @Query('brand') brand?: string,
    @Query('frente') frente?: string,
    @Query('columnId') columnId?: string,
  ): Promise<KanbanCardResponseDto[]> {
    return this.kanbanService.findAll({
      status,
      week,
      quarter,
      fy,
      cliente,
      brand,
      frente,
      columnId,
    });
  }

  @Get('cards/:id')
  @ApiOperation({ summary: 'Buscar card por ID' })
  @ApiResponse({ status: 200, description: 'Card encontrado', type: KanbanCardResponseDto })
  @ApiResponse({ status: 404, description: 'Card não encontrado' })
  async findOne(@Param('id') id: string): Promise<KanbanCardResponseDto> {
    return this.kanbanService.findOne(id);
  }

  @Patch('cards/:id')
  @Roles('ADMIN', 'EDITOR')
  @ApiOperation({ summary: 'Atualizar card' })
  @ApiResponse({ status: 200, description: 'Card atualizado com sucesso', type: KanbanCardResponseDto })
  @ApiResponse({ status: 404, description: 'Card não encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateKanbanCardDto,
    @Request() req,
  ): Promise<KanbanCardResponseDto> {
    const userId = req.user?.sub || req.user?.id;
    return this.kanbanService.update(id, updateDto, userId);
  }

  @Patch('cards/:id/move')
  @Roles('ADMIN', 'EDITOR')
  @ApiOperation({ summary: 'Mover card (drag and drop)' })
  @ApiResponse({ status: 200, description: 'Card movido com sucesso', type: KanbanCardResponseDto })
  @ApiResponse({ status: 404, description: 'Card não encontrado' })
  async move(@Param('id') id: string, @Body() moveDto: MoveKanbanCardDto): Promise<KanbanCardResponseDto> {
    return this.kanbanService.move(id, moveDto);
  }

  @Delete('cards/:id')
  @Roles('ADMIN', 'EDITOR')
  @ApiOperation({ summary: 'Deletar card' })
  @ApiResponse({ status: 204, description: 'Card deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Card não encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.kanbanService.remove(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas do board' })
  @ApiResponse({ status: 200, description: 'Estatísticas do Kanban' })
  async getStats() {
    return this.kanbanService.getStats();
  }
}
