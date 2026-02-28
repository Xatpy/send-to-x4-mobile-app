/**
 * note_epub_sender — Convert a text note to an EPUB and send it to the X4 device.
 *
 * Wraps the note text into an Article object and reuses the existing EPUB builder
 * and upload pipeline.
 */

import type { Article, UploadResult, Settings } from '../types';
import { buildEpub } from './epub_builder';
import { uploadToCrossPoint } from './crosspoint_upload';
import { uploadToStock } from './x4_upload';
import { getCurrentIp, getArticleFolder, resolveTargetFolder } from './settings';

/**
 * Convert plain text to simple HTML paragraphs.
 */
function textToHtml(text: string): string {
    return text
        .split(/\n{2,}/) // split on blank lines → paragraphs
        .map(para => {
            const escaped = para
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            // Preserve single newlines within a paragraph as <br/>
            return `<p>${escaped.replace(/\n/g, '<br/>')}</p>`;
        })
        .join('\n');
}

/**
 * Send a text note to the X4 device as an EPUB file.
 */
export async function sendNoteAsEpub(
    noteText: string,
    settings: Settings,
    title?: string,
    onProgress?: (percent: number) => void
): Promise<UploadResult> {
    const noteTitle = title?.trim() || 'Untitled Note';
    const date = new Date().toISOString().split('T')[0];

    // Build an Article from the note text
    const article: Article = {
        title: noteTitle,
        author: '',
        date,
        body: textToHtml(noteText),
        rawText: noteText,
        wordCount: noteText.split(/\s+/).filter(Boolean).length,
        sourceUrl: '',
    };

    const epub = await buildEpub(article);

    // Add a short timestamp suffix to avoid same-title/same-day collisions
    // (buildEpub uses title + date, but notes have no sourceUrl to disambiguate)
    const now = new Date();
    const timeSuffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = epub.filename.replace(/\.epub$/, ` - ${timeSuffix}.epub`);

    const ip = getCurrentIp(settings);
    const articleFolder = resolveTargetFolder(getArticleFolder(settings), settings.useDateFolders);

    console.log(`[NoteEpubSender] Sending note as EPUB: filename=${filename}, size=${epub.data.length} bytes`);

    if (settings.firmwareType === 'crosspoint') {
        return uploadToCrossPoint(ip, epub.data, filename, onProgress, articleFolder);
    } else {
        return uploadToStock(ip, epub.data, filename, articleFolder, onProgress);
    }
}
