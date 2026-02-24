import type { QueuedArticle, DumpResult, Settings } from '../types';
import { getQueue, updateQueueItem, removeFromQueue } from './queue_storage';
import { extractArticle } from './extractor';
import { buildEpub } from './epub_builder';
import { uploadToCrossPoint, uploadLocalFileToCrossPoint } from './crosspoint_upload';
import { uploadToStock } from './x4_upload';
import { getCurrentIp, getArticleFolder, resolveTargetFolder } from './settings';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { deleteCachedEpub } from './queue_prefetch';

/**
 * Callback for progress updates during dump
 */
export type DumpProgressCallback = (current: number, total: number, title?: string) => void;
export type UploadProgressCallback = (percent: number) => void;

/** Decode a base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

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
    const articleFolder = resolveTargetFolder(getArticleFolder(settings), settings.useDateFolders);

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

                    const result = await uploadLocalFileToCrossPoint(ip, item.url, safeFilename, onUploadProgress, articleFolder);
                    if (!result.success) throw new Error(result.error);
                } else {
                    // Stock firmware doesn't support direct file upload easily without conversion?
                    // Or we just implement uploadToStock for files if needed. 
                    // For now, assume CrossPoint for file uploads or fallback.
                    throw new Error('Local file upload only supported on CrossPoint firmware');
                }
            } else if (item.cachedEpubPath && item.cachedEpubFilename) {
                let cachedData: Uint8Array | null = null;
                try {
                    // Pre-fetched EPUB exists — read from cache first.
                    const base64 = await readAsStringAsync(item.cachedEpubPath, {
                        encoding: EncodingType.Base64,
                    });
                    cachedData = base64ToUint8Array(base64);
                } catch (cacheError) {
                    // Cached file is missing/corrupt. Clear cache metadata and fallback to live extraction.
                    const cacheMessage = cacheError instanceof Error ? cacheError.message : 'Unknown cache error';
                    console.warn(`[QueueProcessor] Cached EPUB unavailable for ${item.url}. Falling back to extraction:`, cacheMessage);

                    await deleteCachedEpub(item.cachedEpubPath).catch(() => { });
                    await updateQueueItem(item.id, {
                        cachedEpubPath: undefined,
                        cachedEpubFilename: undefined,
                    });

                    const extraction = await extractArticle(item.url, { includeImages: settings.includeImagesInArticles });
                    if (!extraction.success || !extraction.article) {
                        throw new Error(extraction.error || 'Failed to extract article');
                    }

                    const epub = await buildEpub(extraction.article);

                    let fallbackUploadResult;
                    if (settings.firmwareType === 'crosspoint') {
                        fallbackUploadResult = await uploadToCrossPoint(ip, epub.data, epub.filename, onUploadProgress, articleFolder);
                    } else {
                        fallbackUploadResult = await uploadToStock(ip, epub.data, epub.filename, articleFolder);
                    }

                    if (!fallbackUploadResult.success) {
                        throw new Error(fallbackUploadResult.error || 'Upload failed');
                    }
                }

                if (cachedData) {
                    // Upload failure here should not invalidate a valid cache.
                    let uploadResult;
                    if (settings.firmwareType === 'crosspoint') {
                        uploadResult = await uploadToCrossPoint(ip, cachedData, item.cachedEpubFilename, onUploadProgress, articleFolder);
                    } else {
                        uploadResult = await uploadToStock(ip, cachedData, item.cachedEpubFilename, articleFolder);
                    }

                    if (!uploadResult.success) {
                        throw new Error(uploadResult.error || 'Upload failed');
                    }

                    // Clean up cached file after successful upload only.
                    await deleteCachedEpub(item.cachedEpubPath);
                }
            } else {
                // No cache — fallback to extract + build + upload (legacy items)
                const extraction = await extractArticle(item.url, { includeImages: settings.includeImagesInArticles });

                if (!extraction.success || !extraction.article) {
                    throw new Error(extraction.error || 'Failed to extract article');
                }

                const epub = await buildEpub(extraction.article);

                let uploadResult;
                if (settings.firmwareType === 'crosspoint') {
                    uploadResult = await uploadToCrossPoint(ip, epub.data, epub.filename, onUploadProgress, articleFolder);
                } else {
                    uploadResult = await uploadToStock(ip, epub.data, epub.filename, articleFolder);
                }

                if (!uploadResult.success) {
                    throw new Error(uploadResult.error || 'Upload failed');
                }
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
