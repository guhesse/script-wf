import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginProgressService } from './login-progress.service';
import { AppAuthController } from './controllers/app-auth.controller';
import { AppAuthService } from './services/app-auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'dev-secret-change-me',
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AuthController, AppAuthController],
  providers: [AuthService, AppAuthService, JwtStrategy, LoginProgressService],
  exports: [AuthService, AppAuthService, LoginProgressService],
})
export class AuthModule {}