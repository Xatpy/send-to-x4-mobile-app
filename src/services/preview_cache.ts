import AsyncStorage from '@react-native-async-storage/async-storage';

const PREVIEW_CACHE_KEY = '@x4_screensaver_preview_cache';

export async function savePreviewMapping(filename: string, previewUrl: string): Promise<void> {
    try {
        const existingData = await AsyncStorage.getItem(PREVIEW_CACHE_KEY);
        const cache: Record<string, string> = existingData ? JSON.parse(existingData) : {};

        cache[filename] = previewUrl;

        await AsyncStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Failed to save preview mapping to cache', e);
    }
}

export async function getPreviewMapping(): Promise<Record<string, string>> {
    try {
        const existingData = await AsyncStorage.getItem(PREVIEW_CACHE_KEY);
        return existingData ? JSON.parse(existingData) : {};
    } catch (e) {
        console.warn('Failed to read preview mapping from cache', e);
        return {};
    }
}

export async function removePreviewMapping(filename: string): Promise<void> {
    try {
        const existingData = await AsyncStorage.getItem(PREVIEW_CACHE_KEY);
        if (!existingData) return;

        const cache: Record<string, string> = JSON.parse(existingData);
        if (cache[filename]) {
            delete cache[filename];
            await AsyncStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
        }
    } catch (e) {
        console.warn('Failed to remove preview mapping from cache', e);
    }
}
