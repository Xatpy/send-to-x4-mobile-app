/**
 * queue_prefetch.ts — Pre-fetches article content at queue time.
 *
 * When the user taps "Queue", we immediately extract the article and
 * build an EPUB, saving it to local storage. This allows sending to
 * the X4 even when the phone is offline (connected to X4 hotspot).
 */

import {
    documentDirectory,
    getInfoAsync,
    makeDirectoryAsync,
    writeAsStringAsync,
    readAsStringAsync,
    deleteAsync,
    EncodingType,
} from 'expo-file-system/legacy';
import { extractArticle } from './extractor';
import { buildEpub } from './epub_builder';

const CACHE_DIR = `${documentDirectory}epub_cache/`;

export interface PrefetchResult {
    success: boolean;
    /** Local filesystem path to the cached EPUB */
    path?: string;
    /** Filename for upload (e.g. "Title - Author - domain - 2026-02-17.epub") */
    filename?: string;
    /** Extracted article title */
    title?: string;
    /** Error message if prefetch failed */
    error?: string;
}

/**
 * Ensure the cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
    const info = await getInfoAsync(CACHE_DIR);
    if (!info.exists) {
        await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
}

/**
 * Pre-fetch an article: extract content, build EPUB, save to local cache.
 *
 * Returns the cached file path and metadata on success.
 * On failure, returns { success: false, error } — caller should still
 * queue the URL (without cache) as a fallback.
 */
export async function prefetchArticle(url: string): Promise<PrefetchResult> {
    try {
        // 1. Extract article content
        const extraction = await extractArticle(url);

        if (!extraction.success || !extraction.article) {
            return {
                success: false,
                error: extraction.error || 'Failed to extract article',
            };
        }

        // 2. Build EPUB
        const epub = await buildEpub(extraction.article);

        // 3. Save to local cache
        await ensureCacheDir();

        const cacheFilename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.epub`;
        const cachePath = `${CACHE_DIR}${cacheFilename}`;

        // Write Uint8Array as base64
        const base64 = uint8ArrayToBase64(epub.data);
        await writeAsStringAsync(cachePath, base64, {
            encoding: EncodingType.Base64,
        });

        return {
            success: true,
            path: cachePath,
            filename: epub.filename,
            title: extraction.article.title,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown prefetch error',
        };
    }
}

/**
 * Delete a cached EPUB file. Silently ignores missing files.
 */
export async function deleteCachedEpub(path: string): Promise<void> {
    try {
        const info = await getInfoAsync(path);
        if (info.exists) {
            await deleteAsync(path, { idempotent: true });
        }
    } catch (error) {
        console.warn('[Prefetch] Failed to delete cached file:', path, error);
    }
}

/**
 * Delete all cached EPUBs in the cache directory.
 */
export async function clearEpubCache(): Promise<void> {
    try {
        const info = await getInfoAsync(CACHE_DIR);
        if (info.exists) {
            await deleteAsync(CACHE_DIR, { idempotent: true });
        }
    } catch (error) {
        console.warn('[Prefetch] Failed to clear cache directory:', error);
    }
}

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}
