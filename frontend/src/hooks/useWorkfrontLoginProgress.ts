import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoginProgressState } from '../types/workfrontLogin';
import { getLoginProgress, getLoginStatus, startLogin } from '../services/workfrontLoginService';

export interface UseWFLoginOpts {
    initialIntervalMs?: number;
    backoffFactor?: number;
    maxIntervalMs?: number;
    stopOnSuccessDelayMs?: number;
}

const DEFAULTS: Required<UseWFLoginOpts> = {
    initialIntervalMs: 700,
    backoffFactor: 1.4,
    maxIntervalMs: 4000,
    stopOnSuccessDelayMs: 1500,
};

export function useWorkfrontLoginProgress(opts: UseWFLoginOpts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const [progress, setProgress] = useState<LoginProgressState | null>(null);
    const [status, setStatus] = useState<{ loggedIn: boolean; hasState: boolean } | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [alreadyRunning, setAlreadyRunning] = useState(false);
    const intervalRef = useRef<number | null>(null);
    const nextDelayRef = useRef(cfg.initialIntervalMs);
    const stoppedRef = useRef(false);

    const clearTimer = () => {
        if (intervalRef.current) {
            window.clearTimeout(intervalRef.current);
            intervalRef.current = null;
        }
    };

    const poll = useCallback(async () => {
        try {
            const p = await getLoginProgress();
            setProgress(p);
            setAlreadyRunning(false);
            if (p.done) {
                // Carrega status final para confirmar reutilização
                const st = await getLoginStatus();
                setStatus(st);
                clearTimer();
                // delay para UX
                setTimeout(() => {
                    setRunning(false);
                }, cfg.stopOnSuccessDelayMs);
                return;
            }
            nextDelayRef.current = Math.min(nextDelayRef.current * cfg.backoffFactor, cfg.maxIntervalMs);
            intervalRef.current = window.setTimeout(poll, nextDelayRef.current);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro desconhecido');
            clearTimer();
            setRunning(false);
        }
    }, [cfg.backoffFactor, cfg.maxIntervalMs, cfg.stopOnSuccessDelayMs]);

    const start = useCallback(async () => {
        setError(null);
        setProgress(null);
        nextDelayRef.current = cfg.initialIntervalMs;
        try {
            const r = await startLogin();
            if (r.alreadyRunning) {
                setAlreadyRunning(true);
            }
            setRunning(true);
            poll();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao iniciar login');
            setRunning(false);
        }
    }, [cfg.initialIntervalMs, poll]);

    const stop = useCallback(() => {
        stoppedRef.current = true;
        clearTimer();
        setRunning(false);
    }, []);

    useEffect(() => {
        return () => clearTimer();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const st = await getLoginStatus();
                setStatus(st);
            } catch { /* ignore */ }
        })();
    }, []);

    return { progress, status, running, error, alreadyRunning, start, stop };
}
