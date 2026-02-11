import type { QueuedScreensaver, Settings, UploadResult } from '../types';
import { getScreensaverQueue, updateScreensaverStatus } from './screensaver_queue';
import { convertImageToScreensaverBmp } from './image_converter';
import { uploadScreensaverToCrossPoint } from './crosspoint_upload';
import { getCurrentIp } from './settings';

export interface ScreensaverDumpResult {
    total: number;
    succeeded: number;
    failed: { id: string; filename: string; error: string }[];
}

/**
 * Process the entire screensaver queue: convert -> upload -> update status.
 */
export async function processScreensaverQueue(
    settings: Settings,
    onProgress?: (current: number, total: number, filename?: string) => void
): Promise<ScreensaverDumpResult> {
    const queue = await getScreensaverQueue();
    const pendingItems = queue.filter(
        item => item.status === 'pending' || item.status === 'failed' || item.status === 'processing'
    );

    const total = pendingItems.length;
    let current = 0;
    let succeeded = 0;
    const failed: { id: string; filename: string; error: string }[] = [];

    const ip = getCurrentIp(settings);

    for (const item of pendingItems) {
        current++;
        onProgress?.(current, total, item.filename);

        try {
            await updateScreensaverStatus(item.id, 'processing');

            // 1. Convert to BMP
            const bmp = await convertImageToScreensaverBmp(item.uri, item.width, item.height);

            // 2. Upload
            // Currently we only support uploading to CrossPoint /sleep folder for screensavers
            // If user is on Stock, this feature might not work or needs Stock implementation.
            // Assuming CrossPoint for now based on previous context.
            let uploadResult: UploadResult = { success: false, error: 'Firmware not supported' };

            if (settings.firmwareType === 'crosspoint') {
                uploadResult = await uploadScreensaverToCrossPoint(ip, bmp.data, item.filename);
            } else {
                // TODO: Implement Stock upload if needed, or fallback
                uploadResult = { success: false, error: 'Screensaver upload only supported on CrossPoint' };
            }

            if (uploadResult.success) {
                await updateScreensaverStatus(item.id, 'success');
                succeeded++;
            } else {
                throw new Error(uploadResult.error || 'Upload failed');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`Failed to process screensaver ${item.filename}:`, error);
            await updateScreensaverStatus(item.id, 'failed', message);
            failed.push({ id: item.id, filename: item.filename, error: message });
        }
    }

    return { total, succeeded, failed };
}
