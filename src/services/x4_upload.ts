import { File, Paths } from 'expo-file-system';
import type { UploadResult, RemoteFile } from '../types';
import { getDeviceBaseUrl } from './settings';
import { formatNetworkError } from './network_errors';

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



const DEFAULT_TARGET_FOLDER = 'send-to-x4';
const TIMEOUT_MS = 30000;

function getMimeTypeForFilename(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.epub')) return 'application/epub+zip';
    return 'application/octet-stream';
}

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
    filename: string,
    targetFolder: string = DEFAULT_TARGET_FOLDER
): Promise<UploadResult> {
    let tempFile: File | null = null;
    const baseUrl = getDeviceBaseUrl(ip);

    try {
        console.log(`[Upload] Starting Stock upload: filename=${filename}, dataSize=${epubData.length}, ip=${ip}, folder=${targetFolder}`);

        // 1. Ensure folder exists
        const folderReady = await ensureFolderExistsStock(ip, targetFolder);

        // 2. Determine upload path
        const path = folderReady
            ? `/${targetFolder}/${filename}`
            : `/${filename}`;
        console.log(`[Upload] Stock folder ready: ${folderReady}, path: ${path}`);

        // 3. Write to temp file
        tempFile = new File(Paths.cache, `upload_stock_${Date.now()}_${filename}`);
        await tempFile.write(epubData);

        // Verify write
        if (tempFile.size !== epubData.length) {
            console.warn(`[Upload] Stock temp file size mismatch: expected ${epubData.length}, got ${tempFile.size}`);
        }

        // 4. Upload file
        const formData = new FormData();
        const mimeType = getMimeTypeForFilename(filename);
        // @ts-ignore
        formData.append('data', {
            uri: tempFile.uri,
            name: path,
            type: mimeType,
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const uploadUrl = `${baseUrl}/edit`;
        console.log(`[Upload] Sending Stock POST to: ${uploadUrl}`);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': '*/*',
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        // Log response details
        let responseBody = '';
        try { responseBody = await response.text(); } catch (e) { /* ignore */ }
        console.log(`[Upload] Stock Response: status=${response.status}, body=${responseBody.substring(0, 500)}`);

        if (response.ok) {
            return { success: true };
        } else {
            return {
                success: false,
                error: `Upload failed: HTTP ${response.status} — ${responseBody.substring(0, 200)}`
            };
        }

    } catch (error) {
        console.warn(`[Upload] Stock exception during upload:`, error);
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
 * Check if folder exists on Stock firmware, create if not.
 * Supports nested paths (e.g. "send-to-x4/2026-02-20") by ensuring each level.
 */
async function ensureFolderExistsStock(ip: string, folder: string): Promise<boolean> {
    const baseUrl = getDeviceBaseUrl(ip);
    const segments = folder.split('/').filter(Boolean);

    let currentPath = '';
    for (const segment of segments) {
        const parentDir = currentPath ? `/${currentPath}` : '/';
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;

        // 1. Check if this level exists
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const listRes = await fetch(`${baseUrl}/list?dir=${encodeURIComponent(parentDir + (parentDir === '/' ? '' : '/'))}`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!listRes.ok) return false;

            const items = await listRes.json();
            const exists = Array.isArray(items) && items.some((item: any) =>
                item.type === 'dir' && item.name === segment
            );

            if (exists) continue;
        } catch {
            return false;
        }

        // 2. Create this level
        try {
            const formData = new FormData();
            formData.append('path', `/${currentPath}/`);

            const createController = new AbortController();
            const createTimeout = setTimeout(() => createController.abort(), 10000);

            const createRes = await fetch(`${baseUrl}/edit`, {
                method: 'PUT',
                body: formData,
                signal: createController.signal,
            });
            clearTimeout(createTimeout);

            if (!createRes.ok) return false;
        } catch {
            return false;
        }
    }
    return true;
}

/**
 * Check if X4 Stock firmware is reachable
 */
export async function checkStockConnection(ip: string): Promise<{ success: boolean; error?: string }> {
    const baseUrl = getDeviceBaseUrl(ip);
    const requestUrl = `${baseUrl}/list?dir=/`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(requestUrl, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
            return { success: true };
        } else {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
    } catch (error: unknown) {
        let details = formatNetworkError(error, requestUrl);
        try {
            const probeController = new AbortController();
            const probeTimeout = setTimeout(() => probeController.abort(), 3000);
            const probeRes = await fetch(`${baseUrl}/`, { signal: probeController.signal });
            clearTimeout(probeTimeout);
            details += ` | probe_root_http=${probeRes.status}`;
        } catch (probeError) {
            details += ` | probe_root_error=${formatNetworkError(probeError, `${baseUrl}/`)}`;
        }
        return { success: false, error: details };
    }
}

/**
 * Handle upload errors with user-friendly messages
 */
function handleUploadError(error: unknown): UploadResult {
    const message = formatNetworkError(error);

    if (message.includes('Network request failed') ||
        message.includes('fetch failed') ||
        message.includes('AbortError')) {
        return {
            success: false,
            error: `Cannot reach X4. ${message}`
        };
    }

    return { success: false, error: message };
}

/**
 * List files in the target folder on Stock firmware
 */
export async function listStockFiles(ip: string, targetFolder: string = DEFAULT_TARGET_FOLDER): Promise<RemoteFile[]> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        // Ensure folder exists first (otherwise list might fail or return 404)
        const folderReady = await ensureFolderExistsStock(ip, targetFolder);
        if (!folderReady) return [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/list?dir=/${targetFolder}/`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) return [];

        const items = await response.json();

        if (!Array.isArray(items)) return [];

        return items
            .filter((item: any) => item.type === 'file' && (item.name.endsWith('.epub') || item.name.endsWith('.txt')))
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
export async function deleteStockFile(ip: string, filename: string, targetFolder: string = DEFAULT_TARGET_FOLDER): Promise<boolean> {
    try {
        const baseUrl = getDeviceBaseUrl(ip);
        const path = `/${targetFolder}/${filename}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Stock firmware delete: DELETE /edit with body path=...
        // Note: passing body with DELETE is non-standard but required by some X4 firmwares
        const response = await fetch(`${baseUrl}/edit`, {
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
