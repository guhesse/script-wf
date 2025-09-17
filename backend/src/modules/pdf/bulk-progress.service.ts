import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface BulkProgressEvent {
    operationId: string;
    type: 'start' | 'project-start' | 'stage' | 'project-success' | 'project-fail' | 'project-meta' | 'completed' | 'error';
    timestamp: string;
    data?: any;
}

@Injectable()
export class BulkProgressService {
    private readonly logger = new Logger(BulkProgressService.name);
    private streams = new Map<string, Subject<BulkProgressEvent>>();
    private cancellations = new Map<string, Set<number>>(); // operationId -> set(projectNumber)

    create(operationId: string) {
        if (this.streams.has(operationId)) return;
        this.streams.set(operationId, new Subject<BulkProgressEvent>());
        this.cancellations.set(operationId, new Set<number>());
        this.logger.log(`🛰️ Progress stream criado: ${operationId}`);
    }

    observe(operationId: string): Observable<BulkProgressEvent> {
        let subj = this.streams.get(operationId);
        if (!subj) {
            subj = new Subject<BulkProgressEvent>();
            this.streams.set(operationId, subj);
        }
        return subj.asObservable();
    }

    emit(operationId: string, event: Omit<BulkProgressEvent, 'timestamp' | 'operationId'>) {
        const subj = this.streams.get(operationId);
        if (!subj) return;
        subj.next({ ...event, operationId, timestamp: new Date().toISOString() });
    }

    complete(operationId: string) {
        const subj = this.streams.get(operationId);
        if (!subj) return;
        subj.complete();
        this.streams.delete(operationId);
        this.cancellations.delete(operationId);
        this.logger.log(`✅ Progress stream finalizado: ${operationId}`);
    }

    cancel(operationId: string, projectNumber: number) {
        if (!this.cancellations.has(operationId)) this.cancellations.set(operationId, new Set<number>());
        this.cancellations.get(operationId)!.add(projectNumber);
        this.emit(operationId, { type: 'stage', data: { projectNumber, stage: 'cancel-requested' } });
    }

    isCanceled(operationId: string, projectNumber: number): boolean {
        return this.cancellations.get(operationId)?.has(projectNumber) ?? false;
    }
}
