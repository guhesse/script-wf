import type { LoginProgressState, LoginStatusResponse, StartLoginResponse, LoginCredentials } from '../types/workfrontLogin';

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

export async function startLogin(options?: { headless?: boolean; credentials?: LoginCredentials }): Promise<StartLoginResponse> {
    try {
        const headlessParam = options?.headless !== undefined ? `?headless=${options.headless}` : '';
        const body = options?.credentials ? JSON.stringify(options.credentials) : JSON.stringify({});
        
        console.log(`🐛 LOGIN SERVICE - Enviando requisição:`);
        console.log(`🐛   - URL: /login/start${headlessParam}`);
        console.log(`🐛   - headless option: ${options?.headless}`);
        console.log(`🐛   - credentials provided: ${!!options?.credentials?.email}`);
        
        return await http<StartLoginResponse>(`/login/start${headlessParam}`, { method: 'POST', body });
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

interface DebugHeadlessResponse {
    environment: Record<string, string | undefined>;
    tests: Record<string, boolean | null>;
    timestamp: string;
}

export async function debugHeadless(override?: boolean): Promise<DebugHeadlessResponse> {
    const overrideParam = override !== undefined ? `?override=${override}` : '';
    return http<DebugHeadlessResponse>(`/debug/headless${overrideParam}`);
}

export async function cancelLogin(): Promise<{ success: boolean; message: string }> {
    return http<{ success: boolean; message: string }>('/login/cancel', { method: 'POST', body: JSON.stringify({}) });
}
