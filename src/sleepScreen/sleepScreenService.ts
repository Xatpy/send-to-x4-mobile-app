import { Settings } from '../types';
import { uploadScreensaverToCrossPoint } from '../services/crosspoint_upload';
import { uploadToStock } from '../services/x4_upload';
import { getCurrentIp } from '../services/settings';
import { convertImageToScreensaverBmp } from '../services/image_converter';
import * as FileSystem from 'expo-file-system/legacy';
import { generateAndSaveThumbnail } from '../services/thumbnail_generator';

export async function processAndSendSleepScreen(
    viewShotUri: string,
    settings: Settings,
    customFilename?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const ip = getCurrentIp(settings);

        // Convert the React Native snapshot to 480x800 BMP
        // We know the source View is already at the correct aspect ratio, so we don't need to specify sizes
        const { data, filename } = await convertImageToScreensaverBmp(viewShotUri, null, null, customFilename);

        let uploadResult;

        if (settings.firmwareType === 'crosspoint') {
            // Send to sleep folder on CrossPoint
            uploadResult = await uploadScreensaverToCrossPoint(ip, data, filename);
        } else {
            // Upload to stock (we use 'sleep' fallback directory)
            uploadResult = await uploadToStock(ip, data, filename, 'sleep');
        }

        if (uploadResult?.success) {
            // Locally cache the high-quality viewShot to display in the Device tab list
            await generateAndSaveThumbnail(viewShotUri, filename);
        }

        return uploadResult;
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Upload failed' };
    }
}

export async function processAndSaveSleepScreenLocally(
    viewShotUri: string,
    customFilename?: string
): Promise<string> {
    const { data, filename } = await convertImageToScreensaverBmp(viewShotUri, null, null, customFilename);
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    const b64 = uint8ArrayToBase64(data);
    await FileSystem.writeAsStringAsync(fileUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
    });

    return fileUri;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
