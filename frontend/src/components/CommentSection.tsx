import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    MessageSquare,
    Eye,
    Send,
    Users,
    FileText,
    Clock
} from 'lucide-react';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontFolder } from '@/types';

interface CommentSectionProps {
    projectUrl: string;
    folders: WorkfrontFolder[];
    currentProject: { title?: string; dsid?: string } | null;
}

export const CommentSection = ({
    projectUrl,
    folders,
    currentProject
}: CommentSectionProps) => {
    const { addComment, getCommentPreview, isLoading } = useWorkfrontApi();

    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [commentType, setCommentType] = useState<'assetRelease' | 'finalMaterials' | 'approval'>('assetRelease');
    const [previewComment, setPreviewComment] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [teamMode, setTeamMode] = useState<'test' | 'carol' | 'giovana'>('test');

    const commentTypes = [
        { value: 'assetRelease', label: 'Asset Release', icon: '🎯', description: 'Para compartilhar assets finais' },
        { value: 'finalMaterials', label: 'Final Materials', icon: '📄', description: 'Para materiais finais' },
        { value: 'approval', label: 'Approval', icon: '✅', description: 'Para aprovação' }
    ] as const;

    const teamModes = [
        { value: 'test', label: 'Teste (Gustavo)', icon: '🧪', color: 'bg-muted text-primary border-border' },
        { value: 'carol', label: 'Equipe Carol', icon: '👥', color: 'bg-muted text-primary border-border' },
        { value: 'giovana', label: 'Equipe Giovana', icon: '👥', color: 'bg-muted text-primary border-border' }
    ] as const;

    const handlePreview = async () => {
        try {
            const result = await getCommentPreview({
                commentType,
                selectedUser: teamMode
            });

            if (result.success) {
                setPreviewComment(result.commentText);
                setShowPreview(true);
            }
        } catch (error) {
            console.error('Erro ao gerar preview:', error);
        }
    };

    const handleAddComment = async () => {
        if (!selectedFile) {
            alert('Por favor, selecione um arquivo');
            return;
        }

        if (!projectUrl) {
            alert('URL do projeto não informada');
            return;
        }

        try {
            await addComment({
                projectUrl,
                folderName: selectedFolder || undefined,
                fileName: selectedFile,
                commentType,
                selectedUser: teamMode,
                headless: false // Para ver o que está acontecendo
            });

            // Limpar seleções após sucesso
            setSelectedFile('');
            setShowPreview(false);
        } catch (error) {
            console.error('Erro ao adicionar comentário:', error);
        }
    };

    const availableFiles = folders.flatMap(folder =>
        folder.files.map(file => ({
            ...file,
            folderName: folder.name
        }))
    );

    return (
        <Card className="w-full bg-card border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-card-foreground">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Adicionar Comentário Automático
                </CardTitle>
                {currentProject && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        {currentProject.title}
                        {currentProject.dsid && (
                            <Badge variant="outline">
                                DSID: {currentProject.dsid}
                            </Badge>
                        )}
                    </div>
                )}
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Seleção de Modo de Equipe */}
                <div>
                    <label className="text-sm font-medium mb-2 block text-foreground">
                        <Users className="h-4 w-4 inline mr-1 text-primary" />
                        Modo de Equipe
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {teamModes.map((mode) => (
                            <Button
                                key={mode.value}
                                variant={teamMode === mode.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => setTeamMode(mode.value)}
                                className="flex items-center gap-1"
                            >
                                <span>{mode.icon}</span>
                                {mode.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Seleção de Tipo de Comentário */}
                <div>
                    <label className="text-sm font-medium mb-2 block text-foreground">
                        Tipo de Comentário
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                        {commentTypes.map((type) => (
                            <Button
                                key={type.value}
                                variant={commentType === type.value ? "default" : "outline"}
                                onClick={() => setCommentType(type.value)}
                                className="flex items-center justify-start gap-2 p-3 h-auto"
                            >
                                <span className="text-lg">{type.icon}</span>
                                <div className="text-left">
                                    <div className="font-medium">{type.label}</div>
                                    <div className="text-xs opacity-70">{type.description}</div>
                                </div>
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Seleção de Arquivo */}
                <div>
                    <label className="text-sm font-medium mb-2 block text-foreground">
                        Arquivo para Comentar
                    </label>
                    {availableFiles.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {availableFiles.map((file, index) => (
                                <Button
                                    key={index}
                                    variant={selectedFile === file.name ? "default" : "outline"}
                                    onClick={() => {
                                        setSelectedFile(file.name);
                                        setSelectedFolder(file.folderName);
                                    }}
                                    className="w-full justify-start text-left p-3 h-auto"
                                >
                                    <div>
                                        <div className="font-medium">{file.name}</div>
                                        <div className="text-xs opacity-70">
                                            📁 {file.folderName} • {file.type}
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    ) : (
                        <Alert>
                            <AlertDescription>
                                Nenhum arquivo disponível. Extraia documentos primeiro.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Preview do Comentário */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handlePreview}
                        disabled={isLoading}
                        className="flex items-center gap-2"
                    >
                        <Eye className="h-4 w-4" />
                        Preview
                    </Button>

                    <Button
                        onClick={handleAddComment}
                        disabled={isLoading || !selectedFile}
                        className="flex items-center gap-2 flex-1"
                    >
                        <Send className="h-4 w-4" />
                        {isLoading ? 'Adicionando...' : 'Adicionar Comentário'}
                    </Button>
                </div>

                {/* Preview Result */}
                {showPreview && previewComment && (
                    <Card className="bg-muted border-border">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                                <Eye className="h-4 w-4 text-primary" />
                                Preview do Comentário
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-background p-3 border border-border">
                                <div className="text-sm font-mono whitespace-pre-wrap text-foreground">
                                    {previewComment}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Este será o comentário adicionado no documento
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Info sobre o processo */}
                <Alert className="bg-muted border-border">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-muted-foreground">
                        <strong>Como funciona:</strong> O sistema abrirá o documento selecionado,
                        clicará no botão "Open summary", adicionará o comentário com @mentions automáticos
                        das pessoas da equipe selecionada, e submeterá o comentário.
                    </AlertDescription>
                </Alert>
            </CardContent>
        </Card>
    );
};