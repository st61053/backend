import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';

@Module({
    imports: [
        UsersModule,
        PassportModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                secret: cfg.get('JWT_SECRET', 'devsecret'),
                signOptions: { expiresIn: cfg.get('JWT_EXPIRES', '1h') },
            }),
        }),
    ],
    providers: [AuthService, JwtStrategy],
    controllers: [AuthController],
    exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule { }
