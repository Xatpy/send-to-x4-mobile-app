import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAsync } from 'expo-file-system/legacy';
import type { QueuedScreensaver } from '../types';

const STORAGE_KEY = '@send-to-x4/screensaver-queue';

/**
 * Delete the locally cached BMP file for a pre-downloaded queue item.
 * Only deletes files we own (isPreDownloaded); gallery URIs are left alone.
 */
async function cleanupLocalFile(item: QueuedScreensaver): Promise<void> {
    if (item.isPreDownloaded && item.uri) {
        try {
            await deleteAsync(item.uri, { idempotent: true });
        } catch (e) {
            console.warn(`[ScreensaverQueue] Failed to delete cached file ${item.uri}`, e);
        }
    }
}

/**
 * Get the current screensaver queue
 */
export async function getScreensaverQueue(): Promise<QueuedScreensaver[]> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
            return JSON.parse(json);
        }
    } catch (error) {
        console.warn('Failed to load screensaver queue:', error);
    }
    return [];
}

/**
 * Add an image to the queue
 */
export async function addToScreensaverQueue(
    uri: string,
    filename: string,
    width?: number,
    height?: number,
    sourceUrl?: string,
    isPreDownloaded?: boolean
): Promise<QueuedScreensaver> {
    const queue = await getScreensaverQueue();

    // Check if already in queue (by URI) to avoid duplicates? 
    // Usually images have unique URIs or we might want to allow duplicates if user intends it.
    // Let's allow duplicates for now, as user might crop differently (though we don't support crop yet).

    const newItem: QueuedScreensaver = {
        id: Date.now().toString(),
        uri,
        filename,
        width,
        height,
        addedAt: Date.now(),
        status: 'pending',
        sourceUrl,
        isPreDownloaded,
    };

    const newQueue = [newItem, ...queue]; // Add to top
    await saveQueue(newQueue);
    return newItem;
}

/**
 * Remove an item from the queue
 */
export async function removeFromScreensaverQueue(id: string): Promise<void> {
    const queue = await getScreensaverQueue();
    const item = queue.find(i => i.id === id);
    if (item) {
        await cleanupLocalFile(item);
    }
    const newQueue = queue.filter(item => item.id !== id);
    await saveQueue(newQueue);
}

/**
 * Update an item's status
 */
export async function updateScreensaverStatus(
    id: string,
    status: QueuedScreensaver['status'],
    error?: string
): Promise<void> {
    const queue = await getScreensaverQueue();
    const newQueue = queue.map(item => {
        if (item.id === id) {
            return { ...item, status, error };
        }
        return item;
    });
    await saveQueue(newQueue);
}

/**
 * Clear the entire queue
 */
export async function clearScreensaverQueue(): Promise<void> {
    const queue = await getScreensaverQueue();
    // Clean up all locally cached BMP files before clearing
    await Promise.all(queue.map(item => cleanupLocalFile(item)));
    await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Internal: save queue to storage
 */
async function saveQueue(queue: QueuedScreensaver[]): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
        console.warn('Failed to save screensaver queue:', error);
        throw error;
    }
}
