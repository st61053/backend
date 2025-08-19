// src/files/files.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { DocumentStatus, StoredFile } from './schemas/file.schema';
import { MinioService } from '../minio/minio.service';
import { Chunk } from './schemas/chunk.schema';
import { PdfTextExtractor } from 'src/parsing/pdf-text-extractor.service';
import { TextChunker } from 'src/parsing/text-chunker.service';

@Injectable()
export class FilesService {
    constructor(
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        @InjectModel(Chunk.name) private readonly chunkModel: Model<Chunk>,
        private readonly minio: MinioService,
        private readonly extractor: PdfTextExtractor,
        private readonly chunker: TextChunker,
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

    async listChunks(documentId: string) {
        return this.chunkModel.find({ documentId }).sort({ index: 1 }).lean();
    }

    async parseAndChunk(documentId: string, size = 1000, overlap = 150) {
        const doc = await this.fileModel.findById(documentId);
        if (!doc) throw new NotFoundException('File not found');

        try {
            const buf = await this.minio.getObjectBuffer(doc.key);
            const pages = await this.extractor.extractPerPage(buf);
            const prepared = this.chunker.split(doc.id, pages, size, overlap);

            // idempotentně přegenerovat chunky
            await this.chunkModel.deleteMany({ documentId: doc.id });
            await this.chunkModel.insertMany(prepared);

            doc.status = DocumentStatus.PARSED;
            doc.pageCount = pages.length;
            await doc.save();
        } catch (e) {
            doc.status = DocumentStatus.FAILED;
            await doc.save();
            throw e;
        }
    }
}
