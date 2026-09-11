import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { computeFrame, CUT_KEYS, DEFAULT_SEED, MOOD_KEYS, PALETTE } from './core';
import type { AvatarSpec } from './core';
import { renderAvatarSvg, renderAnimatedAvatarSvg } from './svg';

const base: Omit<AvatarSpec, 'mood'> = { seed: DEFAULT_SEED, color: PALETTE.pine, cut: 'circle', eyeColor: '#FFFFFF' };

const wellFormed = (xml: string) => {
  const r = spawnSync('xmllint', ['--noout', '-'], { input: xml, encoding: 'utf8' });
  return r.status === 0 ? null : r.stderr;
};

describe('svg export', () => {
  for (const mood of MOOD_KEYS) {
    const spec: AvatarSpec = { ...base, cut: CUT_KEYS[MOOD_KEYS.indexOf(mood) % CUT_KEYS.length], mood };
    test(`${mood}: static svg is well-formed`, () => {
      const svg = renderAvatarSvg(spec, computeFrame(spec, 1.3), { size: 200, background: '#0e1113' });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(wellFormed(svg)).toBeNull();
    });
    test(`${mood}: animated svg is well-formed and loops`, () => {
      const svg = renderAnimatedAvatarSvg(spec, { fps: 12 });
      expect(wellFormed(svg)).toBeNull();
      expect(svg).toContain('repeatCount="indefinite"');
      expect(svg).toContain('keyTimes="0;');
      expect(svg).toMatch(/keyTimes="[^"]*;1"/);
    });
  }
  test('failed animated svg carries swirl paths, inactive carries sleep marks', () => {
    const failed = renderAnimatedAvatarSvg({ ...base, mood: 'failed' });
    expect((failed.match(/attributeName="d"/g) ?? []).length).toBe(2);
    const asleep = renderAnimatedAvatarSvg({ ...base, mood: 'inactive' });
    expect((asleep.match(/attributeName="d"/g) ?? []).length).toBe(3);
  });
});

describe('svg ids', () => {
  // Every def an SVG declares, keyed by id.
  const defs = (svg: string) => new Map([...svg.matchAll(/<(clipPath|radialGradient|filter) id="([^"]+)".*?<\/\1>/g)].map((m) => [m[2], m[0]]));
  const clipId = (svg: string) => svg.match(/<clipPath id="([^"]+)"/)?.[1];

  test('same cut with different shapes gets different clip ids', () => {
    const a: AvatarSpec = { ...base, mood: 'idle', shape: { n: 3 } };
    const b: AvatarSpec = { ...base, mood: 'idle', shape: { n: 5 } };
    expect(clipId(renderAvatarSvg(a, computeFrame(a, 0)))).not.toBe(clipId(renderAvatarSvg(b, computeFrame(b, 0))));
    expect(clipId(renderAnimatedAvatarSvg(a, { fps: 12 }))).not.toBe(clipId(renderAnimatedAvatarSvg(b, { fps: 12 })));
    const plain: AvatarSpec = { ...base, mood: 'idle' };
    expect(clipId(renderAvatarSvg(plain, computeFrame(plain, 0)))).toBe('moodstone-cut-circle');
  });

  test('an id never names two different defs across avatars on one page', () => {
    const specs: AvatarSpec[] = [
      { ...base, mood: 'idle' },
      { ...base, mood: 'idle', shape: { n: 3 } },
      { ...base, mood: 'idle', seed: [1, 2, 3] },
      { ...base, mood: 'idle', color: PALETTE.sky },
      { ...base, mood: 'done' },
    ];
    const page = new Map<string, string>();
    for (const spec of specs) {
      const svgs = [renderAvatarSvg(spec, computeFrame(spec, 1.3)), renderAvatarSvg(spec, computeFrame(spec, 2.9)), renderAnimatedAvatarSvg(spec, { fps: 12 })];
      for (const svg of svgs) {
        for (const [id, def] of defs(svg)) {
          expect(page.get(id) ?? def).toBe(def);
          page.set(id, def);
        }
      }
    }
  });
});
