const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToXhtml } = require('../src/utils/sanitizer.ts');

test('htmlToXhtml strips heavy wikipedia-like markup', () => {
    const html = `
      <div>
        <h1>Title</h1>
        <figure><img src="https://example.com/a.jpg"/><figcaption>Cap</figcaption></figure>
        <table><tr><td>cell</td></tr></table>
        <p>Body <a href="https://example.com">link text</a> more.</p>
      </div>
    `;

    const out = htmlToXhtml(html);
    assert.equal(/<figure\b/i.test(out), false);
    assert.equal(/<img\b/i.test(out), false);
    assert.equal(/<table\b/i.test(out), false);
    assert.equal(/<a\b/i.test(out), false);
    assert.equal(out.includes('link text'), true);
    assert.equal(out.includes('Cap'), false);
    assert.equal(out.includes('cell'), true);
});

test('htmlToXhtml keeps image-only blocks when preserveImages is enabled', () => {
    const html = `
      <div>
        <p><img src="image_1.jpg" alt="hero"></p>
        <blockquote><img src="image_2.png"></blockquote>
      </div>
    `;

    const out = htmlToXhtml(html, { preserveImages: true });
    assert.equal(out.includes('image_1.jpg'), true);
    assert.equal(out.includes('image_2.png'), true);
    assert.equal(/<img\b[^>]*\/>/i.test(out), true);
});

test('htmlToXhtml preserves images wrapped in links when preserveImages is enabled', () => {
    const html = `
      <p>
        <a href="https://example.com/full">
          <img src="image_linked.jpg" alt="linked"/>
        </a>
      </p>
    `;

    const out = htmlToXhtml(html, { preserveImages: true });
    assert.equal(out.includes('image_linked.jpg'), true);
    assert.equal(/<a\b/i.test(out), false);
});
