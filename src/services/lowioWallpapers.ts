import Constants from 'expo-constants';


export interface WallpaperItem {
    hash: string;
    webpUrl: string;
    bmpUrl: string;
    source: 'lowio';
    // Optional metadata added by the JSON API
    title?: string;
    author?: string;
    category?: string;
    download_count?: number;
    tags?: string[];
    is_nsfw?: boolean;
    ai_generated?: boolean;
    target_device?: 'x3' | 'x4';
}

export interface RandomWallpaperResponse {
    success: boolean;
    wallpaper: {
        id: string;
        title: string;
        author: string;
        category: string;
        width: number;
        height: number;
        download_count: number;
        tags?: string[];
        is_nsfw?: boolean;
        ai_generated?: boolean;
        target_device?: 'x3' | 'x4';
        urls: {
            thumbnail: string;
            download: string;
            download_webp: string;
            download_original?: string;
        };
    };
}

export interface RandomWallpaperFilters {
    hideAiWallpapers?: boolean;
    hideSensitiveWallpapers?: boolean;
}

const LOWIO_BASE_URL = 'https://x4epapers.lowio.xyz';
let cachedAppVersion = '';

function getAppVersion() {
    if (cachedAppVersion) return cachedAppVersion;
    cachedAppVersion = Constants.expoConfig?.version || '1.1.0'; // Fallback
    return cachedAppVersion;
}

const getHeaders = () => ({
    'User-Agent': `Send To x4 v${getAppVersion()}`,
    'Accept': 'application/json',
});

// We anticipate that the API returns an array of URLs or hashes based on the Discord screenshot
function parseItem(item: string | any): WallpaperItem | null {
    if (typeof item === 'string') {
        // Expected format: https://x4epapers.lowio.xyz/output/03/a2/03a2d632c361fb93daad1400f4d02ba4.webp
        // Or just a relative path: /output/03/a2/03a2...
        if (item.endsWith('.webp') || item.endsWith('.bmp')) {
            const isFullUrl = item.startsWith('http');
            const webpUrl = isFullUrl ? item.replace(/\.bmp$/, '.webp') : `${LOWIO_BASE_URL}${item.replace(/\.bmp$/, '.webp')}`;
            const bmpUrl = isFullUrl ? item.replace(/\.webp$/, '.bmp') : `${LOWIO_BASE_URL}${item.replace(/\.webp$/, '.bmp')}`;

            const parts = item.split('/');
            const filename = parts[parts.length - 1];
            const hash = filename.replace(/\.(webp|bmp)$/, '');

            return {
                hash,
                webpUrl,
                bmpUrl,
                source: 'lowio',
            };
        }
        // If it's just a hash
        return {
            hash: item,
            webpUrl: `${LOWIO_BASE_URL}/output/${item}.webp`,
            bmpUrl: `${LOWIO_BASE_URL}/output/${item}.bmp`,
            source: 'lowio'
        };
    } else if (item && typeof item === 'object') {
        // If API changes shape to an object
        const urlStr = item.url || item.webp || item.path;
        if (typeof urlStr === 'string') {
            return parseItem(urlStr);
        }
    }

    return null;
}

export async function fetchWallpapersPage(offset: number = 0): Promise<WallpaperItem[]> {
    try {
        const url = `${LOWIO_BASE_URL}/api/more${offset > 0 ? `?offset=${offset}` : ''}`;
        if (__DEV__) console.log(`[LowioAPI] Fetching ${url}`);

        const response = await fetch(url, { headers: getHeaders() });

        if (response.status === 429) {
            throw new Error('Service is busy. Please try again later.');
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // The discord message says "gives 33 random images on load".
        // We assume data is an array of strings like the example URLs.
        if (Array.isArray(data)) {
            return data.map((item: any) => parseItem(item)).filter((item: WallpaperItem | null): item is WallpaperItem => item !== null);
        } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
            return data.items.map((item: any) => parseItem(item)).filter((item: WallpaperItem | null): item is WallpaperItem => item !== null);
        }

        console.warn('[LowioAPI] Unexpected response format', data);
        return [];

    } catch (error) {
        console.error('[LowioAPI] fetchWallpapersPage failed', error);
        throw error;
    }
}

export function getRandomWallpaperUrl(format: 'webp' | 'bmp', invert: boolean = false, dither: boolean = false): string {
    let url = `${LOWIO_BASE_URL}/random/?f=${format}`;
    if (invert) url += '&invert=true';
    if (dither) url += '&dither=true';
    return url;
}

function buildRandomWallpaperUrl(filters: RandomWallpaperFilters = {}): string {
    const params = new URLSearchParams();
    params.set('format', 'x4_ready');
    if (filters.hideAiWallpapers) {
        params.set('no_ai_slop', '1');
    }
    return `https://www.readme.club/api/random-wallpaper?${params.toString()}`;
}

function mapRandomWallpaperResponse(data: RandomWallpaperResponse): WallpaperItem {
    return {
        hash: data.wallpaper.id,
        webpUrl: data.wallpaper.urls.download_webp || data.wallpaper.urls.thumbnail,
        bmpUrl: data.wallpaper.urls.download,
        title: data.wallpaper.title,
        author: data.wallpaper.author,
        category: data.wallpaper.category,
        download_count: data.wallpaper.download_count,
        tags: data.wallpaper.tags,
        is_nsfw: data.wallpaper.is_nsfw,
        ai_generated: data.wallpaper.ai_generated,
        target_device: data.wallpaper.target_device,
        source: 'lowio',
    };
}

export async function fetchRandomWallpaperJSON(filters: RandomWallpaperFilters = {}): Promise<WallpaperItem> {
    const maxAttempts = filters.hideSensitiveWallpapers ? 5 : 1;

    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const url = buildRandomWallpaperUrl(filters);
            if (__DEV__) console.log(`[LowioAPI] Fetching JSON ${url} (attempt ${attempt}/${maxAttempts})`);

            const response = await fetch(url, { headers: getHeaders() });

            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                throw new Error(`Rate limit exceeded. Try again in ${retryAfter || 'a few'} seconds.`);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: RandomWallpaperResponse = await response.json();

            if (!data.success || !data.wallpaper) {
                throw new Error('Invalid JSON payload returned from API');
            }

            const wallpaper = mapRandomWallpaperResponse(data);

            if (filters.hideSensitiveWallpapers && wallpaper.is_nsfw) {
                if (__DEV__) console.log('[LowioAPI] Skipping sensitive wallpaper result');
                continue;
            }

            return wallpaper;
        }

        throw new Error('Could not find a non-sensitive random wallpaper. Please try again.');
    } catch (error) {
        console.error('[LowioAPI] fetchRandomWallpaperJSON failed', error);
        throw error;
    }
}

/**
 * For downloading the actual BMP to memory so we can send it to the device
 */
export async function downloadWallpaperBmp(url: string): Promise<Uint8Array> {
    try {
        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) {
            throw new Error(`Failed to download wallpaper: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    } catch (error) {
        console.error(`[LowioAPI] Error downloading bmp from ${url}`, error);
        throw error;
    }
}
