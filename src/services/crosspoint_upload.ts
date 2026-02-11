import { File, Paths } from 'expo-file-system';
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
const TIMEOUT_MS = 30000;

/**
 * Upload EPUB to X4 device with CrossPoint firmware
 * 
 * CrossPoint firmware API:
 * - GET /api/files?path=/ - List directory
 * - POST /mkdir - Create folder (FormData: name, path)
 * - POST /upload?path=/folder - Upload file (FormData: file)
 * - POST /delete - Delete file/folder
 */
export async function uploadToCrossPoint(
    ip: string,
    epubData: Uint8Array,
    filename: string
): Promise<UploadResult> {
    let tempFile: File | null = null;
    const baseUrl = getDeviceBaseUrl(ip);

    try {
        // 1. Ensure folder exists
        const folderReady = await ensureFolderExistsCrossPoint(ip, TARGET_FOLDER);
        const uploadPath = folderReady ? `/${TARGET_FOLDER}` : `/`;

        // 2. Write to temp file (avoiding Blob crash)
        tempFile = new File(Paths.cache, `upload_${Date.now()}_${filename}`);
        await tempFile.write(epubData);

        // 3. Upload using file URI
        const formData = new FormData();
        // @ts-ignore - React Native FormData support URI object
        formData.append('file', {
            uri: tempFile.uri,
            name: filename,
            type: 'application/epub+zip',
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(
            `${baseUrl}/upload?path=${encodeURIComponent(uploadPath)}`,
            {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'multipart/form-data',
                },
                signal: controller.signal,
            }
        );

        clearTimeout(timeout);

        if (response.ok) {
            return { success: true };
        } else {
            return {
                success: false,
                error: `Upload failed: HTTP ${response.status}`
            };
        }

    } catch (error) {
        return handleUploadError(error);
    } finally {
        // Clean up temp file
        if (tempFile && tempFile.exists) {
            try {
                await tempFile.delete();
            } catch (e) {
                console.warn('Failed to delete temp file:', e);
            }
        }
    }
}

/**
 * Check if folder exists on CrossPoint firmware, create if not
 */
async function ensureFolderExistsCrossPoint(ip: string, folder: string): Promise<boolean> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        // Check if folder exists
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const listRes = await fetch(`${baseUrl}/api/files?path=/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!listRes.ok) return false;

        const items = await listRes.json();
        const exists = Array.isArray(items) && items.some((item: any) =>
            item.isDirectory && item.name === folder
        );

        if (exists) return true;

        // Create folder
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

        return createRes.ok;
    } catch {
        return false;
    }
}

/**
 * Check if X4 CrossPoint firmware is reachable
 */
export async function checkCrossPointConnection(ip: string): Promise<boolean> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${baseUrl}/api/files?path=/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok;
    } catch {
        return false;
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
    filename: string
): Promise<UploadResult> {
    let tempFile: File | null = null;

    try {
        const baseUrl = getDeviceBaseUrl(ip);

        // Write BMP data to temp file
        tempFile = new File(Paths.cache, `screensaver_${Date.now()}_${filename}`);
        await tempFile.write(bmpData);

        const formData = new FormData();
        // @ts-ignore - React Native FormData supports URI object
        formData.append('file', {
            uri: tempFile.uri,
            name: filename,
            type: 'image/bmp',
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(
            `${baseUrl}/upload?path=${encodeURIComponent('/' + SLEEP_FOLDER)}`,
            {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'multipart/form-data',
                },
                signal: controller.signal,
            }
        );

        clearTimeout(timeout);

        if (response.ok) {
            return { success: true };
        } else {
            return {
                success: false,
                error: `Upload failed: HTTP ${response.status}`
            };
        }
    } catch (error) {
        return handleUploadError(error);
    } finally {
        // Clean up temp file
        if (tempFile && tempFile.exists) {
            try {
                await tempFile.delete();
            } catch (e) {
                console.warn('Failed to delete temp screensaver file:', e);
            }
        }
    }
}

