import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'chunks', timestamps: true })
export class Chunk extends Document {
    @Prop({ required: true, index: true }) documentId: string;
    @Prop({ required: true, index: true }) index: number;
    @Prop({ required: true }) text: string;
    @Prop({ required: true }) startOffset: number;
    @Prop({ required: true }) endOffset: number;
    @Prop() pageFrom?: number;
    @Prop() pageTo?: number;
}
export const ChunkSchema = SchemaFactory.createForClass(Chunk);
ChunkSchema.index({ documentId: 1, index: 1 }, { unique: true });
