import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Share,
  LogOut,
  Search,
  FolderOpen,
  CheckCircle,
  UserCheck,
  Workflow,
  FileText,
  MessageSquare,
  History,
  FolderDown
} from 'lucide-react';
import { FolderSection } from './FolderSection';
import { ProgressIndicator } from './ProgressIndicator';
import { ProjectHistory } from './ProjectHistory';
import { CommentSection } from './CommentSection';
import BulkDownload from './BulkDownload';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontFolder, ShareSelection, ShareResult } from '@/types';

interface MainApplicationProps {
  onLogout: () => void;
}

export const MainApplication = ({ onLogout }: MainApplicationProps) => {
  const [projectUrl, setProjectUrl] = useState('');
  const [folders, setFolders] = useState<WorkfrontFolder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [shareResults, setShareResults] = useState<ShareResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<'carol' | 'giovana'>('carol');
  const [currentProject, setCurrentProject] = useState<{ title?: string; dsid?: string } | null>(null);

  // Estados para progresso
  const [showProgress, setShowProgress] = useState(false);
  const [currentProgressStep, setCurrentProgressStep] = useState<{
    step: string;
    message: string;
    progress: number;
    timestamp: string;
    data?: unknown;
  } | null>(null);
  const [progressSteps, setProgressSteps] = useState<Array<{
    step: string;
    message: string;
    progress: number;
    timestamp: string;
    data?: unknown;
  }>>([]);

  const { extractDocumentsWithProgress, shareDocuments, clearCache, getProjectByUrl } = useWorkfrontApi();

  const handleLogoutWithCacheClearing = async () => {
    try {
      await clearCache();
      onLogout();
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      // Mesmo se der erro na limpeza do cache, fazemos logout
      onLogout();
    }
  };

  const extractDSID = (title: string): string | null => {
    // Extrair DSID do formato: 2601G0179_0057_5297982 (Esses números são o DSID)
    const match = title.match(/(\d{7})/);
    return match ? match[1] : null;
  };

  const handleLoadProjectFromHistory = async (projectUrl: string) => {
    setProjectUrl(projectUrl);
    
    // Buscar informações do projeto no backend
    try {
      const project = await getProjectByUrl(projectUrl);
      if (project) {
        console.log('Projeto carregado do histórico:', project);
        setCurrentProject({
          title: project.title || 'Projeto Workfront',
          dsid: project.dsid || extractDSID(project.title || '') || undefined
        });
        // Extrair automaticamente os documentos
        await handleExtractDocuments(projectUrl);
      }
    } catch (error) {
      console.error('Erro ao carregar projeto do histórico:', error);
      // Mesmo com erro, tentamos extrair
      await handleExtractDocuments(projectUrl);
    }
  };

  const isValidUrl = (url: string) => {
    return url && url.includes('workfront') && url.includes('documents');
  };

  const handleExtractDocuments = async (urlToUse?: string) => {
    const urlToExtract = urlToUse || projectUrl;
    
    if (!isValidUrl(urlToExtract)) {
      return;
    }

    try {
      // Resetar estados
      setProgressSteps([]);
      setCurrentProgressStep(null);
      setShowProgress(true);
      setShowResults(false);

      // Callback para atualizar progresso
      const handleProgress = (step: string, message: string, progress: number, data?: unknown) => {
        const progressData = {
          step,
          message,
          progress,
          timestamp: new Date().toISOString(),
          data
        };

        setCurrentProgressStep(progressData);
        setProgressSteps(prev => [...prev, progressData]);
      };

      // Usar a extração com progresso
      const extractedFolders = await extractDocumentsWithProgress(urlToExtract, handleProgress);

      setFolders(extractedFolders);
      setSelectedFiles(new Set());
      setShowProgress(false);

    } catch (error) {
      console.error('Erro na extração:', error);
      setShowProgress(false);
    }
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
      const response = await shareDocuments(projectUrl, selections, selectedUser);
      setShareResults(response.results);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Share className="h-6 w-6" />
              <h1 className="text-xl font-bold">Workfront Sharing Manager</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <UserCheck className="h-4 w-4" />
                <span className="text-sm">Conectado</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutWithCacheClearing}
                className="text-white border-white hover:bg-white hover:text-blue-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair e Limpar Cache
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Process Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center">
            <Workflow className="mr-3 h-8 w-8 text-blue-600" />
            Processo de Compartilhamento
          </h2>
        </div>

        <div className="grid gap-6">
          {/* Progress Indicator */}
          <ProgressIndicator
            isVisible={showProgress}
            currentStep={currentProgressStep}
            steps={progressSteps}
          />

          {/* Main Content Tabs */}
          <Tabs defaultValue="extract" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="extract" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Extrair & Compartilhar
              </TabsTrigger>
              <TabsTrigger value="comment" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comentários
              </TabsTrigger>
              <TabsTrigger value="bulk-download" className="flex items-center gap-2">
                <FolderDown className="h-4 w-4" />
                Download em Massa
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

            {/* Tab Content: Extract & Share */}
            <TabsContent value="extract" className="space-y-6">

          {/* Step 1: Project URL */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader>
              <CardTitle className="flex items-center text-purple-700">
                <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center mr-3 text-sm font-bold">
                  1
                </div>
                Adicionar URL do Projeto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Cole a URL da página de documentos do projeto Workfront para extrair a lista de arquivos.
              </p>
              
              {/* Informações do Projeto Atual */}
              {currentProject && (
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-medium text-purple-800 mb-2 flex items-center">
                    <FileText className="mr-2 h-4 w-4" />
                    Projeto Atual
                  </h4>
                  <div className="space-y-1">
                    <p className="text-sm text-purple-700">
                      <strong>Título:</strong> {currentProject.title}
                    </p>
                    {currentProject.dsid && (
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-purple-700">DSID:</strong>
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-purple-100 text-purple-800 border-purple-200"
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
                  onClick={() => handleExtractDocuments()}
                  disabled={!isValidUrl(projectUrl)}
                  className="px-6"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Extrair Documentos
                </Button>
              </div>
              {projectUrl && !isValidUrl(projectUrl) && (
                <p className="text-amber-600 text-sm mt-2">
                  URL deve ser da página de documentos do Workfront
                </p>
              )}
            </CardContent>
          </Card>

          {/* Step 2: File Selection */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-700">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center mr-3 text-sm font-bold">
                  2
                </div>
                Selecionar Arquivos e Equipe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Seleção de Equipe */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3">Selecionar Equipe para Compartilhamento:</h4>
                  <div className="flex gap-4">
                    <Button
                      variant={selectedUser === 'carol' ? 'default' : 'outline'}
                      onClick={() => setSelectedUser('carol')}
                      className="flex-1 justify-start"
                    >
                      <UserCheck className="mr-2 h-4 w-4" />
                      Equipe Completa (Carolina)
                      <Badge variant="secondary" className="ml-2">7 pessoas</Badge>
                    </Button>
                    <Button
                      variant={selectedUser === 'giovana' ? 'default' : 'outline'}
                      onClick={() => setSelectedUser('giovana')}
                      className="flex-1 justify-start"
                    >
                      <UserCheck className="mr-2 h-4 w-4" />
                      Equipe Reduzida (Giovana)
                      <Badge variant="secondary" className="ml-2">3 pessoas</Badge>
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {selectedUser === 'carol'
                      ? 'Inclui: Yasmin, Gabriela, Eduarda, Evili, Giovanna, Natascha e Carolina'
                      : 'Inclui: Luiza, Gislaine e Giovana'
                    }
                  </p>
                </div>

                {/* Seleção de Arquivos */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3">Selecionar Arquivos:</h4>
                  <p className="text-gray-600 mb-4">
                    Marque os arquivos que deseja compartilhar com a equipe selecionada.
                  </p>

                  {folders.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FolderOpen className="h-16 w-16 mx-auto mb-4 text-gray-300" />
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
          </Card>

          {/* Step 3: Execution */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="flex items-center text-green-700">
                <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center mr-3 text-sm font-bold">
                  3
                </div>
                Executar Compartilhamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Execute o processo de compartilhamento para os arquivos selecionados.
              </p>

              <div className="flex justify-between items-center">
                <div>
                  {summary.totalFiles === 0 ? (
                    <span className="text-gray-500">Nenhum arquivo selecionado</span>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-green-700 font-medium">
                          {summary.totalFiles} arquivo(s) selecionado(s) em {summary.totalFolders} pasta(s)
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <UserCheck className="h-4 w-4 text-blue-500" />
                        <span className="text-blue-700 text-sm">
                          Equipe: {selectedUser === 'carol' ? 'Completa (Carolina)' : 'Reduzida (Giovana)'}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedUser === 'carol' ? '7 pessoas' : '3 pessoas'}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleShareDocuments}
                  disabled={summary.totalFiles === 0}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Share className="mr-2 h-4 w-4" />
                  Compartilhar Selecionados
                </Button>
              </div>

              {/* Results */}
              {showResults && shareResults.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-green-700 mb-3 flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Resultados do Compartilhamento
                  </h4>
                  <div className="space-y-2">
                    {shareResults.map((result, index) => (
                      <Alert
                        key={index}
                        className={result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}
                      >
                        <AlertDescription className="flex items-center">
                          <Badge
                            variant={result.success ? 'default' : 'destructive'}
                            className="mr-3"
                          >
                            {result.success ? 'Sucesso' : 'Erro'}
                          </Badge>
                          <strong className="mr-2">{result.fileName}</strong>
                          <span className="text-gray-600">({result.folder})</span>
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
          </Card>
            </TabsContent>

            {/* Tab Content: Comments */}
            <TabsContent value="comment" className="space-y-6">
              <CommentSection
                projectUrl={projectUrl}
                folders={folders}
                selectedUser={selectedUser}
                currentProject={currentProject}
              />
            </TabsContent>

            {/* Tab Content: Bulk Download */}
            <TabsContent value="bulk-download" className="space-y-6">
              <BulkDownload />
            </TabsContent>

            {/* Tab Content: History */}
            <TabsContent value="history" className="space-y-6">
              <ProjectHistory 
                onLoadProject={handleLoadProjectFromHistory}
                className="border-l-4 border-l-indigo-500"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};