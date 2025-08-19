import { Injectable } from '@nestjs/common';
import pdf from 'pdf-parse';

export interface PageText { page: number; text: string; }

@Injectable()
export class PdfTextExtractor {

    private normalize(t: string) {
        return t
            .replace(/\u00AD/g, '')            // soft hyphen
            .replace(/-\s*\n/g, '')            // zalomené slovní dělení (když by se objevilo)
            .replace(/\s+([.,;:?!%])/g, '$1')  // mezera před interpunkcí pryč
            .replace(/\s+/g, ' ')              // zkonzistentni mezery
            .trim();
    }

    async extractPerPage(buffer: Buffer): Promise<PageText[]> {
        const pages: string[] = [];
        await pdf(buffer, {
            pagerender: async (pageData: any) => {
                const content = await pageData.getTextContent();
                const text = content.items.map((i: any) => i.str).join(' ');
                pages.push(this.normalize(text));
                return text;
            },
        });
        return pages.map((text, i) => ({ page: i + 1, text }));
    }
}
