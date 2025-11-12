import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { DamAuthService } from './dam-auth.service';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface DamDownloadOptions {
    outputDir?: string;
    filename?: string;
}

export interface DamDownloadResult {
    success: boolean;
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    error?: string;
}

@Injectable()
export class DamDownloadService {
    private readonly logger = new Logger(DamDownloadService.name);
    private readonly MAX_CONCURRENT_DOWNLOADS: number;
    private readonly DOWNLOAD_TIMEOUT: number;

    constructor(private readonly damAuthService: DamAuthService) {
        // Ler configurações do ambiente
        this.MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.DAM_MAX_CONCURRENT_DOWNLOADS || '3', 10);
        this.DOWNLOAD_TIMEOUT = parseInt(process.env.DAM_DOWNLOAD_TIMEOUT || '300000', 10); // 5 minutos padrão

        this.logger.log(`⚙️ Configurações de Download DAM:`);
        this.logger.log(`   - Concorrência máxima: ${this.MAX_CONCURRENT_DOWNLOADS} downloads simultâneos`);
        this.logger.log(`   - Timeout por download: ${this.DOWNLOAD_TIMEOUT / 1000}s`);
    }

    /**
     * Baixa um asset do DAM usando a sessão autenticada
     */
    async downloadAsset(
        assetUrl: string,
        options: DamDownloadOptions = {}
    ): Promise<DamDownloadResult> {
        this.logger.log(`📥 Iniciando download de asset: ${assetUrl}`);

        // Verificar sessão válida
        const session = this.damAuthService.getSession();
        if (!session) {
            return {
                success: false,
                error: 'Sessão DAM inválida ou expirada. Faça login novamente.',
            };
        }

        // Configurar diretório de download
        const downloadPath = options.outputDir || path.join(process.cwd(), 'temp', 'dam-downloads');
        await fs.mkdir(downloadPath, { recursive: true });

        const browser = await chromium.launch({
            headless: process.env.DAM_HEADLESS !== 'false',
        });

        try {
            const context = await browser.newContext({
                acceptDownloads: true,
            });

            // Restaurar cookies da sessão
            this.logger.log(`🍪 Restaurando ${session.cookies.length} cookies da sessão`);
            await context.addCookies(session.cookies);

            const page = await context.newPage();

            this.logger.log(`📍 Iniciando download de: ${assetUrl}`);

            // Para download direto, aguardar evento de download
            this.logger.log(`⏳ Aguardando evento de download...`);
            
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: this.DOWNLOAD_TIMEOUT }),
                page.goto(assetUrl, { timeout: this.DOWNLOAD_TIMEOUT }).catch((err) => {
                    // "Download is starting" confirma que download começou
                    if (err.message.includes('Download is starting')) {
                        this.logger.log('✅ Download iniciado pelo navegador');
                    } else {
                        this.logger.error(`❌ Erro na navegação: ${err.message}`);
                        throw err;
                    }
                })
            ]);

            this.logger.log(`📥 Download capturado: ${download.suggestedFilename()}`);

            // Definir nome do arquivo
            const fileName = options.filename || download.suggestedFilename();
            const filePath = path.join(downloadPath, fileName);

            this.logger.log(`💾 Salvando arquivo em: ${filePath}`);
            this.logger.log(`⏬ Baixando... (isso pode demorar alguns minutos para arquivos grandes)`);

            // Salvar o arquivo e aguardar conclusão
            await download.saveAs(filePath);
            
            // Aguardar um pouco para garantir que o arquivo foi escrito
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verificar se o arquivo existe e obter tamanho
            const stats = await fs.stat(filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

            this.logger.log(`✅ ✅ ✅ DOWNLOAD CONCLUÍDO!`);
            this.logger.log(`📁 Arquivo: ${fileName}`);
            this.logger.log(`📏 Tamanho: ${sizeMB} MB`);
            this.logger.log(`📂 Local: ${filePath}`);

            await context.close();

            return {
                success: true,
                filePath,
                fileName,
                fileSize: stats.size,
            };
        } catch (error) {
            this.logger.error('❌ Erro ao baixar asset do DAM:', error);
            return {
                success: false,
                error: error.message,
            };
        } finally {
            await browser.close();
        }
    }

    /**
     * Baixa múltiplos assets em batch com paralelização
     */
    async downloadAssets(
        assetUrls: string[],
        options: DamDownloadOptions = {}
    ): Promise<DamDownloadResult[]> {
        this.logger.log(`📦 Iniciando download em batch de ${assetUrls.length} assets`);
        this.logger.log(`⚡ Concorrência máxima: ${this.MAX_CONCURRENT_DOWNLOADS} downloads simultâneos`);

        const results: DamDownloadResult[] = [];
        const queue = [...assetUrls];
        let completed = 0;

        // Função worker para processar downloads
        const worker = async (): Promise<void> => {
            while (queue.length > 0) {
                const url = queue.shift();
                if (!url) break;

                const index = assetUrls.indexOf(url) + 1;
                this.logger.log(`[${index}/${assetUrls.length}] Processando: ${url}`);

                try {
                    const result = await this.downloadAsset(url, options);
                    results.push(result);
                    completed++;

                    if (result.success) {
                        this.logger.log(`✅ [${completed}/${assetUrls.length}] Sucesso: ${result.fileName}`);
                    } else {
                        this.logger.error(`❌ [${completed}/${assetUrls.length}] Falha: ${result.error}`);
                    }
                } catch (error) {
                    this.logger.error(`❌ [${completed + 1}/${assetUrls.length}] Erro crítico:`, error);
                    results.push({
                        success: false,
                        error: error.message,
                    });
                    completed++;
                }
            }
        };

        // Criar pool de workers paralelos
        const workers: Promise<void>[] = [];
        for (let i = 0; i < this.MAX_CONCURRENT_DOWNLOADS; i++) {
            workers.push(worker());
        }

        // Aguardar todos os workers completarem
        await Promise.all(workers);

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        this.logger.log(`\n${'='.repeat(60)}`);
        this.logger.log(`🎯 RESUMO DO BATCH DOWNLOAD`);
        this.logger.log(`${'='.repeat(60)}`);
        this.logger.log(`📊 Total: ${assetUrls.length}`);
        this.logger.log(`✅ Sucessos: ${successful}`);
        this.logger.log(`❌ Falhas: ${failed}`);
        this.logger.log(`${'='.repeat(60)}\n`);

        return results;
    }
}
