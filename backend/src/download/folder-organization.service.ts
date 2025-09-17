import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';

export interface OrganizeOptions {
    organizeByDSID?: boolean; // se true, usa DSID; senão, nome do projeto
    keepFiles?: boolean; // se true, mantém PDFs/TXTs numa pasta organizada
    mode?: 'pm' | 'studio'; // modo de estrutura das pastas
}

@Injectable()
export class FolderOrganizationService {
    private readonly logger = new Logger(FolderOrganizationService.name);

    /**
     * Retorna o caminho base de destino para um projeto, criando diretórios se necessário
     */
    async ensureProjectFolder(baseDownloadPath: string, projectName: string, dsid?: string | null, options: OrganizeOptions = {}) {
        const { organizeByDSID = true, keepFiles = true, mode = 'pm' } = options;

        const safe = (s?: string | null) => (s || '').replace(/[<>:"/\\|?*]/g, '_').replace(/\s{2,}/g, ' ').trim();
        const folderName = organizeByDSID && dsid ? `${dsid}` : safe(projectName) || 'projeto_sem_nome';

        const projectPath = path.join(baseDownloadPath, folderName);
        await fs.mkdir(projectPath, { recursive: true });

        if (keepFiles) {
            let subfolders: string[];
            if (mode === 'studio') {
                subfolders = [
                    'brief',
                    path.join('assets', 'master'),
                    path.join('assets', 'products'),
                    path.join('assets', 'lifestyles'),
                    path.join('assets', 'screenfill'),
                    'deliverables',
                    'sb'
                ];
            } else {
                subfolders = ['brief', 'creatives', 'ppt'];
            }
            for (const sub of subfolders) {
                await fs.mkdir(path.join(projectPath, sub), { recursive: true });
            }
        }

        return projectPath;
    }

    /**
     * Decide subpasta para um arquivo baseado no nome/extensão e se parece briefing
     */
    decideSubfolder(fileName: string, mode: 'pm' | 'studio' = 'pm'): string {
        const lower = fileName.toLowerCase();
        if (mode === 'studio') {
            if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return 'deliverables';
            if (lower.includes('brief')) return 'brief';
            // Assets default (por enquanto não inferimos master/products/lifestyles/screenfill)
            return path.join('assets', 'master');
        } else {
            // PM
            if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return 'ppt';
            if (lower.includes('brief') || lower.endsWith('.pdf')) return 'brief';
            return 'creatives';
        }
    }

    /**
     * Move um arquivo para dentro da estrutura do projeto, preservando a extensão
     */
    async moveIntoProject(projectPath: string, filePath: string, options: OrganizeOptions = {}) {
        const fileName = path.basename(filePath);
        const sub = this.decideSubfolder(fileName, options.mode ?? 'pm');
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
