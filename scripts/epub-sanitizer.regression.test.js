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
    assert.equal(out.includes('Cap'), true);
    assert.equal(out.includes('cell'), true);
});
