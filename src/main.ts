// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const config = app.get(ConfigService);        // teď už je k dispozici
  const port = Number(config.get('PORT')) || 3000;

  await app.listen(port);
  console.log(`🚀 Donkey Learn BE running on http://localhost:${port}`);
}
bootstrap();
