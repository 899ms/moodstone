import { describe, expect, test } from 'bun:test';
import { CUTS, CUT_KEYS, CUT_TUNES, BODY_RADIUS, SHAPE_DEFAULTS, SHAPE_SAMPLES, CENTER, inscribedRadius, shapeRadii, tunedShape } from './index';
import type { Tune, TuneKey } from './index';

describe('shape engine', () => {
  for (const cut of CUT_KEYS) {
    test(`${cut}: sampled outline is well formed and normalised`, () => {
      const def = CUTS[cut];
      expect(def.points.length).toBe(SHAPE_SAMPLES * 2);
      let ext = 0;
      let minR = Infinity;
      for (let i = 0; i < def.points.length; i += 2) {
        const dx = def.points[i] - CENTER;
        const dy = def.points[i + 1] - CENTER;
        ext = Math.max(ext, Math.abs(dx), Math.abs(dy));
        minR = Math.min(minR, Math.hypot(dx, dy));
      }
      expect(ext).toBeCloseTo(BODY_RADIUS, 3);
      expect(minR).toBeGreaterThan(14);
      expect(def.contentScale).toBeGreaterThanOrEqual(0.55);
      expect(def.contentScale).toBeLessThanOrEqual(1);
    });
  }

  test('circle has constant radius', () => {
    const r = shapeRadii({ n: 2 });
    for (const v of r) expect(v).toBeCloseTo(BODY_RADIUS, 6);
  });

  test('hexagon has six-fold symmetry', () => {
    const r = shapeRadii({ sides: 6, round: 0.3 });
    const step = SHAPE_SAMPLES / 6;
    for (let i = 0; i < SHAPE_SAMPLES; i++) expect(r[i]).toBeCloseTo(r[(i + step) % SHAPE_SAMPLES], 3);
  });

  test('burst is spikier than badge', () => {
    const badge = inscribedRadius(shapeRadii(CUTS.badge.shape));
    const burst = inscribedRadius(shapeRadii(CUTS.burst.shape));
    expect(burst).toBeLessThan(badge);
    expect(CUTS.burst.contentScale).toBeLessThan(CUTS.badge.contentScale);
  });

  test('diamond is the squircle rotated', () => {
    // Same profile up to scale: the diamond's bounding box is set by its corners, the squircle's by its flats.
    const unit = (r: number[]) => { const m = Math.max(...r); return r.map((v) => v / m); };
    const sq = unit(shapeRadii({ n: 4.5 }));
    const di = unit(shapeRadii({ n: 4.5, rot: 45 }));
    const shift = SHAPE_SAMPLES / 8;
    for (let i = 0; i < SHAPE_SAMPLES; i++) expect(di[(i + shift) % SHAPE_SAMPLES]).toBeCloseTo(sq[i], 3);
  });
});

describe('tunes', () => {
  // A step per parameter, large enough to show in the outline.
  const nudge: Record<TuneKey, number> = { n: 3, ax: 0.2, rot: 20, sides: 1, round: 0.1, lobes: 2, depth: 0.05, sharp: 0.5 };

  for (const cut of CUT_KEYS) {
    const keys: readonly TuneKey[] = CUT_TUNES[cut];
    for (const k of keys) {
      test(`${cut}: tuning ${k} changes the outline`, () => {
        const preset = { ...SHAPE_DEFAULTS, ...CUTS[cut].shape };
        const tune: Tune = {};
        tune[k] = preset[k] + nudge[k];
        const before = shapeRadii(preset);
        const after = shapeRadii(tunedShape(cut, tune));
        expect(Math.max(...before.map((r, i) => Math.abs(r - after[i])))).toBeGreaterThan(0.1);
      });
    }
  }

  test('rotating a circle changes nothing, so circle has no rot tune', () => {
    for (const v of shapeRadii({ n: 2, rot: 30 })) expect(v).toBeCloseTo(BODY_RADIUS, 6);
  });

  test('a tune is merged over the preset', () => {
    expect(tunedShape('hexagon', { sides: 5 })).toEqual({ sides: 5, round: 0.3, rot: -90 });
  });

  test('keys the cut does not expose fail to compile and are ignored at runtime', () => {
    // @ts-expect-error circles have no rotation tune
    expect(tunedShape('circle', { rot: 30 })).toEqual(CUTS.circle.shape);
    // @ts-expect-error polygons have no squareness
    expect(tunedShape('hexagon', { n: 4, sides: 5 })).toEqual({ sides: 5, round: 0.3, rot: -90 });
  });
});
