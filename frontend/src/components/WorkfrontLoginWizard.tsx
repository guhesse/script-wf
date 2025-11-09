import React, { useState, useEffect } from 'react';
import { useWorkfrontLoginProgress } from '../hooks/useWorkfrontLoginProgress';
import { useCredentialManager } from '../hooks/useCredentialManager';
import type { LoginPhase, LoginCredentials } from '../types/workfrontLogin';
import {
  Loader2,
  Chrome,
  Globe,
  LogIn,
  Wifi,
  Smartphone,
  CheckCircle,
  Save,
  X,
  Rocket,
  Key
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Mapeamento de fases para ícones e labels
const phaseConfig: Record<LoginPhase, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  IDLE: { icon: Globe, label: 'Aguardando' },
  STARTING: { icon: Rocket, label: 'Iniciando processo' },
  LAUNCHING_BROWSER: { icon: Chrome, label: 'Abrindo navegador' },
  NAVIGATING: { icon: Globe, label: 'Navegando para Adobe' },
  AUTOMATIC_LOGIN: { icon: LogIn, label: 'Login automático' },
  WAITING_SSO: { icon: Wifi, label: 'Aguardando SSO' },
  DETECTED_BUTTON: { icon: CheckCircle, label: 'Sessão detectada' },
  WAITING_DEVICE_CONFIRMATION: { icon: Smartphone, label: 'Autenticação necessária' },
  DEVICE_CONFIRMED: { icon: CheckCircle, label: 'Confirmação recebida' },
  PERSISTING: { icon: Save, label: 'Salvando sessão' },
  SUCCESS: { icon: CheckCircle, label: 'Concluído' },
  FAILED: { icon: X, label: 'Falhou' }
};

export const WorkfrontLoginWizard: React.FC<Props> = ({ open, onClose }) => {
  const [headlessMode, setHeadlessMode] = useState(true);
  const [credentials, setCredentials] = useState<LoginCredentials>({ email: '', workfrontPassword: '', oktaPassword: '' });
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const { progress, status, running, error, alreadyRunning, start, cancel } = useWorkfrontLoginProgress();
  const { isSupported, getWorkfrontCredentials, saveWorkfrontCredentials } = useCredentialManager();

  // Carrega credenciais salvas ao abrir o modal
  useEffect(() => {
    const loadSavedCredentials = async () => {
      if (open && !credentialsLoaded) {
        const saved = await getWorkfrontCredentials();
        if (saved) {
          setCredentials(saved);
          setCredentialsLoaded(true);
        }
      }
    };
    loadSavedCredentials();
  }, [open, credentialsLoaded, getWorkfrontCredentials]);

  const currentPhase = progress?.phase || 'IDLE';
  const showStartButton = !running && !progress?.done && currentPhase === 'IDLE' && !alreadyRunning && !status?.loggedIn;
  const alreadyLoggedIn = status?.loggedIn && progress?.phase !== 'SUCCESS';

  const handleLogin = async () => {
    if (!credentials.email || !credentials.workfrontPassword || !credentials.oktaPassword) {
      alert('Por favor, preencha todos os campos');
      return;
    }

    // Salva credenciais antes de iniciar o login
    if (isSupported) {
      await saveWorkfrontCredentials({
        email: credentials.email,
        workfrontPassword: credentials.workfrontPassword,
        oktaPassword: credentials.oktaPassword,
      });
    }

    await start({
      credentials,
      headless: headlessMode
    });
  };

  if (!open) return null;

  const CurrentIcon = phaseConfig[currentPhase]?.icon || Globe;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-[480px] p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">Login Workfront</h2>

        {alreadyLoggedIn && (
          <div className="bg-primary/10 text-primary border border-primary/20 px-3 py-2 rounded text-sm mb-4">
            Sessão já ativa. Você pode fechar.
          </div>
        )}

        {/* Campos de credenciais - sempre visíveis */}
        <div className="space-y-4 mb-6">
          {credentialsLoaded && (
            <div className="flex items-center space-x-2 text-xs text-primary bg-primary/10 px-3 py-2 rounded border border-primary/20">
              <Key className="w-3 h-3" />
              <span>Credenciais carregadas automaticamente</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Email Adobe Experience Cloud
            </label>
            <input
              type="email"
              value={credentials.email}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              disabled={running}
              autoComplete="email"
              className="w-full px-3 py-2 bg-input border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="seu.email@empresa.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Senha Workfront
            </label>
            <input
              type="password"
              value={credentials.workfrontPassword}
              onChange={(e) => setCredentials({ ...credentials, workfrontPassword: e.target.value })}
              disabled={running}
              autoComplete="workfront-password"
              className="w-full px-3 py-2 bg-input border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Sua senha do Workfront"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Senha Okta
            </label>
            <input
              type="password"
              value={credentials.oktaPassword}
              onChange={(e) => setCredentials({ ...credentials, oktaPassword: e.target.value })}
              disabled={running}
              autoComplete="okta-password"
              className="w-full px-3 py-2 bg-input border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Sua senha do Okta"
            />
          </div>

          {isSupported && !credentialsLoaded && (
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Key className="w-3 h-3" />
              <span>Suas credenciais serão salvas após o login</span>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="headless"
              checked={headlessMode}
              onChange={(e) => setHeadlessMode(e.target.checked)}
              disabled={running}
              className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded disabled:opacity-50"
            />
            <label htmlFor="headless" className="text-sm text-muted-foreground">
              Modo invisível
            </label>
          </div>
        </div>

        {/* Botões de ação */}
        {showStartButton && (
          <button
            onClick={handleLogin}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors mb-4"
          >
            Iniciar Login
          </button>
        )}

        {running && (
          <button
            onClick={cancel}
            className="w-full bg-destructive/20 hover:bg-destructive/30 text-destructive px-4 py-2 rounded-md font-medium transition-colors border border-destructive/20 mb-4"
          >
            Cancelar Login
          </button>
        )}

        {/* Status atual - apenas o passo ativo */}
        {running && currentPhase && currentPhase !== 'IDLE' && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CurrentIcon className="w-5 h-5 text-primary" />
                <span className="font-medium text-primary">
                  {phaseConfig[currentPhase]?.label || 'Processando...'}
                </span>
              </div>

              {/* Loading no canto direito */}
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>

            {progress?.message && (
              <p className="text-sm text-muted-foreground mt-2 ml-8">
                {progress.message}
              </p>
            )}

            {error && (
              <div className="mt-3 ml-8 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Estados finais */}
        {(progress?.done && currentPhase === 'SUCCESS') && (
          <div className="space-y-4">
            <div className="bg-primary/10 text-primary border border-primary/20 px-3 py-2 rounded text-sm flex items-center space-x-2">
              <CheckCircle className="w-4 h-4" />
              <span>Login realizado com sucesso!</span>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors"
            >
              Fechar
            </button>
          </div>
        )}

        {(progress?.done && currentPhase === 'FAILED') && (
          <div className="space-y-4">
            <div className="bg-destructive/10 text-destructive border border-destructive/20 px-3 py-2 rounded text-sm flex items-center space-x-2">
              <X className="w-4 h-4" />
              <span>{error || 'Falha no login'}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors text-sm"
              >
                Tentar Novamente
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-muted hover:bg-muted/80 text-muted-foreground px-4 py-2 rounded-md font-medium transition-colors text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {!running && !progress?.done && currentPhase === 'IDLE' && !showStartButton && (
          <button
            onClick={onClose}
            className="w-full bg-muted hover:bg-muted/80 text-muted-foreground px-4 py-2 rounded-md font-medium transition-colors"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};