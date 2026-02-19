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
export function htmlToXhtml(html: string): string {
    if (!html) return '';

    const sanitized = sanitizeHtmlForEpub(html);

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

function sanitizeHtmlForEpub(html: string): string {
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    const root = document.body;

    const removeSelectors = [
        'script', 'style', 'iframe', 'svg', 'math', 'video', 'audio', 'source',
        'object', 'embed', 'form', 'input', 'button', 'nav', 'header', 'footer',
        'noscript', 'img', 'picture'
    ];
    removeSelectors.forEach(selector => {
        root.querySelectorAll(selector).forEach((node: any) => node.remove());
    });

    // Wikipedia/reference clutter and edit chrome
    root.querySelectorAll('.reference, .mw-editsection, .navbox, .metadata, .thumb, .infobox').forEach((node: any) => node.remove());

    // Unwrap links to plain text to reduce parser/indexer load on constrained devices.
    root.querySelectorAll('a').forEach((a: any) => {
        const text = a.textContent || '';
        const replacement = document.createTextNode(text);
        a.replaceWith(replacement);
    });

    const allowedTags = new Set([
        'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'strong', 'em', 'b', 'i', 'cite', 'abbr', 'span', 'br', 'hr'
    ]);

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
    root.querySelectorAll('p,div,li,blockquote').forEach((el: any) => {
        if ((el.textContent || '').trim().length === 0) el.remove();
    });

    return root.innerHTML;
}

/**
 * Generate a UUID v4
 */
export function generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
