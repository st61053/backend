import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
    constructor(private users: UsersService, private jwt: JwtService) { }

    async register(email: string, password: string) {
        const user = await this.users.create(email, password);
        return this.issue(user.id, user.email, user.roles);
    }

    async login(email: string, password: string) {
        const user = await this.users.validate(email, password);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        return this.issue(user.id, user.email, user.roles);
    }

    private async issue(sub: string, email: string, roles: string[]) {
        const payload = { sub, email, roles };
        return { access_token: await this.jwt.signAsync(payload) };
    }
}
