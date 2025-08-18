// src/files/files.controller.ts
import {
    Controller, Get, Query, Param, Delete, Post, UploadedFile, UseInterceptors, Body, BadRequestException,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateFileDto } from './dto/create-file.dto';
import { MinioService } from '../minio/minio.service';
import { randomUUID } from 'crypto';
import { ApiTags, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('files')
@Controller('files')
export class FilesController {
    constructor(
        private readonly files: FilesService,
        private readonly minio: MinioService,
    ) { }

    @Get()
    @ApiQuery({ name: 'q', required: false, description: 'fulltext v názvu (simple contains)' })
    @ApiQuery({ name: 'limit', required: false, schema: { type: 'number', default: 50 } })
    @ApiQuery({ name: 'skip', required: false, schema: { type: 'number', default: 0 } })
    async list(@Query('q') q?: string, @Query('limit') limit = 50, @Query('skip') skip = 0) {
        const filter = q ? { originalName: { $regex: q, $options: 'i' } } : {};
        return this.files.findAll(filter, Number(limit), Number(skip));
    }

    @Get(':id')
    async getOne(@Param('id') id: string) {
        return this.files.findById(id);
    }

    @Get(':id/download')
    async download(@Param('id') id: string) {
        const url = await this.files.getDownloadUrl(id);
        return { url };
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.files.remove(id);
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
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['file'],
        },
    })
    async upload(
        @UploadedFile() file?: Express.Multer.File,
        @Body() body?: CreateFileDto,
    ) {
        if (!file) throw new BadRequestException('No file provided');

        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        const objectName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext ? '.' + ext : ''}`;

        // uložit do MinIO
        await this.minio.uploadObject(objectName, file.buffer, file.mimetype);

        // zapsat metadata do Mongo
        const doc = await this.files.create({
            originalName: file.originalname,
            key: objectName,
            bucket: this.minio.bucketName(), // viz níže getter
            mime: file.mimetype,
            size: file.size,
            tags: body?.tags ?? [],
        });

        // presigned url
        const url = await this.minio.getPresignedUrl(objectName);

        return { ...doc.toObject?.() ?? doc, url };
    }
}
