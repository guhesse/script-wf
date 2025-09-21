import { useEffect, useRef, useState, useCallback } from 'react';

export type WorkflowProgressEvent = {
  timestamp: number;
  projectUrl?: string;
  stepIndex?: number;
  totalSteps?: number;
  action?: string;
  phase: 'plan' | 'start' | 'success' | 'error' | 'skip' | 'info' | 'delay';
  message: string;
  durationMs?: number;
  extra?: Record<string, unknown>;
};

export interface UseWorkflowProgressOptions {
  projectUrl?: string;
  autoConnect?: boolean;
  maxEvents?: number;
}

type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'skip';
interface TaskInfo { action: string; stepIndex: number; status: TaskStatus; message?: string; durationMs?: number; id: string; display: string }

interface ProgressState {
  events: WorkflowProgressEvent[];
  tasks: TaskInfo[];
  currentAction?: string;
  currentPhase?: string;
  percent: number;
  lastMessage?: string;
  active: boolean;
  totalTasks: number;
  planReceived?: boolean;
}

function computePercent(tasks: TaskInfo[] | undefined, finished: boolean) {
  if (finished) return 100;
  if (!tasks || tasks.length === 0) return 0;
  const done = tasks.filter(t => ['success','error','skip'].includes(t.status)).length;
  return Math.min(99, Math.round(done / tasks.length * 100));
}

function formatDuration(ms?: number) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m${rs > 0 ? rs + 's' : ''}`;
}

export function useWorkflowProgress(opts: UseWorkflowProgressOptions) {
  const { projectUrl, autoConnect = true, maxEvents = 400 } = opts || {};
  const [state, setState] = useState<ProgressState>({ events: [], percent: 0, active: false, tasks: [], totalTasks: 0, planReceived: false });
  const sourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setState(s => ({ ...s, active: false }));
    }
  }, []);

  const connect = useCallback(() => {
    if (sourceRef.current) return;
    const es = new EventSource('/api/workflow/stream');
    sourceRef.current = es;
    setState(s => ({ ...s, active: true }));

    es.onmessage = (evt) => {
      try {
        const data: WorkflowProgressEvent = JSON.parse(evt.data);
        if (projectUrl && data.projectUrl && data.projectUrl !== projectUrl) return;
        setState(prev => {
          const events = [...prev.events, data].slice(-maxEvents);
          let tasks = prev.tasks;
          let totalTasks = prev.totalTasks;
          let planReceived = prev.planReceived;
          if (data.phase === 'plan' && data.extra && Array.isArray((data.extra as Record<string, unknown>).tasks)) {
            const rawTasks = (data.extra as { tasks: Array<{ action: string; stepIndex: number }> }).tasks;
            const counters: Record<string, number> = {};
            tasks = rawTasks.map(t => {
              counters[t.action] = (counters[t.action] || 0) + 1;
              const suffix = counters[t.action] > 1 ? ` #${counters[t.action]}` : '';
              return { action: t.action, stepIndex: t.stepIndex, status: 'pending' as TaskStatus, id: `${t.action}-${t.stepIndex}`, display: t.action + suffix };
            });
            totalTasks = tasks.length;
            planReceived = true;
          }
          if (data.action && data.action !== 'workflow') {
            const keyId = data.stepIndex != null ? `${data.action}-${data.stepIndex}` : undefined;
            const existing = keyId ? tasks.find(t => t.id === keyId) : undefined;
            const finalStatuses: TaskStatus[] = ['success','error','skip'];

            // 1. Evitar criação dinâmica depois que plano chegou, se evento não tem stepIndex definido
            const allowDynamic = !planReceived || (keyId && !existing && data.stepIndex! >= tasks.length);

            if (!existing && allowDynamic) {
              const countSame = tasks.filter(t => t.action === data.action).length + 1;
              const dynamicId = keyId || `${data.action}-dyn-${countSame}`;
              const display = data.action + (countSame > 1 ? ` #${countSame}` : '');
              tasks = [...tasks, { action: data.action, stepIndex: data.stepIndex ?? tasks.length, status: 'pending', id: dynamicId, display }];
              totalTasks = tasks.length;
            }

            // 2. Atualizações: só aplicar se task existir; se não existir e não pode criar, ignorar evento
            if (keyId) {
              tasks = tasks.map(t => {
                if (t.id !== keyId) return t;
                if (finalStatuses.includes(t.status)) return t; // já finalizada, ignora eventos extras
                if (data.phase === 'start') return { ...t, status: 'running' };
                if (data.phase === 'success') return { ...t, status: 'success', message: data.message, durationMs: data.durationMs };
                if (data.phase === 'error') return { ...t, status: 'error', message: data.message };
                if (data.phase === 'skip') return { ...t, status: 'skip', message: data.message };
                return t;
              });
            } else if (!planReceived) {
              // fallback antigo (antes do plan) - primeira pendente daquela action
              tasks = tasks.map(t => {
                if (t.action !== data.action) return t;
                if (finalStatuses.includes(t.status)) return t;
                if (data.phase === 'start' && t.status === 'pending') return { ...t, status: 'running' };
                if (data.phase === 'success' && t.status !== 'success') return { ...t, status: 'success', message: data.message, durationMs: data.durationMs };
                if (data.phase === 'error') return { ...t, status: 'error', message: data.message };
                if (data.phase === 'skip') return { ...t, status: 'skip', message: data.message };
                return t;
              });
            }
          }
          const finished = events.some(e => e.action === 'workflow' && e.phase === 'success');
          const percent = computePercent(tasks, finished);
          return {
            ...prev,
            events,
            tasks,
            totalTasks,
            planReceived,
            currentAction: data.action,
            currentPhase: data.phase,
            lastMessage: data.message,
            percent,
          };
        });
      } catch (e) {
        console.warn('Falha parse evento workflow', e);
      }
    };

    es.onerror = () => {
      disconnect();
      setTimeout(() => { if (autoConnect) connect(); }, 2000);
    };
  }, [autoConnect, disconnect, maxEvents, projectUrl]);

  useEffect(() => { if (autoConnect) connect(); return () => disconnect(); }, [autoConnect, connect, disconnect]);

  return { ...state, connect, disconnect, formatDuration };
}
