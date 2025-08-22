import { Injectable } from '@nestjs/common';
import { PageText } from './text-extractor.types';
import { PdfTextExtractor } from './pdf-text-extractor.service';
import { DocxTextExtractor } from './docx-text-extractor.service';
import { PptxTextExtractor } from './pptx-text-extractor.service';
import { PlainTextExtractor } from './plain-text-extractor.service';

@Injectable()
export class UniversalTextExtractor {
    constructor(
        private readonly pdf: PdfTextExtractor,
        private readonly docx: DocxTextExtractor,
        private readonly pptx: PptxTextExtractor,
        private readonly plain: PlainTextExtractor,
    ) { }

    async extractPerPage(
        buffer: Buffer,
        opts: { mime?: string; filename?: string } = {},
    ): Promise<PageText[]> {
        const { mime, filename } = opts;
        const ext = (filename?.split('.').pop() || '').toLowerCase();

        if (mime === 'application/pdf' || ext === 'pdf') return this.pdf.extractPerPage(buffer);
        if (mime?.includes('word') || ext === 'docx') return this.docx.extractPerPage(buffer);
        if (mime?.includes('presentation') || ext === 'pptx') return this.pptx.extractPerPage(buffer);
        if (mime?.startsWith('text/') || ext === 'txt' || ext === 'md') return this.plain.extractPerPage(buffer);

        // fallback heuristika
        try { return await this.docx.extractPerPage(buffer); } catch { }
        try { return await this.pptx.extractPerPage(buffer); } catch { }
        return this.plain.extractPerPage(buffer);
    }
}
