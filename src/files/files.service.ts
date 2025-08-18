// src/files/files.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { StoredFile } from './schemas/file.schema';
import { MinioService } from '../minio/minio.service';

@Injectable()
export class FilesService {
    constructor(
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        private readonly minio: MinioService,
    ) { }

    async create(meta: {
        originalName: string;
        key: string;
        bucket: string;
        mime: string;
        size: number;
        uploaderId?: string;
        tags?: string[];
    }) {
        return this.fileModel.create(meta);
    }

    async findAll(filter: FilterQuery<StoredFile> = {}, limit = 50, skip = 0) {
        return this.fileModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }

    async findById(id: string) {
        const doc = await this.fileModel.findById(id).lean();
        if (!doc) throw new NotFoundException('File not found');
        return doc;
    }

    async getDownloadUrl(id: string, expiresSec = 3600) {
        const doc = await this.findById(id);
        return this.minio.getPresignedUrl(doc.key, expiresSec);
    }

    async remove(id: string) {
        const doc = await this.fileModel.findById(id);
        if (!doc) throw new NotFoundException('File not found');
        // Smazat z MinIO (nepovinné — ale doporučené)
        await this.minio.removeObject(doc.key);
        await doc.deleteOne();
        return { ok: true };
    }
}
