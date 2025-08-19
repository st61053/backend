import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export enum Role { STUDENT = 'STUDENT', ADMIN = 'ADMIN' }

@Schema({ collection: 'users', timestamps: true })
export class User {
    @Prop({ required: true, unique: true, lowercase: true, index: true }) email: string;
    @Prop({ required: true }) passwordHash: string;
    @Prop({ type: [String], enum: Object.values(Role), default: [Role.STUDENT] }) roles: Role[];
}
export const UserSchema = SchemaFactory.createForClass(User);
