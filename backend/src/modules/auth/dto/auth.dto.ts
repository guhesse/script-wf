// DTOs para requests e responses de autenticação
import { ApiProperty } from '@nestjs/swagger';

export class LoginCredentialsDto {
  @ApiProperty({ description: 'Email para login no Workfront e Okta' })
  email: string;

  @ApiProperty({ description: 'Senha do Workfront', required: false })
  workfrontPassword?: string;

  @ApiProperty({ description: 'Senha do Okta' })
  oktaPassword: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'Indica se o login foi bem-sucedido' })
  success: boolean;

  @ApiProperty({ description: 'Mensagem de status do login' })
  message: string;

  @ApiProperty({ description: 'Nome do arquivo de sessão', required: false })
  sessionFile?: string;

  @ApiProperty({ description: 'Timestamp do login', required: false })
  loginTime?: string;
}

export class LoginStatusDto {
  @ApiProperty({ description: 'Indica se está logado' })
  loggedIn: boolean;

  @ApiProperty({ description: 'Data do último login', required: false })
  lastLogin?: string;

  @ApiProperty({ description: 'Idade da sessão em horas', required: false })
  hoursAge?: number;

  @ApiProperty({ description: 'Nome do arquivo de sessão', required: false })
  sessionFile?: string;

  @ApiProperty({ description: 'Tamanho do arquivo', required: false })
  fileSize?: number;

  @ApiProperty({ description: 'Mensagem de erro', required: false })
  error?: string;
}

export class SessionInfoDto {
  @ApiProperty({ description: 'Indica se há sessão ativa' })
  hasSession: boolean;

  @ApiProperty({ description: 'Mensagem de status', required: false })
  message?: string;

  @ApiProperty({ description: 'Data do último login', required: false })
  lastLogin?: string;

  @ApiProperty({ description: 'Idade da sessão em horas', required: false })
  hoursAge?: number;

  @ApiProperty({ description: 'Indica se tem estado de armazenamento', required: false })
  hasStorageState?: boolean;

  @ApiProperty({ description: 'Número de cookies', required: false })
  hasCookies?: number;

  @ApiProperty({ description: 'Domínio da sessão', required: false })
  domain?: string;

  @ApiProperty({ description: 'Mensagem de erro', required: false })
  error?: string;
}

export class ClearSessionResponseDto {
  @ApiProperty({ description: 'Indica se a limpeza foi bem-sucedida' })
  success: boolean;

  @ApiProperty({ description: 'Mensagem de status' })
  message: string;

  @ApiProperty({ description: 'Arquivo removido', required: false })
  clearedFile?: string;
}

export class SessionValidationDto {
  @ApiProperty({ description: 'Indica se a sessão é válida' })
  valid: boolean;

  @ApiProperty({ description: 'Razão da invalidação', required: false })
  reason?: string;

  @ApiProperty({ description: 'Data do último login', required: false })
  lastLogin?: string;

  @ApiProperty({ description: 'Idade da sessão em horas', required: false })
  hoursAge?: number;

  @ApiProperty({ description: 'Mensagem de erro', required: false })
  error?: string;
}

export class SessionStatsDto {
  @ApiProperty({ description: 'Indica se há estatísticas disponíveis' })
  hasStats: boolean;

  @ApiProperty({ description: 'Mensagem de status', required: false })
  message?: string;

  @ApiProperty({ type: 'object', required: false })
  sessionAge?: {
    hours: number;
    days: number;
  };

  @ApiProperty({ description: 'Tamanho da sessão em bytes', required: false })
  sessionSize?: number;

  @ApiProperty({ description: 'Último acesso', required: false })
  lastAccess?: string;

  @ApiProperty({ description: 'Tempo para expiração em horas', required: false })
  expiresIn?: number;

  @ApiProperty({ description: 'Indica se a sessão expira em breve', required: false })
  isExpiringSoon?: boolean;

  @ApiProperty({ description: 'Mensagem de erro', required: false })
  error?: string;
}