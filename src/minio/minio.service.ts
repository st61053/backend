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

    // Pomocná: vytvoří bucket, pokud neexistuje
    async ensureBucket() {
        const exists = await this.minio.bucketExists(this.bucket).catch(() => false);
        if (!exists) {
            // region může být libovolný string; u lokálního MinIO je to jedno
            await this.minio.makeBucket(this.bucket, 'us-east-1');
        }
    }

    // Uložení objektu (POZOR na pořadí argumentů: size je 4., metadata 5.)
    async uploadObject(objectName: string, data: Buffer, mimeType?: string) {
        await this.ensureBucket();
        await this.minio.putObject(
            this.bucket,
            objectName,
            data,
            data.length, // nebo file.size, pokud voláš z controlleru
            { 'Content-Type': mimeType ?? 'application/octet-stream' },
        );
        return { bucket: this.bucket, objectName };
    }

    // Presigned GET URL (download)
    async getPresignedUrl(objectName: string, expirySeconds = 3600) {
        return this.minio.presignedGetObject(this.bucket, objectName, expirySeconds);
    }

    // ✅ Chybějící metoda pro mazání objektu
    async removeObject(objectName: string) {
        await this.minio.removeObject(this.bucket, objectName);
    }

    // Volitelně hromadné mazání
    async removeObjects(objectNames: string[]) {
        if (!objectNames?.length) return;
        await this.minio.removeObjects(this.bucket, objectNames);
    }

    // Malý getter na název bucketu (pro zápis do Mongo apod.)
    bucketName() {
        return this.bucket;
    }
}
