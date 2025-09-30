import React, { useState } from 'react';
import { useWorkfrontLoginProgress } from '../hooks/useWorkfrontLoginProgress';
import type { LoginPhase, LoginCredentials } from '../types/workfrontLogin';
import { HeadlessToggle } from './HeadlessToggle';
import { debugHeadless } from '../services/workfrontLoginService';

interface Props {
  open: boolean;
  onClose: () => void;
}

const phaseLabels: Record<LoginPhase, string> = {
  IDLE: 'Aguardando',
  STARTING: 'Iniciando',
  LAUNCHING_BROWSER: 'Lançando navegador',
  NAVIGATING: 'Abrindo Adobe Experience Cloud',
  AUTOMATIC_LOGIN: 'Inserindo credenciais automaticamente',
  WAITING_SSO: 'Aguardando SSO / MFA',
  DETECTED_BUTTON: 'Sessão detectada',
  WAITING_DEVICE_CONFIRMATION: '📱 Aguardando confirmação no dispositivo',
  DEVICE_CONFIRMED: '✅ Confirmação recebida',
  PERSISTING: 'Persistindo sessão',
  SUCCESS: 'Concluído',
  FAILED: 'Falhou'
};

const isActivePhase = (phase: LoginPhase, current?: LoginPhase) => phase === current;

export const WorkfrontLoginWizard: React.FC<Props> = ({ open, onClose }) => {
  const [headlessMode, setHeadlessMode] = useState(true); // Default headless para melhor UX
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: 'gustavo.hesse@vml.com',
    workfrontPassword: 'UDbYFBH5avYKF@v',
    oktaPassword: 'UDbYFBH5avYKF@v'
  });
  const { progress, status, running, error, alreadyRunning, start, cancel } = useWorkfrontLoginProgress();

  const handleDebugHeadless = async () => {
    try {
      console.log(`🐛 Frontend - headlessMode atual: ${headlessMode}`);
      console.log(`🐛 Frontend - enviando override: ${!headlessMode}`);
      
      const result = await debugHeadless(!headlessMode);
      console.log('🐛 Debug Headless Result:', result);
      
      // Teste mais detalhado
      const detailedInfo = {
        frontendState: {
          headlessMode,
          sendingOverride: !headlessMode,
          credentialsProvided: !!credentials.email,
        },
        backendResponse: result,
      };
      
      console.log('🐛 Análise Completa:', detailedInfo);
      alert(`Debug Headless:\n\nFrontend:\n- Modo atual: ${headlessMode ? 'Headless' : 'Visível'}\n- Enviando: ${!headlessMode ? 'Visível' : 'Headless'}\n\nBackend:\n- Default: ${result.tests.defaultResolve}\n- Com override: ${result.tests.queryParamTest}\n- Env: ${result.environment.NODE_ENV}`);
    } catch (error) {
      console.error('Erro no debug headless:', error);
      alert(`Erro no debug: ${error}`);
    }
  };

  if (!open) return null;

  const currentPhase = progress?.phase || 'IDLE';
  const phases: LoginPhase[] = [
    'STARTING',
    'LAUNCHING_BROWSER',
    'NAVIGATING',
    'AUTOMATIC_LOGIN',
    'WAITING_SSO',
    'DETECTED_BUTTON',
    'WAITING_DEVICE_CONFIRMATION',
    'DEVICE_CONFIRMED',
    'PERSISTING',
    'SUCCESS'
  ];

  const showStartButton = !running && !progress?.done && currentPhase === 'IDLE' && !alreadyRunning && !status?.loggedIn;
  const alreadyLoggedIn = status?.loggedIn && progress?.phase !== 'SUCCESS';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-[480px] p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">Login Workfront</h2>
        {alreadyLoggedIn && (
          <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-2 rounded text-sm mb-4">
            Sessão já ativa. Você pode fechar.
          </div>
        )}
        {alreadyRunning && (
          <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-2 rounded text-sm mb-4">
            <div className="flex justify-between items-center">
              <span>Um login já está em andamento — exibindo progresso.</span>
              <button 
                onClick={cancel}
                className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded hover:bg-red-500/30"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2 rounded text-sm mb-4">
            Erro: {error}
          </div>
        )}

        {showStartButton && (
          <>
            <div className="space-y-3 mb-4 p-4 border border-border rounded-lg bg-muted/20">
              <h3 className="text-sm font-medium text-foreground">Credenciais de Login</h3>
              
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Email (Workfront/Okta)
                </label>
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="seu.email@empresa.com"
                  disabled={running}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">
                    Senha Workfront
                  </label>
                  <input
                    type="password"
                    value={credentials.workfrontPassword}
                    onChange={(e) => setCredentials(prev => ({ ...prev, workfrontPassword: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="••••••••"
                    disabled={running}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">
                    Senha Okta
                  </label>
                  <input
                    type="password"
                    value={credentials.oktaPassword}
                    onChange={(e) => setCredentials(prev => ({ ...prev, oktaPassword: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="••••••••"
                    disabled={running}
                  />
                </div>
              </div>
            </div>

            <HeadlessToggle
              enabled={headlessMode}
              onChange={setHeadlessMode}
              disabled={running}
            />
          </>
        )}

        <div className="flex flex-col gap-2 my-4">
          {phases.map(p => {
            const label = phaseLabels[p];
            const active = isActivePhase(p, currentPhase as LoginPhase);
            const done = progress && (progress.phase === 'SUCCESS' || progress.phase === 'FAILED') && p === 'SUCCESS';
            return (
              <div key={p} className="flex items-center gap-2 text-sm">
                <StatusDot phase={p} active={active} current={currentPhase as LoginPhase} />
                <span className="text-foreground">{label}</span>
                {active && progress?.message && (
                  <span className="text-xs text-muted-foreground"> - {progress.message}</span>
                )}
                {done && progress?.success && (
                  <span className="text-xs text-green-400"> (ok)</span>
                )}
                {done && !progress?.success && (
                  <span className="text-xs text-red-400"> (falhou)</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Mensagem especial para aguardando confirmação no dispositivo */}
        {currentPhase === 'WAITING_DEVICE_CONFIRMATION' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-400 text-lg">📱</span>
              <span className="text-blue-400 font-medium">Confirmação Necessária</span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Uma notificação foi enviada para seu dispositivo móvel. 
            </p>
            <p className="text-xs text-muted-foreground">
              Por favor, verifique seu celular e confirme a notificação para continuar.
            </p>
            <div className="flex justify-center mt-3">
              <div className="animate-pulse w-2 h-2 bg-blue-400 rounded-full"></div>
              <div className="animate-pulse w-2 h-2 bg-blue-400 rounded-full mx-1 animation-delay-200"></div>
              <div className="animate-pulse w-2 h-2 bg-blue-400 rounded-full animation-delay-400"></div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-between mt-4">
          <div>
            {/* Botão de debug - só em desenvolvimento */}
            {process.env.NODE_ENV === 'development' && (
              <button 
                onClick={handleDebugHeadless}
                className="px-3 py-1 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded hover:bg-yellow-500/30 transition-colors"
                disabled={running}
              >
                🐛 Debug Headless
              </button>
            )}
          </div>
          
          <div className="flex gap-3">
            {showStartButton && (
              <button 
                onClick={() => {
                  console.log('🐛 FRONTEND - Clicando em Iniciar Login');
                  console.log('🐛 FRONTEND - headlessMode:', headlessMode);
                  console.log('🐛 FRONTEND - credentials:', credentials);
                  console.log('🐛 FRONTEND - credentials.email existe:', !!credentials.email);
                  console.log('🐛 FRONTEND - credentials será enviado:', credentials.email ? credentials : undefined);
                  
                  const loginOptions = { 
                    headless: headlessMode,
                    credentials: credentials.email ? credentials : undefined
                  };
                  
                  console.log('🐛 FRONTEND - loginOptions final:', loginOptions);
                  start(loginOptions);
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!credentials.email || !credentials.oktaPassword}
              >
                Iniciar login
              </button>
            )}
            {!showStartButton && !running && (
              <button 
                onClick={onClose}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
              >
                Fechar
              </button>
            )}
            {running && (
              <button 
                disabled 
                className="px-4 py-2 bg-muted text-muted-foreground rounded-md opacity-60 cursor-not-allowed"
              >
                Em andamento...
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusDot: React.FC<{ phase: LoginPhase; active: boolean; current: LoginPhase }> = ({ phase, active, current }) => {
  const baseClasses = "w-3 h-3 rounded-full inline-block";
  
  if (phase === 'SUCCESS' && current === 'SUCCESS') {
    return <span className={`${baseClasses} bg-green-500`} />;
  }
  if (phase === 'SUCCESS') {
    return <span className={`${baseClasses} bg-blue-500 opacity-40`} />;
  }
  if (active) {
    return <span className={`${baseClasses} bg-blue-600 animate-pulse`} />;
  }
  return <span className={`${baseClasses} bg-muted-foreground/30`} />;
};

export default WorkfrontLoginWizard;
