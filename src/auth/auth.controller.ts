import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOperation, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Controller('api/auth')
export class AuthController {
    constructor(private auth: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiBody({ type: RegisterDto })
    @ApiResponse({ status: 201, description: 'User created' })
    register(@Body() dto: RegisterDto) {
        return this.auth.register(dto.email, dto.password);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login' })
    @ApiBody({ type: LoginDto })
    @ApiResponse({ status: 200, description: 'Logged in' })
    login(@Body() dto: LoginDto) {
        return this.auth.login(dto.email, dto.password);
    }
}
