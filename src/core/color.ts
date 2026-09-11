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

/** Hex → [hue 0..360, saturation 0..1, lightness 0..1]. */
export function hexToHsl(c: string): [number, number, number] {
  'worklet';
  const [R, G, B] = parseColor(c);
  const r = R / 255;
  const g = G / 255;
  const b = B / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hueChannel(p: number, q: number, t: number): number {
  'worklet';
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToHex(h: number, s: number, l: number): string {
  'worklet';
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  if (ss < 1e-6) return toHex([ll * 255, ll * 255, ll * 255]);
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return toHex([hueChannel(p, q, hh + 1 / 3) * 255, hueChannel(p, q, hh) * 255, hueChannel(p, q, hh - 1 / 3) * 255]);
}

/** Move a hue toward a target hue by up to `amount` degrees along the shortest arc. */
export function hueToward(h: number, target: number, amount: number): number {
  'worklet';
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amount) return target;
  d = d > 0 ? amount : -amount;
  return h + d;
}

/**
 * The two hues of the surface gradient for a base colour: the lit side
 * leans warm (toward yellow) and brighter, the shaded side leans cool
 * (toward blue-violet) and darker, the way painters shift shadows.
 */
export function litShade(base: string): [string, string] {
  'worklet';
  const [h, s, l] = hexToHsl(base);
  const lit = hslToHex(hueToward(h, 60, 12), s + 0.05, l + 0.09);
  const shade = hslToHex(hueToward(h, 250, 16), s + 0.04, l - 0.17);
  return [lit, shade];
}

/** Hex → [r, g, b] in 0..1, for shader uniforms. */
export function rgb01(c: string): [number, number, number] {
  'worklet';
  const [r, g, b] = parseColor(c);
  return [r / 255, g / 255, b / 255];
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
