declare module 'upng-js' {
    interface DecodedImage {
        width: number;
        height: number;
        depth: number;
        ctype: number;
        data: Uint8Array;
        tabs: Record<string, unknown>;
        frames: Array<{
            rect: { x: number; y: number; width: number; height: number };
            delay: number;
            dispose: number;
            blend: number;
            data: Uint8Array | null;
        }>;
    }

    function decode(buffer: ArrayBuffer | Uint8Array): DecodedImage;
    function toRGBA8(image: DecodedImage): ArrayBuffer[];
    function encode(
        bufs: ArrayBuffer[],
        w: number,
        h: number,
        ps?: number,
        dels?: number[],
        forbidPlte?: boolean,
    ): ArrayBuffer;
}
