import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { CENTER, CUTS } from '../core';
import type { Cut, CutPart } from '../core';

const DEG = Math.PI / 180;

/** Every cut expressed as the same number of parts, so any two cut paths can interpolate. */
export const MORPH_SLOTS = 6;

export function cutPartsForMorph(cut: Cut): CutPart[] {
  const parts = CUTS[cut].parts;
  const out: CutPart[] = [];
  for (let i = 0; i < MORPH_SLOTS; i++) out.push(parts[i % parts.length]);
  return out;
}

function rrectPath(cx: number, cy: number, w: number, h: number, r: number, rotDeg: number): SkPath {
  const b = Skia.PathBuilder.Make();
  b.addRRect(Skia.RRectXY(Skia.XYWHRect(cx - w / 2, cy - h / 2, w, h), r, r));
  if (rotDeg !== 0) {
    const m = Skia.Matrix();
    m.translate(cx, cy);
    m.rotate(rotDeg * DEG);
    m.translate(-cx, -cy);
    b.transform(m);
  }
  return b.build();
}

const cutCache = new Map<Cut, SkPath>();

/** Silhouette path in box coordinates. Cached per cut. */
export function cutPath(cut: Cut): SkPath {
  const hit = cutCache.get(cut);
  if (hit) return hit;
  const b = Skia.PathBuilder.Make();
  for (const part of cutPartsForMorph(cut)) b.addPath(rrectPath(CENTER, CENTER, part.w, part.h, part.r, part.rot));
  const path = b.build();
  cutCache.set(cut, path);
  return path;
}
