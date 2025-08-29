// src/tests/schemas/test.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { QuestionEntity, QuestionSchema } from './question.schema';

// ===== Typy dokumentů =====
export type TestDocument = HydratedDocument<TestEntity>;
export type AttemptDocument = HydratedDocument<AttemptEntity>;

// (Volitelné) starý MCQ-only model můžeš klidně odstranit; pokud ho necháš, nenechává se zapsat do DB samostatně.
@Schema({ _id: false })
export class McqQuestion {
    @Prop({ required: true }) text!: string;
    @Prop({ type: [String], required: true }) options!: string[]; // A–D
    @Prop({ required: true, enum: ['A', 'B', 'C', 'D'] }) answerKey!: 'A' | 'B' | 'C' | 'D';
}
export const McqQuestionSchema = SchemaFactory.createForClass(McqQuestion);

// ===== Test =====
@Schema({ collection: 'tests', timestamps: true })
export class TestEntity {
    @Prop({ required: true }) ownerId!: string;

    @Prop({ type: Types.ObjectId, required: true, index: true })
    folderId!: Types.ObjectId;

    @Prop({ type: Types.ObjectId, index: true })
    fileId?: Types.ObjectId; // jen u topic testů

    @Prop({ required: true, enum: ['topic', 'final'] })
    type!: 'topic' | 'final';

    @Prop({ required: true }) title!: string;

    @Prop({ default: false }) archived!: boolean;

    @Prop({ default: 'fake-v1' })
    strategy!: string; // např. 'ai-v1' / 'fake-v1'

    // Hlavní pole otázek – používáš unifikované QuestionEntity (mcq/msq/tf/cloze/short/match/order)
    @Prop({ type: [QuestionSchema], default: [] })
    questions!: QuestionEntity[];
}
export const TestSchema = SchemaFactory.createForClass(TestEntity);
TestSchema.index({ ownerId: 1, folderId: 1, type: 1, createdAt: -1 });

// ===== Attempt =====
// Pokud používáš AI s různými typy otázek, odpovědi ulož polymorfně:
@Schema({ collection: 'attempts', timestamps: true })
export class AttemptEntity {
    @Prop({ required: true, index: true }) ownerId!: string;

    @Prop({ type: Types.ObjectId, required: true, index: true })
    testId!: Types.ObjectId;

    @Prop({ enum: ['in_progress', 'submitted'], default: 'in_progress', index: true })
    status!: 'in_progress' | 'submitted';

    // Polymorfní odpovědi (mcq/msq/tf/cloze/short/match/order); ladí s UpdateAnswersDto i TestsService
    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    answers!: any[];

    @Prop() score?: number;
    @Prop() total?: number;
    @Prop() submittedAt?: Date;
}
export const AttemptSchema = SchemaFactory.createForClass(AttemptEntity);
AttemptSchema.index({ ownerId: 1, testId: 1, createdAt: -1 });

/* 
// ALTERNATIVA pro čistě MCQ-only scénář (NEPOUŽÍVEJ, pokud máš AI typy):
@Prop({ type: [String], default: [] })
answers!: Array<'A' | 'B' | 'C' | 'D' | null>;
*/
