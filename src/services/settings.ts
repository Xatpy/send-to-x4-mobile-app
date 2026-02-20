import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Settings } from '../types';

const DEFAULTS: Settings = {
    firmwareType: 'crosspoint',
    stockIp: '192.168.3.3',
    crossPointIp: 'crosspoint.local',
    articleFolder: 'send-to-x4',
    noteFolder: 'notes',
};

const STORAGE_KEY = '@send-to-x4/settings';

/**
 * Get current settings from storage
 */
export async function getSettings(): Promise<Settings> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
            const loaded: Settings = { ...DEFAULTS, ...JSON.parse(json) };
            loaded.articleFolder = sanitizeFolderName(loaded.articleFolder) || DEFAULTS.articleFolder;
            loaded.noteFolder = sanitizeFolderName(loaded.noteFolder) || DEFAULTS.noteFolder;
            return loaded;
        }
    } catch (error) {
        console.warn('Failed to load settings:', error);
    }
    return DEFAULTS;
}

/**
 * Save settings to storage
 */
export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
    try {
        const current = await getSettings();
        const updated = { ...current, ...settings };
        updated.stockIp = normalizeDeviceHost(updated.stockIp);
        updated.crossPointIp = normalizeDeviceHost(updated.crossPointIp);
        updated.articleFolder = sanitizeFolderName(updated.articleFolder) || DEFAULTS.articleFolder;
        updated.noteFolder = sanitizeFolderName(updated.noteFolder) || DEFAULTS.noteFolder;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch (error) {
        console.warn('Failed to save settings:', error);
        throw error;
    }
}

/**
 * Get the current device IP based on firmware type
 */
export function getCurrentIp(settings: Settings): string {
    const target = settings.firmwareType === 'crosspoint'
        ? settings.crossPointIp
        : settings.stockIp;
    return getDeviceHostForRuntime(target);
}

/**
 * Get default IP for a firmware type
 */
export function getDefaultIp(firmwareType: 'stock' | 'crosspoint'): string {
    return firmwareType === 'crosspoint' ? DEFAULTS.crossPointIp : DEFAULTS.stockIp;
}

/**
 * Normalize user-provided device target (IP or hostname).
 * Accepts bare hosts like "crosspoint.local" and strips accidental schemes/paths.
 */
export function normalizeDeviceHost(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';

    let host = trimmed.replace(/^https?:\/\//i, '');
    host = host.split('/')[0];
    return host;
}

/**
 * Resolve host to runtime-safe target.
 */
export function getDeviceHostForRuntime(value: string): string {
    return normalizeDeviceHost(value);
}

/**
 * Build the base URL for device API calls.
 */
export function getDeviceBaseUrl(value: string): string {
    return `http://${getDeviceHostForRuntime(value)}`;
}

/**
 * Sanitize a folder name: strip slashes, special chars, collapse whitespace → dashes.
 */
export function sanitizeFolderName(value: string): string {
    return value
        .trim()
        .replace(/[\/\\]/g, '')
        .replace(/[^a-zA-Z0-9\s._-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/^\.{1,2}$/, '')   // block bare "." or ".."
        .substring(0, 60);
}

/**
 * Get the article folder name from settings.
 */
export function getArticleFolder(settings: Settings): string {
    return settings.articleFolder || DEFAULTS.articleFolder;
}

/**
 * Get the note folder name from settings.
 */
export function getNoteFolder(settings: Settings): string {
    return settings.noteFolder || DEFAULTS.noteFolder;
}

/**
 * Get default folder name for a content type.
 */
export function getDefaultFolder(type: 'article' | 'note'): string {
    return type === 'article' ? DEFAULTS.articleFolder : DEFAULTS.noteFolder;
}
