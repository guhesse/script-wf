import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { MainApplication } from '@/components/MainApplication';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { WorkfrontLoginWizard } from '@/components/WorkfrontLoginWizard';

function App() {
  // Auth da aplicação (JWT)
  const { user, loading: userLoading } = useAppAuth();
  // Sessão Workfront
  const [wfReady, setWfReady] = useState(false);
  const [showLoginWizard, setShowLoginWizard] = useState(false);
  const { isLoading, loadingMessage, checkLoginStatus } = useWorkfrontApi();

  // Aplicar tema escuro
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  useEffect(() => {
    if (!user) return; // só checa Workfront se app autenticado
    (async () => {
      try {
        const status = await checkLoginStatus();
        setWfReady(!!status.loggedIn);
      } catch {
        setWfReady(false);
      }
    })();
  }, [user, checkLoginStatus]);

  // Enquanto carrega sessão app
  if (userLoading) {
    return (
      <>
        <LoadingOverlay isVisible={true} message="Carregando sessão..." />
        <Toaster position="bottom-right" />
      </>
    );
  }

  // Se não autenticado na aplicação -> tela Auth (login/registro)
  if (!user) {
    return (
      <>
        <AuthScreen onAuthenticated={() => {}} registerEnabled={true} />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <>
      <LoadingOverlay isVisible={isLoading} message={loadingMessage} />
      {!wfReady && (
        <div className="fixed top-2 right-2 z-50 bg-amber-900/60 border border-amber-600/40 backdrop-blur px-4 py-2 rounded text-xs text-amber-200 shadow">
          <div className="flex items-center gap-3">
            <span>Workfront não conectado</span>
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={() => setShowLoginWizard(true)}
            >
              Login Workfront
            </Button>
          </div>
        </div>
      )}
      <MainApplication onLogout={() => { /* handled inside main */ }} />
      <WorkfrontLoginWizard 
        open={showLoginWizard} 
        onClose={() => {
          setShowLoginWizard(false);
          // Recheck login status after wizard closes
          checkLoginStatus().then(status => {
            setWfReady(!!status.loggedIn);
          }).catch(() => setWfReady(false));
        }} 
      />
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
