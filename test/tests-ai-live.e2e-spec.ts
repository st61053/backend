import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';

// === FAKE MINIO SERVICE ===
class FakeMinioService {
    private bucket = 'documents';
    private store = new Map<string, Buffer>();
    bucketName() { return this.bucket; }
    async ensureBucket() { }
    async uploadObject(objectName: string, data: Buffer, _mimeType?: string) {
        this.store.set(objectName, Buffer.from(data));
        return { bucket: this.bucket, objectName };
    }
    async getPresignedUrl(objectName: string, expirySeconds = 3600) {
        return `http://example/presigned/${encodeURIComponent(objectName)}?exp=${expirySeconds}`;
    }
    async removeObject(objectName: string) { this.store.delete(objectName); }
    async removeObjects(objectNames: string[]) { for (const n of objectNames) this.store.delete(n); }
    async getObjectBuffer(objectName: string): Promise<Buffer> {
        const buf = this.store.get(objectName);
        if (!buf) throw new Error('Object not found in FakeMinioService: ' + objectName);
        return Buffer.from(buf);
    }
}

// === FAKE UNIVERSAL TEXT EXTRACTOR ===
import { PageText } from '../src/parsing/pdf-text-extractor.service';
class FakeUniversalTextExtractor {
    async extractPerPage(_buf: Buffer, opts?: { mime?: string; filename?: string }): Promise<PageText[]> {
        const name = (opts?.filename || '').toLowerCase();
        if (name.includes('network')) {
            return [
                { page: 1, text: 'HTTP je protokol aplikační vrstvy. TCP zajišťuje spolehlivý přenos dat.' },
                { page: 2, text: 'REST je architektonický styl. TLS šifruje spojení.' },
            ];
        }
        if (name.includes('database')) {
            return [
                { page: 1, text: 'MongoDB je dokumentová databáze. Redis je in-memory store.' },
                { page: 2, text: 'Kafka je distribuovaný log. JSON je výměnný formát.' },
            ];
        }
        return [
            { page: 1, text: 'PDF strana 1 – obsah' },
            { page: 2, text: 'PDF strana 2 – pokračování' },
        ];
    }
}

// Helper pro prefixy
const tryPrefixes = ['/api/v1', '/api', ''];
const doReq = (app: INestApplication) => ({
    get: async (route: string, token?: string) => {
        for (const p of tryPrefixes) {
            const r = request(app.getHttpServer()).get(`${p}${route}`);
            if (token) r.set('Authorization', `Bearer ${token}`);
            const res = await r;
            if (res.status !== 404) return res;
        }
        return request(app.getHttpServer()).get(route);
    },
    post: async (route: string, body?: any, token?: string) => {
        for (const p of tryPrefixes) {
            let r = request(app.getHttpServer()).post(`${p}${route}`);
            if (token) r = r.set('Authorization', `Bearer ${token}`);
            const res = await r.send(body ?? {});
            if (res.status !== 404) return res;
        }
        return request(app.getHttpServer()).post(route).send(body ?? {});
    },
    patch: async (route: string, body?: any, token?: string) => {
        for (const p of tryPrefixes) {
            let r = request(app.getHttpServer()).patch(`${p}${route}`);
            if (token) r = r.set('Authorization', `Bearer ${token}`);
            const res = await r.send(body ?? {});
            if (res.status !== 404) return res;
        }
        return request(app.getHttpServer()).patch(route).send(body ?? {});
    },
    upload: async (route: string, fileBuf: Buffer, filename: string, fields: Record<string, string>, token?: string) => {
        for (const p of tryPrefixes) {
            let r = request(app.getHttpServer()).post(`${p}${route}`);
            if (token) r = r.set('Authorization', `Bearer ${token}`);
            r = r.attach('file', fileBuf, filename);
            for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
            const res = await r;
            if (res.status !== 404) return res;
        }
        let r = request(app.getHttpServer()).post(route).attach('file', fileBuf, filename);
        for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
        return r;
    },
});

const expectOk = (status: number) => expect([200, 201]).toContain(status);

// Podmíněné spuštění: bez OPENAI_API_KEY se test přeskočí
const maybeDescribe: jest.Describe = process.env.OPENAI_API_KEY ? describe : describe.skip;

jest.setTimeout(120000);

maybeDescribe('E2E — AI generation (live OpenAI)', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;
    let http: ReturnType<typeof doReq>;
    let authToken = '';

    let folderId = '';
    let fileA = '';
    let fileB = '';

    beforeAll(async () => {
        if (!process.env.OPENAI_API_KEY) {
            // jen pro jistotu, kdyby někdo omylem přepnul maybeDescribe na describe
            console.warn('Skipping AI E2E: OPENAI_API_KEY is not set.');
            return;
        }
        mongod = await MongoMemoryServer.create();
        process.env.MONGO_URI = mongod.getUri();
        process.env.JWT_SECRET = 'testsecret';

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(require('../src/minio/minio.service').MinioService)
            .useClass(FakeMinioService)
            .overrideProvider(require('../src/parsing/universal-text-extractor.service').UniversalTextExtractor)
            .useClass(FakeUniversalTextExtractor)
            // POZOR: NEpřepisujeme QuestionGeneratorService – používáme reálné AI
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        http = doReq(app);

        // auth
        const reg = await http.post('/auth/register', { email: 'student@example.com', password: 'Password1' });
        expectOk(reg.status);
        authToken = reg.body.access_token;
    });

    afterAll(async () => {
        if (app) await app.close();
        if (mongod) await mongod.stop();
    });

    describe('Seed: folder + files + parse', () => {
        it('create folder', async () => {
            const res = await http.post('/folders', { name: 'Lekce AI Live' }, authToken);
            expectOk(res.status);
            folderId = res.body.id || res.body._id;
            expect(folderId).toBeDefined();
        });

        it('upload & parse first file (network.pdf)', async () => {
            const buf = Buffer.from('dummy');
            const up = await http.upload('/files/upload', buf, 'network.pdf', { folderId }, authToken);
            expectOk(up.status);
            fileA = up.body.id || up.body._id;
            expect(fileA).toBeDefined();

            const parse = await http.post(`/files/${fileA}/parse?size=120&overlap=20`, {}, authToken);
            expectOk(parse.status);
            expect(parse.body.ok).toBe(true);
            expect(parse.body.chunksInserted).toBeGreaterThan(0);
        });

        it('upload & parse second file (database.pdf)', async () => {
            const buf = Buffer.from('dummy');
            const up = await http.upload('/files/upload', buf, 'database.pdf', { folderId }, authToken);
            expectOk(up.status);
            fileB = up.body.id || up.body._id;
            expect(fileB).toBeDefined();

            const parse = await http.post(`/files/${fileB}/parse?size=120&overlap=20`, {}, authToken);
            expectOk(parse.status);
            expect(parse.body.ok).toBe(true);
            expect(parse.body.chunksInserted).toBeGreaterThan(0);
        });
    });

    describe('Generate tests via AI', () => {
        it('POST /folders/:folderId/tests/generate (strategy: ai)', async () => {
            const gen = await http.post(`/folders/${folderId}/tests/generate`, {
                topicCount: 5,
                finalCount: 6,
                archiveExisting: true,
                strategy: 'ai',
                // mix je orientační; AI se ho snaží dodržet, ale test nevyžaduje shodu typů
                mix: { mcq: 5, msq: 2, tf: 1, cloze: 1, short: 1, match: 1, order: 1 },
            }, authToken);

            expectOk(gen.status);
            expect(Array.isArray(gen.body.createdTestIds)).toBe(true);
            expect(gen.body.createdTestIds.length).toBeGreaterThanOrEqual(3); // 2 topics + 1 final
        });

        it('GET /folders/:folderId/tests → list active', async () => {
            const list = await http.get(`/folders/${folderId}/tests?includeArchived=false`, authToken);
            expect(list.status).toBe(200);
            expect(Array.isArray(list.body)).toBe(true);
            expect(list.body.length).toBeGreaterThanOrEqual(3);
            for (const t of list.body) {
                expect(t.archived).toBe(false);
                expect(t.questionCount).toBeGreaterThan(0);
            }
        });

        it('GET /tests/:id → public view (no solutions)', async () => {
            const list = await http.get(`/folders/${folderId}/tests`, authToken);
            const anyTestId = list.body[0].id || list.body[0]._id;

            const detail = await http.get(`/tests/${anyTestId}`, authToken);
            expect(detail.status).toBe(200);
            const qs = detail.body.questions;
            expect(Array.isArray(qs)).toBe(true);
            expect(qs.length).toBeGreaterThan(0);

            // public view nesmí prozrazovat řešení
            for (const q of qs) {
                expect(typeof q.text).toBe('string');
                expect(q.correctIndices).toBeUndefined();
                expect(q.correctBool).toBeUndefined();
                expect(q.clozeAnswers).toBeUndefined();
                expect(q.acceptableAnswers).toBeUndefined();
            }
        });
    });

    describe('Attempts lifecycle', () => {
        let testId = '';
        let attemptId = '';
        let total = 0;

        it('pick any test', async () => {
            const list = await http.get(`/folders/${folderId}/tests`, authToken);
            const any = list.body[0];
            expect(any).toBeTruthy();
            testId = any.id || any._id;
        });

        it('create attempt', async () => {
            const res = await http.post(`/tests/${testId}/attempts`, {}, authToken);
            expectOk(res.status);
            attemptId = res.body.attemptId;
            total = res.body.total;
            expect(attemptId).toBeDefined();
            expect(total).toBeGreaterThan(0);
        });

        it('submit attempt without updates (allowed)', async () => {
            // nevyplňujeme odpovědi – ověřujeme jen, že pipeline proběhne a skóre je vyčíslené
            const res = await http.post(`/attempts/${attemptId}/submit`, {}, authToken);
            expectOk(res.status);
            expect(res.body.total).toBe(total);
            expect(res.body.score).toBeGreaterThanOrEqual(0);
        });

        it('get attempt detail', async () => {
            const res = await http.get(`/attempts/${attemptId}`, authToken);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('submitted');
            expect(Array.isArray(res.body.answers)).toBe(true);
            expect(res.body.total).toBe(total);
            expect(res.body.test).toBeDefined();
            expect(res.body.test.title).toBeDefined();
        });
    });

    describe('Archiving', () => {
        it('archive one test and verify listing filters it out', async () => {
            const list1 = await http.get(`/folders/${folderId}/tests?includeArchived=false`, authToken);
            expect(list1.status).toBe(200);
            const first = list1.body[0];
            const testId = first.id || first._id;

            const patch = await http.patch(`/tests/${testId}`, { archived: true }, authToken);
            expectOk(patch.status);
            expect(patch.body.ok).toBe(true);

            const listActive = await http.get(`/folders/${folderId}/tests?includeArchived=false`, authToken);
            expect(listActive.status).toBe(200);
            const stillThere = (listActive.body as any[]).some(t => (t.id || t._id) === testId);
            expect(stillThere).toBe(false);

            const listAll = await http.get(`/folders/${folderId}/tests?includeArchived=true`, authToken);
            expect(listAll.status).toBe(200);
            const archived = (listAll.body as any[]).find(t => (t.id || t._id) === testId);
            expect(archived).toBeTruthy();
            expect(archived.archived).toBe(true);
        });
    });
});
