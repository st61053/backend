import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum DocumentStatus {
    UPLOADED = 'UPLOADED',
    PARSED = 'PARSED',
    FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class StoredFile extends Document {
    @Prop({ required: true }) originalName: string;
    @Prop({ required: true }) key: string;
    @Prop({ required: true }) bucket: string;
    @Prop({ required: true }) mime: string;
    @Prop({ required: true }) size: number;
    @Prop({ required: true }) uploaderId?: string;

    // NEW:
    @Prop({ type: Types.ObjectId, ref: 'Folder', required: true, index: true })
    folderId: Types.ObjectId;

    @Prop({ type: [String], default: [] }) tags: string[];
    @Prop({ enum: DocumentStatus, default: DocumentStatus.UPLOADED }) status: DocumentStatus;
    @Prop() pageCount?: number;
}
export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);

// užitečný složený index
StoredFileSchema.index({ uploaderId: 1, folderId: 1, createdAt: -1 });
