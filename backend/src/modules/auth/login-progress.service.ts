import { Injectable } from '@nestjs/common';
import { LoginPhase, LoginProgressState, initialProgress } from './login-progress.enum';

@Injectable()
export class LoginProgressService {
  private state: LoginProgressState = initialProgress();
  private running = false;
  private cancelRequested = false;

  get(): LoginProgressState {
    return { ...this.state };
  }

  isRunning(): boolean {
    return this.running;
  }

  requestCancel() {
    if (this.running) this.cancelRequested = true;
  }

  wasCancelRequested(): boolean {
    return this.cancelRequested;
  }

  reset() {
    this.state = initialProgress();
    this.running = false;
    this.cancelRequested = false;
  }

  start(message = 'Iniciando login') {
    this.running = true;
    const now = new Date().toISOString();
    this.state = {
      phase: LoginPhase.STARTING,
      startedAt: now,
      updatedAt: now,
      attempts: 0,
      message,
      done: false
    };
  }

  update(phase: LoginPhase, message?: string) {
    this.state.phase = phase;
    this.state.updatedAt = new Date().toISOString();
    if (message) this.state.message = message;
  }

  incrementAttempt() {
    this.state.attempts = (this.state.attempts || 0) + 1;
    this.state.updatedAt = new Date().toISOString();
  }

  fail(error: string) {
    this.state.phase = LoginPhase.FAILED;
    this.state.error = error;
    this.state.done = true;
    this.state.updatedAt = new Date().toISOString();
    this.running = false;
  }

  success(message = 'Login concluído') {
    this.state.phase = LoginPhase.SUCCESS;
    this.state.message = message;
    this.state.done = true;
    this.state.updatedAt = new Date().toISOString();
    this.running = false;
  }
}