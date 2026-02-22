/**
 * X4 Device Hardware Configuration
 *
 * This module defines the physical characteristics of the X4 device screen.
 */

export const X4_WIDTH_PX = 480;
export const X4_HEIGHT_PX = 800;
export const X4_ORIENTATION = 'portrait';

export function getX4ScreenSize() {
    return { width: X4_WIDTH_PX, height: X4_HEIGHT_PX };
}
