import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { CUTS, specPoints, specShapeKey } from '../core';
import type { AvatarSpec, Cut } from '../core';

/** Closed polyline path from flat [x, y, …] points. Every outline has the same segment count, so they interpolate. */
export function outlinePath(points: number[]): SkPath {
  const b = Skia.PathBuilder.Make();
  b.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) b.lineTo(points[i], points[i + 1]);
  b.close();
  return b.build();
}

const cutCache = new Map<string, SkPath>();

/** Silhouette path for a preset cut, cached. */
export function cutPath(cut: Cut): SkPath {
  const key = 'cut:' + cut;
  const hit = cutCache.get(key);
  if (hit) return hit;
  const path = outlinePath(CUTS[cut].points);
  cutCache.set(key, path);
  return path;
}

/** Silhouette path for a spec: preset cuts are cached, custom shapes are built fresh. */
export function surfacePath(spec: Pick<AvatarSpec, 'cut' | 'shape'>): SkPath {
  return spec.shape ? outlinePath(specPoints(spec)) : cutPath(spec.cut);
}
