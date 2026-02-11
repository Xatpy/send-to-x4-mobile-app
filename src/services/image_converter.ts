/**
 * Image Converter for Crosspoint X4 Screensavers
 *
 * Converts any user image into a Crosspoint X4 screensaver BMP:
 *   1. Resize + cover-crop to 480×800 using expo-image-manipulator
 *   2. Export as lossless PNG (base64)
 *   3. Decode PNG to raw RGBA using upng-js (Hermes-compatible)
 *   4. Encode RGBA to uncompressed 24-bit BMP using bmp_encoder
 *
 * Works entirely offline — no network calls.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import UPNG from 'upng-js';
import { encodeRGBAToBMP, BMP_WIDTH, BMP_HEIGHT } from './bmp_encoder';

/**
 * Convert any image to a Crosspoint X4 screensaver BMP.
 *
 * @param uri          Local file URI or base64 data URI of the source image
 * @param sourceWidth  Optional source width (for optimal cover-crop calculation)
 * @param sourceHeight Optional source height
 * @returns Object with BMP data as Uint8Array and suggested filename
 */
export async function convertImageToScreensaverBmp(
    uri: string,
    sourceWidth?: number | null,
    sourceHeight?: number | null,
): Promise<{ data: Uint8Array; filename: string }> {

    // --- Step 1: Resize + cover-crop to 480×800 ---
    const actions = buildCoverCropActions(sourceWidth, sourceHeight);

    const result = await manipulateAsync(uri, actions, {
        format: SaveFormat.PNG,
        compress: 1, // lossless
        base64: true,
    });

    if (!result.base64) {
        throw new Error('ImageManipulator did not return base64 data');
    }

    // --- Step 2: Decode base64 PNG to raw bytes ---
    const pngBytes = base64ToUint8Array(result.base64);

    // --- Step 3: Decode PNG to RGBA pixel data using upng-js ---
    const decoded = UPNG.decode(pngBytes);
    const rgbaFrames = UPNG.toRGBA8(decoded);

    if (rgbaFrames.length === 0) {
        throw new Error('Failed to decode PNG image');
    }

    const rgba = new Uint8Array(rgbaFrames[0]);

    // --- Step 4: Encode RGBA to BMP ---
    const bmpData = encodeRGBAToBMP(rgba);

    // Generate filename: screensaver_<timestamp>.bmp
    const filename = `screensaver_${Date.now()}.bmp`;

    return { data: bmpData, filename };
}

/**
 * Build ImageManipulator actions for cover-crop to 480×800.
 *
 * Cover mode: scale so both dimensions are at least the target, then center-crop.
 * If source dimensions are unknown, resize to exact target (may stretch slightly).
 */
function buildCoverCropActions(
    srcW?: number | null,
    srcH?: number | null,
): Array<{ resize: { width?: number; height?: number } } | { crop: { originX: number; originY: number; width: number; height: number } }> {

    // If we don't know source dimensions, just resize to exact target
    if (!srcW || !srcH) {
        return [{ resize: { width: BMP_WIDTH, height: BMP_HEIGHT } }];
    }

    const targetRatio = BMP_WIDTH / BMP_HEIGHT; // 0.6
    const sourceRatio = srcW / srcH;

    if (sourceRatio > targetRatio) {
        // Source is wider → resize by height, crop width
        const scale = BMP_HEIGHT / srcH;
        const scaledWidth = Math.round(srcW * scale);
        const cropX = Math.round((scaledWidth - BMP_WIDTH) / 2);

        return [
            { resize: { height: BMP_HEIGHT } },
            { crop: { originX: cropX, originY: 0, width: BMP_WIDTH, height: BMP_HEIGHT } },
        ];
    } else {
        // Source is taller (or exact) → resize by width, crop height
        const scale = BMP_WIDTH / srcW;
        const scaledHeight = Math.round(srcH * scale);
        const cropY = Math.round((scaledHeight - BMP_HEIGHT) / 2);

        return [
            { resize: { width: BMP_WIDTH } },
            { crop: { originX: 0, originY: cropY, width: BMP_WIDTH, height: BMP_HEIGHT } },
        ];
    }
}

/**
 * Decode a base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
