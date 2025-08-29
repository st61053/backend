import {
    Body, Controller, Get, Query, Param, Delete, Post, UploadedFile, UseInterceptors,
    BadRequestException, UseGuards, Patch
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiQuery, ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { randomUUID } from 'crypto';

import { FilesService } from './files.service';
import { MinioService } from '../minio/minio.service';
import { CreateFileDto } from './dto/create-file.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FileResponseDto } from './schemas/file.schema';

class MoveFileDto { folderId!: string; }

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
    constructor(private readonly files: FilesService, private readonly minio: MinioService) { }

    @Get()
    @ApiOperation({ summary: 'Seznam souborů uživatele (fulltext + filtr na složku, stránkování)' })
    @ApiQuery({
        name: 'q',
        required: false,
        description: 'Fulltext v názvu (case-insensitive contains)',
        schema: { type: 'string' },
        examples: {
            containsPdf: { summary: 'Hledat PDF', value: 'pdf' },
            containsInvoice: { summary: 'Hledat faktury', value: 'invoice' },
        },
    })
    @ApiQuery({
        name: 'folderId',
        required: false,
        description: 'Filtrovat podle ID složky',
        schema: { type: 'string' },
        examples: {
            someFolder: { summary: 'Konkrétní složka', value: '66cf19ee2e3a4b5c6d7e8f8f' },
        },
    })
    @ApiQuery({ name: 'limit', required: false, schema: { type: 'number', default: 50, minimum: 1, maximum: 200 } })
    @ApiQuery({ name: 'skip', required: false, schema: { type: 'number', default: 0, minimum: 0 } })
    @ApiOkResponse({
        description: 'Pole souborů',
        type: FileResponseDto,
        isArray: true,
        schema: {
            example: [
                {
                    id: '66cf1a1f2e3a4b5c6d7e8f90',
                    originalName: 'invoice-2025-08-01.pdf',
                    key: '2025-08-29/6a2d9e3c-0a7b-4b8e-af1d-1a2b3c4d5e6f.pdf',
                    bucket: 'documents',
                    mime: 'application/pdf',
                    size: 482391,
                    uploaderId: 'user_123',
                    folderId: '66cf19ee2e3a4b5c6d7e8f8f',
                    tags: ['invoice', '2025', 'finance'],
                    status: 'UPLOADED',
                    pageCount: 12,
                    createdAt: '2025-08-29T18:04:12.345Z',
                    updatedAt: '2025-08-29T18:04:12.345Z',
                },
                {
                    id: '66cf1a202e3a4b5c6d7e8f91',
                    originalName: 'scan-contrat-2025.png',
                    key: '2025-08-29/7b3e0a9b-1b2c-4c8e-8f2e-e1f0a2b3c4d5.png',
                    bucket: 'documents',
                    mime: 'image/png',
                    size: 238112,
                    uploaderId: 'user_123',
                    folderId: '66cf19ee2e3a4b5c6d7e8f8f',
                    tags: ['contract'],
                    status: 'PARSED',
                    pageCount: null,
                    createdAt: '2025-08-28T10:11:12.000Z',
                    updatedAt: '2025-08-28T10:11:12.000Z',
                },
            ],
        },
    })
    async list(
        @Query('q') q: string | undefined,
        @Query('folderId') folderId: string | undefined,
        @Query('limit') limit = 50,
        @Query('skip') skip = 0,
        @CurrentUser() user: { userId: string; roles: string[] },
    ) {
        const filter: any = {};
        if (q) filter.originalName = { $regex: q, $options: 'i' };
        if (folderId) filter.folderId = folderId;

        const rows = await this.files.findAllForUser(user, filter, Number(limit), Number(skip));

        // pokud vracíš Mongoose dokumenty, přemapuj na DTO:
        return rows.map((r: any) => ({
            id: r._id?.toString?.() ?? r.id,
            originalName: r.originalName,
            key: r.key,
            bucket: r.bucket,
            mime: r.mime,
            size: r.size,
            uploaderId: r.uploaderId,
            folderId: r.folderId?.toString?.() ?? r.folderId,
            tags: r.tags ?? [],
            status: r.status,
            pageCount: r.pageCount ?? null,
            createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
            updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
        }));
    }

    @Get(':id')
    async getOne(@Param('id') id: string, @CurrentUser() user: any) {
        return await this.files.findByIdForUser(id, user);
    }

    @Get(':id/download')
    async download(@Param('id') id: string, @CurrentUser() user: any, @Query('expiresSec') expiresSec = 3600) {
        const url = await this.files.getDownloadUrlForUser(id, user, Number(expiresSec));
        return { url };
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @CurrentUser() user: any) {
        return await this.files.removeForUser(id, user);
    }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Nahrání souboru do MinIO a zapsání metadat do MongoDB',
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                folderId: { type: 'string', description: 'ID cílové složky' },
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['file', 'folderId'],
        },
    })
    async upload(
        @UploadedFile() file?: Express.Multer.File,
        @Body() body?: CreateFileDto,
        @CurrentUser() user?: { userId: string },
    ) {
        if (!file) throw new BadRequestException('No file provided');

        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        const objectName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext ? '.' + ext : ''}`;

        await this.minio.uploadObject(objectName, file.buffer, file.mimetype);

        const created = await this.files.create({
            originalName: file.originalname,
            key: objectName,
            bucket: this.minio.bucketName(),
            mime: file.mimetype,
            size: file.size,
            tags: body?.tags ?? [],
            uploaderId: user!.userId,
            folderId: body!.folderId!,
        });

        const plain = created && typeof (created as any).toObject === 'function'
            ? (created as any).toObject()
            : created;

        const normalized = {
            id: plain._id?.toString?.() ?? created.id,
            originalName: plain.originalName,
            key: plain.key,
            bucket: plain.bucket,
            mime: plain.mime,
            size: plain.size,
            uploaderId: plain.uploaderId,
            folderId: plain.folderId?.toString?.() ?? plain.folderId,
            tags: plain.tags ?? [],
            status: plain.status,
            pageCount: plain.pageCount,
            createdAt: plain.createdAt,
            updatedAt: plain.updatedAt,
        };

        const url = await this.minio.getPresignedUrl(objectName);
        return { ...normalized, url };
    }

    // NEW: přesun souboru do jiné složky
    @Patch(':id/folder')
    async move(
        @Param('id') id: string,
        @Body() body: MoveFileDto,
        @CurrentUser() user: { userId: string; roles: string[] },
    ) {
        return this.files.moveToFolderForUser(id, body.folderId, user);
    }

    @Post(':id/parse')
    async parse(
        @Param('id') id: string,
        @Query('size') size = 1000,
        @Query('overlap') overlap = 150,
        @CurrentUser() user?: { userId: string; roles: string[] },
    ) {
        const res = await this.files.parseAndChunkForUser(id, user!, Number(size), Number(overlap));
        return { ok: true, ...res };
    }

    @Get(':id/chunks')
    async chunks(@Param('id') id: string, @CurrentUser() user?: { userId: string; roles: string[] }) {
        return await this.files.listChunksForUser(id, user!);
    }
}
