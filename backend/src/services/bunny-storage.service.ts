import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';

interface UploadResult {
    success: boolean;
    cdnUrl?: string;
    storagePath?: string;
    status?: number;
    error?: string;
}

@Injectable()
export class BunnyStorageService {
    private readonly logger = new Logger(BunnyStorageService.name);

    private get config() {
        return {
            storageZone: process.env.BUNNY_STORAGE_ZONE || 'vml-workfront',
            pullZoneBase: process.env.BUNNY_CDN_BASE_URL || 'https://vml-workfront.b-cdn.net',
            hostname: process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com',
            apiKey: process.env.BUNNY_API_KEY || process.env.BUNNY_ACCESS_KEY || '',
        };
    }

    async uploadBuffer(filePath: string, buffer: Buffer, contentType?: string): Promise<UploadResult> {
        const { storageZone, hostname, apiKey, pullZoneBase } = this.config;

        if (!apiKey) {
            return { success: false, error: 'Bunny API key ausente (BUNNY_API_KEY)' };
        }

        const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '');
        const url = `https://${hostname}/${storageZone}/${normalizedPath}`;

        try {
            this.logger.log(`Subindo para Bunny: ${url}`);
            const res = await axios.put(url, buffer, {
                headers: {
                    AccessKey: apiKey,
                    'Content-Type': contentType || 'application/octet-stream',
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });

            if (res.status >= 200 && res.status < 300) {
                return {
                    success: true,
                    storagePath: normalizedPath,
                    cdnUrl: `${pullZoneBase.replace(/\/$/, '')}/${normalizedPath}`,
                    status: res.status,
                };
            }

            return { success: false, status: res.status, error: 'Falha no upload (status inesperado)' };
        } catch (e: any) {
            this.logger.error('Erro upload Bunny', e.message);
            return { success: false, error: e.message };
        }
    }

    buildStoragePath(options: { brand?: string; fileName: string; subfolder?: string }) {
        const parts = ['masters'];
        if (options.brand) parts.push(options.brand.toLowerCase().replace(/[^a-z0-9_-]/gi, '-'));
        if (options.subfolder) parts.push(options.subfolder);
        parts.push(options.fileName);
        return parts.join('/');
    }
}
