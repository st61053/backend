import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { UsersService } from './users.service';

class RegisterDto {
    @IsEmail() email: string;
    @IsString() @MinLength(6) password: string;
}

@Controller('api/auth')
export class UsersController {
    constructor(private users: UsersService) { }

    // OPTIONAL helper (pokud chceš registraci přes /api/auth/register v auth controlleru, nevadí že je tady)
    @Post('register-user')
    async registerUser(@Body() dto: RegisterDto) {
        const u = await this.users.create(dto.email, dto.password);
        return { id: u._id, email: u.email, roles: u.roles };
    }
}
