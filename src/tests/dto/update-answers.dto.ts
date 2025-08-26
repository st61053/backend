import { ArrayNotEmpty, IsArray, IsIn, IsInt, Min } from 'class-validator';

export class UpdateAnswersDto {
    @IsArray() @ArrayNotEmpty()
    answers!: { q: number; option: 'A' | 'B' | 'C' | 'D' }[];
}
