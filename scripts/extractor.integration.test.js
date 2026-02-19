const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { extractArticle } = require('../src/services/extractor.ts');
const { __extractorTestUtils } = require('../src/services/extractor.ts');

const originalFetch = global.fetch;
const originalDev = global.__DEV__;

function mockFetchHtml(html, status = 200) {
    global.fetch = async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => html,
    });
}

function restoreGlobals() {
    global.fetch = originalFetch;
    if (typeof originalDev === 'undefined') {
        delete global.__DEV__;
    } else {
        global.__DEV__ = originalDev;
    }
}

beforeEach(() => {
    global.__DEV__ = false;
});

afterEach(() => {
    restoreGlobals();
});

test('extractArticle handles a standard readable article', { concurrency: false }, async () => {
    const html = `
      <!doctype html><html><head>
        <title>Sample Long Article</title>
        <meta name="author" content="Jane Writer" />
        <meta property="article:published_time" content="2025-12-01T12:00:00Z" />
      </head><body>
        <article>
          <h1>Sample Long Article</h1>
          <p>${'This is a detailed article paragraph with enough context. '.repeat(30)}</p>
          <p>${'More narrative content that readability should keep. '.repeat(30)}</p>
        </article>
      </body></html>
    `;

    mockFetchHtml(html);
    const result = await extractArticle('https://example.com/post');

    assert.equal(result.success, true);
    assert.equal(result.article.title, 'Sample Long Article');
    assert.equal(result.article.author, 'Jane Writer');
    assert.ok(result.article.wordCount > 100);
});

test('extractArticle rejects archive challenge pages', { concurrency: false }, async () => {
    const html = `
      <!doctype html><html><head><title>archive.is</title></head><body>
        <main>
          <h1>Please complete the security check to access</h1>
          <p>${'Why do I have to complete a CAPTCHA? '.repeat(25)}</p>
          <p>Cloudflare Ray ID: 1234567890</p>
        </main>
      </body></html>
    `;

    mockFetchHtml(html);
    const result = await extractArticle('https://archive.is/nLYgm');

    assert.equal(result.success, false);
});

test('archive-like pages keep post-embed continuation in aggressive path', { concurrency: false }, () => {
    const { parseHTML } = require('linkedom');
    const html = `
      <!doctype html><html><head><title>Mirror Article</title></head><body>
        <article><p>${'intro '.repeat(80)}</p></article>
        <div class="post-embed-content"><p>${'continued '.repeat(140)}</p></div>
      </body></html>
    `;

    const { document } = parseHTML(html);
    const article = __extractorTestUtils.extractAggressive(document, 'https://archive.is/example');
    assert.ok(article);
    assert.ok(article.rawText.includes('intro'));
    assert.ok(article.rawText.includes('continued'));
    assert.equal(__extractorTestUtils.isArchiveUrl('https://archive.is/example'), true);
});

test('extractArticle supports X/Twitter thread extraction path', { concurrency: false }, async () => {
    const html = `
      <!doctype html><html><head><title>Thread</title></head><body>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/author1">author1</a></div>
          <div data-testid="tweetText">Primer mensaje del hilo.</div>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/author1">author1</a></div>
          <div data-testid="tweetText">Segundo mensaje con más contenido.</div>
        </article>
      </body></html>
    `;

    mockFetchHtml(html);
    const result = await extractArticle('https://x.com/author1/status/123');

    assert.equal(result.success, true);
    assert.ok(result.article.body.includes('Primer mensaje del hilo.'));
    assert.ok(result.article.body.includes('Segundo mensaje con más contenido.'));
});
