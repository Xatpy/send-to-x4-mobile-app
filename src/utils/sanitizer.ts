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
 * Convert HTML to XHTML by closing void elements
 */
/**
 * Convert HTML to XHTML by closing void elements
 */
export function htmlToXhtml(html: string): string {
    if (!html) return '';

    // List of void/self-closing elements in HTML that must be self-closed in XHTML
    const voidElements = [
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ];

    // Pattern to match void elements that are not already self-closed
    // Matches: <tag ...> but not <tag ... /> or <tag .../>
    const pattern = new RegExp(
        `<(${voidElements.join('|')})([^>]*?)>`,
        'gi'
    );

    // Replace with self-closing version
    return html.replace(pattern, (match, tag, attrs) => {
        if (/\/\s*>$/.test(match)) return match;
        return `<${tag}${attrs} />`;
    });
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
