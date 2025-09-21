import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { ProgressService } from './progress.service';

// Ajustado para expor em /api/workflow/stream (frontend chama /api/...)
@Controller('api/workflow')
export class WorkflowProgressController {
    constructor(private readonly progress: ProgressService) { }

    @Sse('stream')
    stream(): any {
        return this.progress.asObservable().pipe(
            map(evt => ({ data: evt } as MessageEvent))
        );
    }
}