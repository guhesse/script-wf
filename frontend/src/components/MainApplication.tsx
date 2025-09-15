import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  UserCheck,
  FolderOpen,
  MessageSquare,
  History,
  FolderDown
} from 'lucide-react';
import { ProgressIndicator } from './ProgressIndicator';
import { ProjectHistory } from './ProjectHistory';
import { CommentSection } from './CommentSection';
import { DocumentSharingSection } from './DocumentSharingSection';
import BulkDownload from './BulkDownload';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontFolder } from '@/types';

interface MainApplicationProps {
  onLogout: () => void;
}

export const MainApplication = ({ onLogout }: MainApplicationProps) => {
  const [projectUrl, setProjectUrl] = useState('');
  const [folders, setFolders] = useState<WorkfrontFolder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<'carol' | 'giovana'>('carol');
  const [currentProject, setCurrentProject] = useState<{ title?: string; dsid?: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'extract' | 'comment' | 'bulk-download' | 'history'>('extract');

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

  const { extractDocumentsWithProgress, clearCache, getProjectByUrl } = useWorkfrontApi();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="bg-card text-card-foreground border-b border-border">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold tracking-tight text-card-foreground">Workfront Sharing Manager</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Conectado</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutWithCacheClearing}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair e Limpar Cache
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative">
        {/* Progress Indicator */}
        <ProgressIndicator
          isVisible={showProgress}
          currentStep={currentProgressStep}
          steps={progressSteps}
        />

        {/* Main Content with Fixed Sidebar Layout */}
        <div className="flex h-[calc(100vh-73px)]">
          {/* Fixed Sidebar */}
          <div className="w-80 bg-card border-r border-border p-6 flex-shrink-0">
            <h3 className="text-lg font-semibold text-card-foreground mb-6 tracking-tight">Navegação</h3>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection('extract')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'extract'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <FolderOpen className="h-5 w-5" />
                <span className="font-medium">Extrair & Compartilhar</span>
              </button>
              <button
                onClick={() => setActiveSection('comment')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'comment'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="font-medium">Comentários</span>
              </button>
              <button
                onClick={() => setActiveSection('bulk-download')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'bulk-download'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <FolderDown className="h-5 w-5" />
                <span className="font-medium">Download em Massa</span>
              </button>
              <button
                onClick={() => setActiveSection('history')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'history'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <History className="h-5 w-5" />
                <span className="font-medium">Histórico</span>
              </button>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
              {/* Extract & Share Section */}
              {activeSection === 'extract' && (
                <DocumentSharingSection
                  projectUrl={projectUrl}
                  setProjectUrl={setProjectUrl}
                  folders={folders}
                  setFolders={setFolders}
                  selectedFiles={selectedFiles}
                  setSelectedFiles={setSelectedFiles}
                  selectedUser={selectedUser}
                  setSelectedUser={setSelectedUser}
                  currentProject={currentProject}
                  setCurrentProject={setCurrentProject}
                  onExtractDocuments={handleExtractDocuments}
                />
              )}


              {/* Comments Section */}
              {activeSection === 'comment' && (
                <CommentSection
                  projectUrl={projectUrl}
                  folders={folders}
                  currentProject={currentProject}
                />
              )}

              {/* Bulk Download Section */}
              {activeSection === 'bulk-download' && (
                <BulkDownload />
              )}

            {/* History Section */}
            {activeSection === 'history' && (
              <ProjectHistory
                onLoadProject={handleLoadProjectFromHistory}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};