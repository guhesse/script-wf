import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength, IsArray, IsOptional } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 6 })
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Roles do usuário', isArray: true, required: false, example: ['ADMIN','VIEWER'] })
  @IsOptional()
  @IsArray()
  roles?: string[];
}

export class UserResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  email: string;
  @ApiProperty({ isArray: true, example: ['VIEWER'] })
  roles: string[];
  @ApiProperty({ example: 'PENDING' })
  status?: string;
  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
}

export function toUserResponse(user: any): UserResponseDto {
  const { passwordHash, ...rest } = user;
  return rest;
}

export class UpdateUserRolesDto {
  @ApiProperty({ isArray: true, example: ['VIEWER','EDITOR'], description: 'Lista completa de roles que o usuário deve possuir após a atualização' })
  roles: string[];
}

export class ApproveUserDto {
  @ApiProperty({ isArray: true, required: false, example: ['VIEWER'], description: 'Opcional: roles a atribuir (default VIEWER)' })
  roles?: string[];
}

export class RejectUserDto {
  @ApiProperty({ required: false, description: 'Motivo da rejeição' })
  reason?: string;
}
