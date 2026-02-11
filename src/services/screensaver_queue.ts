import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueuedScreensaver } from '../types';

const STORAGE_KEY = '@send-to-x4/screensaver-queue';

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
    height?: number
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
