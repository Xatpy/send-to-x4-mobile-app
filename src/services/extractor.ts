import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { Article, ExtractionResult } from '../types';

const USER_AGENT = 'Mozilla/5.0 (compatible; Send-to-X4/1.0)';

/**
 * Extract article content from a URL
 */
export async function extractArticle(url: string): Promise<ExtractionResult> {
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
};
