// src/files/dto/create-file.dto.ts
import { IsOptional, IsArray, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFileDto {
    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsOptional()
    tags?: string[];

    @ApiPropertyOptional({ type: String, description: 'Target folder id' })
    @IsMongoId()
    @IsOptional()
    folderId: string;
}
