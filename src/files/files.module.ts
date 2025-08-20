import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoredFile, StoredFileSchema } from './schemas/file.schema';
import { FilesService } from './files.service';
import { MinioModule } from '../minio/minio.module';
import { FilesController } from './files.controller';
import { Chunk, ChunkSchema } from './schemas/chunk.schema';
import { PdfTextExtractor } from '../parsing/pdf-text-extractor.service';
import { TextChunker } from '../parsing/text-chunker.service';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema';
import { FoldersModule } from '../folders/folders.module';

@Module({
    imports: [
        MinioModule,
        FoldersModule,
        MongooseModule.forFeature([
            { name: StoredFile.name, schema: StoredFileSchema },
            { name: Chunk.name, schema: ChunkSchema },
            { name: Folder.name, schema: FolderSchema },
        ]),
    ],
    controllers: [FilesController],
    providers: [FilesService, PdfTextExtractor, TextChunker],
    exports: [FilesService],
})
export class FilesModule { }
