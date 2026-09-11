import type { Cut } from './types';

/** Every avatar is designed in a 64×64 box and scaled by the renderer. */
export const BOX = 64;
export const CENTER = 32;

/** A rounded rectangle centred on the box centre and rotated about it. */
export interface CutPart {
  w: number;
  h: number;
  r: number;
  /** Rotation in degrees about the box centre. */
  rot: number;
}

export interface CutDef {
  label: string;
  /** Union of these parts is the silhouette. */
  parts: readonly CutPart[];
  /** Face elements are pulled toward the centre by this factor for smaller silhouettes. */
  contentScale: number;
  /** Vertical nudge (in box units, before scaling) so eyes sit centred in the shape. */
  eyeLift: number;
}

export const CUTS: Record<Cut, CutDef> = {
  rounded: {
    label: 'Rounded',
    parts: [{ w: 56, h: 56, r: 13, rot: 0 }],
    contentScale: 1,
    eyeLift: 0,
  },
  badge: {
    label: 'Badge',
    parts: [
      { w: 44, h: 44, r: 10, rot: 0 },
      { w: 44, h: 44, r: 10, rot: 45 },
    ],
    contentScale: 0.85,
    eyeLift: -5,
  },
  diamond: {
    label: 'Diamond',
    parts: [{ w: 44, h: 44, r: 10, rot: 45 }],
    contentScale: 0.72,
    eyeLift: -3,
  },
  flower: {
    label: 'Flower',
    parts: [
      { w: 54, h: 26, r: 6, rot: 0 },
      { w: 54, h: 26, r: 6, rot: 45 },
      { w: 54, h: 26, r: 6, rot: 90 },
      { w: 54, h: 26, r: 6, rot: 135 },
    ],
    contentScale: 0.88,
    eyeLift: -1,
  },
  burst: {
    label: 'Burst',
    parts: [
      { w: 56, h: 13, r: 5, rot: 0 },
      { w: 56, h: 13, r: 5, rot: 30 },
      { w: 56, h: 13, r: 5, rot: 60 },
      { w: 56, h: 13, r: 5, rot: 90 },
      { w: 56, h: 13, r: 5, rot: 120 },
      { w: 56, h: 13, r: 5, rot: 150 },
    ],
    contentScale: 0.6,
    eyeLift: -2,
  },
};

export const CUT_KEYS: readonly Cut[] = ['rounded', 'badge', 'diamond', 'flower', 'burst'];

/** A facet plane: a rounded rectangle that rotates about its own centre, blended onto the surface. */
export interface PlaneDef {
  cx: number;
  cy: number;
  w: number;
  h: number;
  r: number;
}

export const PLANES: readonly [PlaneDef, PlaneDef, PlaneDef] = [
  { cx: 10, cy: 42, w: 46, h: 24, r: 10 },
  { cx: 36, cy: 40, w: 38, h: 22, r: 9 },
  { cx: 56, cy: 14, w: 46, h: 26, r: 10 },
];

/** Strength of the multiply-blended planes. */
export const PLANE_ALPHA = 0.3;

/** Resting eye geometry. */
export const EYE = {
  w: 7,
  h: 10.5,
  r: 2,
  cxL: 22,
  cxR: 42,
  cy: 43.5,
} as const;
