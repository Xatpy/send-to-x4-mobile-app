import type { QueuedArticle, DumpResult, Settings } from '../types';
import { getQueue, updateQueueItem, removeFromQueue } from './queue_storage';
import { extractArticle } from './extractor';
import { buildEpub } from './epub_builder';
import { uploadToCrossPoint, uploadLocalFileToCrossPoint } from './crosspoint_upload';
import { uploadToStock } from './x4_upload';
import { getCurrentIp } from './settings';

/**
 * Callback for progress updates during dump
 */
export type DumpProgressCallback = (current: number, total: number, title?: string) => void;
export type UploadProgressCallback = (percent: number) => void;

/**
 * Process all pending items in the queue sequentially.
 * 
 * For each item:
 *   1. Extract article content
 *   2. Build EPUB
 *   3. Upload to X4
 *   4. On success → remove from queue
 *   5. On failure → mark as failed, continue to next
 * 
 * Returns a DumpResult summary.
 */
export async function processQueue(
    settings: Settings,
    onProgress?: DumpProgressCallback,
    onUploadProgress?: UploadProgressCallback
): Promise<DumpResult> {
    const queue = await getQueue();
    const pendingItems = queue.filter(item => item.status === 'pending' || item.status === 'failed');

    const result: DumpResult = {
        total: pendingItems.length,
        succeeded: 0,
        failed: [],
    };

    if (pendingItems.length === 0) {
        return result;
    }

    const ip = getCurrentIp(settings);

    for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];

        // Report progress
        onProgress?.(i + 1, pendingItems.length, item.title || item.url);

        // Mark as processing
        await updateQueueItem(item.id, { status: 'processing', errorMessage: undefined });

        try {
            // 1. Check if local file
            if (item.isLocalFile) {
                // console.log(`[QueueProcessor] Processing local file: ${item.url}`);
                // Direct upload
                if (settings.firmwareType === 'crosspoint') {
                    const filename = item.title || item.url.split('/').pop() || 'upload.epub';
                    // Ensure filename ends with .epub if not
                    const safeFilename = filename.toLowerCase().endsWith('.epub') ? filename : `${filename}.epub`;
                    // console.log(`[QueueProcessor] Local file upload: ${safeFilename}`);

                    const result = await uploadLocalFileToCrossPoint(ip, item.url, safeFilename, onUploadProgress);
                    if (!result.success) throw new Error(result.error);
                } else {
                    // Stock firmware doesn't support direct file upload easily without conversion?
                    // Or we just implement uploadToStock for files if needed. 
                    // For now, assume CrossPoint for file uploads or fallback.
                    throw new Error('Local file upload only supported on CrossPoint firmware');
                }
            } else {
                // 1. Extract article
                // console.log(`[QueueProcessor] Extracting article: ${item.url}`);
                const extraction = await extractArticle(item.url);

                if (!extraction.success || !extraction.article) {
                    throw new Error(extraction.error || 'Failed to extract article');
                }
                // console.log(`[QueueProcessor] Extraction succeeded: title="${extraction.article.title}"`);

                // 2. Build EPUB
                const epub = await buildEpub(extraction.article);
                // console.log(`[QueueProcessor] EPUB built: filename="${epub.filename}", dataSize=${epub.data.length}, isUint8Array=${epub.data instanceof Uint8Array}`);

                // 3. Upload to X4
                let uploadResult;
                if (settings.firmwareType === 'crosspoint') {
                    uploadResult = await uploadToCrossPoint(ip, epub.data, epub.filename, onUploadProgress);
                } else {
                    uploadResult = await uploadToStock(ip, epub.data, epub.filename);
                }

                if (!uploadResult.success) {
                    throw new Error(uploadResult.error || 'Upload failed');
                }
                // console.log(`[QueueProcessor] Upload succeeded for: ${epub.filename}`);
            }

            // Success — remove from queue
            await removeFromQueue(item.id);
            result.succeeded++;

        } catch (error) {
            // Failure — mark as failed, continue to next
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[QueueProcessor] Failed for ${item.url}:`, errorMessage);

            await updateQueueItem(item.id, {
                status: 'failed',
                errorMessage,
            });

            result.failed.push({
                id: item.id,
                url: item.url,
                title: item.title,
                error: errorMessage,
            });
        }
    }

    return result;
}
