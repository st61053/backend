// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import mongoose from 'mongoose';

@Controller('health')
export class HealthController {
    constructor(private health: HealthCheckService, private config: ConfigService) { }

    @Get()
    @HealthCheck()
    async check() {
        const mongoUri = this.config.get<string>('MONGO_URI')!;
        const redisUrl = this.config.get<string>('REDIS_URL')!;

        // Mongo
        let mongo = false;
        try { await mongoose.connect(mongoUri); mongo = true; } catch { }
        finally { try { await mongoose.disconnect(); } catch { } }

        // Redis
        let redis = false;
        try { const c = new Redis(redisUrl); redis = (await c.ping()) === 'PONG'; await c.quit(); } catch { }

        return { status: mongo && redis ? 'ok' : 'error', details: { mongo, redis } };
    }
}
