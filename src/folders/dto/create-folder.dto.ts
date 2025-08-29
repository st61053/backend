import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFolderDto {
    @ApiProperty({ minLength: 1, example: 'Moje složka' })
    @IsString() @MinLength(1)
    name: string;

    @ApiPropertyOptional({ example: '#FFAA00' })
    @IsOptional() @IsString()
    color?: string;

    @ApiPropertyOptional({ example: '📁' })
    @IsOptional() @IsString()
    icon?: string;
}
