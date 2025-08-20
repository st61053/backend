import { IsMongoId, IsString, MinLength } from 'class-validator';

export class CreateDocumentDto {
    @IsString() @MinLength(1) title: string;
    @IsMongoId() folderId: string;
    @IsMongoId() fileId: string;
}
