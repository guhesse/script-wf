import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';

export interface OrganizeOptions {
    organizeByDSID?: boolean; // se true, usa DSID; senão, nome do projeto
    keepFiles?: boolean; // se true, mantém PDFs/TXTs numa pasta organizada
}

@Injectable()
export class FolderOrganizationService {
    private readonly logger = new Logger(FolderOrganizationService.name);

    /**
     * Retorna o caminho base de destino para um projeto, criando diretórios se necessário
     */
    async ensureProjectFolder(baseDownloadPath: string, projectName: string, dsid?: string | null, options: OrganizeOptions = {}) {
        const { organizeByDSID = true, keepFiles = true } = options;

        const safe = (s?: string | null) => (s || '').replace(/[<>:"/\\|?*]/g, '_').replace(/\s{2,}/g, ' ').trim();
        const folderName = organizeByDSID && dsid ? `${dsid}` : safe(projectName) || 'projeto_sem_nome';

        const projectPath = path.join(baseDownloadPath, folderName);
        await fs.mkdir(projectPath, { recursive: true });

        if (keepFiles) {
            const subfolders = ['brief', 'pdf', 'txt'];
            for (const sub of subfolders) {
                await fs.mkdir(path.join(projectPath, sub), { recursive: true });
            }
        }

        return projectPath;
    }

    /**
     * Decide subpasta para um arquivo baseado no nome/extensão e se parece briefing
     */
    decideSubfolder(fileName: string): 'brief' | 'pdf' | 'txt' {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.txt')) return 'txt';
        if (lower.includes('brief')) return 'brief';
        return 'pdf';
    }

    /**
     * Move um arquivo para dentro da estrutura do projeto, preservando a extensão
     */
    async moveIntoProject(projectPath: string, filePath: string) {
        const fileName = path.basename(filePath);
        const sub = this.decideSubfolder(fileName);
        const target = path.join(projectPath, sub, fileName);

        try {
            await fs.rename(filePath, target);
        } catch (e) {
            // se estiver em disco diferente, fazer copy + unlink
            if ((e as any).code === 'EXDEV') {
                const data = await fs.readFile(filePath);
                await fs.writeFile(target, data);
                await fs.unlink(filePath);
            } else {
                throw e;
            }
        }

        this.logger.log(`📦 Movido para ${sub}: ${fileName}`);
        return target;
    }
}
