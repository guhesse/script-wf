import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WorkfrontService } from '../workfront/workfront.service';
import {
    ExtractDocumentsDto,
    ExtractDocumentsResponseDto,
} from './dto/pdf.dto';

@Injectable()
export class ExtractionService {
    private readonly logger = new Logger(ExtractionService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => WorkfrontService))
        private readonly workfrontService: WorkfrontService,
    ) {}

    /**
     * Extrair documentos de um projeto
     */
    async extractDocuments(extractDto: ExtractDocumentsDto): Promise<ExtractDocumentsResponseDto> {
        try {
            const { projectUrl, headless } = extractDto;
            
            this.logger.log(`📂 Extraindo documentos do projeto: ${projectUrl}`);
            this.logger.log(`🎭 Modo headless: ${headless}`);

            // Salvar projeto no histórico
            const project = await this.workfrontService.saveProjectFromUrl(projectUrl, {
                title: 'Extração de documentos',
                description: 'Documentos extraídos via API',
            });

            // TODO: Implementar integração real com Playwright para extração
            // Por enquanto, simular resultado de extração
            
            const simulatedResult: ExtractDocumentsResponseDto = {
                success: true,
                message: 'Documentos extraídos com sucesso',
                totalFolders: 5,
                totalFiles: 15,
                folders: {
                    '01. Creative Brief': {
                        files: ['creative_brief.pdf', 'requirements.docx'],
                        count: 2,
                    },
                    '02. Asset Bank': {
                        files: ['logo.png', 'banner.jpg'],
                        count: 2,
                    },
                    '03. Proofs': {
                        files: ['proof_v1.pdf', 'proof_v2.pdf'],
                        count: 2,
                    },
                    '04. Final Assets': {
                        files: ['final_banner.jpg', 'final_logo.png'],
                        count: 2,
                    },
                    '05. Briefing': {
                        files: ['briefing.pdf', 'guidelines.pdf', 'specs.docx'],
                        count: 3,
                    },
                },
                project: project,
                processingTime: '3.2 segundos',
            };

            this.logger.log(`✅ Extração concluída: ${simulatedResult.totalFiles} arquivos em ${simulatedResult.totalFolders} pastas`);
            return simulatedResult;

        } catch (error) {
            this.logger.error(`❌ Erro na extração de documentos: ${error.message}`);
            throw new Error(`Falha na extração: ${error.message}`);
        }
    }

    /**
     * Extrair documentos com progresso em tempo real (SSE)
     */
    async extractDocumentsStream(projectId: string, projectUrl: string): Promise<any> {
        try {
            this.logger.log(`🔄 Iniciando extração com stream para projeto: ${projectId}`);

            // TODO: Implementar Server-Sent Events (SSE) para progresso em tempo real
            // Por enquanto, retornar dados simulados
            
            return {
                message: 'Stream de extração iniciado',
                projectId,
                projectUrl,
                status: 'processing',
            };

        } catch (error) {
            this.logger.error(`❌ Erro na extração com stream: ${error.message}`);
            throw new Error(`Falha na extração com stream: ${error.message}`);
        }
    }
}