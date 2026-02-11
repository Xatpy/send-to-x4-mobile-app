/**
 * BMP Encoder for Crosspoint X4 Screensavers
 *
 * Produces uncompressed 24-bit BMP files at exactly 480×800 pixels.
 * Output matches the device's screen resolution and format requirements.
 *
 * BMP structure:
 *   BITMAPFILEHEADER (14 bytes) + BITMAPINFOHEADER (40 bytes) + pixel data
 *   Pixel data: BGR bytes, bottom-up row order, rows padded to 4-byte boundary
 *   (480 * 3 = 1440, already divisible by 4 — no padding needed)
 *
 * Expected output file size: 54 + (1440 * 800) = 1,152,054 bytes
 */

const BMP_WIDTH = 480;
const BMP_HEIGHT = 800;
const BITS_PER_PIXEL = 24;
const BYTES_PER_PIXEL = 3; // BGR
const ROW_BYTES = BMP_WIDTH * BYTES_PER_PIXEL; // 1440 (already 4-byte aligned)
const PIXEL_DATA_SIZE = ROW_BYTES * BMP_HEIGHT; // 1,152,000
const HEADER_SIZE = 14 + 40; // file header + info header
const FILE_SIZE = HEADER_SIZE + PIXEL_DATA_SIZE; // 1,152,054

/**
 * Encode RGBA pixel data into an uncompressed 24-bit BMP.
 *
 * @param rgba - Uint8Array of RGBA pixel data (4 bytes per pixel, top-down row order)
 *               Must be exactly 480 * 800 * 4 = 1,536,000 bytes.
 * @returns Uint8Array representing the complete BMP file
 */
export function encodeRGBAToBMP(rgba: Uint8Array): Uint8Array {
    const expectedLength = BMP_WIDTH * BMP_HEIGHT * 4;
    if (rgba.length !== expectedLength) {
        throw new Error(
            `RGBA data must be ${expectedLength} bytes (480×800×4), got ${rgba.length}`
        );
    }

    const bmp = new Uint8Array(FILE_SIZE);
    const view = new DataView(bmp.buffer);

    // --- BITMAPFILEHEADER (14 bytes) ---
    bmp[0] = 0x42; // 'B'
    bmp[1] = 0x4d; // 'M'
    view.setUint32(2, FILE_SIZE, true);     // bfSize
    view.setUint16(6, 0, true);             // bfReserved1
    view.setUint16(8, 0, true);             // bfReserved2
    view.setUint32(10, HEADER_SIZE, true);  // bfOffBits (54)

    // --- BITMAPINFOHEADER (40 bytes) ---
    view.setUint32(14, 40, true);                // biSize
    view.setInt32(18, BMP_WIDTH, true);          // biWidth
    view.setInt32(22, BMP_HEIGHT, true);         // biHeight (positive = bottom-up)
    view.setUint16(26, 1, true);                 // biPlanes
    view.setUint16(28, BITS_PER_PIXEL, true);    // biBitCount
    view.setUint32(30, 0, true);                 // biCompression (BI_RGB)
    view.setUint32(34, PIXEL_DATA_SIZE, true);   // biSizeImage
    view.setInt32(38, 2835, true);               // biXPelsPerMeter (~72 DPI)
    view.setInt32(42, 2835, true);               // biYPelsPerMeter (~72 DPI)
    view.setUint32(46, 0, true);                 // biClrUsed
    view.setUint32(50, 0, true);                 // biClrImportant

    // --- Pixel data (bottom-up, BGR) ---
    // BMP stores rows bottom-to-top: BMP row 0 = image bottom row
    for (let y = 0; y < BMP_HEIGHT; y++) {
        // Source row (top-down): the bottom-most source row goes to BMP row 0
        const srcRow = BMP_HEIGHT - 1 - y;
        const srcOffset = srcRow * BMP_WIDTH * 4;
        const dstOffset = HEADER_SIZE + y * ROW_BYTES;

        for (let x = 0; x < BMP_WIDTH; x++) {
            const si = srcOffset + x * 4;
            const di = dstOffset + x * BYTES_PER_PIXEL;
            // RGBA → BGR
            bmp[di] = rgba[si + 2];     // B
            bmp[di + 1] = rgba[si + 1]; // G
            bmp[di + 2] = rgba[si];     // R
        }
    }

    return bmp;
}

export { BMP_WIDTH, BMP_HEIGHT, FILE_SIZE };
