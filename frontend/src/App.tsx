import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { MainApplication } from '@/components/MainApplication';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AuthScreen } from '@/components/AuthScreen';
import { WorkfrontLoginWizard } from '@/components/WorkfrontLoginWizard';
import { useAuthInterceptor } from '@/hooks/useAuthInterceptor';

function App() {
  // Auth da aplicação (JWT)
  const { user, loading: userLoading } = useAppAuth();
  
  // Interceptor de autenticação (401 = logout automático)
  useAuthInterceptor();
  
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
        <AuthScreen onAuthenticated={() => { }} registerEnabled={true} />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <>
      <LoadingOverlay isVisible={isLoading} message={loadingMessage} />
      <MainApplication 
        onLogout={() => { /* handled inside main */ }} 
        wfReady={wfReady}
        onWfReconnect={() => setShowLoginWizard(true)}
      />
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
