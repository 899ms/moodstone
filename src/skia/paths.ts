import { Skia } from "@shopify/react-native-skia";

import { CUTS, specPoints } from "../core";

import type { AvatarSpec, Cut } from "../core";
import type { SkPath, SkPoint } from "@shopify/react-native-skia";

/** Closed polyline path from flat [x, y, …] points. Every outline has the same segment count, so they interpolate. */
export function outlinePath(points: number[]): SkPath {
  const b = Skia.PathBuilder.Make();
  b.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) b.lineTo(points[i], points[i + 1]);
  b.close();
  return b.build();
}

/** Skia points from a flat [x0, y0, x1, y1, …] list. */
export function toSkPoints(flat: number[]): SkPoint[] {
  "worklet";
  const out: SkPoint[] = [];
  for (let i = 0; i < flat.length; i += 2)
    out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

const cutPaths = new Map<Cut, SkPath>();

/** Silhouette path for a preset cut, built once and cached. */
export function cutPath(cut: Cut): SkPath {
  let path = cutPaths.get(cut);
  if (!path) {
    path = outlinePath(CUTS[cut].points);
    cutPaths.set(cut, path);
  }
  return path;
}

/** Silhouette path for a spec: preset cuts are cached, custom shapes are built fresh. */
export function surfacePath(spec: Pick<AvatarSpec, "cut" | "shape">): SkPath {
  return spec.shape ? outlinePath(specPoints(spec)) : cutPath(spec.cut);
}
