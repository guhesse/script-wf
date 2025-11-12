import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DamAuthService, DamCredentials } from './dam-auth.service';
import { DamDownloadService, DamDownloadOptions } from './dam-download.service';

@ApiTags('DAM')
@Controller('api/dam')
export class DamController {
    constructor(
        private readonly damAuthService: DamAuthService,
        private readonly damDownloadService: DamDownloadService,
    ) { }

    @Post('login')
    @ApiOperation({ summary: 'Fazer login no DAM e obter sessão' })
    async login(@Body() credentials: DamCredentials) {
        try {
            const session = await this.damAuthService.login(credentials);
            return {
                success: true,
                message: 'Login realizado com sucesso',
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    @Post('logout')
    @ApiOperation({ summary: 'Fazer logout do DAM' })
    async logout() {
        this.damAuthService.logout();
        return {
            success: true,
            message: 'Logout realizado com sucesso',
        };
    }

    @Get('session')
    @ApiOperation({ summary: 'Verificar status da sessão DAM' })
    async getSessionStatus() {
        const session = this.damAuthService.getSession();
        return {
            success: true,
            hasValidSession: session !== null,
            expiresAt: session?.expiresAt,
        };
    }

    @Post('download')
    @ApiOperation({ summary: 'Baixar asset do DAM' })
    async downloadAsset(
        @Body() body: { url: string; options?: DamDownloadOptions }
    ) {
        const result = await this.damDownloadService.downloadAsset(
            body.url,
            body.options
        );
        return result;
    }

    @Post('download/batch')
    @ApiOperation({ summary: 'Baixar múltiplos assets do DAM' })
    async downloadAssets(
        @Body() body: { urls: string[]; options?: DamDownloadOptions }
    ) {
        const results = await this.damDownloadService.downloadAssets(
            body.urls,
            body.options
        );
        const successful = results.filter(r => r.success).length;
        return {
            success: true,
            total: results.length,
            successful,
            failed: results.length - successful,
            results,
        };
    }
}
