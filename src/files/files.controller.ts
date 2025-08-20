import {
    Body, Controller, Get, Query, Param, Delete, Post, UploadedFile, UseInterceptors,
    BadRequestException, UseGuards, Patch
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { randomUUID } from 'crypto';

import { FilesService } from './files.service';
import { MinioService } from '../minio/minio.service';
import { CreateFileDto } from './dto/create-file.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

class MoveFileDto { folderId!: string; }

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
    constructor(private readonly files: FilesService, private readonly minio: MinioService) { }

    @Get()
    @ApiQuery({ name: 'q', required: false, description: 'fulltext v názvu (simple contains)' })
    @ApiQuery({ name: 'folderId', required: false, description: 'filtr na složku' }) // NEW
    @ApiQuery({ name: 'limit', required: false, schema: { type: 'number', default: 50 } })
    @ApiQuery({ name: 'skip', required: false, schema: { type: 'number', default: 0 } })
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
        return await this.files.findAllForUser(user, filter, Number(limit), Number(skip));
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
