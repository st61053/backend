import { IsBoolean } from 'class-validator';
export class UpdateTestDto {
    @IsBoolean() archived!: boolean;
}
