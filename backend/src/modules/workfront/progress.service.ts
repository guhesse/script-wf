import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface WorkflowProgressEvent {
  timestamp: number;
  projectUrl?: string;
  stepIndex?: number;
  totalSteps?: number;
  action?: string;
  phase: 'plan' | 'start' | 'success' | 'error' | 'skip' | 'info' | 'delay';
  message: string;
  durationMs?: number;
  subStepIndex?: number;           // índice atual de sub-etapa (1-based)
  subStepsTotal?: number;          // total de sub-etapas previstas para essa ação
  extra?: any;
}

@Injectable()
export class ProgressService {
  private subject = new Subject<WorkflowProgressEvent>();

  asObservable() { return this.subject.asObservable(); }

  publish(evt: Omit<WorkflowProgressEvent, 'timestamp'>) {
    this.subject.next({ timestamp: Date.now(), ...evt });
  }
}