// src/minio/minio.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

@Injectable()
export class MinioService {
    private readonly bucket: string;

    constructor(
        private readonly minio: MinioClient,
        private readonly config: ConfigService,
    ) {
        this.bucket = this.config.get<string>('MINIO_BUCKET', 'documents');
    }

    async ensureBucket() {
        const exists = await this.minio.bucketExists(this.bucket).catch(() => false);
        if (!exists) {
            await this.minio.makeBucket(this.bucket, 'us-east-1');
        }
    }

    async uploadObject(objectName: string, data: Buffer, mimeType?: string) {
        await this.ensureBucket();
        await this.minio.putObject(
            this.bucket,
            objectName,
            data,
            data.length, // velikost souboru v bajtech
            { 'Content-Type': mimeType ?? 'application/octet-stream' },
        );
        return { bucket: this.bucket, objectName };
    }

    async getPresignedUrl(objectName: string, expirySeconds = 3600) {
        return this.minio.presignedGetObject(this.bucket, objectName, expirySeconds);
    }
}
