import { IsArray, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFileDto {
    @ApiProperty({ description: 'ID cílové složky' })
    @IsMongoId()
    folderId: string;

    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    tags?: string[];
}
