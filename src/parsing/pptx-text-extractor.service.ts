import { Injectable } from '@nestjs/common';
import { PageText } from './text-extractor.types';
import JSZip from 'jszip';

@Injectable()
export class PptxTextExtractor {
    private normalize(t: string) {
        return t
            .replace(/\u00AD/g, '')
            .replace(/\s+([.,;:?!%])/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async extractPerPage(buffer: Buffer): Promise<PageText[]> {
        const zip = await JSZip.loadAsync(buffer);
        // najdi všechny slidy
        const slidePaths = Object.keys(zip.files)
            .filter(p => p.startsWith('ppt/slides/slide') && p.endsWith('.xml'))
            .sort((a, b) => {
                const na = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
                const nb = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
                return na - nb;
            });

        const pages: PageText[] = [];
        for (let i = 0; i < slidePaths.length; i++) {
            const xml = await zip.file(slidePaths[i])!.async('string');
            // vytáhni všechny textové běhy <a:t> ... </a:t>
            const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map(m => m[1]);
            const text = this.normalize(texts.join(' '));
            pages.push({ page: i + 1, text });
        }
        if (pages.length === 0) return [{ page: 1, text: '' }];
        return pages;
    }
}
