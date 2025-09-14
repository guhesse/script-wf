import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Workfront Sharing API',
        version: '1.0.0',
        description: 'API para gerenciamento de projetos e documentos do Workfront',
        contact: {
            name: 'Support',
            email: 'support@example.com'
        }
    },
    servers: [
        {
            url: 'http://localhost:3000',
            description: 'Servidor de desenvolvimento'
        }
    ],
    components: {
        schemas: {
            WorkfrontProject: {
                type: 'object',
                required: ['url'],
                properties: {
                    id: {
                        type: 'string',
                        description: 'ID único do projeto'
                    },
                    url: {
                        type: 'string',
                        description: 'URL do projeto no Workfront'
                    },
                    title: {
                        type: 'string',
                        description: 'Título do projeto'
                    },
                    description: {
                        type: 'string',
                        description: 'Descrição do projeto'
                    },
                    projectId: {
                        type: 'string',
                        description: 'ID do projeto no Workfront'
                    },
                    dsid: {
                        type: 'string',
                        description: 'DSID extraído do nome do projeto'
                    },
                    status: {
                        type: 'string',
                        enum: ['ACTIVE', 'ARCHIVED', 'COMPLETED'],
                        description: 'Status do projeto'
                    },
                    accessCount: {
                        type: 'number',
                        description: 'Número de acessos ao projeto'
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Data de criação'
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Data de última atualização'
                    },
                    lastAccessedAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Data do último acesso'
                    }
                }
            },
            ProjectHistoryResponse: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean'
                    },
                    projects: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/WorkfrontProject'
                        }
                    },
                    pagination: {
                        type: 'object',
                        properties: {
                            page: { type: 'number' },
                            limit: { type: 'number' },
                            total: { type: 'number' },
                            totalPages: { type: 'number' }
                        }
                    }
                }
            },
            WorkfrontFolder: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome da pasta'
                    },
                    files: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/WorkfrontFile'
                        }
                    }
                }
            },
            WorkfrontFile: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome do arquivo'
                    },
                    type: {
                        type: 'string',
                        description: 'Tipo do arquivo'
                    },
                    size: {
                        type: 'string',
                        description: 'Tamanho do arquivo'
                    },
                    url: {
                        type: 'string',
                        description: 'URL do arquivo'
                    },
                    addedInfo: {
                        type: 'string',
                        description: 'Informações adicionais'
                    }
                }
            },
            ShareSelection: {
                type: 'object',
                properties: {
                    folder: {
                        type: 'string',
                        description: 'Nome da pasta'
                    },
                    fileName: {
                        type: 'string',
                        description: 'Nome do arquivo'
                    }
                }
            },
            CommentRequest: {
                type: 'object',
                required: ['projectUrl', 'fileName'],
                properties: {
                    projectUrl: {
                        type: 'string',
                        description: 'URL do projeto no Workfront',
                        example: 'https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/68b5dfb601425defe0b9db91e1d53c31/documents'
                    },
                    folderName: {
                        type: 'string',
                        description: 'Nome da pasta (opcional)',
                        example: 'Asset Release'
                    },
                    fileName: {
                        type: 'string',
                        description: 'Nome do arquivo',
                        example: 'documento.pdf'
                    },
                    commentType: {
                        type: 'string',
                        enum: ['assetRelease', 'finalMaterials', 'approval'],
                        default: 'assetRelease',
                        description: 'Tipo de comentário'
                    },
                    selectedUser: {
                        type: 'string',
                        enum: ['carol', 'giovana', 'test'],
                        default: 'test',
                        description: 'Equipe para mencionar'
                    },
                    headless: {
                        type: 'boolean',
                        default: true,
                        description: 'Executar em modo headless'
                    }
                }
            },
            CommentResponse: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean',
                        example: true
                    },
                    message: {
                        type: 'string',
                        example: 'Comentário adicionado no documento "arquivo.pdf"'
                    },
                    commentText: {
                        type: 'string',
                        example: '@Gustavo Hesse, teste de approval.'
                    },
                    mentionedUsers: {
                        type: 'number',
                        example: 1
                    }
                }
            },
            CommentPreviewRequest: {
                type: 'object',
                required: ['commentType', 'selectedUser'],
                properties: {
                    commentType: {
                        type: 'string',
                        enum: ['assetRelease', 'finalMaterials', 'approval']
                    },
                    selectedUser: {
                        type: 'string',
                        enum: ['carol', 'giovana', 'test']
                    }
                }
            },
            CommentPreviewResponse: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean'
                    },
                    commentText: {
                        type: 'string'
                    },
                    users: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                email: { type: 'string' },
                                id: { type: 'string' },
                                url: { type: 'string' }
                            }
                        }
                    },
                    availableTypes: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    availableTeams: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                }
            },
            ApiError: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean',
                        example: false
                    },
                    message: {
                        type: 'string',
                        description: 'Mensagem de erro'
                    },
                    error: {
                        type: 'string',
                        description: 'Detalhes do erro'
                    }
                }
            }
        }
    }
};

const options = {
    swaggerDefinition,
    apis: [
        './src/routes/*.js',
        './src/controllers/*.js'
    ]
};

const swaggerSpec = swaggerJSDoc(options);

export { swaggerUi, swaggerSpec };
