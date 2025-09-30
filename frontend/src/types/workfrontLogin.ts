export type LoginPhase = 
    | 'IDLE'
    | 'STARTING'
    | 'LAUNCHING_BROWSER'
    | 'NAVIGATING'
    | 'AUTOMATIC_LOGIN'
    | 'WAITING_SSO'
    | 'DETECTED_BUTTON'
    | 'WAITING_DEVICE_CONFIRMATION'
    | 'DEVICE_CONFIRMED'
    | 'PERSISTING'
    | 'SUCCESS'
    | 'FAILED';export interface LoginProgressState {
    phase: LoginPhase;
    startedAt?: string;
    updatedAt?: string;
    attempts?: number;
    message?: string;
    error?: string;
    done?: boolean;
    success?: boolean;
}

export interface LoginStatusResponse {
    loggedIn: boolean;
    hasState: boolean;
    message?: string;
}

export interface LoginCredentials {
    email: string;
    workfrontPassword?: string;
    oktaPassword: string;
}

export interface StartLoginResponse {
    started: boolean;
    alreadyRunning?: boolean;
}
