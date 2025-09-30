import type { LoginProgressState, LoginStatusResponse, StartLoginResponse } from '../types/workfrontLogin';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        credentials: 'include',
        ...options,
    });
    if (!res.ok) {
        let message: string | undefined;
        try {
            const body = await res.json() as { message?: string; error?: string };
            message = body.message || body.error;
        } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
    }
    return res.json();
}

export async function startLogin(): Promise<StartLoginResponse> {
    try {
        return await http<StartLoginResponse>('/login/start', { method: 'POST', body: JSON.stringify({}) });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('409')) {
            return { started: false, alreadyRunning: true };
        }
        throw e;
    }
}

export async function getLoginProgress(): Promise<LoginProgressState> {
    return http<LoginProgressState>('/login-progress');
}

export async function getLoginStatus(): Promise<LoginStatusResponse> {
    return http<LoginStatusResponse>('/login-status');
}

export interface UseLoginProgressOptions {
    intervalMs?: number;
    backoffFactor?: number;
    maxIntervalMs?: number;
}
