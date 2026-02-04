import JSZip from 'jszip';
import type { Article, EpubResult } from '../types';
import { sanitizeFilename, generateUuid } from '../utils/sanitizer';
import {
    CONTAINER_XML,
    generateContentOpf,
    generateTocNcx,
    generateContentXhtml,
} from '../utils/epubTemplates';

/**
 * Build an EPUB file from an article
 */
export async function buildEpub(article: Article): Promise<EpubResult> {
    const zip = new JSZip();
    const uuid = generateUuid();

    // 1. mimetype (MUST be first, MUST be uncompressed)
    // JSZip doesn't guarantee file order, but we add it first for best compatibility
    zip.file('mimetype', 'application/epub+zip', {
        compression: 'STORE'
    });

    // 2. META-INF/container.xml
    zip.file('META-INF/container.xml', CONTAINER_XML);

    // 3. OEBPS/content.opf (package metadata)
    zip.file('OEBPS/content.opf', generateContentOpf({
        title: article.title,
        author: article.author,
        date: article.date,
        uuid,
    }));

    // 4. OEBPS/toc.ncx (navigation)
    zip.file('OEBPS/toc.ncx', generateTocNcx({
        title: article.title,
        uuid,
    }));

    // 5. OEBPS/content.xhtml (the actual article content)
    zip.file('OEBPS/content.xhtml', generateContentXhtml(article));

    // Generate EPUB (ZIP archive)
    const data = await zip.generateAsync({
        type: 'uint8array',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    });

    return {
        data,
        filename: generateFilename(article),
    };
}

/**
 * Generate a descriptive filename for the EPUB
 */
function generateFilename(article: Article): string {
    const parts: string[] = [];

    // Title (max 50 chars)
    const safeTitle = sanitizeFilename(article.title, 50);
    parts.push(safeTitle || 'Untitled');

    // Author (max 30 chars)
    if (article.author) {
        const safeAuthor = sanitizeFilename(article.author, 30);
        if (safeAuthor) {
            parts.push(safeAuthor);
        }
    }

    // Source domain
    try {
        const hostname = new URL(article.sourceUrl).hostname.replace(/^www\./, '');
        parts.push(hostname);
    } catch {
        // Ignore invalid URLs
    }

    // Date
    const date = article.date || new Date().toISOString().split('T')[0];
    parts.push(date);

    return parts.join(' - ') + '.epub';
}
