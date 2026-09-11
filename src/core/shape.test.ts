import { describe, expect, test } from 'bun:test';
import { CUTS, CUT_KEYS, BODY_RADIUS, SHAPE_SAMPLES, CENTER, inscribedRadius, shapeRadii } from './index';

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
