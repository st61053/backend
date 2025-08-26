import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { TestEntity, TestSchema, AttemptEntity, AttemptSchema } from './schemas/test.schema';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema';
import { StoredFile, StoredFileSchema } from '../files/schemas/file.schema';
import { Chunk, ChunkSchema } from '../files/schemas/chunk.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: TestEntity.name, schema: TestSchema },
            { name: AttemptEntity.name, schema: AttemptSchema },
            { name: Folder.name, schema: FolderSchema },
            { name: StoredFile.name, schema: StoredFileSchema },
            { name: Chunk.name, schema: ChunkSchema },
        ]),
    ],
    controllers: [TestsController],
    providers: [TestsService],
    exports: [TestsService],
})
export class TestsModule { }
