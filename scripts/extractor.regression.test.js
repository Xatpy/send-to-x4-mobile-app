const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { __extractorTestUtils } = require('../src/services/extractor.ts');

test('archive domains are recognized', () => {
    assert.equal(__extractorTestUtils.isArchiveUrl('https://archive.is/nLYgm'), true);
    assert.equal(__extractorTestUtils.isArchiveUrl('https://archive.today/abc123'), true);
    assert.equal(__extractorTestUtils.isArchiveUrl('https://example.com/post'), false);
});

test('aggressive candidate rejects challenge pages', () => {
    const challenge = `
        Please complete the security check to access.
        Why do I have to complete a CAPTCHA?
        Cloudflare Ray ID: 12345.
    `;
    const assessment = __extractorTestUtils.assessAggressiveCandidate(challenge);
    assert.equal(assessment.isContentLike, false);
});

test('aggressive extractor skips nav text and escapes html-sensitive content', () => {
    const html = `
        <html>
          <body>
            <nav>${'menu item '.repeat(150)}</nav>
            <main>
              <div>
                ${'actual article content '.repeat(120)}
                a &lt; b &amp;&amp; c &gt; d
              </div>
            </main>
          </body>
        </html>
    `;
    const { document } = parseHTML(html);
    const article = __extractorTestUtils.extractAggressive(document, 'https://archive.is/example');

    assert.ok(article);
    assert.equal(article.rawText.includes('menu item'), false);
    assert.equal(article.body.includes('&lt;'), true);
    assert.equal(article.body.includes('&amp;'), true);
});

test('image mime helpers normalize content-type values for OPF compatibility', () => {
    assert.equal(
        __extractorTestUtils.normalizeImageMimeType('image/svg+xml; charset=utf-8'),
        'image/svg+xml'
    );
    assert.equal(
        __extractorTestUtils.normalizeImageMimeType('image/jpg'),
        'image/jpeg'
    );
    assert.equal(
        __extractorTestUtils.extensionFromImageMime('image/svg'),
        'svg'
    );
});
