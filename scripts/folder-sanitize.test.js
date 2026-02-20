#!/usr/bin/env node
/**
 * Quick sanity tests for folder-name sanitization.
 *
 * Run:  node scripts/test_folder_sanitize.mjs
 */

// ---- inline copy of sanitizeFolderName (avoids TS import issues) ----
function sanitizeFolderName(value) {
    return value
        .trim()
        .replace(/[\/\\]/g, '')
        .replace(/[^a-zA-Z0-9\s._-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/^\.{1,2}$/, '')   // block bare "." or ".."
        .substring(0, 60);
}

const DEFAULT_FOLDER = 'send-to-x4';

function sanitizeOrDefault(raw) {
    return sanitizeFolderName(raw) || DEFAULT_FOLDER;
}

// ---- test cases ----
const cases = [
    // [input, expected]
    ['send-to-x4', 'send-to-x4'],
    ['My Articles', 'My-Articles'],
    ['my/folder', 'myfolder'],
    ['..', 'send-to-x4'],               // traversal → default
    ['.', 'send-to-x4'],               // traversal → default
    ['   ', 'send-to-x4'],             // whitespace-only → default
    ['', 'send-to-x4'],                // empty → default
    ['a'.repeat(80), 'a'.repeat(60)],   // capped at 60
    ['hello!@#world', 'helloworld'],
    ['  --spaced--  ', 'spaced'],
    ['.inbox', '.inbox'],               // leading dot in a real name → allowed
    ['my..folder', 'my..folder'],       // dots mid-name → allowed
    ['back\\slash', 'backslash'],
];

let passed = 0;
let failed = 0;

for (const [input, expected] of cases) {
    const got = sanitizeOrDefault(input);
    if (got === expected) {
        passed++;
    } else {
        failed++;
        console.error(`FAIL: sanitize(${JSON.stringify(input)}) => ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    }
}

console.log(`\n${passed} passed, ${failed} failed out of ${cases.length} tests`);
process.exit(failed > 0 ? 1 : 0);
