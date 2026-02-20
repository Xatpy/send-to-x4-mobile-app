/**
 * note_sender — Convert a text note to a .txt file and send it to the X4 device.
 *
 * Uses the same upload pipeline as articles/screensavers (WebSocket for CrossPoint,
 * HTTP POST for Stock firmware).
 */

import type { UploadResult, Settings } from '../types';
import { uploadToCrossPoint } from './crosspoint_upload';
import { uploadToStock } from './x4_upload';
import { getCurrentIp, getNoteFolder } from './settings';

let lastTs = 0;
let sameTsCounter = 0;

function nextUniqueSuffix(): string {
    const now = Date.now();
    if (now === lastTs) {
        sameTsCounter += 1;
    } else {
        lastTs = now;
        sameTsCounter = 0;
    }
    return `${now.toString(36)}-${sameTsCounter.toString(36)}`;
}

/**
 * Generate a filename for the note.
 *
 * If a title is provided it is sanitized and used as the base name.
 * Otherwise falls back to a timestamped default: note-YYYY-MM-DD-HHmm.txt
 */
function generateNoteFilename(title?: string): string {
    const unique = nextUniqueSuffix();
    if (title && title.trim()) {
        // Sanitize: keep letters, digits, spaces → dashes; collapse; trim; cap length
        const safe = title
            .trim()
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 60);
        if (safe) return `${safe}-${unique}.txt`;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `note-${yyyy}-${mm}-${dd}-${hh}${min}-${unique}.txt`;
}

/**
 * Send a text note to the X4 device as a .txt file.
 *
 * @param noteText  The raw note text (newlines preserved, UTF-8).
 * @param settings  Current app settings (firmware type + IP).
 * @param title     Optional title used as the filename.
 * @returns         UploadResult indicating success or failure.
 */
export async function sendNoteAsTxt(
    noteText: string,
    settings: Settings,
    title?: string,
): Promise<UploadResult> {
    const filename = generateNoteFilename(title);
    const data = new TextEncoder().encode(noteText);
    const ip = getCurrentIp(settings);
    const noteFolder = getNoteFolder(settings);

    console.log(`[NoteSender] Sending note: filename=${filename}, size=${data.length} bytes, ip=${ip}, folder=${noteFolder}`);

    if (settings.firmwareType === 'crosspoint') {
        return uploadToCrossPoint(ip, data, filename, undefined, noteFolder);
    } else {
        return uploadToStock(ip, data, filename, noteFolder);
    }
}

export const __noteSenderTestUtils = {
    generateNoteFilename,
};
