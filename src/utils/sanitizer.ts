import { parseHTML } from 'linkedom';

/**
 * Sanitize a string to be used as a filename
 */
export function sanitizeFilename(text: string, maxLength = 80): string {
    if (!text) return 'untitled';
    return text
        .replace(/[\/\\:*?"<>|]/g, '')           // Remove illegal chars
        .replace(/\s+/g, ' ')                     // Normalize whitespace
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')   // Remove emojis
        .trim()
        .substring(0, maxLength) || 'untitled';
}

/**
 * Escape special characters for XML
 */
export function escapeXml(text: string): string {
    if (!text) return '';
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Convert article HTML to EPUB-safe XHTML content.
 * Strips heavy/interactive markup and keeps a conservative set of tags.
 */
export function htmlToXhtml(html: string, options?: { preserveImages?: boolean }): string {
    if (!html) return '';

    const sanitized = sanitizeHtmlForEpub(html, options?.preserveImages);

    // List of void/self-closing elements in HTML that must be self-closed in XHTML
    const voidElements = [
        'area', 'base', 'br', 'col', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ];

    // Pattern to match void elements that are not already self-closed
    // Matches: <tag ...> but not <tag ... /> or <tag .../>
    const pattern = new RegExp(
        `<(${voidElements.join('|')})([^>]*?)>`,
        'gi'
    );

    // Replace with self-closing version
    return sanitized.replace(pattern, (match, tag, attrs) => {
        if (/\/\s*>$/.test(match)) return match;
        return `<${tag}${attrs} />`;
    });
}

function sanitizeHtmlForEpub(html: string, preserveImages?: boolean): string {
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    const root = document.body;

    let removeSelectors = [
        'script', 'style', 'iframe', 'svg', 'math', 'video', 'audio', 'source',
        'object', 'embed', 'form', 'input', 'button', 'nav', 'header', 'footer',
        'noscript'
    ];

    if (!preserveImages) {
        removeSelectors.push('img', 'picture', 'figure', 'figcaption');
    }

    removeSelectors.forEach(selector => {
        root.querySelectorAll(selector).forEach((node: any) => node.remove());
    });

    // Wikipedia/reference clutter and edit chrome
    root.querySelectorAll('.reference, .mw-editsection, .navbox, .metadata, .thumb, .infobox').forEach((node: any) => node.remove());

    // Unwrap links (drop the anchor tag but keep its content).
    // This preserves linked images like <a><img .../></a>.
    root.querySelectorAll('a').forEach((a: any) => {
        const parent = a.parentNode;
        if (!parent) return;
        const children = Array.from(a.childNodes) as any[];
        if (children.length > 0) {
            for (const child of children) {
                parent.insertBefore(child, a);
            }
            parent.removeChild(a);
            return;
        }
        const text = a.textContent || '';
        const replacement = document.createTextNode(text);
        a.replaceWith(replacement);
    });

    const allowedTags = new Set([
        'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'strong', 'em', 'b', 'i', 'cite', 'abbr', 'span', 'br', 'hr'
    ]);

    if (preserveImages) {
        allowedTags.add('img');
        // We intentionally don't add picture, figure, figcaption. 
        // This causes the sanitizer to unwrap them, leaving behind just the standard <img> tag
        // which complies perfectly with strict XHTML 1.1 EPUB 2 parsers.
    }

    const sanitizeNode = (node: any) => {
        if (!node) return;

        if (node.nodeType === 1) {
            const tag = node.tagName.toLowerCase();
            if (!allowedTags.has(tag)) {
                const parent = node.parentNode;
                if (!parent) return;

                const movedChildren = Array.from(node.childNodes) as any[];
                for (const child of movedChildren) {
                    parent.insertBefore(child, node);
                }
                parent.removeChild(node);

                for (const child of movedChildren) {
                    sanitizeNode(child);
                }
                return;
            }

            // Keep markup minimal and XHTML-friendly.
            const attrs = Array.from(node.attributes || []) as any[];
            for (const attr of attrs) {
                // Keep src and alt and dimensions for images
                const isImageAttr = tag === 'img' && (
                    attr.name === 'src' || attr.name === 'alt' || attr.name === 'width' || attr.name === 'height' || attr.name === 'style'
                );
                if (preserveImages && isImageAttr) {
                    continue;
                }
                node.removeAttribute(attr.name);
            }

            const children = Array.from(node.childNodes) as any[];
            for (const child of children) {
                sanitizeNode(child);
            }
            return;
        }

        if (node.nodeType !== 3) {
            node.remove();
        }
    };

    const rootChildren = Array.from(root.childNodes) as any[];
    for (const child of rootChildren) {
        sanitizeNode(child);
    }

    // Remove empty block elements after cleanup.
    // Keep image-only wrappers when image preservation is enabled.
    root.querySelectorAll('p,div,li,blockquote').forEach((el: any) => {
        const hasText = ((el.textContent || '').trim().length > 0);
        const hasImage = preserveImages && el.querySelector('img');
        if (!hasText && !hasImage) el.remove();
    });

    return root.innerHTML;
}

/**
 * Generate a UUID v4
 */
let uuidFallbackCounter = 0;

export function generateUuid(): string {
    const cryptoApi = globalThis.crypto;

    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }

    if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        return bytesToUuid(bytes);
    }

    // Last-resort fallback for runtimes without Web Crypto.
    const now = Date.now().toString(16).padStart(12, '0');
    const perfNow = typeof performance !== 'undefined'
        ? Math.floor(performance.now() * 1000).toString(16).padStart(12, '0')
        : '000000000000';
    const counter = (uuidFallbackCounter++).toString(16).padStart(8, '0');
    const seed = `${now}${perfNow}${counter}`.slice(0, 32).padEnd(32, '0').split('');

    seed[12] = '4';
    seed[16] = '8';

    return `${seed.slice(0, 8).join('')}-${seed.slice(8, 12).join('')}-${seed.slice(12, 16).join('')}-${seed.slice(16, 20).join('')}-${seed.slice(20, 32).join('')}`;
}

function bytesToUuid(bytes: Uint8Array): string {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(text: string): boolean {
    try {
        const url = new URL(text.trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Truncate a URL for display
 */
export function truncateUrl(url: string, maxLength = 50): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
}
