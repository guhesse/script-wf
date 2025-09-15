import { useEffect, useState } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkfrontApi } from '@/hooks/useWorkfrontApi';
import type { LoginStatusResponse } from '@/types';

interface LoginScreenProps {
  onLoginComplete: () => void;
}

export const LoginScreen = ({ onLoginComplete }: LoginScreenProps) => {
  const [loginStatus, setLoginStatus] = useState<LoginStatusResponse | null>(null);
  const { checkLoginStatus, login } = useWorkfrontApi();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await checkLoginStatus();
        setLoginStatus(status);
        
        // Auto-redirecionar se já estiver logado
        if (status.loggedIn) {
          setTimeout(() => {
            onLoginComplete();
          }, 1000); // Pequeno delay para mostrar o status antes de redirecionar
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    };

    checkStatus();
  }, [checkLoginStatus, onLoginComplete]);

  const handleLogin = async () => {
    try {
      await login();
      const status = await checkLoginStatus();
      setLoginStatus(status);
    } catch (error) {
      console.error('Erro no login:', error);
    }
  };

  const getStatusIndicator = () => {
    if (!loginStatus) return { color: 'bg-gray-500', text: 'Verificando status...' };
    
    if (loginStatus.loggedIn) {
      return { 
        color: 'bg-green-500', 
        text: `Conectado (há ${loginStatus.hoursAge}h)` 
      };
    } else {
      return { color: 'bg-red-500', text: 'Não conectado' };
    }
  };

  const status = getStatusIndicator();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-blue-600 mb-3">
              Workfront Sharing Manager
            </h1>
            <p className="text-gray-600 mb-6">
              Interface visual para compartilhamento de documentos no Workfront.
              Primeiro, você precisa fazer login no sistema.
            </p>
            
            <div className="mb-6">
              <div className="flex items-center justify-center mb-2">
                <div className={`w-3 h-3 -full ${status.color} mr-2`} />
                <span className="text-sm text-gray-600">{status.text}</span>
              </div>
            </div>
            
            {loginStatus?.loggedIn ? ( 
              <div className="space-y-4">
                <div className="text-center">
                  <div className="animate-spin -full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-sm text-gray-600 mb-4">
                    Você já está conectado! Redirecionando para o dashboard...
                  </p>
                </div>
                <Button 
                  onClick={onLoginComplete}
                  size="lg" 
                  className="w-full"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Ir para Dashboard Agora
                </Button>
              </div>
            ) : (
              <Button 
                onClick={handleLogin}
                size="lg" 
                className="w-full"
                disabled={!loginStatus}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Fazer Login no Workfront
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};