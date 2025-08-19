import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Role, User } from './schemas/user.schema';

@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private model: Model<User>) { }

    async create(email: string, password: string, roles: Role[] = [Role.STUDENT]) {
        const exists = await this.model.findOne({ email }).lean();
        if (exists) throw new ConflictException('Email already registered');
        const passwordHash = await bcrypt.hash(password, 10);
        return this.model.create({ email, passwordHash, roles });
    }

    findByEmail(email: string) { return this.model.findOne({ email }); }
    findById(id: string) { return this.model.findById(id); }

    async validate(email: string, password: string) {
        const user = await this.findByEmail(email);
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        return ok ? user : null;
    }
}
