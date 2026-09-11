import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { computeFrame, identityFromName, CUT_KEYS, MOOD_KEYS } from './core';
import type { AvatarSpec } from './core';
import { renderAvatarSvg, renderAnimatedAvatarSvg } from './svg';

const wellFormed = (xml: string) => {
  const r = spawnSync('xmllint', ['--noout', '-'], { input: xml, encoding: 'utf8' });
  return r.status === 0 ? null : r.stderr;
};

describe('svg export', () => {
  for (const mood of MOOD_KEYS) {
    const spec: AvatarSpec = { ...identityFromName('Nova'), cut: CUT_KEYS[MOOD_KEYS.indexOf(mood) % CUT_KEYS.length], mood, eyeColor: '#FFFFFF' };
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
    const failed = renderAnimatedAvatarSvg({ ...identityFromName('Nova'), mood: 'failed', eyeColor: '#FFFFFF' });
    expect((failed.match(/attributeName="d"/g) ?? []).length).toBe(2);
    const asleep = renderAnimatedAvatarSvg({ ...identityFromName('Nova'), mood: 'inactive', eyeColor: '#FFFFFF' });
    expect((asleep.match(/attributeName="d"/g) ?? []).length).toBe(3);
  });
});
