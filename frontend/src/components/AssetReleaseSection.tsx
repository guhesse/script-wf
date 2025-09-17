import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Search,
    FolderOpen,
    CheckCircle,
    UserCheck,
    FileText,
    Share,
    Link,
    File,
} from 'lucide-react';
import { FolderSection } from './FolderSection';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontFolder, ShareSelection, ShareResult, ShareAndCommentResponse, ShareAndCommentProjectResult } from '@/types';

interface AssetReleaseSectionProps {
    projectUrl: string;
    setProjectUrl: (url: string) => void;
    folders: WorkfrontFolder[];
    setFolders: (folders: WorkfrontFolder[]) => void;
    selectedFiles: Set<string>;
    setSelectedFiles: (files: Set<string>) => void;
    selectedUser: 'carol' | 'giovana' | 'test';
    setSelectedUser: (user: 'carol' | 'giovana' | 'test') => void;
    currentProject: { title?: string; dsid?: string } | null;
    setCurrentProject: (project: { title?: string; dsid?: string } | null) => void;
    onExtractDocuments: (urlToUse?: string) => Promise<void>;
}

export const AssetReleaseSection = ({
    projectUrl,
    setProjectUrl,
    folders,
    selectedFiles,
    setSelectedFiles,
    selectedUser,
    setSelectedUser,
    currentProject,
    onExtractDocuments
}: AssetReleaseSectionProps) => {
    const [shareResults, setShareResults] = useState<ShareResult[]>([]);
    const [combinedResults, setCombinedResults] = useState<ShareAndCommentProjectResult[] | null>(null);
    const [showResults, setShowResults] = useState(false);

    const { shareAndComment } = useWorkfrontApi();

    const isValidUrl = (url: string) => {
        return !!url && url.includes('workfront');
    };

    const handleFileToggle = (folderName: string, fileName: string) => {
        const fileKey = `${folderName}-${fileName}`;
        const newSelectedFiles = new Set(selectedFiles);

        if (newSelectedFiles.has(fileKey)) {
            newSelectedFiles.delete(fileKey);
        } else {
            newSelectedFiles.add(fileKey);
        }

        setSelectedFiles(newSelectedFiles);
    };

    const handleSelectAll = (folderName: string) => {
        const folder = folders.find(f => f.name === folderName);
        if (folder) {
            const newSelectedFiles = new Set(selectedFiles);
            folder.files.forEach(file => {
                newSelectedFiles.add(`${folderName}-${file.name}`);
            });
            setSelectedFiles(newSelectedFiles);
        }
    };

    const handleDeselectAll = (folderName: string) => {
        const folder = folders.find(f => f.name === folderName);
        if (folder) {
            const newSelectedFiles = new Set(selectedFiles);
            folder.files.forEach(file => {
                newSelectedFiles.delete(`${folderName}-${file.name}`);
            });
            setSelectedFiles(newSelectedFiles);
        }
    };

    const handleShareDocuments = async () => {
        const selections: ShareSelection[] = [];

        Array.from(selectedFiles).forEach(fileKey => {
            const [folderName, fileName] = fileKey.split('-', 2);
            selections.push({ folder: folderName, fileName });
        });

        try {
            const response = await shareAndComment({ projectUrl, selections, selectedUser, commentType: 'assetRelease', headless: false }) as ShareAndCommentResponse;
            setCombinedResults(response.results);
            // Mapear resultados de share para manter painel atual
            const flatShare: ShareResult[] = [];
            response.results.forEach(pr => pr.items.forEach(item => flatShare.push({
                folder: item.folder,
                fileName: item.fileName,
                success: item.share.success && item.comment.success,
                message: item.share.message || item.comment.message,
                error: item.share.error || item.comment.error,
            })));
            setShareResults(flatShare);
            setShowResults(true);
        } catch (error) {
            console.error('Erro no compartilhamento:', error);
        }
    };

    const getSelectionSummary = () => {
        const totalFiles = selectedFiles.size;
        const selectedFolders = new Set();

        Array.from(selectedFiles).forEach(fileKey => {
            const [folderName] = fileKey.split('-', 2);
            selectedFolders.add(folderName);
        });

        return { totalFiles, totalFolders: selectedFolders.size };
    };

    const summary = getSelectionSummary();

    return (
        <>
            {/* Step 1: Project URL */}
            <Card className="border-l-primary bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Link className="w-4 h-4 text-primary" />
                        Adicionar URL do Projeto
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">
                        Cole a URL da página de documentos do projeto Workfront para extrair a lista de arquivos.
                    </p>

                    {/* Informações do Projeto Atual */}
                    {currentProject && (
                        <div className="mb-4 p-4 bg-muted border border-border">
                            <h4 className="font-medium text-foreground mb-2 flex items-center">
                                <FileText className="mr-2 h-4 w-4" />
                                Projeto Atual
                            </h4>
                            <div className="space-y-2">
                                <p className="text-sm text-foreground">
                                    <strong>Título:</strong> {currentProject.title}
                                </p>
                                {currentProject.dsid && (
                                    <div className="flex items-center gap-2">
                                        <strong className="text-sm text-foreground">DSID:</strong>
                                        <Badge
                                            variant="outline"
                                            className="text-xs"
                                        >
                                            {currentProject.dsid}
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <Input
                            type="url"
                            value={projectUrl}
                            onChange={(e) => setProjectUrl(e.target.value)}
                            placeholder="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/project/..."
                            className="flex-1"
                        />
                        <Button
                            onClick={() => onExtractDocuments()}
                            disabled={!isValidUrl(projectUrl)}
                            className="px-6"
                        >
                            <Search className="mr-2 h-4 w-4" />
                            Extrair Documentos
                        </Button>
                    </div>
                    {projectUrl && !isValidUrl(projectUrl) && (
                        <p className="text-destructive text-sm mt-2">
                            URL deve ser da página de documentos do Workfront
                        </p>
                    )}
                </CardContent>
            </Card >

            {/* Step 2: File Selection */}
            < Card className="border-l-primary bg-card border-border" >
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <File className="w-4 h-4 text-primary" />
                        Selecionar Arquivos e Equipe
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Seleção de Equipe */}
                        <div>
                            <h4 className="font-semibold text-foreground mb-3">Selecionar Equipe para Compartilhamento:</h4>
                            <div className="flex gap-4">
                                <Button
                                    variant={selectedUser === 'carol' ? 'default' : 'secondary'}
                                    onClick={() => setSelectedUser('carol')}
                                    className="flex-1 justify-start"
                                >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Equipe Completa (Carolina)
                                    <Badge variant="secondary" className="ml-2">7 pessoas</Badge>
                                </Button>
                                <Button
                                    variant={selectedUser === 'giovana' ? 'default' : 'secondary'}
                                    onClick={() => setSelectedUser('giovana')}
                                    className="flex-1 justify-start"
                                >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Equipe Reduzida (Giovana)
                                    <Badge variant="secondary" className="ml-2">3 pessoas</Badge>
                                </Button>
                                <Button
                                    variant={selectedUser === 'test' ? 'default' : 'secondary'}
                                    onClick={() => setSelectedUser('test')}
                                    className="flex-1 justify-start"
                                >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Teste (Gustavo)
                                    <Badge variant="secondary" className="ml-2">1 pessoa</Badge>
                                </Button>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                {selectedUser === 'carol'
                                    ? 'Inclui: Yasmin, Gabriela, Eduarda, Evili, Giovanna, Natascha e Carolina'
                                    : selectedUser === 'giovana'
                                        ? 'Inclui: Luiza, Gislaine e Giovana'
                                        : 'Inclui: Gustavo Hesse'
                                }
                            </p>
                        </div>

                        {/* Seleção de Arquivos */}
                        <div>
                            <h4 className="font-semibold text-foreground mb-3">Selecionar Arquivos:</h4>
                            <p className="text-muted-foreground mb-4">
                                Marque os arquivos que deseja compartilhar com a equipe selecionada.
                            </p>

                            {folders.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <FolderOpen className="h-16 w-16 mx-auto mb-4" />
                                    <p>Adicione uma URL do projeto para ver os documentos disponíveis</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {folders.map((folder) => (
                                        <FolderSection
                                            key={folder.name}
                                            folder={folder}
                                            selectedFiles={selectedFiles}
                                            onFileToggle={handleFileToggle}
                                            onSelectAll={handleSelectAll}
                                            onDeselectAll={handleDeselectAll}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </ Card >

            {/* Step 3: Execution */}
            < Card className="border-l-primary bg-card border-border" >
                <CardHeader>
                    <CardTitle className="flex items-center text-card-foreground gap-3">
                        <Share className="w-4 h-4 text-primary" />
                        Compartilhar + Comentar (Fluxo Único)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">Executa o compartilhamento e adiciona o comentário padrão (Asset Release) para cada arquivo selecionado.</p>

                    <div className="flex justify-between items-center">
                        <div>
                            {summary.totalFiles === 0 ? (
                                <span className="text-muted-foreground">Nenhum arquivo selecionado</span>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="h-5 w-5 text-primary" />
                                        <span className="text-foreground font-medium">
                                            {summary.totalFiles} arquivo(s) selecionado(s) em {summary.totalFolders} pasta(s)
                                        </span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <UserCheck className="h-4 w-4 text-primary" />
                                        <span className="text-foreground text-sm">
                                            Equipe: {selectedUser === 'carol' ? 'Completa (Carolina)' : selectedUser === 'giovana' ? 'Reduzida (Giovana)' : 'Teste (Gustavo)'}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                            {selectedUser === 'carol' ? '7 pessoas' : selectedUser === 'giovana' ? '3 pessoas' : '1 pessoa'}
                                        </Badge>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={handleShareDocuments}
                            disabled={summary.totalFiles === 0}
                            size="lg"
                            className=""
                        >
                            <Share className="mr-2 h-4 w-4" />
                            Executar Fluxo
                        </Button>
                    </div>

                    {/* Results */}
                    {showResults && shareResults.length > 0 && (
                        <div className="mt-6">
                            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center">
                                <CheckCircle className="mr-2 h-5 w-5" />
                                Resultados do Fluxo
                            </h4>
                            {combinedResults && (
                                <div className="mb-4 text-sm text-muted-foreground">
                                    {combinedResults.map((proj, idx) => (
                                        <div key={idx} className="mb-1">
                                            <strong className="text-foreground">Projeto:</strong> {proj.projectUrl} — {proj.summary.success}/{proj.summary.total} OK, {proj.summary.errors} erros
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="space-y-2">
                                {shareResults.map((result, index) => (
                                    <Alert
                                        key={index}
                                        className={result.success ? 'border-primary/20 bg-primary/10' : 'border-destructive/20 bg-destructive/10'}
                                    >
                                        <AlertDescription className="flex items-center">
                                            <Badge
                                                variant={result.success ? 'default' : 'destructive'}
                                                className="mr-3"
                                            >
                                                {result.success ? 'Sucesso' : 'Erro'}
                                            </Badge>
                                            <strong className="mr-2">{result.fileName}</strong>
                                            <span className="text-muted-foreground">({result.folder})</span>
                                            <span className="ml-2">
                                                {result.success ? result.message : result.error}
                                            </span>
                                        </AlertDescription>
                                    </Alert>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </ Card >
        </>
    );
};