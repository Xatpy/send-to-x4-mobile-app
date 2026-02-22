/**
 * note_sender — Convert a text note to a .txt file and send it to the X4 device.
 *
 * Uses the same upload pipeline as articles/screensavers (WebSocket for CrossPoint,
 * HTTP POST for Stock firmware).
 */

import type { UploadResult, Settings } from '../types';
import { uploadToCrossPoint } from './crosspoint_upload';
import { uploadToStock } from './x4_upload';
import { getCurrentIp, getNoteFolder, resolveTargetFolder } from './settings';

let lastTitle = '';
let sameTitleCounter = 0;

/**
 * Generate a filename for the note.
 *
 * If a title is provided it is sanitized and used as the base name
 * (e.g. "My Note" → "My-Note.txt"). A short numeric suffix (-2, -3, …)
 * is appended only when the same title is sent consecutively.
 *
 * Without a title, falls back to: note-YYYY-MM-DD-HHmm.txt
 */
function generateNoteFilename(title?: string): string {
    if (title && title.trim()) {
        const safe = title
            .trim()
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 60);
        if (safe) {
            if (safe === lastTitle) {
                sameTitleCounter++;
                return `${safe}-${sameTitleCounter}.txt`;
            }
            lastTitle = safe;
            sameTitleCounter = 1;
            return `${safe}.txt`;
        }
    }
    // Untitled — use timestamp
    lastTitle = '';
    sameTitleCounter = 0;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `note-${yyyy}-${mm}-${dd}-${hh}${min}${ss}.txt`;
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
    const noteFolder = resolveTargetFolder(getNoteFolder(settings), settings.useDateFolders);

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
