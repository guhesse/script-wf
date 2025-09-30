import { Controller, Post, Get, Query, Body, HttpException, HttpStatus, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
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
  LoginCredentialsDto,
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
  @ApiQuery({ 
    name: 'headless', 
    required: false, 
    type: String,
    description: 'Executar em modo headless (true/false). Apenas em desenvolvimento.' 
  })
  @ApiBody({ 
    type: LoginCredentialsDto, 
    required: false,
    description: 'Credenciais para login automático (opcional)' 
  })
  async startLogin(
    @Query('headless') headless?: string,
    @Body() body?: any
  ): Promise<{ started: boolean; phase: LoginPhase }> {
    if (this.progress.isRunning()) {
      throw new ConflictException('Login já em andamento');
    }
    this.progress.start();
    
    console.log(`🐛 DEBUG AUTH CONTROLLER - headless query param: "${headless}"`);
    console.log(`🐛 DEBUG AUTH CONTROLLER - body recebido:`, JSON.stringify(body, null, 2));
    console.log(`🐛 DEBUG AUTH CONTROLLER - NODE_ENV: "${process.env.NODE_ENV}"`);
    console.log(`🐛 DEBUG AUTH CONTROLLER - WF_FORCE_VISIBLE: "${process.env.WF_FORCE_VISIBLE}"`);
    console.log(`🐛 DEBUG AUTH CONTROLLER - WF_HEADLESS_DEFAULT: "${process.env.WF_HEADLESS_DEFAULT}"`);
    
    const options: any = {};
    if (headless !== undefined) {
      options.headless = headless.toLowerCase() === 'true';
      console.log(`🐛 DEBUG AUTH CONTROLLER - parsed headless: ${options.headless}`);
    }
    
    // Extrair credenciais do body
    const credentials = body && body.email ? body : null;
    if (credentials) {
      console.log(`🐛 DEBUG AUTH CONTROLLER - CREDENCIAIS ENCONTRADAS! Email: ${credentials.email}`);
      options.credentials = credentials;
    } else {
      console.log(`🐛 DEBUG AUTH CONTROLLER - CREDENCIAIS NÃO ENCONTRADAS!`);
      console.log(`🐛   - body existe: ${!!body}`);
      console.log(`🐛   - body.email existe: ${!!body?.email}`);
    }
    
    console.log(`🐛 DEBUG AUTH CONTROLLER - final options:`, JSON.stringify(options, null, 2));
    
    // dispara async sem aguardar
    setImmediate(() => this.authService.login(options).catch(e => this.progress.fail(e.message)));
    return { started: true, phase: LoginPhase.STARTING };
  }

  @Get('login-progress')
  @ApiOperation({ summary: 'Obter progresso do login assíncrono' })
  getProgress() {
    return this.progress.get();
  }

  @Post('login')
  @ApiOperation({ summary: 'Fazer login no Workfront' })
  @ApiQuery({ 
    name: 'headless', 
    required: false, 
    type: String,
    description: 'Executar em modo headless (true/false). Apenas em desenvolvimento.' 
  })
  @ApiBody({ 
    type: LoginCredentialsDto, 
    required: false,
    description: 'Credenciais para login automático (opcional)' 
  })
  @ApiResponse({
    status: 200,
    description: 'Login realizado com sucesso',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Erro no login',
  })
  async login(
    @Query('headless') headless?: string,
    @Body() credentials?: LoginCredentialsDto
  ): Promise<LoginResponseDto> {
    try {
      const options: any = {};
      if (headless !== undefined) {
        options.headless = headless.toLowerCase() === 'true';
      }
      if (credentials && credentials.email) {
        options.credentials = credentials;
      }
        
      return await this.authService.login(options);
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

  @Post('login/cancel')
  @ApiOperation({ summary: 'Cancelar processo de login em andamento' })
  async cancelLogin(): Promise<{ success: boolean; message: string }> {
    if (!this.progress.isRunning()) {
      return { success: false, message: 'Nenhum login em andamento' };
    }
    
    this.progress.reset();
    return { success: true, message: 'Login cancelado com sucesso' };
  }

  @Get('debug/headless')
  @ApiOperation({ summary: 'Debug das configurações headless' })
  @ApiQuery({ 
    name: 'override', 
    required: false, 
    type: String,
    description: 'Valor para override (true/false)' 
  })
  async debugHeadless(@Query('override') override?: string) {
    const { resolveHeadless } = await import('../workfront/utils/headless.util');
    
    const result = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        WF_FORCE_VISIBLE: process.env.WF_FORCE_VISIBLE,
        WF_HEADLESS_DEFAULT: process.env.WF_HEADLESS_DEFAULT,
      },
      tests: {
        defaultResolve: resolveHeadless(),
        withOverrideTrue: resolveHeadless({ override: true, allowOverride: true }),
        withOverrideFalse: resolveHeadless({ override: false, allowOverride: true }),
        withOverrideString: resolveHeadless({ override: 'false', allowOverride: true }),
        queryParamTest: override ? resolveHeadless({ override: override.toLowerCase() === 'true', allowOverride: true }) : null,
      },
      timestamp: new Date().toISOString(),
    };
    
    console.log('🐛 DEBUG HEADLESS ENDPOINT:', JSON.stringify(result, null, 2));
    return result;
  }
}