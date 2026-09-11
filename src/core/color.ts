import { clamp, wrap01 } from './math';

export type RGB = readonly [number, number, number];

/** Parses #rgb, #rrggbb or rgb(r,g,b). Falls back to mid grey. */
export function parseColor(c: string): RGB {
  'worklet';
  if (c.charAt(0) === '#') {
    if (c.length === 4) {
      const r = parseInt(c.charAt(1), 16);
      const g = parseInt(c.charAt(2), 16);
      const b = parseInt(c.charAt(3), 16);
      return [r * 17, g * 17, b * 17];
    }
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/\d+(\.\d+)?/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [128, 128, 128];
}

export function toHex(rgb: RGB): string {
  'worklet';
  const r = clamp(Math.round(rgb[0]), 0, 255);
  const g = clamp(Math.round(rgb[1]), 0, 255);
  const b = clamp(Math.round(rgb[2]), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function mixColor(a: string, b: string, u: number): string {
  'worklet';
  const A = parseColor(a);
  const B = parseColor(b);
  return toHex([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]);
}

/**
 * The colour you get by multiply-blending `c` onto itself at full strength.
 * Drawing this at 30% opacity with normal compositing is identical to a
 * 30% multiply layer, which lets renderers without blend modes fake the facets.
 */
export function selfMultiply(c: string): string {
  'worklet';
  const [r, g, b] = parseColor(c);
  return toHex([(r * r) / 255, (g * g) / 255, (b * b) / 255]);
}

/** Saturated hues cycled during the `done` celebration. */
export const RAINBOW: readonly string[] = [
  '#D63A2F',
  '#F2705B',
  '#FF9F43',
  '#FFD447',
  '#C5D94A',
  '#1F8A70',
  '#5FC7B0',
  '#3FC1F5',
  '#9B59B6',
  '#F48FB1',
];

export function rainbowAt(phase: number): string {
  'worklet';
  const n = RAINBOW.length;
  const f = wrap01(phase) * n;
  const i = Math.floor(f) % n;
  return mixColor(RAINBOW[i], RAINBOW[(i + 1) % n], f - Math.floor(f));
}

/** Blend the base colour toward the rainbow by `amount`. */
export function celebrationColor(base: string, phase: number, amount: number): string {
  'worklet';
  if (amount <= 0) return base;
  return mixColor(base, rainbowAt(phase * 2), amount);
}
