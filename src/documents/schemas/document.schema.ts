import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentDoc = HydratedDocument<DocumentEntity>;

@Schema({ collection: 'documents', timestamps: true })
export class DocumentEntity {
    @Prop({ required: true }) title: string;

    @Prop({ type: Types.ObjectId, ref: 'Folder', required: true, index: true })
    folderId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'StoredFile', required: true, index: true })
    fileId: Types.ObjectId;

    @Prop({ enum: ['processing', 'ready', 'failed'], default: 'processing' })
    status: 'processing' | 'ready' | 'failed';
}
export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);
