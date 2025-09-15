import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { LoginScreen } from '@/components/LoginScreen';
import { MainApplication } from '@/components/MainApplication';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { isLoading, loadingMessage, checkLoginStatus } = useWorkfrontApi();

  // Aplicar tema escuro automaticamente
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Verificar automaticamente se usuário já está logado ao iniciar a aplicação
  useEffect(() => {
    const checkInitialLoginStatus = async () => {
      try {
        const status = await checkLoginStatus();
        if (status.loggedIn) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error('Erro ao verificar status inicial de login:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkInitialLoginStatus();
  }, [checkLoginStatus]);

  const handleLoginComplete = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  // Mostrar loading enquanto verifica o status de autenticação inicial
  if (isCheckingAuth) {
    return (
      <>
        <LoadingOverlay isVisible={true} message="Verificando autenticação..." />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <>
      <LoadingOverlay isVisible={isLoading} message={loadingMessage} />
      
      {isLoggedIn ? (
        <MainApplication onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginComplete={handleLoginComplete} />
      )}
      
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
