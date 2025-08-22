import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PageText } from './text-extractor.types';

@Injectable()
export class DocxTextExtractor {
    private normalize(t: string) {
        return t
            .replace(/\u00AD/g, '')
            .replace(/\s+([.,;:?!%])/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async extractPerPage(buffer: Buffer): Promise<PageText[]> {
        // mammoth vrací raw text; „stránky“ u DOCX neexistují → rozřežeme podle prázdných řádků / odstavců
        const res = await mammoth.extractRawText({ buffer });
        const chunks = res.value.split(/\n{2,}/).map(s => this.normalize(s)).filter(Boolean);
        if (chunks.length === 0) return [{ page: 1, text: this.normalize(res.value) }];
        return chunks.map((text, i) => ({ page: i + 1, text }));
    }
}
