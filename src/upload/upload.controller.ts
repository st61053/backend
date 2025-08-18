// src/upload/upload.controller.ts
import {
    Controller, Post, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MinioService } from '../minio/minio.service';
import { randomUUID } from 'crypto';

@Controller('upload')
export class UploadController {
    constructor(private readonly minio: MinioService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file')) // říkáme, že čekáme multipart pole 'file'
    async upload(@UploadedFile() file?: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file provided');

        // název souboru: YYYY-MM-DD/UUID.ext
        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        const objectName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext ? '.' + ext : ''}`;

        await this.minio.uploadObject(objectName, file.buffer, file.mimetype);
        const url = await this.minio.getPresignedUrl(objectName);

        return {
            key: objectName,      // kde soubor leží v bucketu
            size: file.size,      // velikost
            mime: file.mimetype,  // MIME typ
            presignedUrl: url,    // odkaz pro stažení
        };
    }
}
