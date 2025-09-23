import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppAuthService } from '../services/app-auth.service';
import { LoginDto, RegisterDto, AuthTokenResponse } from '../dto/app-auth.dto';

@ApiTags('App Auth')
@Controller('api/app-auth')
export class AppAuthController {
  constructor(private readonly appAuth: AppAuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar primeiro usuário (converte em ADMIN). Bloqueia caso já exista usuário.' })
  async register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.appAuth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login e obtenção de token JWT' })
  async login(@Body() dto: LoginDto): Promise<AuthTokenResponse> {
    return this.appAuth.login(dto);
  }
}
