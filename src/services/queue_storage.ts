import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueuedArticle } from '../types';
import { deleteCachedEpub, clearEpubCache } from './queue_prefetch';

// Helper to safely decode URI components without crashing on invalid escapes (like "100%")
function safeDecodeURIComponent(str: string): string {
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}

const STORAGE_KEY = '@send-to-x4/queue';

// ── Mutex for serializing read-modify-write cycles ──────────────────
// Prevents concurrent operations (dump updates + share intent adds)
// from clobbering each other via interleaved reads/writes.

let _lock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    const prev = _lock;
    _lock = next;

    return prev.then(async () => {
        try {
            return await fn();
        } finally {
            release!();
        }
    });
}

// ── Core read/write (internal, always called inside lock) ───────────

async function readQueue(): Promise<QueuedArticle[]> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
            return JSON.parse(json) as QueuedArticle[];
        }
    } catch (error) {
        console.warn('Failed to load queue:', error);
    }
    return [];
}

async function writeQueue(queue: QueuedArticle[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Load all queued articles from storage.
 * Also recovers any items stuck in 'processing' state (from app kill mid-dump)
 * by resetting them to 'pending'.
 */
export async function getQueue(): Promise<QueuedArticle[]> {
    return withLock(async () => {
        const queue = await readQueue();

        // Recovery: reset any 'processing' items to 'pending'.
        // These were mid-flight when the app was killed/crashed.
        let needsWrite = false;
        for (let i = 0; i < queue.length; i++) {
            if (queue[i].status === 'processing') {
                queue[i] = { ...queue[i], status: 'pending', errorMessage: undefined };
                needsWrite = true;
            }
        }
        if (needsWrite) {
            await writeQueue(queue);
        }

        return queue;
    });
}

/**
 * Add a URL or Local File to the queue
 */
export async function addToQueue(
    content: string,
    title?: string,
    isLocalFile?: boolean,
    cachedEpubPath?: string,
    cachedEpubFilename?: string,
): Promise<QueuedArticle> {
    return withLock(async () => {
        const queue = await readQueue();

        const item: QueuedArticle = {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            url: content.trim(),
            title: title || (isLocalFile ? content.split('/').pop() : extractDisplayTitle(content)),
            addedAt: Date.now(),
            status: 'pending',
            isLocalFile,
            cachedEpubPath,
            cachedEpubFilename,
        };

        queue.push(item);
        await writeQueue(queue);
        return item;
    });
}

/**
 * Remove a single item from the queue by ID
 */
export async function removeFromQueue(id: string): Promise<void> {
    return withLock(async () => {
        const queue = await readQueue();
        // Delete cached EPUB file if present
        const item = queue.find(i => i.id === id);
        if (item?.cachedEpubPath) {
            deleteCachedEpub(item.cachedEpubPath).catch(() => { });
        }
        const filtered = queue.filter(item => item.id !== id);
        await writeQueue(filtered);
    });
}

/**
 * Update a queue item (e.g., status, errorMessage).
 * Used by the queue processor during dump.
 */
export async function updateQueueItem(
    id: string,
    updates: Partial<Pick<QueuedArticle, 'status' | 'errorMessage' | 'cachedEpubPath' | 'cachedEpubFilename'>>
): Promise<void> {
    return withLock(async () => {
        const queue = await readQueue();
        const index = queue.findIndex(item => item.id === id);
        if (index !== -1) {
            queue[index] = { ...queue[index], ...updates };
            await writeQueue(queue);
        }
    });
}

/**
 * Get the number of items in the queue
 */
export async function getQueueCount(): Promise<number> {
    return withLock(async () => {
        const queue = await readQueue();
        return queue.length;
    });
}

/**
 * Reset all failed items back to pending (for retry)
 */
export async function resetFailedItems(): Promise<void> {
    return withLock(async () => {
        const queue = await readQueue();
        const updated = queue.map(item =>
            item.status === 'failed'
                ? { ...item, status: 'pending' as const, errorMessage: undefined }
                : item
        );
        await writeQueue(updated);
    });
}

/**
 * Clear the entire queue
 */
export async function clearQueue(): Promise<void> {
    return withLock(async () => {
        await writeQueue([]);
        // Clean up all cached EPUB files
        await clearEpubCache();
    });
}

/**
 * Extract a display-friendly title from a URL
 */
function extractDisplayTitle(url: string): string {
    try {
        const parsed = new URL(url.trim());
        const domain = parsed.hostname.replace(/^www\./, '');

        // Try to get a readable path segment
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            const lastPart = safeDecodeURIComponent(pathParts[pathParts.length - 1]);
            // Clean up common URL patterns
            const cleaned = lastPart
                .replace(/[-_]/g, ' ')
                .replace(/\.\w+$/, '') // remove file extension
                .trim();
            if (cleaned.length > 3) {
                return `${cleaned} — ${domain}`;
            }
        }

        return domain;
    } catch {
        return url.substring(0, 50);
    }
}
