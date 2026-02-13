import { PermissionsAndroid, Platform } from 'react-native';

const NEARBY_WIFI_PERMISSION =
    PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES || 'android.permission.NEARBY_WIFI_DEVICES';

/**
 * Android 13+ may require Nearby Wi-Fi permission for reliable local network access.
 */
export async function ensureNearbyWifiPermission(): Promise<{ granted: boolean; reason?: string }> {
    if (Platform.OS !== 'android') return { granted: true };
    if (typeof Platform.Version === 'number' && Platform.Version < 33) return { granted: true };

    try {
        const alreadyGranted = await PermissionsAndroid.check(NEARBY_WIFI_PERMISSION);
        if (alreadyGranted) return { granted: true };

        const result = await PermissionsAndroid.request(NEARBY_WIFI_PERMISSION, {
            title: 'Nearby devices permission',
            message: 'Allow nearby devices so the app can connect to your X4 over local Wi-Fi.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
        });

        if (result === PermissionsAndroid.RESULTS.GRANTED) {
            return { granted: true };
        }

        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            return { granted: false, reason: 'Nearby devices permission is disabled (Never ask again).' };
        }

        return { granted: false, reason: 'Nearby devices permission denied.' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { granted: false, reason: `Permission check failed: ${msg}` };
    }
}

