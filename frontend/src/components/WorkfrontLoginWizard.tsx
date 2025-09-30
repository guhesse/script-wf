import React from 'react';
import { useWorkfrontLoginProgress } from '../hooks/useWorkfrontLoginProgress';
import type { LoginPhase } from '../types/workfrontLogin';

interface Props {
  open: boolean;
  onClose: () => void;
}

const phaseLabels: Record<LoginPhase, string> = {
  IDLE: 'Aguardando',
  STARTING: 'Iniciando',
  OPENING_EXPERIENCE_CLOUD: 'Abrindo Adobe Experience Cloud',
  WAITING_SSO_MFA: 'Aguardando SSO / MFA',
  CHECKING_SESSION: 'Validando sessão',
  PERSISTING_STATE: 'Persistindo sessão',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou'
};

const isActivePhase = (phase: LoginPhase, current?: LoginPhase) => phase === current;

export const WorkfrontLoginWizard: React.FC<Props> = ({ open, onClose }) => {
  const { progress, status, running, error, alreadyRunning, start } = useWorkfrontLoginProgress();

  if (!open) return null;

  const currentPhase = progress?.phase || 'IDLE';
  const phases: LoginPhase[] = [
    'STARTING',
    'OPENING_EXPERIENCE_CLOUD',
    'WAITING_SSO_MFA',
    'CHECKING_SESSION',
    'PERSISTING_STATE',
    'COMPLETED'
  ];

  const showStartButton = !running && !progress?.done && currentPhase === 'IDLE' && !alreadyRunning && !status?.loggedIn;
  const alreadyLoggedIn = status?.loggedIn && progress?.phase !== 'COMPLETED';

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ marginTop: 0 }}>Login Workfront</h2>
        {alreadyLoggedIn && <div style={infoBox}>Sessão já ativa. Você pode fechar.</div>}
        {alreadyRunning && <div style={infoBox}>Um login já está em andamento — exibindo progresso.</div>}
        {error && <div style={errorBox}>Erro: {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
          {phases.map(p => {
            const label = phaseLabels[p];
            const active = isActivePhase(p, currentPhase as LoginPhase);
            const done = progress && (progress.phase === 'COMPLETED' || progress.phase === 'FAILED') && p === 'COMPLETED';
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot phase={p} active={active} current={currentPhase as LoginPhase} />
                <span>{label}</span>
                {active && progress?.message && <span style={{ fontSize: 12, opacity: 0.7 }}> - {progress.message}</span>}
                {done && progress?.success && <span style={{ fontSize: 12, color: 'green' }}> (ok)</span>}
                {done && !progress?.success && <span style={{ fontSize: 12, color: 'red' }}> (falhou)</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
          {showStartButton && <button onClick={() => start()}>Iniciar login</button>}
          {!showStartButton && !running && <button onClick={onClose}>Fechar</button>}
          {running && <button disabled style={{ opacity: 0.6 }}>Em andamento...</button>}
        </div>
      </div>
    </div>
  );
};

const StatusDot: React.FC<{ phase: LoginPhase; active: boolean; current: LoginPhase }> = ({ phase, active, current }) => {
  const base: React.CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#ccc',
    display: 'inline-block'
  };
  if (phase === 'COMPLETED' && current === 'COMPLETED') {
    return <span style={{ ...base, background: '#16a34a' }} />;
  }
  if (phase === 'COMPLETED') {
    return <span style={{ ...base, background: '#0ea5e9', opacity: 0.4 }} />;
  }
  if (active) {
    return <span style={{ ...base, background: '#2563eb', animation: 'pulse 1.2s ease-in-out infinite' }} />;
  }
  return <span style={base} />;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
};

const modalStyle: React.CSSProperties = {
  background: '#fff', padding: 24, borderRadius: 8, width: 480, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.35)', fontFamily: 'system-ui, sans-serif'
};

const infoBox: React.CSSProperties = {
  background: '#e0f2fe', color: '#075985', padding: '8px 10px', borderRadius: 4, fontSize: 13
};

const errorBox: React.CSSProperties = {
  background: '#fee2e2', color: '#991b1b', padding: '8px 10px', borderRadius: 4, fontSize: 13
};

export default WorkfrontLoginWizard;
