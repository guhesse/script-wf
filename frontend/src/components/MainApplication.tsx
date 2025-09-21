import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  UserCheck,
  FolderOpen,
  History,
  FolderDown,
  FileText
} from 'lucide-react';
import { ProjectHistory } from './ProjectHistory';
import UploadSection from './UploadSection';
import BulkDownload from './BulkDownload';
import BriefingContentViewer from './BriefingContentViewer';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontFolder } from '@/types';

interface MainApplicationProps {
  onLogout: () => void;
}

export const MainApplication = ({ onLogout }: MainApplicationProps) => {
  const [projectUrl, setProjectUrl] = useState('');
  const [folders, setFolders] = useState<WorkfrontFolder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<'carol' | 'giovana' | 'test'>('carol');
  const [currentProject, setCurrentProject] = useState<{ title?: string; dsid?: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'upload' | 'extract' | 'bulk-download' | 'briefing-content' | 'history'>('upload');

  // Estado simples de carregamento
  const [showProgress, setShowProgress] = useState(false);


  const { extractDocuments, clearCache, getProjectByUrl } = useWorkfrontApi();

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
    return url && url.includes('workfront');
  };

  const handleExtractDocuments = async (urlToUse?: string) => {
    const urlToExtract = urlToUse || projectUrl;

    if (!isValidUrl(urlToExtract)) {
      return;
    }

    try {
      setShowProgress(true);
      const extractedFolders = await extractDocuments(urlToExtract);
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
              <h1 className="text-xl font-semibold tracking-tight text-card-foreground">VML Workfront Manager</h1>
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
        {/* Indicador simples de progresso */}
        {showProgress && (
          <div className="absolute inset-x-0 top-0 z-10">
            <div className="mx-auto my-2 w-fit rounded bg-muted px-3 py-1 text-sm text-muted-foreground border border-border">
              Processando extração do Workfront...
            </div>
          </div>
        )}

        {/* Main Content with Fixed Sidebar Layout */}
        <div className="flex h-[calc(100vh-73px)]">
          {/* Fixed Sidebar */}
          <div className="w-80 bg-card border-r border-border p-6 flex-shrink-0">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection('upload')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'upload'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <FolderOpen className="h-5 w-5" />
                <span className="font-medium">Asset Release</span>
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
                onClick={() => setActiveSection('briefing-content')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'briefing-content'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <FileText className="h-5 w-5" />
                <span className="font-medium">Conteúdo de Briefings</span>
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
            {/* Upload Section */}
            {activeSection === 'upload' && (
              <UploadSection
                projectUrl={projectUrl}
                setProjectUrl={setProjectUrl}
                selectedUser={selectedUser}
                setSelectedUser={setSelectedUser}
                currentProject={currentProject}
              />
            )}

            {/* Bulk Download Section */}
            {activeSection === 'bulk-download' && (
              <BulkDownload />
            )}

            {/* Briefing Content Section */}
            {activeSection === 'briefing-content' && (
              <BriefingContentViewer />
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