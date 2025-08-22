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

// === FAKE UNIVERSAL EXTRACTOR (PDF/DOCX/PPTX) ===
import { PageText } from '../src/parsing/pdf-text-extractor.service';
class FakeUniversalTextExtractor {
    async extractPerPage(_buf: Buffer, opts?: { mime?: string; filename?: string }): Promise<PageText[]> {
        const name = (opts?.filename || '').toLowerCase();
        if (name.endsWith('.pdf')) {
            return [
                { page: 1, text: 'PDF strana 1 – obsah' },
                { page: 2, text: 'PDF strana 2 – pokračování' },
            ];
        }
        if (name.endsWith('.docx')) {
            return [
                { page: 1, text: 'DOCX stránka 1 – obsah dokumentu' },
                { page: 2, text: 'DOCX stránka 2 – další text' },
            ];
        }
        if (name.endsWith('.pptx')) {
            return [
                { page: 1, text: 'PPTX slide 1 – úvod' },
                { page: 2, text: 'PPTX slide 2 – střed' },
                { page: 3, text: 'PPTX slide 3 – závěr' },
            ];
        }
        return [{ page: 1, text: 'GEN stránka 1' }];
    }
}

// Helper pro prefixy (zkusí /api/v1, /api, bez prefixu)
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

jest.setTimeout(60000);

describe('E2E — PDF, DOCX & PPTX end-to-end flow', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;
    let http: ReturnType<typeof doReq>;
    let authToken = '';

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        process.env.MONGO_URI = mongod.getUri();
        process.env.JWT_SECRET = 'testsecret';

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(require('../src/minio/minio.service').MinioService)
            .useClass(FakeMinioService)
            // ⬇️ override UniversalTextExtractor (musí být provider v app)
            .overrideProvider(require('../src/parsing/universal-text-extractor.service').UniversalTextExtractor)
            .useClass(FakeUniversalTextExtractor)
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        http = doReq(app);

        // Auth
        const reg = await http.post('/auth/register', { email: 'student@example.com', password: 'Password1' });
        expectOk(reg.status);
        expect(reg.body?.access_token).toBeDefined();
        authToken = reg.body.access_token as string;
    });

    afterAll(async () => {
        await app.close();
        if (mongod) await mongod.stop();
    });

    const runFlowFor = (label: 'PDF' | 'DOCX' | 'PPTX', filename: string, expectedPages: number) => {
        describe(`${label} flow`, () => {
            let folderId = '';
            let fileId = '';
            let docId = '';

            it('create folder', async () => {
                const res = await http.post('/folders', { name: `Složka ${label}` }, authToken);
                expectOk(res.status);
                folderId = res.body.id || res.body._id;
                expect(folderId).toBeDefined();
            });

            it('upload file', async () => {
                const buf = Buffer.from('dummy content');
                const upload = await http.upload('/files/upload', buf, filename, { folderId }, authToken);
                expectOk(upload.status);
                fileId = upload.body.id || upload.body._id;
                expect(fileId).toBeDefined();
                expect(upload.body.folderId || upload.body.folder?.id).toBeDefined();
            });

            it('parse file → chunksInserted & pageCount', async () => {
                const parse = await http.post(`/files/${fileId}/parse?size=80&overlap=20`, {}, authToken);
                expectOk(parse.status);
                expect(parse.body.ok).toBe(true);
                expect(parse.body.chunksInserted).toBeGreaterThan(0);
                expect(parse.body.pageCount).toBe(expectedPages);
            });

            it('create document', async () => {
                const res = await http.post('/documents', { title: `${label} dokument`, folderId, fileId }, authToken);
                expectOk(res.status);
                docId = res.body.id || res.body._id;
                expect(docId).toBeDefined();
            });

            it('get document detail', async () => {
                const res = await http.get(`/documents/${docId}`, authToken);
                expect(res.status).toBe(200);
                expect(res.body.title).toBe(`${label} dokument`);
            });

            it('list chunks via document', async () => {
                const res = await http.get(`/documents/${docId}/chunks`, authToken);
                expect(res.status).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
                expect(res.body.length).toBeGreaterThan(0);
                expect(res.body[0]).toHaveProperty('text');
            });

            it('list files by folder contains the uploaded file', async () => {
                const res = await http.get(`/files?folderId=${folderId}`, authToken);
                expect(res.status).toBe(200);
                const norm = (x: any) => (x?.id ?? x?._id ?? '').toString();
                const found = res.body.find((f: any) => norm(f) === norm({ id: fileId }));
                if (!found) {
                    // eslint-disable-next-line no-console
                    console.log(`[${label}] FILES LIST body:`, res.body, 'expected fileId:', fileId);
                }
                expect(found).toBeTruthy();
            });

            it('get download URL', async () => {
                const res = await http.get(`/files/${fileId}/download`, authToken);
                expect(res.status).toBe(200);
                expect(res.body.url).toMatch(/^http:\/\/example\/presigned\//);
            });
        });
    };

    // Spusť tři scénáře
    runFlowFor('PDF', 'doc.pdf', 2);
    runFlowFor('DOCX', 'doc.docx', 2);
    runFlowFor('PPTX', 'slides.pptx', 3);
});
