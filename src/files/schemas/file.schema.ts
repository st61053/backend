// src/files/schemas/file.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true }) // createdAt, updatedAt
export class StoredFile extends Document {
    @Prop({ required: true }) originalName: string; // původní název
    @Prop({ required: true }) key: string;          // cesta v MinIO (bucket/key)
    @Prop({ required: true }) bucket: string;
    @Prop({ required: true }) mime: string;
    @Prop({ required: true }) size: number;
    @Prop() uploaderId?: string;                    // volitelně (až bude auth)
    @Prop({ type: [String], default: [] }) tags: string[];
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);
