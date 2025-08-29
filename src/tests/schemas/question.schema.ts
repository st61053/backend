import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type QuestionKind = 'mcq' | 'msq' | 'tf' | 'cloze' | 'short' | 'match' | 'order';

@Schema({ _id: false })
export class QuestionSource {
    @Prop() chunkId?: string;
    @Prop() fileId?: string;
}
export const QuestionSourceSchema = SchemaFactory.createForClass(QuestionSource);

@Schema({ _id: false })
export class QuestionEntity {
    @Prop({ required: true, enum: ['mcq', 'msq', 'tf', 'cloze', 'short', 'match', 'order'] })
    kind!: QuestionKind;

    @Prop({ required: true }) text!: string;
    @Prop() rationale?: string;
    @Prop({ type: QuestionSourceSchema }) source?: QuestionSource;

    @Prop({ type: [String], default: undefined }) options?: string[];
    @Prop({ type: [Number], default: undefined }) correctIndices?: number[]; // MCQ=1 prvek, MSQ=více

    @Prop() correctBool?: boolean;                                               // TF
    @Prop({ type: [String], default: undefined }) clozeAnswers?: string[];       // Cloze
    @Prop({ type: [String], default: undefined }) acceptableAnswers?: string[];  // Short
    @Prop({ type: [String], default: undefined }) matchLeft?: string[];          // Matching
    @Prop({ type: [String], default: undefined }) matchRight?: string[];
    @Prop({ type: [String], default: undefined }) orderItems?: string[];         // Ordering
}
export const QuestionSchema = SchemaFactory.createForClass(QuestionEntity);
