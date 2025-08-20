import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFolderDto {
    @IsString() @MinLength(1) name: string;
    @IsOptional() @IsString() color?: string;
    @IsOptional() @IsString() icon?: string;
}
