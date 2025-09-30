export enum LoginPhase {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  LAUNCHING_BROWSER = 'LAUNCHING_BROWSER',
  NAVIGATING = 'NAVIGATING',
  WAITING_SSO = 'WAITING_SSO',
  DETECTED_BUTTON = 'DETECTED_BUTTON',
  PERSISTING = 'PERSISTING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export interface LoginProgressState {
  phase: LoginPhase;
  startedAt?: string;
  updatedAt?: string;
  attempts?: number;
  message?: string;
  error?: string;
  done?: boolean;
}

export const initialProgress = (): LoginProgressState => ({
  phase: LoginPhase.IDLE,
  attempts: 0,
  startedAt: undefined,
  updatedAt: undefined,
  message: undefined,
  error: undefined,
  done: true
});