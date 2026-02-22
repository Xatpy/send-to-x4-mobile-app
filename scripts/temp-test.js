const assert = require('assert');
const { wrapText, layoutTextIntoLines } = require('../src/sleepScreen/textLayout.ts');
console.log(layoutTextIntoLines("One Two Three Four", {templateId: 'note', textSize: 'S', density: 'normal'}, 100, 80, {charWidth: 10, charHeight: 20}));
