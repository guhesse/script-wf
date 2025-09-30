import { Controller, Post, Get, HttpException, HttpStatus, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginProgressService } from './login-progress.service';
import { LoginPhase } from './login-progress.enum';
import {
  LoginResponseDto,
  LoginStatusDto,
  SessionInfoDto,
  ClearSessionResponseDto,
  SessionValidationDto,
  SessionStatsDto,
} from './dto/auth.dto';

@ApiTags('Autenticação')
@Controller('api')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly progress: LoginProgressService,
  ) {}

  @Post('login/start')
  @ApiOperation({ summary: 'Iniciar processo assíncrono de login' })
  async startLogin(): Promise<{ started: boolean; phase: LoginPhase }> {
    if (this.progress.isRunning()) {
      throw new ConflictException('Login já em andamento');
    }
    this.progress.start();
    // dispara async sem aguardar
    setImmediate(() => this.authService.login().catch(e => this.progress.fail(e.message)));
    return { started: true, phase: LoginPhase.STARTING };
  }

  @Get('login-progress')
  @ApiOperation({ summary: 'Obter progresso do login assíncrono' })
  getProgress() {
    return this.progress.get();
  }

  @Post('login')
  @ApiOperation({ summary: 'Fazer login no Workfront' })
  @ApiResponse({
    status: 200,
    description: 'Login realizado com sucesso',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Erro no login',
  })
  async login(): Promise<LoginResponseDto> {
    try {
      return await this.authService.login();
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('login-status')
  @ApiOperation({ summary: 'Verificar status do login' })
  @ApiResponse({
    status: 200,
    description: 'Status do login',
    type: LoginStatusDto,
  })
  async getLoginStatus(): Promise<LoginStatusDto> {
    return await this.authService.checkLoginStatus();
  }

  @Post('clear-cache')
  @ApiOperation({ summary: 'Limpar cache do navegador' })
  @ApiResponse({
    status: 200,
    description: 'Cache limpo com sucesso',
    type: ClearSessionResponseDto,
  })
  async clearCache(): Promise<ClearSessionResponseDto> {
    try {
      return await this.authService.clearSession();
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('session-info')
  @ApiOperation({ summary: 'Obter informações da sessão atual' })
  @ApiResponse({
    status: 200,
    description: 'Informações da sessão',
    type: SessionInfoDto,
  })
  async getSessionInfo(): Promise<SessionInfoDto> {
    return await this.authService.getSessionInfo();
  }

  @Get('session-validation')
  @ApiOperation({ summary: 'Validar sessão atual' })
  @ApiResponse({
    status: 200,
    description: 'Resultado da validação',
    type: SessionValidationDto,
  })
  async validateSession(): Promise<SessionValidationDto> {
    return await this.authService.validateSession();
  }

  @Get('session-stats')
  @ApiOperation({ summary: 'Obter estatísticas da sessão' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas da sessão',
    type: SessionStatsDto,
  })
  async getSessionStats(): Promise<SessionStatsDto> {
    return await this.authService.getSessionStats();
  }

  @Get('requires-login')
  @ApiOperation({ summary: 'Verificar se é necessário fazer login' })
  @ApiResponse({
    status: 200,
    description: 'Indica se é necessário login',
    schema: {
      type: 'object',
      properties: {
        requiresLogin: { type: 'boolean' },
        timestamp: { type: 'string' },
      },
    },
  })
  async requiresLogin(): Promise<{ requiresLogin: boolean; timestamp: string }> {
    const requiresLogin = await this.authService.requiresLogin();
    return {
      requiresLogin,
      timestamp: new Date().toISOString(),
    };
  }
}