import { QuestionEntity } from '../schemas/question.schema';

export function redactQuestions(qs: QuestionEntity[]) {
    return qs.map(q => {
        const base: any = { kind: q.kind, text: q.text, rationale: q.rationale, source: q.source };
        switch (q.kind) {
            case 'mcq':
            case 'msq':
                return { ...base, options: q.options ?? [] };          // bez correctIndices
            case 'tf':
                return { ...base };                                     // bez correctBool
            case 'cloze':
                return { ...base };                                     // bez clozeAnswers
            case 'short':
                return { ...base };                                     // bez acceptableAnswers
            case 'match':
                return { ...base, matchLeft: q.matchLeft ?? [], matchRight: q.matchRight ?? [] };
            case 'order':
                return { ...base, orderItems: q.orderItems ?? [] };
            default:
                return base;
        }
    });
}
