import { Injectable, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, RegisterDto, AuthTokenResponse } from '../dto/app-auth.dto';

@Injectable()
export class AppAuthService {
    constructor(private users: UsersService, private jwt: JwtService) { }

    async register(dto: RegisterDto): Promise<any> { // retorno heterogêneo: token se primeiro, mensagem se pendente
        const existingUsers = await this.users.findAll();
        if (existingUsers.length === 0) {
            // Primeiro usuário vira ADMIN ativo direto
            const user = await this.users.create({ ...dto, roles: ['ADMIN'] });
            return this.buildToken(user);
        }
        // Demais: criar requisição pendente (status PENDING, roles VIEWER default, sem token)
        const pending = await this.users.createPending(dto);
        return {
            success: true,
            pending: true,
            message: 'Sua solicitação de cadastro foi enviada, aguarde a liberação ou contate o administrador.',
            userId: pending.id,
            status: pending.status,
        };
    }

    async login(dto: LoginDto): Promise<AuthTokenResponse> {
        const user = await this.users.validateUser(dto.email, dto.password);
        return this.buildToken(user);
    }

    private buildToken(user: any): AuthTokenResponse {
        const payload = { sub: user.id, email: user.email, roles: user.roles };
        const accessToken = this.jwt.sign(payload);
        return {
            accessToken,
            expiresIn: 8 * 60 * 60,
            user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
        };
    }
}
