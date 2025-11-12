import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  UserCheck,
  FolderOpen,
  FolderDown,
  FileText,
  GalleryHorizontal,
  MessageSquare,
  FileSearch
} from 'lucide-react';
import UploadSection from './UploadSection';
import BulkDownload from './BulkDownload';
import BriefingContentViewer from './BriefingContentViewer';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import MastersGallery from './MastersGallery';
import { useAppAuth } from '@/hooks/useAppAuth';
import CommentsGenerator from './CommentsGenerator';
import OverviewExtractor from './OverviewExtractor';

interface MainApplicationProps {
  onLogout: () => void;
  wfReady: boolean;
  onWfReconnect: () => void;
}

export const MainApplication = ({ onLogout, wfReady, onWfReconnect }: MainApplicationProps) => {
  // Restaurar estados salvos do localStorage
  const [projectUrl, setProjectUrl] = useState(() => {
    try { return localStorage.getItem('wf_projectUrl') || ''; } catch { return ''; }
  });
  const [selectedUser, setSelectedUser] = useState<'carol' | 'giovana' | 'test'>(() => {
    try {
      const saved = localStorage.getItem('wf_selectedUser');
      return (saved === 'carol' || saved === 'giovana' || saved === 'test') ? saved : 'carol';
    } catch { return 'carol'; }
  });
  const [currentProject, setCurrentProject] = useState<{ title?: string; dsid?: string } | null>(() => {
    try {
      const saved = localStorage.getItem('wf_currentProject');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeSection, setActiveSection] = useState<'upload' | 'extract' | 'bulk-download' | 'briefing-content' | 'masters' | 'comments' | 'overview' | 'kanban'>(() => {
    try {
      const saved = localStorage.getItem('wf_activeSection');
      return (saved === 'upload' || saved === 'extract' || saved === 'bulk-download' || saved === 'briefing-content' || saved === 'masters' || saved === 'comments' || saved === 'overview' || saved === 'kanban') ? saved : 'upload';
    } catch { return 'upload'; }
  });

  // Persistir estados no localStorage quando mudarem
  useEffect(() => {
    try { localStorage.setItem('wf_projectUrl', projectUrl); } catch { /* ignore */ }
  }, [projectUrl]);

  useEffect(() => {
    try { localStorage.setItem('wf_selectedUser', selectedUser); } catch { /* ignore */ }
  }, [selectedUser]);

  useEffect(() => {
    try {
      if (currentProject) {
        localStorage.setItem('wf_currentProject', JSON.stringify(currentProject));
      } else {
        localStorage.removeItem('wf_currentProject');
      }
    } catch { /* ignore */ }
  }, [currentProject]);

  useEffect(() => {
    try { localStorage.setItem('wf_activeSection', activeSection); } catch { /* ignore */ }
  }, [activeSection]);

  const { clearCache } = useWorkfrontApi();
  const { logout: logoutApp, user } = useAppAuth();

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
                <span className="text-sm text-muted-foreground">{user?.name || 'Usuário'}</span>
              </div>
              {/* Indicador de status do Workfront */}
              {wfReady ? (
                <>
                  <div className="text-xs text-green-500 border border-green-600/40 px-2 py-0.5 rounded">Workfront OK</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogoutWithCacheClearing}
                    title="Limpar cache e reconectar Workfront"
                  >
                    Desconectar WF
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onWfReconnect}
                  className="border-amber-600/40 text-amber-500 hover:bg-amber-900/20"
                >
                  Login Workfront
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={logoutApp}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair da Aplicação
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative">
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
                <span className="font-medium">Conteúdo DSID</span>
              </button>
              <button
                onClick={() => setActiveSection('masters')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'masters'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <GalleryHorizontal className="h-5 w-5" />
                <span className="font-medium">Masters</span>
              </button>
              <button
                onClick={() => setActiveSection('comments')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'comments'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="font-medium">Comentários Workfront</span>
              </button>
              <button
                onClick={() => setActiveSection('overview')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 ${activeSection === 'overview'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <FileSearch className="h-5 w-5" />
                <span className="font-medium">Extrator de Overview</span>
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

            {activeSection === 'masters' && (
              <MastersGallery />
            )}

            {/* Comments Generator Section */}
            {activeSection === 'comments' && (
              <CommentsGenerator />
            )}

            {/* Overview Extractor Section */}
            {activeSection === 'overview' && (
              <OverviewExtractor />
            )}

          </div>
        </div>
      </div>
    </div>
  );
};