import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { documentDirectory, copyAsync, deleteAsync } from 'expo-file-system/legacy';
import { savePreviewMapping } from './preview_cache';

/**
 * Generates a small thumbnail from the source image, saves it persistently,
 * and records it in the preview cache mapped against the target device filename.
 * 
 * @param sourceUri The original high-res image URI
 * @param targetFilename The `.bmp` filename the user is uploading to the device
 */
export async function generateAndSaveThumbnail(sourceUri: string, targetFilename: string): Promise<void> {
    try {
        // Shrink the image down to 200px wide and output a low-quality JPEG
        const result = await manipulateAsync(
            sourceUri,
            [{ resize: { width: 200 } }],
            { compress: 0.5, format: SaveFormat.JPEG }
        );

        // Define a safe persistent path for the thumbnail
        const localFileName = `thumb_${targetFilename.replace('.bmp', '.jpg')}`;
        const finalUri = `${documentDirectory}${localFileName}`;

        // Ensure the previous file is cleanly wiped to avoid copyAsync silent failures
        await deleteAsync(finalUri, { idempotent: true });

        // Move the file from the cache directory to the document directory to persist it
        await copyAsync({
            from: result.uri,
            to: finalUri
        });

        // Save the mapping to our existing dictionary
        await savePreviewMapping(targetFilename, finalUri);

        console.log(`[Thumbnail] Cached ${targetFilename} -> ${finalUri}`);
    } catch (e) {
        console.warn(`[Thumbnail] Failed to generate thumbnail for ${targetFilename}`, e);
    }
}
