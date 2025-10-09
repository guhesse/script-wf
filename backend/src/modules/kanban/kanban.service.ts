import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateKanbanCardDto, UpdateKanbanCardDto, MoveKanbanCardDto, KanbanCardResponseDto } from './dto/kanban-card.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcular dias entre datas
   */
  private calculateDaysBetween(start: Date | null, end: Date | null): number | null {
    if (!start || !end) return null;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calcular todos os campos derivados de datas
   */
  private calculateDerivedFields(card: any) {
    const updates: any = {};

    // Calcular dias entre etapas
    updates.diasStartR1VML = this.calculateDaysBetween(card.start, card.entregaR1VML);
    updates.diasR1VMLR1Dell = this.calculateDaysBetween(card.entregaR1VML, card.feedbackR1Dell);
    updates.diasR1DellR2VML = this.calculateDaysBetween(card.feedbackR1Dell, card.entregaR2VML);
    updates.diasR2VMLR2Dell = this.calculateDaysBetween(card.entregaR2VML, card.feedbackR2Dell);
    updates.diasR2DellR3VML = this.calculateDaysBetween(card.feedbackR2Dell, card.entregaR3VML);
    updates.diasR3VMLR3Dell = this.calculateDaysBetween(card.entregaR3VML, card.feedbackR3Dell);
    updates.diasR3DellR4VML = this.calculateDaysBetween(card.feedbackR3Dell, card.entregaR4VML);
    updates.diasR4VMLR4Dell = this.calculateDaysBetween(card.entregaR4VML, card.feedbackR4Dell);

    // Calcular percentuais
    const totalDiasVML = [
      updates.diasStartR1VML,
      updates.diasR1DellR2VML,
      updates.diasR2DellR3VML,
      updates.diasR3DellR4VML,
    ].filter((d) => d !== null).reduce((sum, d) => sum + (d || 0), 0);

    const totalDiasDell = [
      updates.diasR1VMLR1Dell,
      updates.diasR2VMLR2Dell,
      updates.diasR3VMLR3Dell,
      updates.diasR4VMLR4Dell,
    ].filter((d) => d !== null).reduce((sum, d) => sum + (d || 0), 0);

    const totalDias = totalDiasVML + totalDiasDell;

    if (totalDias > 0) {
      updates.diasNaVMLPercent = (totalDiasVML / totalDias) * 100;
      updates.diasNaDellPercent = (totalDiasDell / totalDias) * 100;
    }

    return updates;
  }

  /**
   * Criar novo card
   */
  async create(dto: CreateKanbanCardDto, userId?: string): Promise<KanbanCardResponseDto> {
    this.logger.log(`Criando novo card: ${dto.atividade}`);

    const data: Prisma.KanbanCardCreateInput = {
      ...dto,
      start: dto.start ? new Date(dto.start) : undefined,
      realDeliv: dto.realDeliv ? new Date(dto.realDeliv) : undefined,
      prevDeliv: dto.prevDeliv ? new Date(dto.prevDeliv) : undefined,
      entregaR1VML: dto.entregaR1VML ? new Date(dto.entregaR1VML) : undefined,
      feedbackR1Dell: dto.feedbackR1Dell ? new Date(dto.feedbackR1Dell) : undefined,
      entregaR2VML: dto.entregaR2VML ? new Date(dto.entregaR2VML) : undefined,
      feedbackR2Dell: dto.feedbackR2Dell ? new Date(dto.feedbackR2Dell) : undefined,
      entregaR3VML: dto.entregaR3VML ? new Date(dto.entregaR3VML) : undefined,
      feedbackR3Dell: dto.feedbackR3Dell ? new Date(dto.feedbackR3Dell) : undefined,
      entregaR4VML: dto.entregaR4VML ? new Date(dto.entregaR4VML) : undefined,
      feedbackR4Dell: dto.feedbackR4Dell ? new Date(dto.feedbackR4Dell) : undefined,
      createdBy: userId,
    };

    const card = await this.prisma.kanbanCard.create({ data });

    // Calcular campos derivados
    const derivedFields = this.calculateDerivedFields(card);

    // Atualizar com campos calculados
    const updatedCard = await this.prisma.kanbanCard.update({
      where: { id: card.id },
      data: derivedFields,
    });

    return updatedCard as KanbanCardResponseDto;
  }

  /**
   * Listar todos os cards com filtros opcionais
   */
  async findAll(filters?: {
    status?: string;
    week?: string;
    quarter?: string;
    fy?: string;
    cliente?: string;
    brand?: string;
    frente?: string;
    columnId?: string;
  }): Promise<KanbanCardResponseDto[]> {
    const where: Prisma.KanbanCardWhereInput = {};

    if (filters) {
      if (filters.status) where.status = filters.status as any;
      if (filters.week) where.week = filters.week;
      if (filters.quarter) where.quarter = filters.quarter;
      if (filters.fy) where.fy = filters.fy as any;
      if (filters.cliente) where.cliente = { contains: filters.cliente, mode: 'insensitive' };
      if (filters.brand) where.brand = { contains: filters.brand, mode: 'insensitive' };
      if (filters.frente) where.frente = filters.frente as any;
      if (filters.columnId) where.columnId = filters.columnId;
    }

    const cards = await this.prisma.kanbanCard.findMany({
      where,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });

    return cards as KanbanCardResponseDto[];
  }

  /**
   * Buscar card por ID
   */
  async findOne(id: string): Promise<KanbanCardResponseDto> {
    const card = await this.prisma.kanbanCard.findUnique({
      where: { id },
    });

    if (!card) {
      throw new NotFoundException(`Card com ID ${id} não encontrado`);
    }

    return card as KanbanCardResponseDto;
  }

  /**
   * Atualizar card
   */
  async update(id: string, dto: UpdateKanbanCardDto, userId?: string): Promise<KanbanCardResponseDto> {
    this.logger.log(`Atualizando card ${id}`);

    // Verificar se existe
    await this.findOne(id);

    const data: Prisma.KanbanCardUpdateInput = {
      ...dto,
      start: dto.start ? new Date(dto.start) : undefined,
      realDeliv: dto.realDeliv ? new Date(dto.realDeliv) : undefined,
      prevDeliv: dto.prevDeliv ? new Date(dto.prevDeliv) : undefined,
      entregaR1VML: dto.entregaR1VML ? new Date(dto.entregaR1VML) : undefined,
      feedbackR1Dell: dto.feedbackR1Dell ? new Date(dto.feedbackR1Dell) : undefined,
      entregaR2VML: dto.entregaR2VML ? new Date(dto.entregaR2VML) : undefined,
      feedbackR2Dell: dto.feedbackR2Dell ? new Date(dto.feedbackR2Dell) : undefined,
      entregaR3VML: dto.entregaR3VML ? new Date(dto.entregaR3VML) : undefined,
      feedbackR3Dell: dto.feedbackR3Dell ? new Date(dto.feedbackR3Dell) : undefined,
      entregaR4VML: dto.entregaR4VML ? new Date(dto.entregaR4VML) : undefined,
      feedbackR4Dell: dto.feedbackR4Dell ? new Date(dto.feedbackR4Dell) : undefined,
      updatedBy: userId,
    };

    const card = await this.prisma.kanbanCard.update({
      where: { id },
      data,
    });

    // Recalcular campos derivados
    const derivedFields = this.calculateDerivedFields(card);

    const updatedCard = await this.prisma.kanbanCard.update({
      where: { id },
      data: derivedFields,
    });

    return updatedCard as KanbanCardResponseDto;
  }

  /**
   * Mover card (drag and drop)
   */
  async move(id: string, dto: MoveKanbanCardDto): Promise<KanbanCardResponseDto> {
    this.logger.log(`Movendo card ${id} para coluna ${dto.columnId} posição ${dto.position}`);

    const updateData: Prisma.KanbanCardUpdateInput = {
      columnId: dto.columnId,
      position: dto.position,
    };

    if (dto.status) {
      updateData.status = dto.status;
    }

    const card = await this.prisma.kanbanCard.update({
      where: { id },
      data: updateData,
    });

    return card as KanbanCardResponseDto;
  }

  /**
   * Deletar card
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Deletando card ${id}`);

    await this.findOne(id); // Verificar se existe

    await this.prisma.kanbanCard.delete({
      where: { id },
    });
  }

  /**
   * Obter estatísticas do board
   */
  async getStats() {
    const total = await this.prisma.kanbanCard.count();

    const byStatus = await this.prisma.kanbanCard.groupBy({
      by: ['status'],
      _count: true,
    });

    const byFrente = await this.prisma.kanbanCard.groupBy({
      by: ['frente'],
      _count: true,
    });

    const byCliente = await this.prisma.kanbanCard.groupBy({
      by: ['cliente'],
      _count: true,
      orderBy: {
        _count: {
          cliente: 'desc',
        },
      },
      take: 10,
    });

    return {
      total,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count,
      })),
      byFrente: byFrente.map((item) => ({
        frente: item.frente,
        count: item._count,
      })),
      topClientes: byCliente.map((item) => ({
        cliente: item.cliente,
        count: item._count,
      })),
    };
  }
}
