import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(cfg: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: cfg.get('JWT_SECRET', 'devsecret'),
            ignoreExpiration: false,
        });
    }
    validate(payload: any) {
        return { userId: payload.sub, email: payload.email, roles: payload.roles };
    }
}
