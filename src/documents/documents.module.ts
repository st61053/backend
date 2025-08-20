import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentEntity, DocumentSchema } from './schemas/document.schema';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema';
import { StoredFile, StoredFileSchema } from '../files/schemas/file.schema';
import { Chunk, ChunkSchema } from '../files/schemas/chunk.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: DocumentEntity.name, schema: DocumentSchema },
            { name: Folder.name, schema: FolderSchema },
            { name: StoredFile.name, schema: StoredFileSchema },
            { name: Chunk.name, schema: ChunkSchema },
        ]),
    ],
    controllers: [DocumentsController],
    providers: [DocumentsService],
    exports: [DocumentsService],
})
export class DocumentsModule { }
