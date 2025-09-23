import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto, toUserResponse, UserResponseDto, UpdateUserRolesDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateUserDto): Promise<UserResponseDto> {
        const exists = await this.prisma.user.findUnique({ where: { email: data.email } }).catch(() => null);
        if (exists) throw new BadRequestException('E-mail já cadastrado');

        const passwordHash = await bcrypt.hash(data.password, 10);

        const user = await this.prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash,
                roles: (data.roles as any) || ['VIEWER'],
                status: 'ACTIVE',
            },
        });
        return toUserResponse(user);
    }

    async createPending(data: { name: string; email: string; password: string }): Promise<any> {
        const exists = await this.prisma.user.findUnique({ where: { email: data.email } }).catch(() => null);
        if (exists) throw new BadRequestException('E-mail já cadastrado');
        const passwordHash = await bcrypt.hash(data.password, 10);
        return this.prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash,
                roles: ['VIEWER'],
                status: 'PENDING',
            },
            select: { id: true, email: true, name: true, status: true }
        });
    }

    async findAll(): Promise<UserResponseDto[]> {
        const users = await this.prisma.user.findMany();
        return users.map(toUserResponse);
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async validateUser(email: string, password: string) {
        const user = await this.findByEmail(email);
        if (!user) throw new NotFoundException('Usuário não encontrado');
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) throw new BadRequestException('Credenciais inválidas');
        return user;
    }

    async updateRoles(userId: string, dto: UpdateUserRolesDto): Promise<UserResponseDto> {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { roles: dto.roles as any },
        }).catch(() => null);
        if (!user) throw new NotFoundException('Usuário não encontrado');
        return toUserResponse(user);
    }

    async listPending(): Promise<UserResponseDto[]> {
        const users = await this.prisma.user.findMany({ where: { status: 'PENDING' } });
        return users.map(toUserResponse);
    }

    async approveUser(id: string, roles?: string[]): Promise<UserResponseDto> {
        const user = await this.prisma.user.update({
            where: { id },
            data: { status: 'ACTIVE', roles: (roles && roles.length ? roles : ['VIEWER']) as any }
        }).catch(() => null);
        if (!user) throw new NotFoundException('Usuário não encontrado');
        return toUserResponse(user);
    }

    async rejectUser(id: string, reason?: string): Promise<UserResponseDto> {
        const user = await this.prisma.user.update({
            where: { id },
            data: { status: 'REJECTED' }
        }).catch(() => null);
        if (!user) throw new NotFoundException('Usuário não encontrado');
        return toUserResponse(user);
    }
}
