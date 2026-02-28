/**
 * Design Storage — Persist Sleep Screen Editor state (draft) to AsyncStorage.
 *
 * Stores the full editor canvas as serializable JSON so the user can
 * navigate away and come back to continue editing without losing work.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CanvasElement } from '../screens/SleepScreenTab';

const STORAGE_KEY = '@send-to-x4/design-draft';

export interface DesignDraft {
    elements: CanvasElement[];
    doodlePaths: string[];
    isInverted: boolean;
    overwriteMain: boolean;
}

/**
 * Save the current editor state as a draft.
 */
export async function saveDesignDraft(draft: DesignDraft): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
        console.warn('[DesignStorage] Failed to save draft:', e);
    }
}

/**
 * Load the previously saved draft, if any.
 */
export async function loadDesignDraft(): Promise<DesignDraft | null> {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (!json) return null;
        return JSON.parse(json) as DesignDraft;
    } catch (e) {
        console.warn('[DesignStorage] Failed to load draft:', e);
        return null;
    }
}

/**
 * Clear the saved draft (e.g. after "Clear Design").
 */
export async function clearDesignDraft(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('[DesignStorage] Failed to clear draft:', e);
    }
}
