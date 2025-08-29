import { IsBoolean, IsInt, IsOptional, IsIn, Max, Min, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateFolderTestsDto {
    @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 5, example: 4 })
    @IsOptional() @IsInt() @Min(1) @Max(50)
    topicCount?: number = 5;

    @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20, example: 6 })
    @IsOptional() @IsInt() @Min(1) @Max(200)
    finalCount?: number = 20;

    @ApiPropertyOptional({ default: true, example: true })
    @IsOptional() @IsBoolean()
    archiveExisting?: boolean = true;

    @ApiPropertyOptional({ enum: ['fake', 'ai'], default: 'fake', example: 'ai' })
    @IsOptional() @IsIn(['fake', 'ai'])
    strategy?: 'fake' | 'ai' = 'fake';

    // Swagger neumí přímo odvodit Partial<Record<...>>, proto schema ručně:
    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: { type: 'number' },
        example: { mcq: 5, tf: 2, msq: 2, cloze: 1 },
        description:
            'Rozdělení typů úloh. Povolené klíče: mcq, msq, tf, cloze, short, match, order.',
    })
    @IsOptional() @IsObject()
    mix?: Partial<Record<'mcq' | 'msq' | 'tf' | 'cloze' | 'short' | 'match' | 'order', number>>;
}

