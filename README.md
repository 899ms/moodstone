# moodstone

Animated, procedurally generated avatars for AI agents in React Native. Give an agent a mood and the face reacts. Rendered with [React Native Skia](https://shopify.github.io/react-native-skia/) on the UI thread.

```tsx
import { Moodstone } from 'moodstone';

<Moodstone color="pine" mood="thinking" size={48} />
```

## What you get

- **Lit surface.** The body is a two-hue gradient from a light source that slowly orbits, with a soft highlight and a per-pixel grain, all in one Skia runtime shader. Highlights lean warm, shadows lean cool.
- **Nine moods**, each a seamless loop: `idle`, `observing`, `thinking`, `processing`, `working`, `done`, `failed`, `invalid`, `inactive`.
- **Seven cuts** (silhouettes) from one polar shape engine: `circle`, `squircle`, `square`, `diamond`, `hexagon`, `badge`, `burst`. Changing the cut morphs the shape, and the eyes fit themselves to the silhouette automatically.
- **Twelve palette colours**, or any hex. White or black eyes.
- **UI-thread animation.** One pure function, `computeFrame(spec, t)`, describes every frame. Skia reads it through Reanimated derived values, so the JS thread stays idle. Pause, restart, or offset the loop.
- **Exports.** PNG at any size through a ref, a still SVG, and a self-contained animated SVG of the whole loop.
- **Still frames** for lists (`animated={false}`).
- **Platform-agnostic core.** `moodstone/core` has no React Native imports. The same maths drives the HTML canvas renderer in the dev harness.

## Install

```bash
npx expo install @shopify/react-native-skia react-native-reanimated react-native-worklets
npm install moodstone
```

Peer dependencies: React 19+, React Native 0.78+, Skia 2+, Reanimated 4+. In Expo Go the JavaScript versions must match the native ones baked into the Go binary, which is exactly what `npx expo install` gives you.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `mood` | `Mood` | `'idle'` | See the list above. Changing it restarts the loop from its rest pose. |
| `color` | palette key or hex | `'pine'` | `'pine'`, `'#1F8A70'`. |
| `cut` | `Cut` | `'circle'` | Silhouette preset. Changing it morphs. |
| `tune` | `Tune` | | Adjusts the cut's preset. Only the parameters that cut exposes are accepted, see [Tuning a cut](#tuning-a-cut). Changes morph. |
| `shape` | `Partial<ShapeParams>` | | Custom silhouette from the shape engine, replacing the cut's geometry: `{ n: 4.5 }`, `{ lobes: 12, depth: 0.11, sharp: 1.6 }`, `{ sides: 6, round: 0.3 }`. Can't be combined with `tune`. Changes morph too. |
| `eyeColor` | `'white' \| 'black' \| hex` | `'white'` | |
| `seed` | `[number, number, number]` | `DEFAULT_SEED` | Light start angle, drift direction and orbit radius. `randomSeed()` gives a fresh one. |
| `size` | `number` | `64` | dp. |
| `animated` | `boolean` | `true` | `false` renders one frame at `phase`. |
| `paused` | `boolean` | `false` | Freezes the loop in place. |
| `phase` | `0..1` | `0` | Loop position for stills, start offset for animated avatars. Give wall tiles different phases so they don't blink together. |
| `morphDuration` | `number` | `460` | Shape morph length in ms. `0` snaps. |
| `style` | `ViewStyle` | | Applied to the canvas. |

### Tuning a cut

Each cut exposes the shape parameters that visibly change it, listed in `CUT_TUNES`, and `tune` accepts only those:

| Cut | Tunable |
|---|---|
| `circle` | `n`, `ax` |
| `squircle`, `square`, `diamond` | `n`, `rot`, `ax` |
| `hexagon` | `sides`, `round`, `rot` |
| `badge`, `burst` | `lobes`, `depth`, `sharp` |

```tsx
<Moodstone cut="hexagon" tune={{ sides: 5 }} />  // ok
<Moodstone cut="circle" tune={{ rot: 30 }} />    // type error: rotating a circle does nothing
```

The check needs a literal `cut`. When the cut comes from state, TypeScript can't pair it with the tune, so take the keys from `CUT_TUNES[cut]` and cast the pair to `CutTune`. Keys a cut doesn't expose are ignored at runtime either way. Outside React, set the spec's `shape` to `tunedShape(cut, tune)` and its `contentScale` to `shapeContentScale(shape)`, as the component does.

### Ref handle

```tsx
const ref = useRef<MoodstoneHandle>(null);
<Moodstone ref={ref} mood="done" />

const image = ref.current?.snapshot({ size: 1024, background: '#0e1113' }); // SkImage
const base64 = image?.encodeToBase64();
ref.current?.restart();
```

`snapshot` renders offscreen with Skia, so it works for still avatars too and is not limited to the on-screen resolution.

## Exports outside the app

```ts
import { renderAvatarSvg, renderAnimatedAvatarSvg, computeFrame, DEFAULT_SEED, PALETTE, type AvatarSpec } from 'moodstone';

const spec: AvatarSpec = { seed: DEFAULT_SEED, color: PALETTE.pine, cut: 'circle', mood: 'thinking', eyeColor: '#FFFFFF' };
const still = renderAvatarSvg(spec, computeFrame(spec, 1.2), { size: 240 });
const loop = renderAnimatedAvatarSvg(spec, { size: 240, fps: 24, background: '#0e1113' });
```

The animated SVG uses SMIL, samples every attribute from `computeFrame`, and loops seamlessly. GIF and WebM encoders are not bundled; `computeFrame` plus `renderAvatarImage` give you every frame if you want to encode one natively.

## Mapping agent state to moods

| Agent is… | Mood |
|---|---|
| ready, waiting for input | `idle` |
| reading context, awaiting a tool result | `observing` |
| searching, short tool call | `thinking` |
| long reasoning | `processing` |
| streaming output | `working` |
| finished successfully | `done` |
| errored | `failed` |
| rejected the input | `invalid` |
| offline, paused | `inactive` |

## Performance notes

Each `Moodstone` is its own Skia canvas with its own clock. A handful of animated avatars on a screen is cheap. For long lists, render rows with `animated={false}` and animate only the avatar the user is looking at. The example's Wall runs 45 animated avatars at once on an iPhone simulator without dropping frames, but treat that as the upper end.

## Core API

```ts
import { computeFrame, randomSeed, loopLength, MOODS, CUTS, PALETTE, shapeRadii, type AvatarSpec } from 'moodstone/core';

const spec: AvatarSpec = { seed: randomSeed(), color: PALETTE.sky, cut: 'hexagon', mood: 'done', eyeColor: '#FFFFFF' };
const frame = computeFrame(spec, 1.25); // plain numbers: eyes, tilt, light position, lit/shade hues, swirls, sleep marks
```

## Example app

`example/` is an Expo app with a single-screen Studio: colour, cut, mood, eye colour, tuning sliders for the parameters the selected cut exposes, loop scrubbing with play/pause/restart, size and a morph toggle. It also accepts deep-link parameters so it can be driven from a script:

```bash
cd example && npx expo start --ios
xcrun simctl openurl booted "exp://<host>:8081/--/?mood=failed&still=0.6&cut=burst&lobes=9"
```

Parameters: `color`, `cut`, `mood`, `eyes`, `paused`, `still` (0..1), `morph`, `size`, `theme`, `restart`, and any tunable parameter (`n`, `ax`, `rot`, `lobes`, `depth`, `sharp`, `sides`, `round`), which applies when the cut exposes it.

## Development

```bash
npm run typecheck
npm run harness:build && python3 -m http.server 8765 -d dev   # canvas harness at http://localhost:8765
npm run build                               # bob → lib/
```

## Credits

The idea of a single-colour agent face whose whole personality lives in two eyes comes from Plane's [Agent Avatar Lab](https://agents.plane.so/). The surface treatment, geometry, palette, timing and code here are original.

## License

MIT
