// src/files/files.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoredFile, StoredFileSchema } from './schemas/file.schema';
import { FilesService } from './files.service';
import { MinioModule } from '../minio/minio.module';
import { FilesController } from './files.controller';
import { Chunk, ChunkSchema } from './schemas/chunk.schema';
import { PdfTextExtractor } from 'src/parsing/pdf-text-extractor.service';
import { TextChunker } from 'src/parsing/text-chunker.service';

@Module({
    imports: [
        MinioModule,
        MongooseModule.forFeature([
            { name: StoredFile.name, schema: StoredFileSchema },
            { name: Chunk.name, schema: ChunkSchema },
        ]),
    ],
    controllers: [FilesController],
    providers: [FilesService, PdfTextExtractor, TextChunker],
    exports: [FilesService],
})
export class FilesModule { }
