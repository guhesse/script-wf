import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
    AddCommentDto,
    AddCommentResponseDto,
    CommentPreviewDto,
    CommentPreviewResponseDto,
    CommentType,
    UserTeam,
} from '../pdf/dto/pdf.dto';

// Configuração de usuários baseada no approval.html
const USERS_CONFIG = {
    // Carolina's team
    carol: [
        {
            name: 'Yasmin Lahm',
            email: 'yasmin.lahm@dell.com',
            id: 'USER_682e04f003a037009d7bb6434c90f1bc',
        },
        {
            name: 'Gabriela Vargas',
            email: 'gabriela.vargas1@dell.com',
            id: 'USER_682cca1400bed8ae9149fedfdc5b0170',
        },
        {
            name: 'Eduarda Ulrich',
            email: 'eduarda.ulrich@dell.com',
            id: 'USER_66f6ab9b050fd317df75ed2a4de184e7',
        },
        {
            name: 'Evili Borges',
            email: 'evili.borges@dell.com',
            id: 'USER_6610596c008d57c44df182ec8183336d',
        },
        {
            name: 'Giovanna Deparis',
            email: 'giovanna.deparis@dell.com',
            id: 'USER_682e04e403a004b47dad0ce00a992d84',
        },
        {
            name: 'Natascha Batista',
            email: 'natascha.batista@dell.com',
            id: 'USER_6867f5d90093ad0c57fbe5a22851a7d0',
        },
        {
            name: 'Carolina Lipinski',
            email: 'carolina.lipinski@dell.com',
            id: 'USER_6404f185031cb4594c66a99fa57c36e5',
        },
    ],
    // Giovana's team
    giovana: [
        {
            name: 'Giovana Cardoso',
            email: 'giovana.cardoso@dell.com',
            id: 'USER_6404f185031cb4594c66a99fa57c36e4',
        },
        {
            name: 'Bianca Santos',
            email: 'bianca.santos@dell.com',
            id: 'USER_6404f185031cb4594c66a99fa57c36e3',
        },
    ],
    // Test users
    test: [
        {
            name: 'Test User',
            email: 'test@dell.com',
            id: 'USER_test123',
        },
    ],
};

// Templates de comentários
const COMMENT_TEMPLATES = {
    [CommentType.ASSET_RELEASE]: {
        text: 'Asset Release finalizado e aprovado para uso.',
        mentions: true,
    },
    [CommentType.FINAL_MATERIALS]: {
        text: 'Materiais finais revisados e aprovados.',
        mentions: true,
    },
    [CommentType.APPROVAL]: {
        text: 'Documento aprovado para prosseguimento.',
        mentions: false,
    },
};

@Injectable()
export class CommentService {
    private readonly logger = new Logger(CommentService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Adicionar comentário em um documento
     */
    async addComment(commentDto: AddCommentDto): Promise<AddCommentResponseDto> {
        try {
            const { projectUrl, folderName, fileName, commentType, selectedUser, headless } = commentDto;

            this.logger.log(`💬 Adicionando comentário: ${fileName}`);
            this.logger.log(`📁 Pasta: ${folderName || 'Raiz'}`);
            this.logger.log(`🏷️ Tipo: ${commentType}`);
            this.logger.log(`👥 Equipe: ${selectedUser}`);

            // Obter template do comentário
            const template = COMMENT_TEMPLATES[commentType] || COMMENT_TEMPLATES[CommentType.ASSET_RELEASE];
            
            // Obter usuários para mencionar
            const users = this.getUsersForTeam(selectedUser);
            const mentionedUsers = template.mentions ? users.length : 0;

            // TODO: Implementar integração com Playwright para automação real
            // Por enquanto, simular resultado
            
            const result: AddCommentResponseDto = {
                success: true,
                message: `Comentário adicionado com sucesso em ${fileName}`,
                commentText: template.text,
                mentionedUsers,
            };

            this.logger.log(`✅ Comentário adicionado: ${mentionedUsers} usuários mencionados`);
            return result;

        } catch (error) {
            this.logger.error(`❌ Erro ao adicionar comentário: ${error.message}`);
            throw new Error(`Falha ao adicionar comentário: ${error.message}`);
        }
    }

    /**
     * Preview do comentário antes de enviar
     */
    getCommentPreview(previewDto: CommentPreviewDto): CommentPreviewResponseDto {
        try {
            const { commentType, selectedUser } = previewDto;

            // Obter template do comentário
            const template = COMMENT_TEMPLATES[commentType] || COMMENT_TEMPLATES[CommentType.ASSET_RELEASE];
            
            // Obter usuários para mencionar
            const users = this.getUsersForTeam(selectedUser);
            const usersToMention = template.mentions ? users : [];

            return {
                success: true,
                commentText: template.text,
                users: usersToMention.map(user => ({
                    name: user.name,
                    email: user.email,
                    id: user.id,
                })),
            };

        } catch (error) {
            this.logger.error(`❌ Erro ao gerar preview: ${error.message}`);
            throw new Error(`Falha ao gerar preview: ${error.message}`);
        }
    }

    /**
     * Obter usuários de uma equipe
     */
    private getUsersForTeam(team: UserTeam): any[] {
        const teamKey = team.toString();
        return USERS_CONFIG[teamKey] || USERS_CONFIG.test;
    }
}