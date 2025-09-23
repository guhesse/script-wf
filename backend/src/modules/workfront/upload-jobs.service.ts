import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export type UploadJobStatus = 'staged' | 'executing' | 'completed' | 'failed' | 'canceled';

export interface UploadJob {
    id: string;
    userId: string;          // identificador lógico do usuário (header ou token)
    projectUrl: string;
    staged: { assetZip?: string; finalMaterials?: string[] };
    status: UploadJobStatus;
    createdAt: number;
    updatedAt: number;
    error?: string;
    summary?: any;
    projectTitle?: string;
    dsid?: string;
    fileNames?: string[]; // nomes dos arquivos envolvidos para pesquisa
}

interface PersistedState { uploadJobs: UploadJob[] }

/**
 * Serviço simples para rastrear jobs de upload por usuário.
 * IMPORTANTE (futuro): substituir userId 'anonymous' por ID real vindo de auth (JWT / sessão)
 * e aplicar guard que permita: usuário vê só seus jobs; admin (role) vê todos.
 */
@Injectable()
export class UploadJobsService {
    private readonly logger = new Logger(UploadJobsService.name);
    private jobs: UploadJob[] = [];
    private stateFile: string;

    constructor() {
        this.stateFile = path.resolve(process.cwd(), 'wf_state.json');
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const raw = fs.readFileSync(this.stateFile, 'utf8');
                const json = JSON.parse(raw);
                if (Array.isArray(json.uploadJobs)) {
                    this.jobs = json.uploadJobs as UploadJob[];
                }
            }
        } catch (e) {
            this.logger.warn('Falha ao carregar wf_state.json: ' + (e as Error).message);
        }
    }

    private persist() {
        try {
            let base: PersistedState = { uploadJobs: this.jobs };
            if (fs.existsSync(this.stateFile)) {
                try {
                    const current = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                    base = { ...current, uploadJobs: this.jobs };
                } catch { /* ignore */ }
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(base, null, 2), 'utf8');
        } catch (e) {
            this.logger.error('Falha ao persistir estado: ' + (e as Error).message);
        }
    }

    createJob(params: { userId: string; projectUrl: string; staged: { assetZip?: string; finalMaterials?: string[] }; projectTitle?: string; dsid?: string }): UploadJob {
        const job: UploadJob = {
            id: randomUUID(),
            userId: params.userId,
            projectUrl: params.projectUrl,
            staged: params.staged,
            status: 'staged',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            projectTitle: params.projectTitle,
            dsid: params.dsid,
            fileNames: [
                ...(params.staged.assetZip ? [params.staged.assetZip.split(/[/\\]/).pop() || ''] : []),
                ...((params.staged.finalMaterials || []).map(p => p.split(/[/\\]/).pop() || ''))
            ].filter(Boolean)
        };
        // remover jobs antigos completados (> 24h)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this.jobs = this.jobs.filter(j => !(j.status === 'completed' && j.updatedAt < cutoff));
        this.jobs.push(job);
        this.persist();
        return job;
    }

    getJob(id: string, userId: string, isAdmin = false): UploadJob | undefined {
        const j = this.jobs.find(j => j.id === id);
        if (!j) return undefined;
        if (j.userId !== userId && !isAdmin) return undefined;
        return j;
    }

    getActiveJobForUser(userId: string): UploadJob | undefined {
        return this.jobs.find(j => j.userId === userId && ['staged', 'executing'].includes(j.status));
    }

    markExecuting(id: string) { this.updateStatus(id, 'executing'); }
    markCompleted(id: string, summary?: any) { this.updateStatus(id, 'completed', undefined, summary); }
    markFailed(id: string, error?: string) { this.updateStatus(id, 'failed', error); }
    cancel(id: string, userId: string, isAdmin = false): boolean {
        const j = this.jobs.find(j => j.id === id);
        if (!j) return false;
        if (j.userId !== userId && !isAdmin) return false;
        if (['completed', 'failed', 'canceled'].includes(j.status)) return false;
        j.status = 'canceled';
        j.updatedAt = Date.now();
        this.persist();
        return true;
    }

    private updateStatus(id: string, status: UploadJobStatus, error?: string, summary?: any) {
        const j = this.jobs.find(j => j.id === id);
        if (!j) return;
        j.status = status;
        j.updatedAt = Date.now();
        if (error) j.error = error;
        if (summary !== undefined) j.summary = summary;
        this.persist();
    }

    search(q: string, userId?: string, isAdmin = false): UploadJob[] {
        const term = q.trim().toLowerCase();
        if (!term) return [];
        const pool = isAdmin ? this.jobs : this.jobs.filter(j => j.userId === userId);
        return pool.filter(j => {
            return [j.projectUrl, j.projectTitle, j.dsid, ...(j.fileNames || [])].some(v => v && v.toLowerCase().includes(term));
        }).slice(0, 100);
    }
}
