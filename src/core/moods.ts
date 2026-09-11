import type { Mood } from './types';

/** How a mood is presented and timed. */
export interface MoodInfo {
  key: Mood;
  /** Display name. */
  label: string;
  /** What the face does, in a few words. */
  hint: string;
  /** Seconds per eye cycle. */
  cycle: number;
  /** Eye cycles per seamless loop. */
  reps: number;
}

/**
 * Every mood's label and timing: the one place mood data is written down.
 * A plain record, so worklets can read it on the UI runtime.
 */
export const MOOD_TABLE: Readonly<Record<Mood, Omit<MoodInfo, 'key'>>> = {
  idle: { label: 'Idle', hint: 'blinking', cycle: 5.5, reps: 2 },
  observing: { label: 'Observing', hint: 'looking around', cycle: 6.5, reps: 2 },
  thinking: { label: 'Thinking', hint: 'searching', cycle: 5.5, reps: 1 },
  processing: { label: 'Processing', hint: 'deep thought', cycle: 9, reps: 1 },
  working: { label: 'Working', hint: 'busy', cycle: 3.75, reps: 1 },
  done: { label: 'Done', hint: 'celebrating', cycle: 3.2, reps: 1 },
  failed: { label: 'Failed', hint: 'knocked out', cycle: 5.5, reps: 1 },
  invalid: { label: 'Invalid', hint: 'shaking no', cycle: 4, reps: 1 },
  inactive: { label: 'Inactive', hint: 'asleep', cycle: 3.4, reps: 1 },
};

/** Mood names in display order. */
export const MOOD_KEYS: readonly Mood[] = Object.keys(MOOD_TABLE) as Mood[];

/** Every mood with its key, in display order. */
export const MOODS: readonly MoodInfo[] = MOOD_KEYS.map((key) => ({ key, ...MOOD_TABLE[key] }));

/** Seconds per seamless loop for a mood. */
export function loopLength(mood: Mood): number {
  'worklet';
  const { cycle, reps } = MOOD_TABLE[mood];
  return cycle * reps;
}
