import { Injectable } from '@nestjs/common';
import { PageText } from './pdf-text-extractor.service';

@Injectable()
export class TextChunker {
    private isWordChar(ch: string) { return /\w|\p{L}/u.test(ch); }

    private snapBackward(all: string, pos: number, maxShift = 60) {
        for (let i = pos; i >= Math.max(0, pos - maxShift); i--) {
            const ch = all[i];
            if (ch === ' ' || /[.?!]/.test(ch)) return i + 1;
        }
        return pos; // nenašli jsme nic rozumného
    }

    private snapForward(all: string, pos: number, maxShift = 120) {
        // preferuj konec věty
        for (let i = pos; i <= Math.min(all.length - 1, pos + maxShift); i++) {
            const ch = all[i];
            if (/[.?!]/.test(ch)) return i + 1;
        }
        // nebo aspoň mezera
        for (let i = pos; i <= Math.min(all.length - 1, pos + maxShift); i++) {
            if (all[i] === ' ') return i + 1;
        }
        return pos;
    }

    split(documentId: string, pages: PageText[], size = 1000, overlap = 150) {
        const pageStarts: number[] = [];
        let offset = 0, all = '';
        for (const p of pages) { pageStarts.push(offset); all += p.text; offset += p.text.length; }

        const chunks: any[] = [];
        let idx = 0;

        for (let targetStart = 0; targetStart < all.length; targetStart += (size - overlap)) {
            // Snaž se nezačínat uprostřed slova
            let start = targetStart;
            if (start > 0 && this.isWordChar(all[start]) && this.isWordChar(all[start - 1])) {
                start = this.snapBackward(all, start);
            }

            let end = Math.min(start + size, all.length);
            // Snaž se nekončit uprostřed slova; raději na hranici věty/mezery
            if (end < all.length && this.isWordChar(all[end - 1]) && this.isWordChar(all[end])) {
                end = this.snapForward(all, end);
            }

            const text = all.substring(start, end);

            // přibližný mapping na stránky
            let pageFrom: number | undefined, pageTo: number | undefined;
            for (let i = 0; i < pageStarts.length; i++) {
                const ps = pageStarts[i];
                const pe = (i + 1 < pageStarts.length) ? pageStarts[i + 1] : all.length;
                if (pageFrom === undefined && start < pe) pageFrom = i + 1;
                if (end <= pe) { pageTo = i + 1; break; }
            }

            chunks.push({ documentId, index: idx++, text, startOffset: start, endOffset: end, pageFrom, pageTo });
            if (end === all.length) break;
        }
        return chunks;
    }
}
