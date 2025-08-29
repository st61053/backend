import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ minLength: 6, example: 'Secret123' })
    @IsString()
    @MinLength(6)
    password: string;
}

export class LoginDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ minLength: 6, example: 'Secret123' })
    @IsString()
    @MinLength(6)
    password: string;
}