// src/files/dto/create-file.dto.ts
import { IsOptional, IsString, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFileDto {
    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsOptional()
    tags?: string[];
}
