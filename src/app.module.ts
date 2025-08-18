// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthModule } from './health/health.module';
import { MinioModule } from './minio/minio.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,          // ↓ zpřístupní ConfigService všude (i v main.ts)
      envFilePath: ['.env'],   // volitelné; cesta k env souboru
    }),
    MinioModule, // klient na MinIO
    UploadModule, // upload endpoint
    TerminusModule,
    HealthModule,
  ],
})
export class AppModule { }
