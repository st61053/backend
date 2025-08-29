// src/upload/upload.controller.ts
import {
    Controller, Post, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MinioService } from '../minio/minio.service';
import { randomUUID } from 'crypto';
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { UploadResponseDto } from './dto/upload.dto';

@Controller('upload')
export class UploadController {
    constructor(private readonly minio: MinioService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file')) // očekáváme multipart pole "file"
    @ApiOperation({ summary: 'Nahraje jeden soubor a vrátí presigned URL' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Multipart formulář s jedním souborem v poli "file".',
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
            required: ['file'],
        },
    })
    @ApiOkResponse({
        description: 'Metadata nahraného souboru',
        type: UploadResponseDto,
        schema: {
            example: {
                key: '2025-08-29/1f3a8a7a-1c2b-4d5e-9f00-2a1b3c4d5e6f.png',
                size: 524288,
                mime: 'image/png',
                presignedUrl: 'https://minio.example.com/bucket/2025-08-29/uuid.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&…',
            },
        },
    })
    @ApiBadRequestResponse({ description: 'No file provided' })
    async upload(@UploadedFile() file?: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file provided');

        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        const objectName = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext ? '.' + ext : ''}`;

        await this.minio.uploadObject(objectName, file.buffer, file.mimetype);
        const url = await this.minio.getPresignedUrl(objectName);

        return {
            key: objectName,
            size: file.size,
            mime: file.mimetype,
            presignedUrl: url,
        };
    }
}
