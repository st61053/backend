import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { AttemptEntity, AttemptSchema, TestEntity, TestSchema } from './schemas/test.schema';
import { StoredFile, StoredFileSchema } from '../files/schemas/file.schema';
import { Chunk, ChunkSchema } from '../files/schemas/chunk.schema';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema';
import { AiModule } from '../ai/ai.module';
import { QuestionGeneratorService } from 'src/ai/question-generator.service';

@Module({
    imports: [
        AiModule,
        MongooseModule.forFeature([
            { name: TestEntity.name, schema: TestSchema },
            { name: AttemptEntity.name, schema: AttemptSchema },
            { name: StoredFile.name, schema: StoredFileSchema },
            { name: Chunk.name, schema: ChunkSchema },
            { name: Folder.name, schema: FolderSchema },
        ]),
    ],
    controllers: [TestsController],
    providers: [TestsService, QuestionGeneratorService],
    exports: [TestsService],
})
export class TestsModule { }
