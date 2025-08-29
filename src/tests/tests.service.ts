// src/tests/tests.service.ts
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TestEntity, AttemptEntity } from './schemas/test.schema';
import { Folder } from '../folders/schemas/folder.schema';
import { StoredFile } from '../files/schemas/file.schema';
import { Chunk } from '../files/schemas/chunk.schema';

import { QuestionEntity } from './schemas/question.schema';
import { redactQuestions } from './utils/redact-questions';
import { makeFakeQuestion } from './utils/fake-question-factory';
import { QuestionGeneratorService } from 'src/ai/question-generator.service';

type UserCtx = { userId: string; roles?: string[] };

@Injectable()
export class TestsService {
    constructor(
        @InjectModel(TestEntity.name) private readonly testModel: Model<TestEntity>,
        @InjectModel(AttemptEntity.name) private readonly attemptModel: Model<AttemptEntity>,
        @InjectModel(Folder.name) private readonly folderModel: Model<Folder>,
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
        @InjectModel(Chunk.name) private readonly chunkModel: Model<Chunk>,
        private readonly ai: QuestionGeneratorService, // AI generátor (Structured Outputs)
    ) { }

    // ===== Helpers =====
    private ensureOwner(ownerId: string, user: UserCtx) {
        if (ownerId !== user.userId) throw new ForbiddenException('Not allowed');
    }

    private toObjId(id: string) {
        return new Types.ObjectId(id);
    }

    // ===== PUBLIC READ =====
    async getPublicTest(testId: string, user: UserCtx) {
        const t = await this.testModel.findById(testId).lean();
        if (!t) throw new NotFoundException('Test not found');
        const folder = await this.folderModel.findById(t.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);

        return {
            id: t._id.toString(),
            folderId: t.folderId?.toString(),
            fileId: t.fileId?.toString(),
            type: t.type,
            title: t.title,
            archived: !!t.archived,
            questionCount: (t.questions ?? []).length,
            questions: redactQuestions(t.questions ?? []), // schová správné odpovědi
            createdAt: (t as any).createdAt,
        };
    }

    async listTestsForFolder(folderId: string, user: UserCtx, includeArchived = false) {
        const folder = await this.folderModel.findById(folderId).lean();
        if (!folder) throw new NotFoundException('Folder not found');
        this.ensureOwner(folder.ownerId, user);

        const q: any = { ownerId: user.userId, folderId: this.toObjId(folderId) };
        if (!includeArchived) q.archived = false;

        const rows = await this.testModel.find(q).sort({ type: 1, createdAt: -1 }).lean();
        return rows.map((t) => ({
            id: t._id.toString(),
            type: t.type,
            title: t.title,
            fileId: t.fileId?.toString(),
            archived: !!t.archived,
            questionCount: (t.questions ?? []).length,
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

    // ===== GENERATION =====
    async generateForFolder(
        folderId: string,
        user: UserCtx,
        topicCount = 5,
        finalCount = 20,
        archiveExisting = true,
        strategy: 'fake' | 'ai' = 'fake',
        mix?: Partial<Record<'mcq' | 'msq' | 'tf' | 'cloze' | 'short' | 'match' | 'order', number>>,
    ) {
        const folder = await this.folderModel.findById(folderId).lean();
        if (!folder) throw new NotFoundException('Folder not found');
        this.ensureOwner(folder.ownerId, user);

        const files = await this.fileModel.find({
            folderId: this.toObjId(folderId),
            uploaderId: user.userId,
        }).lean();
        if (!files.length) throw new BadRequestException('Folder has no files for this user');

        if (archiveExisting) {
            await this.testModel.updateMany(
                { ownerId: user.userId, folderId: this.toObjId(folderId), archived: false },
                { $set: { archived: true } },
            );
        }

        const createdIds: string[] = [];

        // Topic tests (1 file = 1 topic test)
        for (const file of files) {
            const qs = await this.buildQuestionsFromFile(file._id.toString(), topicCount, strategy, mix);
            if (!qs.length) continue;

            const t = await this.testModel.create({
                ownerId: user.userId,
                folderId: this.toObjId(folderId),
                fileId: file._id,
                type: 'topic',
                title: file.originalName?.replace(/\.[^.]+$/, '') || 'Téma',
                archived: false,
                questions: qs,
                strategy: strategy === 'ai' ? 'ai-v1' : 'fake-v1',
            });
            createdIds.push(t.id);
        }

        // Final test (ze všech souborů složky)
        const fileIds = files.map((f) => f._id.toString());
        const fqs = await this.buildQuestionsFromFolder(fileIds, finalCount, strategy, mix);
        if (fqs.length) {
            const ft = await this.testModel.create({
                ownerId: user.userId,
                folderId: this.toObjId(folderId),
                type: 'final',
                title: `Final – ${folder.name ?? 'Lekce'}`,
                archived: false,
                questions: fqs,
                strategy: strategy === 'ai' ? 'ai-v1' : 'fake-v1',
            });
            createdIds.push(ft.id);
        }

        if (!createdIds.length) {
            throw new BadRequestException('No questions could be generated from chunks');
        }
        return { createdTestIds: createdIds };
    }

    private async buildQuestionsFromFile(
        fileId: string,
        count: number,
        strategy: 'fake' | 'ai',
        mix?: any,
    ): Promise<QuestionEntity[]> {
        const sample = await this.chunkModel.aggregate([
            { $match: { documentId: fileId } },
            { $sample: { size: Math.max(count * 2, count) } },
            { $project: { text: 1 } },
        ]);
        const chunks = sample.map((c: any) => ({ id: c._id.toString(), text: c.text, fileId }));

        if (strategy === 'ai') {
            const qs = await this.ai.generateFromChunks(chunks, count, mix);
            if (qs.length) return qs.slice(0, count);
        }
        // fallback: fake (vícetypové otázky)
        return chunks.slice(0, count).map((c, i) => makeFakeQuestion(c.text, fileId, i));
    }

    private async buildQuestionsFromFolder(
        fileIds: string[],
        count: number,
        strategy: 'fake' | 'ai',
        mix?: any,
    ): Promise<QuestionEntity[]> {
        const sample = await this.chunkModel.aggregate([
            { $match: { documentId: { $in: fileIds } } },
            { $sample: { size: Math.max(count * 2, count) } },
            { $project: { text: 1, documentId: 1 } },
        ]);
        const chunks = sample.map((c: any) => ({
            id: c._id.toString(),
            text: c.text,
            fileId: c.documentId?.toString(),
        }));

        if (strategy === 'ai') {
            const qs = await this.ai.generateFromChunks(chunks, count, mix);
            if (qs.length) return qs.slice(0, count);
        }
        // fallback: fake
        return chunks.slice(0, count).map((c, i) => makeFakeQuestion(c.text, c.fileId, i));
    }

    // ===== ATTEMPTS =====
    async createAttempt(testId: string, user: UserCtx) {
        const t = await this.testModel.findById(testId).lean();
        if (!t) throw new NotFoundException('Test not found');
        const folder = await this.folderModel.findById(t.folderId).lean();
        if (!folder) throw new NotFoundException('Folder missing');
        this.ensureOwner(folder.ownerId, user);
        if (t.archived) throw new BadRequestException('Test is archived');

        const answers = new Array((t.questions ?? []).length).fill(null);
        const att = await this.attemptModel.create({
            ownerId: user.userId,
            testId: t._id,
            status: 'in_progress',
            answers,
        });
        return { attemptId: att.id, total: answers.length, status: att.status };
    }

    /**
     * Update odpovědí – flexibilní formát:
     * - zpětně kompatibilní: { q, option:'A'|'B'|'C'|'D' }  -> uloží index 0..3
     * - obecně: { q, value:any }                            -> uloží přímo (pro msq/tf/cloze/short/match/order)
     * - také:  { q, index:number } / { q, indices:number[] } / { q, bool:boolean } / { q, cloze:string[] } / atd.
     */
    async updateAnswers(
        attemptId: string,
        user: UserCtx,
        payload: {
            answers: Array<
                { q: number; option?: 'A' | 'B' | 'C' | 'D'; index?: number; indices?: number[]; bool?: boolean; cloze?: string[]; text?: string; match?: number[]; order?: number[]; value?: any; }
            >
        },
    ) {
        const att = await this.attemptModel.findById(attemptId);
        if (!att) throw new NotFoundException('Attempt not found');
        if (att.ownerId !== user.userId) throw new ForbiddenException('Not allowed');
        if (att.status !== 'in_progress') throw new BadRequestException('Attempt already submitted');

        if (!payload?.answers?.length) return { ok: true };

        const mapLetter = (opt?: 'A' | 'B' | 'C' | 'D') =>
            opt === 'A' ? 0 : opt === 'B' ? 1 : opt === 'C' ? 2 : opt === 'D' ? 3 : null;

        for (const u of payload.answers) {
            const i = u.q ?? -1;
            if (i < 0 || i >= att.answers.length) continue;

            // preferuj 'value', jinak odvodit z aliasů pro zpětnou kompatibilitu
            let value: any = undefined;
            if ('value' in u) value = (u as any).value;
            else if ('option' in u) value = mapLetter(u.option as any);
            else if ('index' in u) value = u.index;
            else if ('indices' in u) value = u.indices;
            else if ('bool' in u) value = u.bool;
            else if ('cloze' in u) value = u.cloze;
            else if ('text' in u) value = u.text;
            else if ('match' in u) value = u.match;
            else if ('order' in u) value = u.order;

            (att.answers as any)[i] = value ?? null;
        }

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

        const total = (t.questions ?? []).length;
        let score = 0;
        for (let i = 0; i < total; i++) {
            const q = (t.questions as QuestionEntity[])[i];
            const ans = (att.answers as any)[i];
            score += this.scoreOne(q, ans);
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

        return {
            id: att._id.toString(),
            testId: att.testId.toString(),
            status: att.status,
            answers: att.answers,
            score: att.score,
            total: att.total ?? (t.questions ?? []).length,
            submittedAt: att.submittedAt,
            // test meta (bez správných odpovědí)
            test: {
                id: t._id.toString(),
                title: t.title,
                type: t.type,
                questionCount: (t.questions ?? []).length,
            },
        };
    }

    // ===== Scoring všech typů =====
    private norm(s?: string) {
        return (s ?? '').trim().toLowerCase();
    }

    private scoreOne(q: QuestionEntity, ans: any): number {
        switch (q.kind) {
            case 'mcq': {
                // očekáváme index číslem (0..N-1); zpětná kompatibilita: pokud přijde 'A'..'D'
                const idx = typeof ans === 'string'
                    ? ({ A: 0, B: 1, C: 2, D: 3 } as any)[ans] ?? null
                    : typeof ans === 'number' ? ans : null;
                if (!Array.isArray(q.correctIndices) || idx === null) return 0;
                return q.correctIndices[0] === idx ? 1 : 0;
            }
            case 'msq': {
                if (!Array.isArray(q.correctIndices) || !Array.isArray(ans)) return 0;
                const a = [...ans].sort((x, y) => x - y);
                const b = [...q.correctIndices].sort((x, y) => x - y);
                return JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;
            }
            case 'tf': {
                if (typeof q.correctBool !== 'boolean' || typeof ans !== 'boolean') return 0;
                return q.correctBool === ans ? 1 : 0;
            }
            case 'cloze': {
                if (!Array.isArray(q.clozeAnswers) || !Array.isArray(ans)) return 0;
                if (q.clozeAnswers.length !== ans.length) return 0;
                for (let i = 0; i < ans.length; i++) {
                    if (this.norm(q.clozeAnswers[i]) !== this.norm(ans[i])) return 0;
                }
                return 1;
            }
            case 'short': {
                if (!Array.isArray(q.acceptableAnswers)) return 0;
                return q.acceptableAnswers.some(x => this.norm(x) === this.norm(ans)) ? 1 : 0;
            }
            case 'match': {
                // ans: number[] (mapování left -> right index); správné je i -> i
                if (!Array.isArray(q.matchLeft) || !Array.isArray(q.matchRight) || !Array.isArray(ans)) return 0;
                if (q.matchLeft.length !== ans.length) return 0;
                for (let i = 0; i < q.matchLeft.length; i++) if (ans[i] !== i) return 0;
                return 1;
            }
            case 'order': {
                // ans: number[] pořadí indexů položek; správné je [0,1,2,...]
                if (!Array.isArray(q.orderItems) || !Array.isArray(ans)) return 0;
                if (q.orderItems.length !== ans.length) return 0;
                for (let i = 0; i < q.orderItems.length; i++) if (ans[i] !== i) return 0;
                return 1;
            }
            default:
                return 0;
        }
    }
}
