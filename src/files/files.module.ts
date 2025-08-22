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
import { DocxTextExtractor } from 'src/parsing/docx-text-extractor.service';
import { PlainTextExtractor } from 'src/parsing/plain-text-extractor.service';
import { PptxTextExtractor } from 'src/parsing/pptx-text-extractor.service';
import { UniversalTextExtractor } from 'src/parsing/universal-text-extractor.service';

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
    providers: [
        FilesService,
        PdfTextExtractor,
        DocxTextExtractor,
        PptxTextExtractor,
        PlainTextExtractor,
        UniversalTextExtractor,
        TextChunker
    ],
    exports: [FilesService],
})
export class FilesModule { }
