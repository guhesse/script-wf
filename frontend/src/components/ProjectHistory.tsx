import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Clock,
  ExternalLink,
  RefreshCw,
  Archive,
  FileText,
  Calendar,
  Hash
} from 'lucide-react';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { WorkfrontProject } from '@/types';

interface ProjectHistoryProps {
  onLoadProject: (projectUrl: string) => void;
  className?: string;
}

export const ProjectHistory = ({ onLoadProject, className = '' }: ProjectHistoryProps) => {
  const [projects, setProjects] = useState<WorkfrontProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const { getProjectHistory } = useWorkfrontApi();

  const loadHistory = useCallback(async (pageNum = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await getProjectHistory(pageNum, 5);
      
      if (response.success) {
        setProjects(response.projects);
        setPage(response.pagination.page);
        setTotalPages(response.pagination.totalPages);
      } else {
        setError('Erro ao carregar histórico');
      }
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  }, [getProjectHistory]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const extractDSID = (title: string): string | null => {
    // Extrair DSID do formato: 2601G0179_0057_5297982 (Esses números são o DSID)
    const match = title.match(/(\d{7})/);
    return match ? match[1] : null;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleProjectClick = (project: WorkfrontProject) => {
    onLoadProject(project.url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Ativo';
      case 'COMPLETED':
        return 'Concluído';
      case 'ARCHIVED':
        return 'Arquivado';
      default:
        return status;
    }
  };

  if (loading && projects.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center text-purple-700">
            <Clock className="mr-2 h-5 w-5" />
            Histórico de Projetos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-600">Carregando histórico...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center text-purple-700">
            <Clock className="mr-2 h-5 w-5" />
            Histórico de Projetos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-700">
              {error}
            </AlertDescription>
          </Alert>
          <Button
            onClick={() => loadHistory()}
            variant="outline"
            size="sm"
            className="mt-3"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center text-purple-700">
            <Clock className="mr-2 h-5 w-5" />
            Histórico de Projetos
          </CardTitle>
          <Button
            onClick={() => loadHistory(page)}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Archive className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum projeto encontrado no histórico</p>
            <p className="text-sm mt-1">Extraia alguns documentos para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const dsid = extractDSID(project.title);
              
              return (
                <div
                  key={project.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50 transition-colors cursor-pointer"
                  onClick={() => handleProjectClick(project)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-gray-900 truncate max-w-md">
                          {project.title}
                        </span>
                      </div>
                      
                      {dsid && (
                        <div className="flex items-center gap-2 mb-2">
                          <Hash className="h-3 w-3 text-gray-500" />
                          <Badge 
                            variant="outline" 
                            className="text-xs bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectClick(project);
                            }}
                          >
                            DSID: {dsid}
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={getStatusColor(project.status)}>
                        {getStatusText(project.status)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(project.url, '_blank');
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Criado: {formatDate(project.createdAt)}</span>
                    </div>
                    {project.lastAccessedAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Último acesso: {formatDate(project.lastAccessedAt)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span>Acessos: {project.accessCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistory(page - 1)}
                  disabled={page <= 1 || loading}
                >
                  Anterior
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistory(page + 1)}
                  disabled={page >= totalPages || loading}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};