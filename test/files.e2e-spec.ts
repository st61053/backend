import { INestApplication, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { FilesController } from '../src/files/files.controller';
import { FilesService } from '../src/files/files.service';
import { MinioService } from '../src/minio/minio.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

// ---- MOCKY ----
const minioMock = {
    uploadObject: jest.fn(async () => ({ bucket: 'documents', objectName: 'x' })),
    getPresignedUrl: jest.fn(async () => 'http://example/presigned'),
    bucketName: jest.fn(() => 'documents'),
};

const sampleDoc = (overrides: any = {}) => ({
    _id: 'doc1',
    originalName: 'test.pdf',
    key: '2025-01-01/uuid.pdf',
    bucket: 'documents',
    mime: 'application/pdf',
    size: 123,
    tags: [],
    uploaderId: 'u1',
    status: 'UPLOADED',
    ...overrides,
});

const filesServiceMock = {
    create: jest.fn(async (meta) => ({ _id: 'doc1', ...meta })),
    findAllForUser: jest.fn(async () => [sampleDoc()]),
    findByIdForUser: jest.fn(async (id) => sampleDoc({ _id: id })),
    getDownloadUrlForUser: jest.fn(async () => 'http://example/presigned'),
    removeForUser: jest.fn(async () => ({ ok: true })),
    parseAndChunkForUser: jest.fn(async () => ({ chunksInserted: 2, pageCount: 1 })),
    listChunksForUser: jest.fn(async () => [
        { _id: 'c1', documentId: 'doc1', index: 0, text: 'A', startOffset: 0, endOffset: 1 },
        { _id: 'c2', documentId: 'doc1', index: 1, text: 'B', startOffset: 1, endOffset: 2 },
    ]),
};

// ---- OVERRIDE GUARD ----
// Přepínač 401/200 v rámci testů:
const allow = { value: false };

class FakeJwtGuard implements CanActivate {
    canActivate(ctx: ExecutionContext) {
        if (!allow.value) throw new UnauthorizedException(); // → 401
        const req = ctx.switchToHttp().getRequest();
        req.user = { userId: 'u1', email: 'student@example.com', roles: ['STUDENT'] };
        return true;
    }
}

describe('FILES E2E (override guard)', () => {
    let app: INestApplication;

    const resetMocks = () => {
        Object.values(minioMock).forEach((v: any) => v?.mockClear?.());
        Object.values(filesServiceMock).forEach((v: any) => v?.mockClear?.());
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [FilesController],
            providers: [
                { provide: MinioService, useValue: minioMock },
                { provide: FilesService, useValue: filesServiceMock },
            ],
        })
            // zásadní část: přepíšeme JwtAuthGuard na náš FakeJwtGuard
            .overrideGuard(JwtAuthGuard)
            .useClass(FakeJwtGuard)
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    beforeEach(() => {
        resetMocks();
        allow.value = false; // defaultně zamčeno (401)
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /files bez tokenu (guard deny) -> 401', async () => {
        await request(app.getHttpServer()).get('/files').expect(401);
    });

    it('GET /files s tokenem (guard allow) -> 200 a pole dokumentů', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .get('/files?limit=10&skip=0')
            .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toEqual(expect.objectContaining({ _id: 'doc1', uploaderId: 'u1' }));
        expect(filesServiceMock.findAllForUser).toHaveBeenCalled();
    });

    it('POST /files/upload (guard allow) -> 201 a uloží uploaderId', async () => {
        allow.value = true;

        const res = await request(app.getHttpServer())
            .post('/files/upload')
            .attach('file', Buffer.from('%PDF-1.4 test'), 'test.pdf')
            .expect(201);

        expect(res.body).toEqual(
            expect.objectContaining({
                originalName: 'test.pdf',
                bucket: 'documents',
                mime: 'application/pdf',
                size: expect.any(Number),
                url: 'http://example/presigned',
            }),
        );

        expect(filesServiceMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ uploaderId: 'u1' }), // z guardu
        );
        expect(minioMock.uploadObject).toHaveBeenCalled();
        expect(minioMock.getPresignedUrl).toHaveBeenCalled();
    });

    it('GET /files/:id (guard allow) -> 200', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .get('/files/doc1')
            .expect(200);

        expect(res.body).toEqual(expect.objectContaining({ _id: 'doc1' }));
        expect(filesServiceMock.findByIdForUser).toHaveBeenCalledWith('doc1', expect.any(Object));
    });

    it('GET /files/:id/download (guard allow) -> 200', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .get('/files/doc1/download')
            .expect(200);

        expect(res.body).toEqual({ url: 'http://example/presigned' });
        expect(filesServiceMock.getDownloadUrlForUser).toHaveBeenCalledWith('doc1', expect.any(Object), 3600);
    });

    it('POST /files/:id/parse (guard allow) -> 201', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .post('/files/doc1/parse?size=1000&overlap=150')
            .expect(201);

        expect(res.body).toEqual(expect.objectContaining({ ok: true, chunksInserted: 2, pageCount: 1 }));
        expect(filesServiceMock.parseAndChunkForUser).toHaveBeenCalledWith('doc1', expect.any(Object), 1000, 150);
    });

    it('GET /files/:id/chunks (guard allow) -> 200', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .get('/files/doc1/chunks')
            .expect(200);

        expect(res.body.length).toBe(2);
        expect(filesServiceMock.listChunksForUser).toHaveBeenCalledWith('doc1', expect.any(Object));
    });

    it('DELETE /files/:id (guard allow) -> 200 {ok:true}', async () => {
        allow.value = true;
        const res = await request(app.getHttpServer())
            .delete('/files/doc1')
            .expect(200);

        expect(res.body).toEqual({ ok: true });
        expect(filesServiceMock.removeForUser).toHaveBeenCalledWith('doc1', expect.any(Object));
    });
});
