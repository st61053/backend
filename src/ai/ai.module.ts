import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export const OPENAI_CLIENT = 'OPENAI_CLIENT';

@Global()
@Module({
    providers: [
        {
            provide: OPENAI_CLIENT,
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => {
                const apiKey = cfg.get<string>('OPENAI_API_KEY');
                if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
                return new OpenAI({
                    apiKey,
                    timeout: cfg.get<number>('OPENAI_TIMEOUT_MS') ?? 60000,
                });
            },
        },
    ],
    exports: [OPENAI_CLIENT],
})
export class AiModule { }
