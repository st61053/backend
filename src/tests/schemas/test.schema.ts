import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TestDocument = HydratedDocument<TestEntity>;
export type AttemptDocument = HydratedDocument<AttemptEntity>;

@Schema({ _id: false })
export class McqQuestion {
    @Prop({ required: true }) text: string;
    @Prop({ type: [String], required: true }) options: string[]; // pevně 4 položky A–D
    @Prop({ required: true, enum: ['A', 'B', 'C', 'D'] }) answerKey: 'A' | 'B' | 'C' | 'D';
}
export const McqQuestionSchema = SchemaFactory.createForClass(McqQuestion);

@Schema({ collection: 'tests', timestamps: true })
export class TestEntity {
    @Prop({ required: true, index: true }) ownerId: string;

    @Prop({ type: Types.ObjectId, ref: 'Folder', required: true, index: true })
    folderId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'StoredFile', required: false, index: true })
    fileId?: Types.ObjectId; // u tématického testu vyplněno, u finálního prázdné

    @Prop({ required: true, enum: ['topic', 'final'] }) type: 'topic' | 'final';
    @Prop({ required: true }) title: string;

    @Prop({ type: [McqQuestionSchema], default: [] }) questions: McqQuestion[];

    @Prop({ default: false, index: true }) archived: boolean;

    @Prop() strategy?: string; // např. 'fake-v1'
}
export const TestSchema = SchemaFactory.createForClass(TestEntity);

@Schema({ collection: 'attempts', timestamps: true })
export class AttemptEntity {
    @Prop({ required: true, index: true }) ownerId: string;
    @Prop({ type: Types.ObjectId, ref: 'TestEntity', required: true, index: true })
    testId: Types.ObjectId;

    @Prop({ enum: ['in_progress', 'submitted'], default: 'in_progress', index: true })
    status: 'in_progress' | 'submitted';

    @Prop({ type: [String], default: [] }) answers: Array<'A' | 'B' | 'C' | 'D' | null>; // index = pořadí otázky
    @Prop() score?: number;
    @Prop() total?: number;
    @Prop() submittedAt?: Date;
}
export const AttemptSchema = SchemaFactory.createForClass(AttemptEntity);
AttemptSchema.index({ ownerId: 1, testId: 1, createdAt: -1 });
