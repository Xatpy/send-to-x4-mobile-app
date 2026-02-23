import AsyncStorage from '@react-native-async-storage/async-storage';
import { WallpaperItem } from './lowioWallpapers';

const STORAGE_KEY = '@x4_recent_wallpapers';
const MAX_RECENTS = 20;

export async function getRecentWallpapers(): Promise<WallpaperItem[]> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        return json ? JSON.parse(json) : [];
    } catch (error) {
        console.error('[WallpaperStorage] getRecentWallpapers failed', error);
        return [];
    }
}

export async function addRecentWallpaper(item: WallpaperItem): Promise<void> {
    try {
        const recents = await getRecentWallpapers();
        const existingIndex = recents.findIndex(r => r.hash === item.hash);

        if (existingIndex > -1) {
            recents.splice(existingIndex, 1);
        }

        recents.unshift(item);

        if (recents.length > MAX_RECENTS) {
            recents.pop();
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
    } catch (error) {
        console.error('[WallpaperStorage] addRecentWallpaper failed', error);
    }
}

export async function clearRecentWallpapers(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[WallpaperStorage] clearRecentWallpapers failed', e);
    }
}
