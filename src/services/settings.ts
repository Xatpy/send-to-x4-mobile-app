import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Settings } from '../types';

const DEFAULTS: Settings = {
    firmwareType: 'crosspoint',
    stockIp: '192.168.3.3',
    crossPointIp: 'crosspoint.local',
};

const STORAGE_KEY = '@send-to-x4/settings';

/**
 * Get current settings from storage
 */
export async function getSettings(): Promise<Settings> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
            return { ...DEFAULTS, ...JSON.parse(json) };
        }
    } catch (error) {
        console.warn('Failed to load settings:', error);
    }
    return DEFAULTS;
}

/**
 * Save settings to storage
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
    try {
        const current = await getSettings();
        const updated = { ...current, ...settings };
        updated.stockIp = normalizeDeviceHost(updated.stockIp);
        updated.crossPointIp = normalizeDeviceHost(updated.crossPointIp);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
