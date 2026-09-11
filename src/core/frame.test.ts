import { describe, expect, test } from 'bun:test';
import { computeFrame, loopLength, seedFromName, identityFromName, CUT_KEYS, MOOD_KEYS, TAU } from './index';
import type { AvatarSpec } from './types';

const specFor = (cut: AvatarSpec['cut'], mood: AvatarSpec['mood']): AvatarSpec => ({
  seed: seedFromName('Nova'),
  color: '#1F8A70',
  cut,
  mood,
  eyeColor: '#FFFFFF',
});

const angleDiff = (a: number, b: number) => {
  const d = ((a - b) % TAU + TAU) % TAU;
  return Math.min(d, TAU - d);
};

describe('seedFromName', () => {
  test('is deterministic and name-sensitive', () => {
    expect(seedFromName('Nova')).toEqual(seedFromName('Nova'));
    expect(seedFromName('Nova')).not.toEqual(seedFromName('Atlas'));
    expect(seedFromName('')).toEqual(seedFromName(''));
  });
  test('identity picks a palette colour and a cut', () => {
    const id = identityFromName('Nova');
    expect(id.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(CUT_KEYS).toContain(id.cut);
  });
});

describe('computeFrame', () => {
  for (const mood of MOOD_KEYS) {
    for (const cut of CUT_KEYS) {
      const spec = specFor(cut, mood);
      const L = loopLength(mood);

      test(`${mood}/${cut}: periodic`, () => {
        const a = computeFrame(spec, 0.37);
        const b = computeFrame(spec, 0.37 + L);
        expect(b.tilt).toBeCloseTo(a.tilt, 6);
        for (let i = 0; i < 4; i++) {
          expect(b.eyes[i].cx).toBeCloseTo(a.eyes[i].cx, 6);
          expect(b.eyes[i].cy).toBeCloseTo(a.eyes[i].cy, 6);
          expect(b.eyes[i].h).toBeCloseTo(a.eyes[i].h, 6);
        }
        for (let i = 0; i < 3; i++) expect(angleDiff(a.planeAngles[i], b.planeAngles[i])).toBeLessThan(1e-6);
      });

      test(`${mood}/${cut}: seamless at the loop boundary`, () => {
        const a = computeFrame(spec, L - 1e-4);
        const b = computeFrame(spec, 0);
        expect(Math.abs(a.tilt - b.tilt)).toBeLessThan(0.1);
        expect(Math.abs(a.offset[0] - b.offset[0])).toBeLessThan(0.1);
        expect(Math.abs(a.offset[1] - b.offset[1])).toBeLessThan(0.1);
        for (let i = 0; i < 4; i++) {
          expect(Math.abs(a.eyes[i].cx - b.eyes[i].cx)).toBeLessThan(0.1);
          expect(Math.abs(a.eyes[i].cy - b.eyes[i].cy)).toBeLessThan(0.1);
          expect(Math.abs(a.eyes[i].w - b.eyes[i].w)).toBeLessThan(0.1);
          expect(Math.abs(a.eyes[i].h - b.eyes[i].h)).toBeLessThan(0.1);
        }
        for (let i = 0; i < 3; i++) expect(angleDiff(a.planeAngles[i], b.planeAngles[i])).toBeLessThan(0.01);
        expect(a.color).toBe(b.color);
      });

      test(`${mood}/${cut}: finite and inside the box`, () => {
        for (let k = 0; k <= 200; k++) {
          const fr = computeFrame(spec, (k / 200) * L);
          expect(Number.isFinite(fr.tilt)).toBe(true);
          for (const e of fr.eyes) {
            expect(Number.isFinite(e.cx + e.cy + e.w + e.h + e.r)).toBe(true);
            expect(e.w).toBeGreaterThanOrEqual(0);
            expect(e.h).toBeGreaterThanOrEqual(0);
            if (e.alpha > 0) {
              expect(e.cx).toBeGreaterThan(0);
              expect(e.cx).toBeLessThan(64);
              expect(e.cy).toBeGreaterThan(0);
              expect(e.cy).toBeLessThan(64);
            }
          }
        }
      });
    }
  }

  test('done cycles colour and returns to base', () => {
    const spec = specFor('rounded', 'done');
    expect(computeFrame(spec, 0).color).toBe('#1F8A70');
    expect(computeFrame(spec, 1.0).color).not.toBe('#1F8A70');
    expect(computeFrame(spec, 3.0).color).toBe('#1F8A70');
  });

  test('failed produces swirls mid-loop only', () => {
    const spec = specFor('rounded', 'failed');
    expect(computeFrame(spec, 0.2).swirls.length).toBe(0);
    expect(computeFrame(spec, 3.3).swirls.length).toBe(2);
    expect(computeFrame(spec, 5.0).swirls.length).toBe(0);
  });

  test('inactive floats sleep marks', () => {
    expect(computeFrame(specFor('badge', 'inactive'), 1).sleepMarks.length).toBe(3);
  });
});
