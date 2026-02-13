import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import type { UploadResult, RemoteFile } from '../types';
import { getDeviceBaseUrl } from './settings';

// Helper to parse date from filename "Author - YYYY-MM-DD - Title.epub"
function parseDateFromFilename(filename: string): number {
    try {
        const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) {
            return new Date(match[1]).getTime();
        }
        return 0;
    } catch {
        return 0;
    }
}



const TARGET_FOLDER = 'send-to-x4';
const TIMEOUT_MS = 60000; // Increased for WS upload

// Helper: Base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Upload binary data via WebSocket (Port 81)
 * Protocol: 
 * 1. Connect ws://IP:81/
 * 2. Send "START:filename:size:path"
 * 3. Wait for "READY"
 * 4. Send binary chunks
 * 5. Wait for "DONE" or "ERROR:..."
 */
async function uploadViaWebSocket(
    ip: string,
    filename: string,
    data: Uint8Array,
    targetPath: string,
    onProgress?: (percent: number) => void
): Promise<UploadResult> {
    return new Promise((resolve) => {
        const wsUrl = `ws://${ip}:81/`;
        console.log(`[WS] Connecting to ${wsUrl}`);
        const ws = new WebSocket(wsUrl);

        // Safety timeout
        const timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            resolve({ success: false, error: 'WebSocket upload timed out' });
        }, TIMEOUT_MS);

        ws.onopen = () => {
            console.log(`[WS] Connected. Sending START command for ${filename} (${data.length} bytes)`);
            ws.send(`START:${filename}:${data.length}:${targetPath}`);
        };

        ws.onmessage = (e) => {
            const msg = e.data;
            // console.log(`[WS] Message: ${msg}`);

            if (msg === 'READY') {
                // console.log('[WS] Server READY. Sending chunks...');
                // Send in 4KB chunks
                const CHUNK_SIZE = 4096;
                let offset = 0;

                // We'll use a recursive function or loop to send chunks to avoid blocking UI too much
                const sendChunks = async () => {
                    try {
                        while (offset < data.length && ws.readyState === WebSocket.OPEN) {
                            const end = Math.min(offset + CHUNK_SIZE, data.length);
                            const chunk = data.slice(offset, end);
                            ws.send(chunk);
                            offset += CHUNK_SIZE;

                            // Small yield every few chunks to allow UI updates / WebSocket processing
                            if (offset % (CHUNK_SIZE * 10) === 0) {
                                await new Promise(r => setTimeout(r, 0));
                            }
                        }
                        // console.log('[WS] All chunks sent. Waiting for DONE...');
                    } catch (err) {
                        console.warn('[WS] Error sending chunks:', err);
                        ws.close();
                        clearTimeout(timeout);
                        resolve({ success: false, error: 'Error sending binary data' });
                    }
                };
                sendChunks();

            } else if (msg === 'DONE') {
                // console.log('[WS] Upload DONE!');
                clearTimeout(timeout);
                ws.close();
                resolve({ success: true });
            } else if (typeof msg === 'string' && msg.startsWith('ERROR:')) {
                console.warn(`[WS] Server reported error: ${msg}`);
                clearTimeout(timeout);
                ws.close();
                resolve({ success: false, error: msg.replace('ERROR:', '').trim() });
                resolve({ success: false, error: msg.replace('ERROR:', '').trim() });
            } else if (typeof msg === 'string' && msg.startsWith('PROGRESS:')) {
                // Format: PROGRESS:current:total
                const parts = msg.split(':');
                if (parts.length === 3 && onProgress) {
                    const current = parseInt(parts[1], 10);
                    const total = parseInt(parts[2], 10);
                    if (total > 0) {
                        const percent = Math.min(100, Math.round((current / total) * 100));
                        onProgress(percent);
                    }
                }
            }
        };

        ws.onerror = (e) => {
            console.warn('[WS] Error event:', e);
            clearTimeout(timeout);
            // Don't resolve here immediately, wait for close or timeout often safer, but let's resolve if it failed early
            resolve({ success: false, error: 'WebSocket connection failed' });
        };

        ws.onclose = (e) => {
            console.log(`[WS] Closed: ${e.code} ${e.reason}`);
            // If we haven't resolved yet (e.g. abrupt close without DONE), resolve as fail
            // But we need to track if we already resolved.
            // Since Promise can only resolve once, calling resolve again does nothing.
            resolve({ success: false, error: 'Connection closed unexpectedly' });
        };
    });
}

export async function uploadToCrossPoint(
    ip: string,
    epubData: Uint8Array,
    filename: string,
    onProgress?: (percent: number) => void
): Promise<UploadResult> {
    try {
        console.log(`[Upload] Starting CrossPoint upload (WS): filename=${filename}, dataSize=${epubData.length}, ip=${ip}`);

        // 1. Ensure folder exists (HTTP fallback for mkdir is fine)
        await ensureFolderExistsCrossPoint(ip, TARGET_FOLDER);

        // 2. Upload via WebSocket
        return await uploadViaWebSocket(ip, filename, epubData, `/${TARGET_FOLDER}`, onProgress);

    } catch (error) {
        console.warn(`[Upload] Exception during upload:`, error);
        return handleUploadError(error);
    }
}

/**
 * Upload a local file (URI) directly to X4 without reading into memory first
 */
export async function uploadLocalFileToCrossPoint(
    ip: string,
    fileUri: string,
    filename: string,
    onProgress?: (percent: number) => void
): Promise<UploadResult> {
    try {
        console.log(`[Upload] Starting local file upload (WS): filename=${filename}, fileUri=${fileUri}, ip=${ip}`);

        // 1. Ensure folder exists
        const folderReady = await ensureFolderExistsCrossPoint(ip, TARGET_FOLDER);
        console.log(`[Upload] Folder ready: ${folderReady}`);

        // 2. Read file as Base64 (using Expo FileSystem Legacy)
        // Note: This reads entire file into memory. For very large files this might be an issue,
        // but EPUBs are usually small (<100MB).
        const base64 = await readAsStringAsync(fileUri, {
            encoding: EncodingType.Base64
        });

        // 3. Convert to Uint8Array
        const data = base64ToUint8Array(base64);
        console.log(`[Upload] Read local file: ${data.length} bytes`);

        // 4. Upload via WebSocket
        return await uploadViaWebSocket(ip, filename, data, `/${TARGET_FOLDER}`, onProgress);

    } catch (error) {
        console.warn(`[Upload] Local file exception:`, error);
        return handleUploadError(error);
    }
}

/**
 * Check if folder exists on CrossPoint firmware, create if not
 */
async function ensureFolderExistsCrossPoint(ip: string, folder: string): Promise<boolean> {
    const baseUrl = getDeviceBaseUrl(ip);

    // 1. Try to list to check existence
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // Short timeout for check

        const listRes = await fetch(`${baseUrl}/api/files?path=/`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (listRes.ok) {
            const items = await listRes.json();
            const exists = Array.isArray(items) && items.some((item: any) =>
                item.isDirectory && item.name === folder
            );
            if (exists) return true;
        } else {
            console.warn(`List files failed in ensureFolder: ${listRes.status}`);
        }
    } catch (e) {
        console.warn('List files exception in ensureFolder (proceeding to mkdir):', e);
    }

    // 2. Try to create (if not found or list failed)
    try {
        const formData = new FormData();
        formData.append('name', folder);
        formData.append('path', '/');

        const createController = new AbortController();
        const createTimeout = setTimeout(() => createController.abort(), 10000);

        const createRes = await fetch(`${baseUrl}/mkdir`, {
            method: 'POST',
            body: formData,
            signal: createController.signal,
        });

        clearTimeout(createTimeout);

        if (!createRes.ok) {
            console.warn(`mkdir failed: ${createRes.status}`);
            // If 400, 409 or 500, it often means folder already exists or server is weird but folder might be there.
            if (createRes.status === 400 || createRes.status === 409 || createRes.status === 500) {
                return true;
            }
            return false;
        }
        return true;
    } catch (e) {
        console.warn('mkdir exception:', e);
        return false;
    }
}

/**
 * Check if X4 CrossPoint firmware is reachable
 */
export async function checkCrossPointConnection(ip: string): Promise<{ success: boolean; error?: string }> {
    const baseUrl = getDeviceBaseUrl(ip);
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${baseUrl}/api/files?path=/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
            return { success: true };
        } else {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
    } catch (error: any) {
        let msg = error.message;
        if (msg === 'Aborted') msg = 'Connection timed out';
        if (msg.includes('Network request failed')) msg = `Network unreachable (${baseUrl})`;
        return { success: false, error: msg };
    }
}

/**
 * Handle upload errors with user-friendly messages
 */
function handleUploadError(error: unknown): UploadResult {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Network request failed') ||
        message.includes('fetch failed') ||
        message.includes('AbortError')) {
        return {
            success: false,
            error: 'Cannot reach X4. Make sure you are connected to the X4 WiFi hotspot.'
        };
    }

    return { success: false, error: message };
}

/**
 * List files in the target folder on CrossPoint firmware
 */
export async function listCrossPointFiles(ip: string): Promise<RemoteFile[]> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        const folderReady = await ensureFolderExistsCrossPoint(ip, TARGET_FOLDER);
        if (!folderReady) return [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/api/files?path=/${TARGET_FOLDER}`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) return [];

        const items = await response.json();

        if (!Array.isArray(items)) return [];

        return items
            .filter((item: any) => !item.isDirectory && item.name.endsWith('.epub'))
            .map((item: any) => ({
                name: decodeURIComponent(item.name),
                rawName: item.name,
                size: item.size,
                timestamp: parseDateFromFilename(decodeURIComponent(item.name)),
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    } catch (error) {
        console.warn('Error listing CrossPoint files:', error);
        return [];
    }
}

/**
 * Delete a file on CrossPoint firmware
 */
export async function deleteCrossPointFile(ip: string, filename: string): Promise<boolean> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        const path = `/${TARGET_FOLDER}/${filename}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // CrossPoint firmware delete: POST /delete
        const params = new URLSearchParams();
        params.append('path', path);
        params.append('type', 'file');

        const response = await fetch(`${baseUrl}/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok;
    } catch (error) {
        console.warn('Error deleting CrossPoint file:', error);
        return false;
    }
}

const SLEEP_FOLDER = 'sleep';

/**
 * Upload a BMP screensaver to the X4 device's /sleep folder
 *
 * Accepts BMP data as a Uint8Array (from the image converter) and uploads it
 * via the CrossPoint firmware upload API. Uses a temp file, same as epub upload.
 */
export async function uploadScreensaverToCrossPoint(
    ip: string,
    bmpData: Uint8Array,
    filename: string,
    onProgress?: (percent: number) => void
): Promise<UploadResult> {
    try {
        // Ensure /sleep folder exists
        const folderReady = await ensureFolderExistsCrossPoint(ip, SLEEP_FOLDER);
        if (!folderReady) {
            return {
                success: false,
                error: `Could not create required '/${SLEEP_FOLDER}' folder on device.`
            };
        }

        console.log(`[Upload] Uploading screensaver (WS): ${filename}`);

        // Upload via WebSocket
        return await uploadViaWebSocket(ip, filename, bmpData, `/${SLEEP_FOLDER}`, onProgress);

    } catch (error) {
        return handleUploadError(error);
    }
}

/**
 * List screensaver files in the /sleep folder on CrossPoint firmware
 */
export async function listCrossPointSleepFiles(ip: string): Promise<RemoteFile[]> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/api/files?path=/${SLEEP_FOLDER}`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) return [];

        const items = await response.json();

        if (!Array.isArray(items)) return [];

        return items
            .filter((item: any) => !item.isDirectory && item.name.endsWith('.bmp'))
            .map((item: any) => ({
                name: decodeURIComponent(item.name),
                rawName: item.name,
                size: item.size,
                timestamp: item.lastModified || undefined,
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    } catch (error) {
        console.warn('Error listing CrossPoint sleep files:', error);
        return [];
    }
}

/**
 * Delete a screensaver file from the /sleep folder on CrossPoint firmware
 */
export async function deleteCrossPointSleepFile(ip: string, filename: string): Promise<boolean> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        const path = `/${SLEEP_FOLDER}/${filename}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const params = new URLSearchParams();
        params.append('path', path);
        params.append('type', 'file');

        const response = await fetch(`${baseUrl}/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok;
    } catch (error) {
        console.warn('Error deleting CrossPoint sleep file:', error);
        return false;
    }
}

