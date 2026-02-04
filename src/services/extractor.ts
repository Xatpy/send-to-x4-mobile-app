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

        // Check success
        if (parsed && parsed.textContent && parsed.textContent.length >= 400) {
            if (__DEV__) console.log('[Extractor] Readability success');

            const title = parsed.title || document.title || 'Untitled';
            const author = extractAuthor(parsed, document);
            const date = extractDate(document);

            const article: Article = {
                title,
                author,
                date,
                body: parsed.content || '',
                rawText: parsed.textContent,
                wordCount: countWords(parsed.textContent),
                sourceUrl: url,
            };

            return { success: true, article };
        }

        // --- FALLBACK EXTRACTION ---
        if (__DEV__) console.log('[Extractor] Readability failed or content too short. Using fallback extraction.');

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

        if (textContent.length < 400) {
            if (__DEV__) console.log('[Extractor] Fallback content too short:', textContent.length);
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
        const paragraphs = textContent.split(/\n\n+/).filter(p => p.trim().length > 0);
        const body = paragraphs
            .map(p => `<p>${p.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
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
