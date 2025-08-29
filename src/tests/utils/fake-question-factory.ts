// src/tests/utils/fake-question-factory.ts
import { QuestionEntity, QuestionKind } from '../schemas/question.schema';

const POOL = [
    'HTTP', 'TCP', 'UDP', 'DNS', 'REST', 'SOAP', 'JWT', 'Redis', 'MongoDB', 'Kafka',
    'gRPC', 'GraphQL', 'OAuth2', 'TLS', 'CDN', 'S3', 'JSON', 'YAML', 'XML'
];

const RELATED: Record<string, string[]> = {
    HTTP: ['REST', 'TLS', 'JSON', 'CDN'],
    TCP: ['UDP', 'TLS'],
    DNS: ['CDN', 'HTTP'],
    REST: ['HTTP', 'JSON', 'OAuth2'],
    JWT: ['OAuth2', 'HTTP'],
    Redis: ['Kafka', 'MongoDB'],
    MongoDB: ['JSON', 'Redis'],
    Kafka: ['Redis', 'JSON'],
    gRPC: ['HTTP', 'TLS'],
    GraphQL: ['HTTP', 'JSON'],
    OAuth2: ['JWT', 'HTTP'],
    TLS: ['HTTP', 'TCP'],
    CDN: ['HTTP', 'DNS'],
    S3: ['JSON', 'HTTP'],
    JSON: ['HTTP', 'REST', 'GraphQL', 'MongoDB'],
    YAML: ['JSON', 'XML'],
    XML: ['SOAP', 'HTTP'],
    UDP: ['TCP'],
    SOAP: ['HTTP', 'XML'],
};

function rand(n: number) { return Math.floor(Math.random() * n); }
function pick<T>(arr: T[]): T { return arr[rand(arr.length)]; }
function shuffle<T>(a: T[]) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rand(i + 1);[x[i], x[j]] = [x[j], x[i]]; } return x; }
function unique<T>(arr: T[]) { return Array.from(new Set(arr)); }
function sampleDistinct<T>(arr: T[], k: number, avoid: T[] = []): T[] {
    const pool = arr.filter(x => !avoid.includes(x));
    return shuffle(pool).slice(0, Math.max(0, Math.min(k, pool.length)));
}

function firstTokenFromText(text: string): string | null {
    // zkus najít známý pojem z POOL v textu
    const found = POOL.find(p => new RegExp(`\\b${p}\\b`, 'i').test(text));
    if (found) return found;
    // fallback: první „delší“ slovo
    const m = text.match(/[A-Za-zÀ-ž0-9+#.]{3,}/g);
    return m?.[0] ?? null;
}

/**
 * Vytvoř jednu fake otázku (typ náhodně, nebo vynucený přes param `kind`).
 * - Matching/Ordering: generujeme **správně seřazené** položky; FE může right/pořadí zamíchat pro UI.
 * - TF: generujeme tvrzení, které je **pravdivé** (correctBool = true), aby scoring bylo deterministické.
 * - MSQ: 2 správné odpovědi, zbytek distraktory (pokud není dost, padá na 1 správnou).
 */
export function makeFakeQuestion(
    text: string,
    fileId?: string,
    idx = 0,
    kind?: QuestionKind
): QuestionEntity {
    const token = firstTokenFromText(text) ?? pick(POOL);
    const related = RELATED[token] ?? [];
    const distractorPool = unique(POOL.filter(x => x !== token && !related.includes(x)));

    const choose: QuestionKind[] = kind ? [kind] : ['mcq', 'msq', 'tf', 'cloze', 'short', 'match', 'order'];
    const k = pick(choose);

    switch (k) {
        case 'mcq': {
            const distractors = sampleDistinct(distractorPool, 3);
            const options = shuffle([token, ...distractors]).slice(0, 4);
            const correct = options.indexOf(token);
            return {
                kind: 'mcq',
                text: `Který pojem nejlépe vystihuje úryvek #${idx + 1}?`,
                options,
                correctIndices: [Math.max(0, correct)],
                source: { fileId },
            };
        }

        case 'msq': {
            // 2 správné pokud lze (token + 1 related), jinak 1 správná
            const second = related.length ? pick(related) : null;
            const correctTokens = unique([token, ...(second ? [second] : [])]);
            const needDistr = Math.max(0, 5 - correctTokens.length);
            const distractors = sampleDistinct(distractorPool, needDistr, correctTokens);
            const options = shuffle(unique([...correctTokens, ...distractors])).slice(0, 5);
            const correctIndices = correctTokens
                .map(ct => options.indexOf(ct))
                .filter(i => i >= 0);

            // bezpečnost: kdyby se „second“ nedostal do options, ponech min. 1 správnou
            const effectiveCorrect = correctIndices.length ? correctIndices : [Math.max(0, options.indexOf(token))];

            return {
                kind: 'msq',
                text: `Vyber všechny pojmy relevantní k úryvku #${idx + 1}.`,
                options,
                correctIndices: effectiveCorrect,
                source: { fileId },
            };
        }

        case 'tf': {
            // true tvrzení pro deterministiku
            return {
                kind: 'tf',
                text: `„${token} je zmíněno nebo implikováno v úryvku #${idx + 1}.”`,
                correctBool: true,
                source: { fileId },
            };
        }

        case 'cloze': {
            // nahraď první výskyt tokenu placeholderem {{gap1}}; když není, vytvoř „doplnění“ na základě tokenu
            const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            let clozeText = text;
            if (re.test(text)) {
                clozeText = text.replace(re, '{{gap1}}');
            } else {
                clozeText = `Protokol {{gap1}} pracuje nad transportní vrstvou.`;
            }
            return {
                kind: 'cloze',
                text: clozeText.slice(0, 240),
                clozeAnswers: [token],
                source: { fileId },
            };
        }

        case 'short': {
            // krátká odpověď: akceptuj token + jeho lower-case
            const acc = unique([token, token.toLowerCase()]);
            return {
                kind: 'short',
                text: `Jedním slovem: klíčový pojem úryvku #${idx + 1}`,
                acceptableAnswers: acc,
                source: { fileId },
            };
        }

        case 'match': {
            // správné páry: left[i] ↔ right[i]; FE může right promíchat při zobrazení
            const left = ['Protokol', 'Databáze', 'Fronta', 'Formát'];
            const rightCorrect = ['HTTP', 'MongoDB', 'Kafka', 'JSON'];
            return {
                kind: 'match',
                text: `Spáruj pojmy související s úryvkem #${idx + 1}.`,
                matchLeft: left,
                matchRight: rightCorrect, // scoring očekává mapu i -> i
                source: { fileId },
            };
        }

        case 'order': {
            // správné pořadí (0..n-1); FE může zamíchat pro UI
            const items = ['Definice', 'Příklad', 'Výhody', 'Nevýhody'];
            return {
                kind: 'order',
                text: `Seřaď logickou strukturu tématu (úryvek #${idx + 1}).`,
                orderItems: items, // správný pořádek
                source: { fileId },
            };
        }
    }
}

/**
 * Volitelné: vygeneruje dávku otázek z textů (1 otázka na text).
 * Užitečné v lokálních utilitách/testech.
 */
export function makeFakeBatchFromChunks(
    chunks: Array<{ id: string; text: string; fileId?: string }>,
    forceKind?: QuestionKind
): QuestionEntity[] {
    return chunks.map((c, i) => makeFakeQuestion(c.text, c.fileId, i, forceKind));
}
