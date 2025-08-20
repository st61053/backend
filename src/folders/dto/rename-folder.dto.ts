import { IsString, MinLength } from 'class-validator';
export class RenameFolderDto { @IsString() @MinLength(1) name: string; }
