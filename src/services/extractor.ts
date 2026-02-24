import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { Article, ExtractionResult, ArticleImage } from '../types';
import { generateUuid } from '../utils/sanitizer';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extract article content from a URL
 */
export async function extractArticle(url: string, options?: { includeImages?: boolean }): Promise<ExtractionResult> {
    if (__DEV__) console.log('[Extractor] Starting extraction for URL:', url);

    try {
        // 1. Fetch HTML
        if (__DEV__) console.log('[Extractor] Fetching HTML...');
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        });

        if (__DEV__) console.log('[Extractor] Response status:', response.status);

        if (!response.ok) {
            console.warn('[Extractor] HTTP error:', response.status);
            return {
                success: false,
                error: `Failed to fetch: HTTP ${response.status}`
            };
        }

        const html = await response.text();
        if (__DEV__) console.log('[Extractor] HTML received, length:', html.length);

        // 2. Parse with linkedom
        if (__DEV__) console.log('[Extractor] Parsing HTML with linkedom...');
        const { document } = parseHTML(html);
        if (__DEV__) console.log('[Extractor] Document title:', document.title);

        // Special handling for Twitter/X
        if (isTwitterUrl(url)) {
            if (__DEV__) console.log('[Extractor] Detected Twitter/X URL, using DOM extraction...');
            return extractTwitterFromDocument(document, url);
        }

        // 3. Extract with Readability
        if (__DEV__) console.log('[Extractor] Running Readability...');
        const reader = new Readability(document as unknown as Document);
        const parsed = reader.parse();
        const readabilityAssessment = parsed?.textContent
            ? assessAggressiveCandidate(parsed.textContent)
            : { isContentLike: false };
        const archiveUrl = isArchiveUrl(url);

        // Lazily compute aggressive extraction only when needed.
        let aggressive: Article | null | undefined;
        let aggressiveAssessment: { isContentLike: boolean } | null | undefined;
        const getAggressive = () => {
            if (aggressive !== undefined) {
                return { aggressive, aggressiveAssessment };
            }
            aggressive = extractAggressive(document, url);
            aggressiveAssessment = aggressive ? assessAggressiveCandidate(aggressive.rawText) : null;
            return { aggressive, aggressiveAssessment };
        };

        let finalArticle: Article | null = null;
        let usedMethod = 'readability';

        // Decision Logic:
        // If Readability succeeded and result seems substantial
        if (
            parsed &&
            parsed.textContent &&
            parsed.textContent.length >= 400 &&
            readabilityAssessment.isContentLike
        ) {
            if (archiveUrl) {
                // archive.* pages often truncate in Readability around embeds, so compare against aggressive output there.
                const { aggressive, aggressiveAssessment } = getAggressive();
                const switchMultiplier = 1.4;
                if (
                    aggressive &&
                    aggressiveAssessment &&
                    aggressiveAssessment.isContentLike &&
                    aggressive.rawText.length > (parsed.textContent.length * switchMultiplier)
                ) {
                    if (__DEV__) console.log('[Extractor] Readability result suspicious/short compared to Aggressive scan. Switching to Aggressive.');
                    finalArticle = aggressive;
                    usedMethod = 'aggressive';
                } else {
                    if (__DEV__) console.log('[Extractor] Readability success');
                    finalArticle = {
                        title: parsed.title || document.title || 'Untitled',
                        author: extractAuthor(parsed, document),
                        date: extractDate(document),
                        body: parsed.content || '',
                        rawText: parsed.textContent,
                        wordCount: countWords(parsed.textContent),
                        sourceUrl: url,
                    };
                }
            } else {
                if (__DEV__) console.log('[Extractor] Readability success');
                finalArticle = {
                    title: parsed.title || document.title || 'Untitled',
                    author: extractAuthor(parsed, document),
                    date: extractDate(document),
                    body: parsed.content || '',
                    rawText: parsed.textContent,
                    wordCount: countWords(parsed.textContent),
                    sourceUrl: url,
                };
            }
        }
        // Readability failed or very short
        else {
            if (__DEV__) {
                console.log('[Extractor] Readability failed, content too short, or looked like challenge/boilerplate.');
            }

            const { aggressive, aggressiveAssessment } = getAggressive();
            if (aggressive && aggressiveAssessment && aggressiveAssessment.isContentLike && aggressive.rawText.length > 200) {
                if (__DEV__) console.log('[Extractor] Using Aggressive fallback.');
                finalArticle = aggressive;
                usedMethod = 'aggressive';
            } else {
                // If aggressive also failed or was too short, try the legacy fallback
                const legacy = extractFallback(document, url);
                if (legacy.success && legacy.article && assessAggressiveCandidate(legacy.article.rawText).isContentLike) {
                    finalArticle = legacy.article;
                    usedMethod = 'legacy_fallback';
                }
            }
        }

        if (finalArticle) {
            if (options?.includeImages) {
                if (__DEV__) console.log('[Extractor] Processing images for article...');
                finalArticle = await processArticleImages(finalArticle);
            }

            if (__DEV__) console.log(`[Extractor] Success using method: ${usedMethod}`);
            return { success: true, article: finalArticle };
        }

        return {
            success: false,
            error: 'No content found (All extraction methods failed)'
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[Extractor] Error caught:', message);

        if (message.includes('Network request failed') || message.includes('fetch failed')) {
            return {
                success: false,
                error: 'Network error. Check your internet connection.'
            };
        }

        return { success: false, error: message };
    }
}

/**
 * Process HTML for images: download them, convert to base64, and modify img src.
 */
async function processArticleImages(article: Article): Promise<Article> {
    try {
        const { document } = parseHTML(`<!doctype html><html><body>${article.body}</body></html>`);
        const root = document.body;
        const imgTags = Array.from(root.querySelectorAll('img'));

        if (imgTags.length === 0) return article;

        const images: ArticleImage[] = [];

        for (let i = 0; i < imgTags.length; i++) {
            const img = imgTags[i] as any;
            const src = pickPreferredImageSource(img);
            if (!src) continue;
            let tempUri: string | null = null;
            let convertedUri: string | null = null;

            try {
                // resolve absolute URL
                const absoluteUrl = new URL(src, article.sourceUrl).href;

                // data uri support
                if (absoluteUrl.startsWith('data:image/')) {
                    const match = absoluteUrl.match(/^data:(image\/[^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
                    if (match) {
                        const mimeType = normalizeImageMimeType(match[1]);
                        const base64Data = match[2];
                        const ext = extensionFromImageMime(mimeType);

                        const filename = `image_${generateUuid()}.${ext}`;

                        images.push({
                            id: `img_${generateUuid()}`,
                            filename,
                            mediaType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
                            data: base64Data
                        });

                        img.setAttribute('src', filename);
                        img.removeAttribute('srcset');
                        img.removeAttribute('loading');
                    } else {
                        img.remove();
                    }
                    continue;
                }

                if (__DEV__) console.log(`[Extractor] Fetching image: ${absoluteUrl}`);

                // Resolve extension from URL or default
                let ext = 'jpeg';
                if (absoluteUrl.toLowerCase().includes('.png')) ext = 'png';
                else if (absoluteUrl.toLowerCase().includes('.gif')) ext = 'gif';
                else if (absoluteUrl.toLowerCase().includes('.svg')) ext = 'svg';
                else if (absoluteUrl.toLowerCase().includes('.webp')) ext = 'webp';

                if (!FileSystem.cacheDirectory) {
                    img.remove();
                    continue;
                }
                const tempFilename = `tmp_image_${generateUuid()}.${ext}`;
                tempUri = `${FileSystem.cacheDirectory}${tempFilename}`;

                // Use FileSystem to download natively
                const downloadRes = await FileSystem.downloadAsync(absoluteUrl, tempUri, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    }
                });

                // Add a small delay to avoid 429 Too Many Requests from CDNs (e.g., Wikimedia)
                await new Promise(resolve => setTimeout(resolve, 350));

                if (downloadRes.status !== 200) {
                    if (__DEV__) console.log('[Extractor] Failed to fetch image, status:', downloadRes.status);
                    img.remove();
                    continue;
                }

                const rawMimeType = downloadRes.headers['content-type'] || downloadRes.headers['Content-Type'] || `image/${ext}`;
                let finalMimeType = normalizeImageMimeType(rawMimeType, ext);
                let finalExt = extensionFromImageMime(finalMimeType);
                let base64Data: string | null = null;

                if (isDeviceFriendlyImageMime(finalMimeType)) {
                    base64Data = await FileSystem.readAsStringAsync(tempUri, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                } else {
                    // Some EPUB readers on e-ink devices don't render WebP/AVIF reliably.
                    // Transcode unsupported formats to JPEG for broad compatibility.
                    const converted = await manipulateAsync(tempUri, [], {
                        format: SaveFormat.JPEG,
                        compress: 0.92,
                        base64: true,
                    });
                    if (!converted.base64) {
                        img.remove();
                        continue;
                    }
                    convertedUri = converted.uri || null;
                    base64Data = converted.base64;
                    finalMimeType = 'image/jpeg';
                    finalExt = 'jpg';
                }

                if (!base64Data) {
                    img.remove();
                    continue;
                }

                const filename = `image_${generateUuid()}.${finalExt}`;

                images.push({
                    id: `img_${generateUuid()}`,
                    filename,
                    mediaType: finalMimeType,
                    data: base64Data
                });

                img.setAttribute('src', filename);
                img.removeAttribute('srcset');
                img.removeAttribute('loading');

            } catch (err) {
                console.warn('[Extractor] Failed to process image:', src, err instanceof Error ? err.message : '');
                img.remove();
            } finally {
                if (tempUri) {
                    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => { });
                }
                if (convertedUri && convertedUri !== tempUri) {
                    await FileSystem.deleteAsync(convertedUri, { idempotent: true }).catch(() => { });
                }
            }
        }

        article.body = root.innerHTML;
        article.images = images;
    } catch (err) {
        console.warn('[Extractor] Image processing failed globally:', err);
    }
    return article;
}

function normalizeImageMimeType(rawMimeType: string, fallbackExt = 'jpeg'): string {
    const cleaned = (rawMimeType || '').split(';')[0].trim().toLowerCase();

    if (cleaned === 'image/jpg' || cleaned === 'image/pjpeg') return 'image/jpeg';
    if (cleaned === 'image/svg') return 'image/svg+xml';
    if (cleaned.startsWith('image/')) return cleaned;

    return `image/${fallbackExt}`;
}

function extensionFromImageMime(mimeType: string): string {
    const normalized = normalizeImageMimeType(mimeType);

    switch (normalized) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        case 'image/svg+xml':
            return 'svg';
        case 'image/bmp':
            return 'bmp';
        default:
            return 'jpg';
    }
}

function isDeviceFriendlyImageMime(mimeType: string): boolean {
    const normalized = normalizeImageMimeType(mimeType);
    return normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/gif';
}

function pickPreferredImageSource(img: any): string | null {
    const preferredAttrs = ['data-src', 'data-original', 'data-lazy-src', 'data-url'];
    for (const attr of preferredAttrs) {
        const value = (img.getAttribute(attr) || '').trim();
        if (value) return value;
    }

    const srcsetCandidates = [
        parseSrcset(img.getAttribute('data-srcset')),
        parseSrcset(img.getAttribute('srcset')),
    ].filter(Boolean) as string[];
    if (srcsetCandidates.length > 0) {
        return srcsetCandidates[0];
    }

    const src = (img.getAttribute('src') || '').trim();
    return src || null;
}

function parseSrcset(srcset: string | null): string | null {
    if (!srcset) return null;
    const candidates = srcset
        .split(',')
        .map(part => part.trim().split(/\s+/)[0])
        .filter(Boolean);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1];
}

/**
 * Check if URL is a Twitter/X URL
 */
function isTwitterUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname;
        return hostname === 'twitter.com' || hostname === 'www.twitter.com' ||
            hostname === 'x.com' || hostname === 'www.x.com';
    } catch {
        return false;
    }
}

/**
 * Check if URL is an archive mirror domain where Readability can truncate around embeds.
 */
function isArchiveUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === 'archive.is' ||
            hostname === 'www.archive.is' ||
            hostname === 'archive.today' ||
            hostname === 'archive.ph' ||
            hostname === 'archive.li' ||
            hostname === 'archive.vn' ||
            hostname === 'archive.fo';
    } catch {
        return false;
    }
}

/**
 * Screen aggressive output for challenge/boilerplate pages.
 */
function assessAggressiveCandidate(text: string): { isContentLike: boolean } {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const challengeMarkers = [
        'please complete the security check to access',
        'why do i have to complete a captcha',
        'cloudflare ray id',
        'attention required',
        'checking if the site connection is secure'
    ];

    const hasChallengeMarker = challengeMarkers.some(marker => normalized.includes(marker));
    const words = countWords(text);

    return {
        isContentLike: !hasChallengeMarker && words >= 80
    };
}

/**
 * Fallback extraction logic (Legacy/Simple)
 */
function extractFallback(document: any, url: string): ExtractionResult {
    if (__DEV__) console.log('[Extractor] Running Legacy Fallback.');

    // Get main content area
    const mainContent = document.querySelector('article') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('main') ||
        document.body;

    if (!mainContent) {
        return {
            success: false,
            error: 'No content found (Fallback failed)'
        };
    }

    // Get text content
    const textContent = mainContent.textContent || '';
    const wordCount = countWords(textContent);

    if (textContent.length < 200) {
        return {
            success: false,
            error: `Content too short (${textContent.length} chars).`
        };
    }

    // Get metadata for fallback
    const title = document.title || 'Untitled';
    const author = extractAuthor({}, document);
    const date = extractDate(document);

    // Create simple HTML body
    const paragraphs = textContent.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
    const body = paragraphs
        .map((p: string) => `<p>${p.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n');

    const article: Article = {
        title,
        author,
        date,
        body,
        rawText: textContent,
        wordCount,
        sourceUrl: url,
    };

    return { success: true, article };
}

/**
 * Extract content from Twitter DOM (Ported from reference project)
 */
function extractTwitterFromDocument(document: any, url: string): ExtractionResult {
    try {
        // 1. Identify Author from URL
        const urlObj = new URL(url);
        const urlParts = urlObj.pathname.split('/');
        // /username/status/id -> parts: ['', 'username', 'status', 'id']
        const authorHandle = urlParts[1];

        if (!authorHandle || !url.includes('/status/')) {
            return { success: false, error: 'Not a valid tweet/thread URL' };
        }

        console.log('[Extractor] Extracting Thread for:', authorHandle);

        // Select tweets
        const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        let threadContent: string[] = [];
        let title = '';

        console.log('[Extractor] Found tweets in DOM:', tweets.length);

        if (tweets.length === 0) {
            return {
                success: false,
                error: 'No tweets found. Twitter might be blocking automated requests or content requires JavaScript.'
            };
        }

        tweets.forEach((tweet: any, index: number) => {
            // Check author via User-Name links
            const userLinks = tweet.querySelectorAll('div[data-testid="User-Name"] a');
            let isAuthor = false;

            for (const link of userLinks) {
                const href = link.getAttribute('href');
                if (href && href.replace('/', '').toLowerCase() === authorHandle.toLowerCase()) {
                    isAuthor = true;
                    break;
                }
            }

            // Capture Author's tweets
            if (isAuthor) {
                // Extract Text
                let textEl = tweet.querySelector('[data-testid="tweetText"]');
                let isArticle = false;

                // Fallback for Twitter Articles (Long Posts)
                if (!textEl) {
                    textEl = tweet.querySelector('[data-testid="twitterArticleRichTextView"]');
                    isArticle = !!textEl;
                }

                const text = textEl ? textEl.innerHTML : '';

                // Title logic
                if (isArticle) {
                    const articleTitleEl = tweet.querySelector('[data-testid="twitter-article-title"]');
                    if (articleTitleEl) {
                        title = articleTitleEl.textContent.trim();
                    }
                }
                // Standard fallback
                if (!title && textEl) {
                    title = textEl.textContent.substring(0, 50) + '...';
                }

                // Helper for XML escaping
                const escapeXml = (str: string) => {
                    if (!str) return '';
                    return str.toString()
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&apos;');
                };

                let tweetHtml = `<div class="tweet" style="border-bottom: 1px solid #ccc; padding: 10px 0;">`;
                if (isArticle && title) {
                    tweetHtml += `<h2>${escapeXml(title)}</h2>`;
                }
                if (text) tweetHtml += `<div>${text}</div>`;
                tweetHtml += `</div>`;

                threadContent.push(tweetHtml);
            }
        });

        if (threadContent.length > 0) {
            const finalTitle = `${authorHandle} on X: "${title.replace(/"/g, "'")}"`;

            // Date (try to find a time element)
            let date = new Date().toISOString().split('T')[0];
            const dateEl = document.querySelector('time');
            if (dateEl && dateEl.getAttribute('datetime')) {
                date = dateEl.getAttribute('datetime').split('T')[0];
            }

            const article: Article = {
                title: finalTitle,
                author: `X (${authorHandle})`,
                date,
                wordCount: threadContent.length * 30, // Estimate
                body: threadContent.join('\n'),
                rawText: '', // rawText not strictly needed for epub unless we want word count accuracy
                sourceUrl: url
            };

            return { success: true, article };
        }

        return { success: false, error: 'Could not extract thread content' };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log('[Extractor] Twitter extraction error:', message);
        return { success: false, error: message };
    }
}

/**
 * Extract author from parsed article or document metadata
 */
function extractAuthor(parsed: { byline?: string | null }, document: any): string {
    if (parsed.byline) {
        return parsed.byline;
    }

    // Try meta tags
    const metaAuthor = document.querySelector('meta[name="author"]');
    if (metaAuthor?.content) {
        return metaAuthor.content;
    }

    const ogAuthor = document.querySelector('meta[property="article:author"]');
    if (ogAuthor?.content) {
        return ogAuthor.content;
    }

    // Fall back to site name
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite?.content) {
        return ogSite.content;
    }

    return 'Unknown';
}

/**
 * Extract publication date from document metadata
 */
function extractDate(document: any): string {
    const today = new Date().toISOString().split('T')[0];

    // Try common date meta tags
    const dateSources = [
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="publish-date"]',
        'time[datetime]',
    ];

    for (const selector of dateSources) {
        const el = document.querySelector(selector);
        if (el) {
            const dt = el.getAttribute('content') || el.getAttribute('datetime');
            if (dt) {
                // Try to parse and format the date
                try {
                    const parsed = new Date(dt);
                    if (!isNaN(parsed.getTime())) {
                        return parsed.toISOString().split('T')[0];
                    }
                } catch {
                    // If parsing fails, try to extract YYYY-MM-DD
                    const match = dt.match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (match) {
                        return match[0];
                    }
                }
            }
        }
    }

    return today;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generic Aggressive Extractor
 * Scans document for paragraphs, filters out menu/link-heavy items,
 * and constructs a body from valid text blocks.
 */
function extractAggressive(document: any, url: string): Article | null {
    try {
        const validBlocks: string[] = [];
        const validTexts: string[] = [];

        // Helper to check if a node is a block-level element
        const isBlock = (tagName: string) => {
            return ['p', 'div', 'article', 'section', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main'].includes(tagName.toLowerCase());
        };

        // Text Clustering Approach (Recursive, linkedom-friendly)
        let currentCluster: string[] = [];

        const flushCluster = () => {
            if (currentCluster.length > 0) {
                const text = currentCluster.join(' ').replace(/\s+/g, ' ').trim();
                if (text.length > 30) {
                    validTexts.push(text);
                    validBlocks.push(`<p>${escapeHtml(text)}</p>`);
                }
                currentCluster = [];
            }
        };

        const walk = (node: any) => {
            if (!node) return;

            if (node.nodeType === 3) { // Text Node
                const t = node.textContent?.trim() || '';
                if (t.length > 0) {
                    currentCluster.push(t);
                }
            }

            // Element Node
            let isBlockStart = false;
            // Note: In linkedom, nodeType might be string '1' or number 1 depending on version, generic check matches both via strict equality if typed correctly, staying safe with standard check.
            if (node.nodeType === 1) {
                const tagName = node.tagName.toLowerCase();

                // Skip non-content tags
                if (['script', 'style', 'nav', 'footer', 'aside', 'header', 'noscript', 'button', 'form', 'svg', 'iframe'].includes(tagName)) {
                    flushCluster();
                    return;
                }

                if (isBlock(tagName)) {
                    flushCluster();
                    isBlockStart = true;
                }
            }

            // Recurse for ALL node types (Document, Element, etc.)
            if (node.childNodes && node.childNodes.length > 0) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    walk(node.childNodes[i]);
                }
            }

            if (isBlockStart) flushCluster();
        };

        // Prefer body to avoid traversing head text nodes.
        walk(document.body || document);

        flushCluster(); // Final flush

        if (validBlocks.length === 0) return null;

        const bodyHtml = validBlocks.join('\n');

        const rawText = validTexts.join('\n\n');

        return {
            title: document.title || 'Untitled',
            author: extractAuthor({}, document),
            date: extractDate(document),
            body: bodyHtml,
            rawText: rawText,
            wordCount: countWords(rawText),
            sourceUrl: url
        };

    } catch (e) {
        console.warn('[Extractor] Aggressive Extraction failed', e);
        return null;
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Internal helpers exported for deterministic regression tests.
export const __extractorTestUtils = {
    isArchiveUrl,
    assessAggressiveCandidate,
    extractAggressive,
    escapeHtml,
    normalizeImageMimeType,
    extensionFromImageMime,
    pickPreferredImageSource,
    parseSrcset,
};
