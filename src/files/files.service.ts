import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { StoredFile } from './schemas/file.schema';
import { MinioService } from '../minio/minio.service';
import { PdfTextExtractor } from '../parsing/pdf-text-extractor.service';
import { TextChunker } from '../parsing/text-chunker.service';
import { DocumentStatus } from './schemas/file.schema';
import { Chunk } from './schemas/chunk.schema';

type UserCtx = { userId: string; roles?: string[] };

@Injectable()
export class FilesService {
    constructor(
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        @InjectModel(Chunk.name) private readonly chunkModel: Model<Chunk>,
        private readonly minio: MinioService,
        private readonly extractor: PdfTextExtractor,
        private readonly chunker: TextChunker,
    ) { }

    // --- helper pro práva ---
    private isAdmin(user?: UserCtx) {
        return !!user?.roles?.includes('ADMIN');
    }
    private ensureOwnerOrAdmin(ownerId: string | undefined | null, user: UserCtx) {
        if (ownerId && ownerId.toString() === user.userId) return;
        if (this.isAdmin(user)) return;
        throw new ForbiddenException('Not allowed');
    }

    // --- CRUD nad StoredFile ---
    async create(meta: {
        originalName: string; key: string; bucket: string; mime: string; size: number;
        uploaderId?: string; tags?: string[];
    }) {
        return this.fileModel.create(meta);
    }

    async findAllForUser(user: UserCtx, filter: FilterQuery<StoredFile> = {}, limit = 50, skip = 0) {
        const f = { ...filter };
        if (!this.isAdmin(user)) (f as any).uploaderId = user.userId;
        return this.fileModel.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }

    async findByIdForUser(id: string, user: UserCtx) {
        const doc = await this.fileModel.findById(id).lean();
        if (!doc) throw new NotFoundException('File not found');
        this.ensureOwnerOrAdmin(doc.uploaderId, user);
        return doc;
    }

    async getDownloadUrlForUser(id: string, user: UserCtx, expiresSec = 3600) {
        const doc = await this.findByIdForUser(id, user);
        return this.minio.getPresignedUrl(doc.key, expiresSec);
    }

    async removeForUser(id: string, user: UserCtx) {
        const doc = await this.fileModel.findById(id);
        if (!doc) throw new NotFoundException('File not found');
        this.ensureOwnerOrAdmin(doc.uploaderId, user);
        await this.minio.removeObject(doc.key);
        await doc.deleteOne();
        await this.chunkModel.deleteMany({ documentId: id }); // uklidit chunky
        return { ok: true };
    }

    // --- Chunking & přístup k chunkům ---
    async listChunksForUser(documentId: string, user: UserCtx) {
        const doc = await this.fileModel.findById(documentId).lean();
        if (!doc) throw new NotFoundException('File not found');
        this.ensureOwnerOrAdmin(doc.uploaderId, user);
        return this.chunkModel.find({ documentId }).sort({ index: 1 }).lean();
    }

    async parseAndChunkForUser(documentId: string, user: UserCtx, size = 1000, overlap = 150) {
        const doc = await this.fileModel.findById(documentId);
        if (!doc) throw new NotFoundException('File not found');
        this.ensureOwnerOrAdmin(doc.uploaderId, user);

        try {
            const buf = await this.minio.getObjectBuffer(doc.key);
            const pages = await this.extractor.extractPerPage(buf);
            const prepared = this.chunker.split(doc.id, pages, size, overlap);

            await this.chunkModel.deleteMany({ documentId: doc.id });
            await this.chunkModel.insertMany(prepared);

            doc.status = DocumentStatus.PARSED;
            (doc as any).pageCount = pages.length;
            await doc.save();

            return { chunksInserted: prepared.length, pageCount: pages.length };
        } catch (e) {
            doc.status = DocumentStatus.FAILED;
            await doc.save();
            throw e;
        }
    }
}
