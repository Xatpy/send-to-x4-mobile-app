import { File, Paths } from 'expo-file-system';
import type { UploadResult, RemoteFile } from '../types';

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
 * Upload EPUB to X4 device with Stock firmware
 * 
 * Stock firmware API:
 * - GET /list?dir=/ - List directory
 * - PUT /edit - Create folder (FormData: path=/folder/)
 * - POST /edit - Upload file (FormData: data=<file> with filename as path)
 */
export async function uploadToStock(
    ip: string,
    epubData: Uint8Array,
    filename: string
): Promise<UploadResult> {
    let tempFile: File | null = null;

    try {
        // 1. Ensure folder exists
        const folderReady = await ensureFolderExistsStock(ip, TARGET_FOLDER);

        // 2. Determine upload path
        const path = folderReady
            ? `/${TARGET_FOLDER}/${filename}`
            : `/${filename}`;

        // 3. Write to temp file
        tempFile = new File(Paths.cache, `upload_stock_${Date.now()}_${filename}`);
        await tempFile.write(epubData);

        // 4. Upload file
        const formData = new FormData();
        // @ts-ignore
        formData.append('data', {
            uri: tempFile.uri,
            name: path,
            type: 'application/epub+zip',
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(`http://${ip}/edit`, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': '*/*',
                'Content-Type': 'multipart/form-data',
            },
            signal: controller.signal,
        });

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
 * Check if folder exists on Stock firmware, create if not
 */
async function ensureFolderExistsStock(ip: string, folder: string): Promise<boolean> {
    try {
        // Check if folder exists
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const listRes = await fetch(`http://${ip}/list?dir=/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!listRes.ok) return false;

        const items = await listRes.json();
        const exists = Array.isArray(items) && items.some((item: any) =>
            item.type === 'dir' && item.name === folder
        );

        if (exists) return true;

        // Create folder
        const formData = new FormData();
        formData.append('path', `/${folder}/`);

        const createController = new AbortController();
        const createTimeout = setTimeout(() => createController.abort(), 10000);

        const createRes = await fetch(`http://${ip}/edit`, {
            method: 'PUT',
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
 * Check if X4 Stock firmware is reachable
 */
export async function checkStockConnection(ip: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`http://${ip}/list?dir=/`, {
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
 * List files in the target folder on Stock firmware
 */
export async function listStockFiles(ip: string): Promise<RemoteFile[]> {
    try {
        // Ensure folder exists first (otherwise list might fail or return 404)
        const folderReady = await ensureFolderExistsStock(ip, TARGET_FOLDER);
        if (!folderReady) return [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`http://${ip}/list?dir=/${TARGET_FOLDER}/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) return [];

        const items = await response.json();

        if (!Array.isArray(items)) return [];

        return items
            .filter((item: any) => item.type === 'file' && item.name.endsWith('.epub'))
            .map((item: any) => ({
                name: decodeURIComponent(item.name),
                rawName: item.name,
                size: item.size,
                timestamp: parseDateFromFilename(decodeURIComponent(item.name)),
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Newest first

    } catch (error) {
        console.warn('Error listing stock files:', error);
        return [];
    }
}

/**
 * Delete a file on Stock firmware
 */
export async function deleteStockFile(ip: string, filename: string): Promise<boolean> {
    try {
        const path = `/${TARGET_FOLDER}/${filename}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Stock firmware delete: DELETE /edit with body path=...
        // Note: passing body with DELETE is non-standard but required by some X4 firmwares
        const response = await fetch(`http://${ip}/edit`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `path=${encodeURIComponent(path)}`,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok;
    } catch (error) {
        console.warn('Error deleting stock file:', error);
        return false;
    }
}
