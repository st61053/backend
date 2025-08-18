// src/minio/minio.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { MinioService } from './minio.service';


@Module({
    providers: [
        {
            provide: MinioClient,
            useFactory: (config: ConfigService) => {
                return new MinioClient({
                    endPoint: config.get<string>('MINIO_ENDPOINT', 'localhost'),
                    port: parseInt(config.get<string>('MINIO_PORT', '9000'), 10),
                    useSSL: config.get<string>('MINIO_USE_SSL', 'false') === 'true',
                    accessKey: config.get<string>('MINIO_ACCESS_KEY'),
                    secretKey: config.get<string>('MINIO_SECRET_KEY'),
                });
            },
            inject: [ConfigService],
        },
        MinioService,
    ],
    exports: [MinioService], // aby UploadController mohl použít MinioService
})
export class MinioModule { }
