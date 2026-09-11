import type { AvatarSpec, Cut } from './types';
import { clamp } from './math';
import { inscribedRadius, radiiToPoints, shapeRadii } from './shape';
import type { ShapeParams } from './shape';

export { BOX, CENTER } from './box';

export interface CutDef {
  label: string;
  /** Parameters for the polar shape engine. */
  shape: Partial<ShapeParams>;
  /** Outline as flat [x, y, …] in box coordinates, SHAPE_SAMPLES points. */
  points: number[];
  /** Face elements are pulled toward the centre by this factor for narrower silhouettes. */
  contentScale: number;
  /** Vertical nudge (in box units, before scaling) so eyes sit centred in the shape. */
  eyeLift: number;
}

function makeCut(label: string, shape: Partial<ShapeParams>, eyeLift = 0): CutDef {
  const radii = shapeRadii(shape);
  return {
    label,
    shape,
    points: radiiToPoints(radii),
    contentScale: clamp(inscribedRadius(radii) / 27, 0.55, 1),
    eyeLift,
  };
}

export const CUTS: Record<Cut, CutDef> = {
  circle: makeCut('Circle', { n: 2 }),
  squircle: makeCut('Squircle', { n: 4.5 }),
  square: makeCut('Square', { n: 9 }),
  diamond: makeCut('Diamond', { n: 4.5, rot: 45 }),
  hexagon: makeCut('Hexagon', { sides: 6, round: 0.3, rot: -90 }),
  badge: makeCut('Badge', { n: 2.4, lobes: 8, depth: 0.07, sharp: 0.8 }),
  burst: makeCut('Burst', { n: 2, lobes: 12, depth: 0.11, sharp: 1.6 }),
};

export const CUT_KEYS: readonly Cut[] = ['circle', 'squircle', 'square', 'diamond', 'hexagon', 'badge', 'burst'];

/** Face scale for any shape: how far the eyes pull toward the centre. */
export function shapeContentScale(shape: Partial<ShapeParams>): number {
  return clamp(inscribedRadius(shapeRadii(shape)) / 27, 0.55, 1);
}

/** Outline points for a spec: its custom shape when set, else its cut. Plain JS, not for worklets. */
export function specPoints(spec: Pick<AvatarSpec, 'cut' | 'shape'>): number[] {
  return spec.shape ? radiiToPoints(shapeRadii(spec.shape)) : CUTS[spec.cut].points;
}

/** A stable key for a spec's silhouette, for caches. */
export function specShapeKey(spec: Pick<AvatarSpec, 'cut' | 'shape'>): string {
  return spec.shape ? 'shape:' + JSON.stringify(spec.shape) : 'cut:' + spec.cut;
}

/** Radius of the light source's orbit around the centre, in box units. */
export const LIGHT_ORBIT = 24;
/** Distance over which the lit hue fades into the shaded hue. */
export const LIGHT_REACH = 74;
/** Luminance amplitude of the grain overlay (0..1). */
export const GRAIN = 0.07;

/** Resting eye geometry. */
export const EYE = {
  w: 7,
  h: 10.5,
  r: 2,
  cxL: 22,
  cxR: 42,
  cy: 43.5,
} as const;
