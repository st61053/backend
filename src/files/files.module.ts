// src/files/files.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoredFile, StoredFileSchema } from './schemas/file.schema';
import { FilesService } from './files.service';
import { MinioModule } from '../minio/minio.module';
import { FilesController } from './files.controller';

@Module({
    imports: [
        MinioModule,
        MongooseModule.forFeature([{ name: StoredFile.name, schema: StoredFileSchema }]),
    ],
    controllers: [FilesController],
    providers: [FilesService],
    exports: [FilesService],
})
export class FilesModule { }
