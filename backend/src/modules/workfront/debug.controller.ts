import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('debug')
export class DebugController {
    private readonly logger = new Logger(DebugController.name);

    @Get('screenshots')
    async listScreenshots() {
        try {
            const screenshotsPath = '/app/temp';
            const files = fs.readdirSync(screenshotsPath);
            const screenshots = files
                .filter(file => file.startsWith('debug_') && file.endsWith('.png'))
                .map(file => ({
                    name: file,
                    path: `/debug/screenshot/${file}`,
                    size: fs.statSync(path.join(screenshotsPath, file)).size,
                    created: fs.statSync(path.join(screenshotsPath, file)).ctime
                }))
                .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

            return {
                total: screenshots.length,
                screenshots
            };
        } catch (error) {
            this.logger.error('Erro ao listar screenshots:', error.message);
            return { total: 0, screenshots: [] };
        }
    }

    @Get('screenshot/:filename')
    async getScreenshot(@Param('filename') filename: string, @Res() res: Response) {
        try {
            const screenshotPath = path.join('/app/temp', filename);
            
            if (!fs.existsSync(screenshotPath)) {
                return res.status(404).json({ error: 'Screenshot não encontrado' });
            }

            // Verificar se é um arquivo de screenshot válido
            if (!filename.startsWith('debug_') || !filename.endsWith('.png')) {
                return res.status(400).json({ error: 'Nome de arquivo inválido' });
            }

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            
            const imageBuffer = fs.readFileSync(screenshotPath);
            res.send(imageBuffer);
        } catch (error) {
            this.logger.error(`Erro ao servir screenshot ${filename}:`, error.message);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }

    @Get('logs/latest')
    async getLatestLogs() {
        try {
            // Aqui você pode implementar leitura dos logs mais recentes
            // Por enquanto, retorna informações básicas
            return {
                message: 'Logs disponíveis via console ou arquivo de log',
                screenshots_available: '/debug/screenshots'
            };
        } catch (error) {
            return { error: error.message };
        }
    }
}