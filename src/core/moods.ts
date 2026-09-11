import type { Mood } from './types';

export interface MoodInfo {
  key: Mood;
  label: string;
  hint: string;
  /** Seconds per eye cycle. */
  cycle: number;
  /** Eye cycles per seamless loop. */
  reps: number;
}

export const MOODS: readonly MoodInfo[] = [
  { key: 'idle', label: 'Idle', hint: 'blinking', cycle: 5.5, reps: 2 },
  { key: 'observing', label: 'Observing', hint: 'looking around', cycle: 6.5, reps: 2 },
  { key: 'thinking', label: 'Thinking', hint: 'searching', cycle: 5.5, reps: 1 },
  { key: 'processing', label: 'Processing', hint: 'deep thought', cycle: 9, reps: 1 },
  { key: 'working', label: 'Working', hint: 'busy', cycle: 3.75, reps: 1 },
  { key: 'done', label: 'Done', hint: 'celebrating', cycle: 3.2, reps: 1 },
  { key: 'failed', label: 'Failed', hint: 'knocked out', cycle: 5.5, reps: 1 },
  { key: 'invalid', label: 'Invalid', hint: 'shaking no', cycle: 4, reps: 1 },
  { key: 'inactive', label: 'Inactive', hint: 'asleep', cycle: 3.4, reps: 1 },
];

export const MOOD_KEYS: readonly Mood[] = MOODS.map((m) => m.key);

/** Worklet-friendly lookups (plain records copy cleanly to the UI runtime). */
export const MOOD_CYCLE: Record<Mood, number> = {
  idle: 5.5,
  observing: 6.5,
  thinking: 5.5,
  processing: 9,
  working: 3.75,
  done: 3.2,
  failed: 5.5,
  invalid: 4,
  inactive: 3.4,
};

export const MOOD_REPS: Record<Mood, number> = {
  idle: 2,
  observing: 2,
  thinking: 1,
  processing: 1,
  working: 1,
  done: 1,
  failed: 1,
  invalid: 1,
  inactive: 1,
};

/** Seconds per seamless loop for a mood. */
export function loopLength(mood: Mood): number {
  'worklet';
  return MOOD_CYCLE[mood] * MOOD_REPS[mood];
}
