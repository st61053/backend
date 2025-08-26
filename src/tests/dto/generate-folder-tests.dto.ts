import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateFolderTestsDto {
    @IsOptional() @IsInt() @Min(1) @Max(50)
    topicCount?: number = 5;

    @IsOptional() @IsInt() @Min(1) @Max(200)
    finalCount?: number = 20;

    // pokud true, staré testy ve složce archivujeme (zůstanou v historii)
    @IsOptional() @IsBoolean()
    archiveExisting?: boolean = true;
}
