import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsArray } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 6 })
  @MinLength(6)
  password: string;

  @ApiProperty({ required: false, isArray: true })
  @IsOptional()
  @IsArray()
  roles?: string[]; // ADMIN only can set
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsNotEmpty()
  password: string;
}

export class AuthTokenResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Expiração em segundos' })
  expiresIn: number;

  @ApiProperty({ type: 'object' })
  user: any;
}
