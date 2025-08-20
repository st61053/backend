import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentEntity } from './schemas/document.schema';
import { StoredFile } from '../files/schemas/file.schema';
import { Folder } from '../folders/schemas/folder.schema';
import { Chunk } from '../files/schemas/chunk.schema';

type UserCtx = { userId: string; roles?: string[] };

@Injectable()
export class DocumentsService {
    constructor(
        @InjectModel(DocumentEntity.name) private readonly docModel: Model<DocumentEntity>,
        @InjectModel(Folder.name) private readonly folderModel: Model<Folder>,
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        @InjectModel(Chunk.name) private readonly chunkModel: Model<Chunk>,
    ) { }

    private ensureOwner(ownerId: string, user: UserCtx) {
        if (ownerId !== user.userId) throw new ForbiddenException('Not allowed');
    }

    async create(title: string, folderId: string, fileId: string, user: UserCtx) {
        const folder = await this.folderModel.findById(folderId).lean();
        if (!folder) throw new BadRequestException('Folder not found');
        this.ensureOwner(folder.ownerId, user);

        const file = await this.fileModel.findById(fileId).lean();
        if (!file) throw new BadRequestException('File not found');
        if (file.uploaderId !== user.userId) throw new ForbiddenException('Not allowed');
        // volitelně: vynutit shodu folderId file vs document
        // if (file.folderId?.toString() !== folderId) throw new BadRequestException('File not in the folder');

        const created = await this.docModel.create({
            title,
            folderId: new Types.ObjectId(folderId),
            fileId: new Types.ObjectId(fileId),
            status: 'processing',
        });
        return { id: created.id };
    }

    async getByIdForUser(id: string, user: UserCtx) {
        const doc = await this.docModel.findById(id).lean();
        if (!doc) throw new NotFoundException('Document not found');

        // ověř vlastnictví přes folder a file
        const folder = await this.folderModel.findById(doc.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);

        const file = await this.fileModel.findById(doc.fileId).lean();
        if (!file) throw new NotFoundException('File missing');

        return {
            id: doc._id.toString(),
            title: doc.title,
            folderId: doc.folderId.toString(),
            fileId: doc.fileId.toString(),
            status: doc.status,
            pageCount: (file as any).pageCount ?? undefined,
            createdAt: (doc as any).createdAt,
        };
    }

    // Public read chunks by DOCUMENT (aktuálně alias na fileId, protože chunks.documentId = fileId)
    async getChunksForUser(documentId: string, user: UserCtx, limit = 100, skip = 0) {
        const doc = await this.docModel.findById(documentId).lean();
        if (!doc) throw new NotFoundException('Document not found');

        const folder = await this.folderModel.findById(doc.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);

        // alias: chunks.documentId = fileId (zatím)
        return this.chunkModel.find({ documentId: doc.fileId.toString() })
            .sort({ index: 1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }
}
