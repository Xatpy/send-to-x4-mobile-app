type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function stringifyValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * Build a user-facing error with extra native details for fetch/network failures.
 * This helps diagnose Android release-only failures where message alone is generic.
 */
export function formatNetworkError(error: unknown, requestUrl?: string): string {
    const parts: string[] = [];
    const errObj = isRecord(error) ? error : undefined;

    let message = 'Unknown error';
    if (error instanceof Error) {
        message = error.message || error.name || message;
    } else if (typeof error === 'string') {
        message = error;
    } else if (errObj && typeof errObj.message === 'string') {
        message = errObj.message;
    }

    if (message === 'Aborted') {
        message = 'Connection timed out';
    }
    parts.push(message);

    if (requestUrl) {
        parts.push(`url=${requestUrl}`);
    }

    if (error instanceof Error && error.name && error.name !== 'Error') {
        parts.push(`name=${error.name}`);
    } else if (errObj && typeof errObj.name === 'string') {
        parts.push(`name=${errObj.name}`);
    }

    if (errObj) {
        for (const key of ['code', 'type', 'description', 'errno']) {
            const value = errObj[key];
            if (value !== undefined && value !== null && value !== '') {
                parts.push(`${key}=${stringifyValue(value)}`);
            }
        }

        const cause = errObj.cause;
        if (cause !== undefined && cause !== null) {
            parts.push(`cause=${stringifyValue(cause)}`);
        }
    }

    return parts.join(' | ');
}

