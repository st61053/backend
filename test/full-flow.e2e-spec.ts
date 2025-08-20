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
    async uploadObject(objectName: string, data: Buffer, mimeType?: string) {
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

// === FAKE PDF EXTRACTOR ===
import { PageText } from '../src/parsing/pdf-text-extractor.service';
class FakePdfTextExtractor {
    async extractPerPage(_buffer: Buffer): Promise<PageText[]> {
        return [
            { page: 1, text: 'HTTP je protokol aplikační vrstvy. TCP zajišťuje spolehlivý přenos dat.' },
            { page: 2, text: 'DNS převádí doménová jména na IP adresy. REST je architektonický styl pro API.' },
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
    del: async (route: string, token?: string) => {
        for (const p of tryPrefixes) {
            let r = request(app.getHttpServer()).delete(`${p}${route}`);
            if (token) r = r.set('Authorization', `Bearer ${token}`);
            const res = await r;
            if (res.status !== 404) return res;
        }
        return request(app.getHttpServer()).delete(route);
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

jest.setTimeout(60000);

describe('Full E2E flow — split by steps', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;
    let http: ReturnType<typeof doReq>;

    // Sdílený stav mezi kroky:
    let authToken = '';
    let folderId = '';
    let fileId = '';
    let docId = '';

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        process.env.MONGO_URI = mongod.getUri();
        process.env.JWT_SECRET = 'testsecret';

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(require('../src/minio/minio.service').MinioService)
            .useClass(FakeMinioService)
            .overrideProvider(require('../src/parsing/pdf-text-extractor.service').PdfTextExtractor)
            .useClass(FakePdfTextExtractor)
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        http = doReq(app);
    });

    afterAll(async () => {
        await app.close();
        if (mongod) await mongod.stop();
    });

    describe('Auth', () => {
        it('register → returns JWT', async () => {
            const reg = await http.post('/auth/register', { email: 'student@example.com', password: 'Password1' });
            expect([200, 201]).toContain(reg.status);
            expect(reg.body?.access_token).toBeDefined();
            authToken = reg.body.access_token as string;
        });
    });

    describe('Folders', () => {
        it('create folder', async () => {
            const res = await http.post('/folders', { name: 'Diplomka' }, authToken);
            expect([200, 201]).toContain(res.status);
            folderId = res.body.id || res.body._id;
            expect(folderId).toBeDefined();
        });
    });

    describe('Files: upload', () => {
        it('upload file into folder', async () => {
            const fileBuf = Buffer.from('%PDF-1.4 dummy');
            const upload = await http.upload('/files/upload', fileBuf, 'doc.pdf', { folderId }, authToken);
            expect([200, 201]).toContain(upload.status);
            fileId = upload.body.id || upload.body._id;
            expect(fileId).toBeDefined();
            expect(upload.body.folderId || upload.body.folder?.id).toBeDefined();
        });
    });

    describe('Files: parse', () => {
        it('parse file → chunksInserted & pageCount', async () => {
            const parse = await http.post(`/files/${fileId}/parse?size=80&overlap=20`, {}, authToken);
            expect(parse.status).toBe(201); // POST default
            expect(parse.body.ok).toBe(true);
            expect(parse.body.chunksInserted).toBeGreaterThan(0);
            expect(parse.body.pageCount).toBe(2);
        });
    });

    describe('Documents', () => {
        it('create document (title + folderId + fileId)', async () => {
            const res = await http.post('/documents', { title: 'Moje PDF', folderId, fileId }, authToken);
            expect([200, 201]).toContain(res.status);
            docId = res.body.id || res.body._id;
            expect(docId).toBeDefined();
        });

        it('get document detail', async () => {
            const res = await http.get(`/documents/${docId}`, authToken);
            expect(res.status).toBe(200);
            expect(res.body.id || res.body._id).toBeDefined();
            expect(res.body.title).toBe('Moje PDF');
        });
    });

    describe('Documents: chunks', () => {
        it('list chunks via document', async () => {
            const res = await http.get(`/documents/${docId}/chunks`, authToken);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0]).toHaveProperty('text');
        });
    });

    describe('Files: list & download', () => {
        it('list files filtered by folder contains uploaded file', async () => {
            const res = await http.get(`/files?folderId=${folderId}`, authToken);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            const found = res.body.find((f: any) => f.id === fileId || f._id === fileId);
            // pro snadné ladění při failu:
            if (!found) {
                // eslint-disable-next-line no-console
                console.log('FILES LIST body:', res.body, 'expected fileId:', fileId);
            }
            expect(found).toBeTruthy();
        });

        it('get download URL', async () => {
            const res = await http.get(`/files/${fileId}/download`, authToken);
            expect(res.status).toBe(200);
            expect(res.body.url).toMatch(/^http:\/\/example\/presigned\//);
        });
    });
});
