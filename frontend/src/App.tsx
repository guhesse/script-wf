import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { LoginScreen } from '@/components/LoginScreen';
import { MainApplication } from '@/components/MainApplication';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { isLoading, loadingMessage } = useWorkfrontApi();

  const handleLoginComplete = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

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
