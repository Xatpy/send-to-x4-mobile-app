import test from 'node:test';
import { strict as assert } from 'node:assert';
import { encodeRGBAToBMP, BMP_WIDTH, BMP_HEIGHT, FILE_SIZE } from '../src/services/bmp_encoder';

test('encodeRGBAToBMP: produces correct header and size', () => {
    // Produce a dummy RGBA buffer (all transparent)
    const expectedLength = BMP_WIDTH * BMP_HEIGHT * 4;
    const rgba = new Uint8Array(expectedLength);

    const bmp = encodeRGBAToBMP(rgba);

    // Test 1: File size matches expected exactly (1,152,054)
    assert.equal(bmp.length, FILE_SIZE);

    // Test 2: Magic bytes "BM"
    assert.equal(bmp[0], 0x42); // 'B'
    assert.equal(bmp[1], 0x4d); // 'M'

    // Test 3: bfSize in header (bytes 2-5)
    const view = new DataView(bmp.buffer);
    const bfSize = view.getUint32(2, true);
    assert.equal(bfSize, FILE_SIZE);

    // Test 4: Pixel offset is 54
    const offset = view.getUint32(10, true);
    assert.equal(offset, 54);

    // Test 5: Info header size is 40
    const infoSize = view.getUint32(14, true);
    assert.equal(infoSize, 40);

    // Test 6: Correct dimensions
    const width = view.getInt32(18, true);
    const height = view.getInt32(22, true);
    assert.equal(width, BMP_WIDTH);
    assert.equal(height, BMP_HEIGHT);

    // Test 7: 24 bits per pixel
    const bpp = view.getUint16(28, true);
    assert.equal(bpp, 24);
});

test('encodeRGBAToBMP: converts RGBA to BGR correctly', () => {
    const expectedLength = BMP_WIDTH * BMP_HEIGHT * 4;
    const rgba = new Uint8Array(expectedLength);

    // Set first pixel (top-left) to Red=100, Green=150, Blue=200
    rgba[0] = 100; // R
    rgba[1] = 150; // G
    rgba[2] = 200; // B
    rgba[3] = 255; // A

    const bmp = encodeRGBAToBMP(rgba);

    // BMP is bottom-up by default, so top-left source pixel goes to the LAST row in BMP
    // Let's find the last row
    const rowBytes = BMP_WIDTH * 3;
    const lastRowOffset = 54 + (BMP_HEIGHT - 1) * rowBytes;

    // Expected in BMP: B G R
    assert.equal(bmp[lastRowOffset], 200);     // B
    assert.equal(bmp[lastRowOffset + 1], 150); // G
    assert.equal(bmp[lastRowOffset + 2], 100); // R
});
