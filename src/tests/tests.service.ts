import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TestEntity, AttemptEntity } from './schemas/test.schema';
import { Folder } from '../folders/schemas/folder.schema';
import { StoredFile } from '../files/schemas/file.schema';
import { Chunk } from '../files/schemas/chunk.schema';

type UserCtx = { userId: string; roles?: string[] };

@Injectable()
export class TestsService {
    constructor(
        @InjectModel(TestEntity.name) private readonly testModel: Model<TestEntity>,
        @InjectModel(AttemptEntity.name) private readonly attemptModel: Model<AttemptEntity>,
        @InjectModel(Folder.name) private readonly folderModel: Model<Folder>,
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        @InjectModel(Chunk.name) private readonly chunkModel: Model<Chunk>,
    ) { }

    private ensureOwner(ownerId: string, user: UserCtx) {
        if (ownerId !== user.userId) throw new ForbiddenException('Not allowed');
    }

    // ======= PUBLIC READ =======
    async getPublicTest(testId: string, user: UserCtx) {
        const t = await this.testModel.findById(testId).lean();
        if (!t) throw new NotFoundException('Test not found');
        const folder = await this.folderModel.findById(t.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);

        return {
            id: t._id.toString(),
            folderId: t.folderId.toString(),
            fileId: t.fileId?.toString(),
            type: t.type,
            title: t.title,
            archived: !!t.archived,
            questions: t.questions.map(q => ({ text: q.text, options: q.options })), // bez answerKey
            createdAt: (t as any).createdAt,
        };
    }

    async listTestsForFolder(folderId: string, user: UserCtx, includeArchived = false) {
        const folder = await this.folderModel.findById(folderId).lean();
        if (!folder) throw new NotFoundException('Folder not found');
        this.ensureOwner(folder.ownerId, user);

        const q: any = { ownerId: user.userId, folderId: new Types.ObjectId(folderId) };
        if (!includeArchived) q.archived = false;

        const rows = await this.testModel.find(q).sort({ type: 1, createdAt: -1 }).lean();
        return rows.map(t => ({
            id: t._id.toString(),
            type: t.type,
            title: t.title,
            fileId: t.fileId?.toString(),
            archived: !!t.archived,
            questionCount: t.questions.length,
            createdAt: (t as any).createdAt,
        }));
    }

    async updateTest(testId: string, user: UserCtx, archived: boolean) {
        const t = await this.testModel.findById(testId).lean();
        if (!t) throw new NotFoundException('Test not found');
        const folder = await this.folderModel.findById(t.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);

        await this.testModel.updateOne({ _id: t._id }, { $set: { archived } });
        return { ok: true };
    }

    // ======= GENEROVÁNÍ =======
    async generateForFolder(folderId: string, user: UserCtx, topicCount = 5, finalCount = 20, archiveExisting = true) {
        const folder = await this.folderModel.findById(folderId).lean();
        if (!folder) throw new NotFoundException('Folder not found');
        this.ensureOwner(folder.ownerId, user);

        const files = await this.fileModel.find({
            folderId: new Types.ObjectId(folderId),
            uploaderId: user.userId,
        }).lean();

        if (!files.length) {
            throw new BadRequestException(`Folder has no files for this user (folderId=${folderId})`);
        }

        const fileIds = files.map(f => f._id.toString());

        if (archiveExisting) {
            await this.testModel.updateMany(
                { ownerId: user.userId, folderId: new Types.ObjectId(folderId), archived: false },
                { $set: { archived: true } }
            );
        }

        // 1) Tématické testy (1/soubor)
        const createdIds: string[] = [];
        for (const file of files) {
            const topicQs = await this.buildQuestionsFromFile(file._id.toString(), topicCount);
            if (!topicQs.length) continue; // soubor bez chunků – přeskoč

            const t = await this.testModel.create({
                ownerId: user.userId,
                folderId: new Types.ObjectId(folderId),
                fileId: file._id,
                type: 'topic',
                title: file.originalName?.replace(/\.[^.]+$/, '') || 'Téma',
                archived: false,
                questions: topicQs,
                strategy: 'fake-v1',
            });
            createdIds.push(t.id);
        }

        if (!createdIds.length) throw new BadRequestException('No chunks in any file of this folder');

        // 2) Finální test (z celé složky)
        const finalQs = await this.buildQuestionsFromFolder(fileIds, finalCount);
        if (finalQs.length) {
            const ft = await this.testModel.create({
                ownerId: user.userId,
                folderId: new Types.ObjectId(folderId),
                type: 'final',
                title: `Final – ${folder.name ?? 'Lekce'}`,
                archived: false,
                questions: finalQs,
                strategy: 'fake-v1',
            });
            createdIds.push(ft.id);
        }

        return { createdTestIds: createdIds };
    }

    private async buildQuestionsFromFile(fileId: string, count: number) {
        const sample = await this.chunkModel.aggregate([
            { $match: { documentId: fileId } },
            { $sample: { size: count } },
            { $project: { text: 1 } },
        ]);
        return sample.map((c: any, i: number) => this.makeQuestion(c.text, i));
    }

    private async buildQuestionsFromFolder(fileIds: string[], count: number) {
        const sample = await this.chunkModel.aggregate([
            { $match: { documentId: { $in: fileIds } } },
            { $sample: { size: count } },
            { $project: { text: 1 } },
        ]);
        return sample.map((c: any, i: number) => this.makeQuestion(c.text, i));
    }

    // === jednoduchý fake generátor MCQ (bez AI) ===
    private makeQuestion(text: string, idx: number) {
        const pool = ['HTTP', 'TCP', 'DNS', 'REST', 'JWT', 'Redis', 'MongoDB', 'Kafka', 'gRPC', 'GraphQL', 'OAuth2', 'MinIO', 'TLS', 'CDN', 'S3', 'JSON'];
        const found = pool.find(p => new RegExp(`\\b${p}\\b`, 'i').test(text));
        const correct = found ?? this.pickToken(text) ?? 'HTTP';
        const distractors = this.pickDistractors(pool, correct, 3);
        const options = this.shuffle([correct, ...distractors]).slice(0, 4);
        const answerKey = (['A', 'B', 'C', 'D'] as const)[options.findIndex(o => o.toLowerCase() === correct.toLowerCase())] ?? 'A';
        return { text: `Co nejlépe vystihuje úryvek #${idx + 1}?`, options, answerKey };
    }
    private pickToken(text: string) {
        const tokens = text.split(/[^A-Za-zÀ-ž0-9+#.]/).map(t => t.trim()).filter(t => t.length >= 3);
        return tokens[0] || null;
    }
    private pickDistractors(pool: string[], correct: string, n: number) {
        const c = pool.filter(x => x.toLowerCase() !== correct.toLowerCase());
        this.shuffle(c);
        return c.slice(0, n);
    }
    private shuffle<T>(a: T[]): T[] { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[x[i], x[j]] = [x[j], x[i]]; } return x; }

    // ======= ATTEMPTS =======
    async createAttempt(testId: string, user: UserCtx) {
        const t = await this.testModel.findById(testId).lean();
        if (!t) throw new NotFoundException('Test not found');
        const folder = await this.folderModel.findById(t.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);
        if (t.archived) throw new BadRequestException('Test is archived');

        const answers = new Array(t.questions.length).fill(null);
        const att = await this.attemptModel.create({
            ownerId: user.userId, testId: t._id, status: 'in_progress', answers,
        });
        return { attemptId: att.id, total: t.questions.length, status: att.status };
    }

    async updateAnswers(attemptId: string, user: UserCtx, updates: { q: number; option: 'A' | 'B' | 'C' | 'D' }[]) {
        const att = await this.attemptModel.findById(attemptId);
        if (!att) throw new NotFoundException('Attempt not found');
        if (att.ownerId !== user.userId) throw new ForbiddenException('Not allowed');
        if (att.status !== 'in_progress') throw new BadRequestException('Attempt already submitted');

        updates.forEach(u => {
            if (u.q < 0 || u.q >= att.answers.length) return;
            (att.answers as any)[u.q] = u.option;
        });
        await att.save();
        return { ok: true };
    }

    async submitAttempt(attemptId: string, user: UserCtx) {
        const att = await this.attemptModel.findById(attemptId);
        if (!att) throw new NotFoundException('Attempt not found');
        if (att.ownerId !== user.userId) throw new ForbiddenException('Not allowed');
        if (att.status !== 'in_progress') throw new BadRequestException('Already submitted');

        const t = await this.testModel.findById(att.testId).lean();
        if (!t) throw new NotFoundException('Test missing');

        const total = t.questions.length;
        let score = 0;
        for (let i = 0; i < total; i++) {
            const ans = (att.answers as any)[i];
            if (!ans) continue;
            if (ans === t.questions[i].answerKey) score++;
        }

        att.status = 'submitted';
        att.score = score;
        att.total = total;
        att.submittedAt = new Date();
        await att.save();

        return { attemptId: att.id, score, total, submittedAt: att.submittedAt };
    }

    async getAttempt(attemptId: string, user: UserCtx) {
        const att = await this.attemptModel.findById(attemptId).lean();
        if (!att) throw new NotFoundException('Attempt not found');
        if (att.ownerId !== user.userId) throw new ForbiddenException('Not allowed');

        const t = await this.testModel.findById(att.testId).lean();
        if (!t) throw new NotFoundException('Test missing');

        // nevracíme answerKey, ale vrátíme vlastní odpovědi a případné skóre
        return {
            id: att._id.toString(),
            testId: att.testId.toString(),
            status: att.status,
            answers: att.answers,
            score: att.score,
            total: att.total ?? t.questions.length,
            submittedAt: att.submittedAt,
            test: { id: t._id.toString(), title: t.title, type: t.type, questionCount: t.questions.length },
        };
    }
}
