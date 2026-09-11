import { Skia } from "@shopify/react-native-skia";

import { GRAIN, LIGHT_REACH, rgb01 } from "../core";

import type { Frame } from "../core";
import type { SkRuntimeEffect, SkShader } from "@shopify/react-native-skia";

/**
 * Surface shader, in box coordinates (0..64). A radial two-hue gradient
 * from the light position, a soft highlight near it, and a static
 * per-pixel grain so the surface reads as material rather than vector.
 */
export const SURFACE_SKSL = `
uniform float2 light;
uniform float3 lit;
uniform float3 shade;
uniform float reach;
uniform float grain;
uniform float px;

float hash21(float2 p) {
  p = fract(p * float2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

half4 main(float2 pos) {
  float d = distance(pos, light) / reach;
  float t = smoothstep(0.0, 1.0, d);
  float3 c = mix(lit, shade, t);
  float hi = 1.0 - smoothstep(0.0, 0.5, d);
  c = mix(c, min(c * 1.10 + 0.03, float3(1.0)), hi * 0.5);
  float2 cell = floor(pos * px / 1.5);
  float n = hash21(cell) - 0.5;
  c += n * grain;
  return half4(clamp(c, 0.0, 1.0), 1.0);
}
`;

let effect: SkRuntimeEffect | null = null;

/** The compiled surface effect. Compiled once, on first use. */
export function surfaceEffect(): SkRuntimeEffect {
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(SURFACE_SKSL);
    if (!effect)
      throw new Error("moodstone: the surface shader failed to compile");
  }
  return effect;
}

export interface SurfaceUniforms {
  [name: string]: number | number[];
  light: number[];
  lit: number[];
  shade: number[];
  reach: number;
  grain: number;
  px: number;
}

/** Uniforms for a frame. `px` is device pixels per box unit, which sizes the grain. */
export function surfaceUniforms(frame: Frame, px: number): SurfaceUniforms {
  "worklet";
  return {
    light: [frame.light[0], frame.light[1]],
    lit: rgb01(frame.lit),
    shade: rgb01(frame.shade),
    reach: LIGHT_REACH,
    grain: GRAIN,
    px,
  };
}

/** Same uniforms flattened in declaration order, for `makeShader`. */
export function makeSurfaceShader(frame: Frame, px: number): SkShader {
  const u = surfaceUniforms(frame, px);
  return surfaceEffect().makeShader([
    ...u.light,
    ...u.lit,
    ...u.shade,
    u.reach,
    u.grain,
    u.px,
  ]);
}
