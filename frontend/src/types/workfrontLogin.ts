export type LoginPhase =
    | 'IDLE'
    | 'STARTING'
    | 'OPENING_EXPERIENCE_CLOUD'
    | 'WAITING_SSO_MFA'
    | 'CHECKING_SESSION'
    | 'PERSISTING_STATE'
    | 'COMPLETED'
    | 'FAILED';

export interface LoginProgressState {
    phase: LoginPhase;
    startedAt: string | null;
    updatedAt: string | null;
    attempts: number;
    message?: string;
    error?: string;
    done: boolean;
    success: boolean;
}

export interface LoginStatusResponse {
    loggedIn: boolean;
    hasState: boolean;
    message?: string;
}

export interface StartLoginResponse {
    started: boolean;
    alreadyRunning?: boolean;
}
