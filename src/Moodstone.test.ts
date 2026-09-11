import { test } from 'bun:test';
import type { MoodstoneProps } from './Moodstone';

const props = (p: MoodstoneProps) => p;

// The silhouette props are a type-level contract: `npm run typecheck` enforces the @ts-expect-error lines.
test('silhouette props accept only tunes that fit the cut', () => {
  props({});
  props({ cut: 'hexagon', tune: { sides: 5, rot: 10 } });
  props({ tune: { ax: 1.2 } });
  props({ cut: 'hexagon', shape: { n: 3 } });
  // @ts-expect-error circles have no rotation tune
  props({ cut: 'circle', tune: { rot: 30 } });
  // @ts-expect-error without a cut the tune is for the default circle
  props({ tune: { sides: 5 } });
  // @ts-expect-error tune and shape are exclusive
  props({ cut: 'hexagon', tune: { sides: 5 }, shape: { n: 3 } });
});
