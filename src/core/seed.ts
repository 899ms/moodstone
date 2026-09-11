import { TAU } from './math';
import type { Seed } from './types';

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  'worklet';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Three plane rotations derived deterministically from a name. */
export function seedFromName(name: string): Seed {
  'worklet';
  const h = hashString(name.length > 0 ? name : ' ');
  return [
    ((h & 1023) / 1023) * TAU,
    (((h >>> 10) & 1023) / 1023) * TAU,
    (((h >>> 20) & 1023) / 1023) * TAU,
  ];
}

/** A random seed, for shuffles and galleries. */
export function randomSeed(): Seed {
  return [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
}
