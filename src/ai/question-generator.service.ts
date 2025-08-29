// src/ai/question-generator.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { OPENAI_CLIENT } from 'src/ai/ai.module';
import { QuestionEntity, QuestionKind } from '../tests/schemas/question.schema';

// ---------- Zod schéma ----------
const QBase = z.object({
    kind: z.enum(['mcq', 'msq', 'tf', 'cloze', 'short', 'match', 'order']),
    text: z.string().min(8),
    rationale: z.string().optional(),
    source: z.object({ chunkId: z.string().optional(), fileId: z.string().optional() }).optional(),
});
const QMcq = QBase.extend({ kind: z.literal('mcq'), options: z.array(z.string()).min(2), correctIndices: z.array(z.number().int().min(0)).length(1) });
const QMsq = QBase.extend({ kind: z.literal('msq'), options: z.array(z.string()).min(2), correctIndices: z.array(z.number().int().min(0)).min(1) });
const QTf = QBase.extend({ kind: z.literal('tf'), correctBool: z.boolean() });
const QCloze = QBase.extend({ kind: z.literal('cloze'), clozeAnswers: z.array(z.string().min(1)).min(1) });
const QShort = QBase.extend({ kind: z.literal('short'), acceptableAnswers: z.array(z.string().min(1)).min(1) });
const QMatch = QBase.extend({ kind: z.literal('match'), matchLeft: z.array(z.string().min(1)).min(2), matchRight: z.array(z.string().min(1)).min(2) });
const QOrder = QBase.extend({ kind: z.literal('order'), orderItems: z.array(z.string().min(1)).min(3) });

const QUnion = z.union([QMcq, QMsq, QTf, QCloze, QShort, QMatch, QOrder]);
const PayloadZ = z.object({ questions: z.array(QUnion).min(1) });

type ChunkIn = { id: string; text: string; fileId?: string };

@Injectable()
export class QuestionGeneratorService {
    private readonly log = new Logger(QuestionGeneratorService.name);
    private readonly model: string;
    private readonly maxTokens: number;

    constructor(
        private cfg: ConfigService,
        @Inject(OPENAI_CLIENT) private openai: OpenAI,
    ) {
        this.model = this.cfg.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
        this.maxTokens = Number(this.cfg.get('OPENAI_MAX_OUTPUT_TOKENS') ?? 1800);
    }

    async generateFromChunks(
        chunks: ChunkIn[],
        count: number,
        mix?: Partial<Record<QuestionKind, number>>,
    ): Promise<QuestionEntity[]> {
        if (!chunks.length || count <= 0) return [];

        const picked = this.pickDiverse(chunks, Math.min(count * 2, 24));
        const mixText = this.normalizeMix(mix);

        const system =
            `Jsi zkoušející. Z dodaných úryvků vytváříš validované testové otázky více typů (mcq, msq, tf, cloze, short, match, order).
Pravidla:
- Vrať výstup POUZE jako volání funkce dle JSON schématu (tools/functions), žádný volný text.
- Otázky musí být zodpověditelné čistě z úryvků; jazyk čeština.
- Cloze: používej {{gap1}}, {{gap2}}, … a clozeAnswers stejné délky.
- Matching: páry jsou na stejném indexu (left[i] ↔ right[i]).
- Ordering: orderItems jsou ve správném pořadí.
- U každé otázky vyplň source.chunkId (a fileId, pokud existuje).
- Mix typů (orientačně): ${mixText}.`;

        const user =
            `Vytvoř maximálně ${count} otázek podle mixu typů.

Úryvky:
${picked.map((c, i) => `#${i + 1} chunkId=${c.id} fileId=${c.fileId ?? ''}\n${c.text}`).join('\n\n')}`;

        const tool = {
            type: 'function' as const,
            function: {
                name: 'return_questions',
                description: 'Vrátí dávku vygenerovaných otázek podle schématu',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        questions: {
                            type: 'array',
                            minItems: 1,
                            maxItems: count,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', enum: ['mcq', 'msq', 'tf', 'cloze', 'short', 'match', 'order'] },
                                    text: { type: 'string' },
                                    rationale: { type: 'string' },
                                    source: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: { chunkId: { type: 'string' }, fileId: { type: 'string' } }
                                    },
                                    options: { type: 'array', items: { type: 'string' } },
                                    correctIndices: { type: 'array', items: { type: 'integer' } },
                                    correctBool: { type: 'boolean' },
                                    clozeAnswers: { type: 'array', items: { type: 'string' } },
                                    acceptableAnswers: { type: 'array', items: { type: 'string' } },
                                    matchLeft: { type: 'array', items: { type: 'string' } },
                                    matchRight: { type: 'array', items: { type: 'string' } },
                                    orderItems: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['kind', 'text']
                            }
                        }
                    },
                    required: ['questions']
                }
            }
        };
        const legacyFn = { name: 'return_questions', description: tool.function.description, parameters: tool.function.parameters };

        try {
            const argsStr = await this.callOpenAIWithRetry({
                model: this.model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
                tool,
                legacyFunction: legacyFn,
                maxTokens: this.maxTokens,
            });

            const parsed = safeJSON(argsStr);
            const data = PayloadZ.safeParse(parsed);
            if (!data.success) {
                this.log.warn('AI payload validation failed');
                return [];
            }

            const sanitized = this.sanitizeQuestions(data.data.questions, picked);
            return sanitized.slice(0, count);
        } catch (err: any) {
            if (err?.status === 429) {
                this.log.warn('AI quota/rate limited – falling back to fake.');
                return [];
            }
            this.log.error(`AI generation failed: ${err?.message ?? err}`);
            return [];
        }
    }

    // ---------- Retry + správné token parametry ----------
    private modelWantsMaxCompletionTokens(model: string) {
        // Heuristika pro nové modely (gpt-5*, o4*, o3*, 4o*, 4o-mini…)
        return /(^(gpt-5|o4|o3))|4o/i.test(model);
    }

    private async callOpenAIWithRetry(args: {
        model: string;
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
        tool: any;
        legacyFunction: any;
        maxTokens: number;
    }): Promise<string> {
        const attempts = 2;
        let lastErr: any;

        for (let i = 0; i < attempts; i++) {
            try {
                // ---- 1) pokus: TOOLS ONLY ----
                const useMaxCompletion = this.modelWantsMaxCompletionTokens(args.model);
                const toolsPayload: any = {
                    model: args.model,
                    messages: args.messages,
                    // N E M Í T  functions  Z D E !
                    tools: [args.tool],
                    tool_choice: { type: 'function', function: { name: 'return_questions' } },
                    temperature: 0.2,
                };
                if (useMaxCompletion) toolsPayload.max_completion_tokens = args.maxTokens;
                else toolsPayload.max_tokens = args.maxTokens;

                const cc = await this.openai.chat.completions.create(toolsPayload);
                const msg: any = cc.choices?.[0]?.message;
                const tc = Array.isArray(msg?.tool_calls) ? msg.tool_calls[0] : undefined;
                const argsStr = String(
                    tc?.function?.arguments ??
                    tc?.arguments ??
                    '{}'
                );
                return argsStr;
            } catch (e: any) {
                // pokud není rate-limit a 400 není „tools not supported“, zkusíme functions fallback
                lastErr = e;
                if (e?.status === 429 && i < attempts - 1) {
                    const wait = (300 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                // ---- 2) fallback: FUNCTIONS ONLY (legacy) ----
                try {
                    const useMaxCompletion = this.modelWantsMaxCompletionTokens(args.model);
                    const funcPayload: any = {
                        model: args.model,
                        messages: args.messages,
                        // N E M Í T  tools  Z D E !
                        functions: [args.legacyFunction],
                        function_call: { name: 'return_questions' },
                        temperature: 0.2,
                    };
                    if (useMaxCompletion) funcPayload.max_completion_tokens = args.maxTokens;
                    else funcPayload.max_tokens = args.maxTokens;

                    const cc2 = await this.openai.chat.completions.create(funcPayload);
                    const msg2: any = cc2.choices?.[0]?.message;
                    const argsStr2 = String(msg2?.function_call?.arguments ?? '{}');
                    return argsStr2;
                } catch (e2: any) {
                    lastErr = e2;
                    if (e2?.status === 429 && i < attempts - 1) {
                        const wait = (300 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
                        await new Promise(r => setTimeout(r, wait));
                        continue;
                    }
                    // jinak propadneme ven a necháme vyšší vrstvu fallbacknout na fake
                    throw e2;
                }
            }
        }
        throw lastErr;
    }

    // ---------- Sanitizace ----------
    private sanitizeQuestions(qs: any[], picked: ChunkIn[]): QuestionEntity[] {
        const out: QuestionEntity[] = [];
        const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

        for (let i = 0; i < qs.length; i++) {
            const q = qs[i] ?? {};
            if (!q.source?.chunkId && picked.length) {
                const src = picked[i % picked.length];
                q.source = { ...(q.source || {}), chunkId: src.id, fileId: src.fileId };
            }

            switch (q.kind) {
                case 'mcq': {
                    const options = dedupeStrings(Array.isArray(q.options) ? q.options : []);
                    const rawCI = Array.isArray(q.correctIndices) ? (q.correctIndices as unknown[]) : [];
                    const ci = rawCI.map(x => clamp((Number(x) | 0), 0, Math.max(0, options.length - 1)));
                    if (!options.length || ci.length !== 1) break;
                    out.push({
                        kind: 'mcq', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source,
                        options: options as string[], correctIndices: [ci[0]] as number[]
                    });
                    break;
                }
                case 'msq': {
                    const options = dedupeStrings(Array.isArray(q.options) ? q.options : []);
                    const rawCI = Array.isArray(q.correctIndices) ? (q.correctIndices as unknown[]) : [];
                    const ci = Array.from(new Set(rawCI.map(x => clamp((Number(x) | 0), 0, Math.max(0, options.length - 1)))));
                    if (!options.length || !ci.length) break;
                    out.push({
                        kind: 'msq', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source,
                        options: options as string[], correctIndices: ci as number[]
                    });
                    break;
                }
                case 'tf': {
                    if (typeof q.correctBool !== 'boolean') break;
                    out.push({
                        kind: 'tf', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source,
                        correctBool: q.correctBool as boolean
                    });
                    break;
                }
                case 'cloze': {
                    const text = String(q.text ?? '').trim();
                    const gaps = (text.match(/{{gap\d+}}/g) || []).length;
                    const answers = (Array.isArray(q.clozeAnswers) ? q.clozeAnswers : []).map(s => String(s ?? '').trim()).filter(Boolean) as string[];
                    if (!gaps || !answers.length) break;
                    out.push({ kind: 'cloze', text, rationale: q.rationale, source: q.source, clozeAnswers: answers.slice(0, gaps) as string[] });
                    break;
                }
                case 'short': {
                    const acc = Array.from(new Set((Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [])
                        .map(s => String(s ?? '').trim()).filter(Boolean))) as string[];
                    if (!acc.length) break;
                    out.push({ kind: 'short', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source, acceptableAnswers: acc as string[] });
                    break;
                }
                case 'match': {
                    const L = (Array.isArray(q.matchLeft) ? q.matchLeft : []).map(s => String(s ?? '').trim()).filter(Boolean) as string[];
                    const R = (Array.isArray(q.matchRight) ? q.matchRight : []).map(s => String(s ?? '').trim()).filter(Boolean) as string[];
                    const n = Math.min(L.length, R.length);
                    if (n < 2) break;
                    out.push({
                        kind: 'match', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source,
                        matchLeft: L.slice(0, n) as string[], matchRight: R.slice(0, n) as string[]
                    });
                    break;
                }
                case 'order': {
                    const items = (Array.isArray(q.orderItems) ? q.orderItems : []).map(s => String(s ?? '').trim()).filter(Boolean) as string[];
                    if (items.length < 3) break;
                    out.push({ kind: 'order', text: String(q.text ?? '').trim(), rationale: q.rationale, source: q.source, orderItems: items as string[] });
                    break;
                }
                default: break;
            }
        }
        return out;
    }

    // ---------- Helpers ----------
    private normalizeMix(m?: Partial<Record<QuestionKind, number>>) {
        if (!m) return 'mcq:40, msq:20, tf:10, cloze:10, short:10, match:5, order:5';
        const entries = Object.entries(m).filter(([, v]) => typeof v === 'number' && (v as number) > 0);
        if (!entries.length) return 'mcq:60, tf:20, msq:10, cloze:5, short:5';
        const sum = entries.reduce((s, [, v]) => s + (v as number), 0);
        return entries.map(([k, v]) => `${k}:${Math.round(100 * (v as number) / sum)}`).join(', ');
    }

    private pickDiverse<T extends { fileId?: string }>(items: T[], k: number): T[] {
        if (items.length <= k) return items;
        const byFile = new Map<string, T[]>();
        for (const it of items) {
            const key = it.fileId ?? '_';
            if (!byFile.has(key)) byFile.set(key, []);
            byFile.get(key)!.push(it);
        }
        const res: T[] = [];
        while (res.length < k) {
            let added = false;
            for (const arr of byFile.values()) {
                if (!arr.length) continue;
                res.push(arr.shift()!);
                added = true;
                if (res.length === k) break;
            }
            if (!added) break;
        }
        return res;
    }
}

// ---------- Utils ----------
function safeJSON(s: string) { try { return JSON.parse(s); } catch { return {}; } }
function dedupeStrings(arr: unknown[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
        const s = String(v ?? '').trim();
        if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
}
