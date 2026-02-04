import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Settings } from '../types';

const DEFAULTS: Settings = {
    firmwareType: 'crosspoint',
    stockIp: '192.168.3.3',
    crossPointIp: '192.168.1.224',
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
    return settings.firmwareType === 'crosspoint'
        ? settings.crossPointIp
        : settings.stockIp;
}

/**
 * Get default IP for a firmware type
 */
export function getDefaultIp(firmwareType: 'stock' | 'crosspoint'): string {
    return firmwareType === 'crosspoint' ? DEFAULTS.crossPointIp : DEFAULTS.stockIp;
}
