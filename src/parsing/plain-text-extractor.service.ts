import { Injectable } from '@nestjs/common';
import { PageText } from './text-extractor.types';

@Injectable()
export class PlainTextExtractor {
    private normalize(t: string) {
        return t.replace(/\s+/g, ' ').trim();
    }
    async extractPerPage(buffer: Buffer): Promise<PageText[]> {
        return [{ page: 1, text: this.normalize(buffer.toString('utf8')) }];
    }
}
