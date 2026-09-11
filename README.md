# react-native-agent-avatar

Animated, procedurally generated avatars for AI agents in React Native. Give an agent a name and it gets a consistent face; give it a mood and the face reacts. Rendered with [React Native Skia](https://shopify.github.io/react-native-skia/) on the UI thread.

```tsx
import { AgentAvatar } from 'react-native-agent-avatar';

<AgentAvatar name="Nova" mood="thinking" size={48} />
```

## What you get

- **Deterministic identity.** The name hashes to a colour, a cut and a lighting composition (where the light starts, which way it drifts), so `Nova` looks the same on every device. Override any of them.
- **Lit surface.** The body is a two-hue gradient from a light source that slowly orbits, with a soft highlight and a per-pixel grain, all in one Skia runtime shader. Highlights lean warm, shadows lean cool.
- **Nine moods**, each a seamless loop: `idle`, `observing`, `thinking`, `processing`, `working`, `done`, `failed`, `invalid`, `inactive`.
- **Five cuts** (silhouettes): `rounded`, `badge`, `diamond`, `flower`, `burst`. Changing the cut morphs the shape.
- **Twelve palette colours**, or any hex. White or black eyes.
- **UI-thread animation.** One pure function, `computeFrame(spec, t)`, describes every frame. Skia reads it through Reanimated derived values, so the JS thread stays idle. Pause, restart, or offset the loop.
- **Exports.** PNG at any size through a ref, a still SVG, and a self-contained animated SVG of the whole loop.
- **Still frames** for lists (`animated={false}`).
- **Platform-agnostic core.** `react-native-agent-avatar/core` has no React Native imports. The same maths drives the HTML canvas renderer in the dev harness.

## Install

```bash
npx expo install @shopify/react-native-skia react-native-reanimated react-native-worklets
npm install react-native-agent-avatar
```

Peer dependencies: React 19+, React Native 0.78+, Skia 2+, Reanimated 4+. In Expo Go the JavaScript versions must match the native ones baked into the Go binary, which is exactly what `npx expo install` gives you.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `name` | `string` | `'Agent'` | Seeds colour, cut and facets. |
| `mood` | `Mood` | `'idle'` | See the list above. Changing it restarts the loop from its rest pose. |
| `color` | palette key or hex | from name | `'pine'`, `'#1F8A70'`. |
| `cut` | `Cut` | from name | Silhouette. Changing it morphs. |
| `eyeColor` | `'white' \| 'black' \| hex` | `'white'` | |
| `seed` | `[number, number, number]` | from name | Light start angle, drift direction and orbit radius. |
| `size` | `number` | `64` | dp. |
| `animated` | `boolean` | `true` | `false` renders one frame at `phase`. |
| `paused` | `boolean` | `false` | Freezes the loop in place. |
| `phase` | `0..1` | `0` | Loop position for stills, start offset for animated avatars. Give wall tiles different phases so they don't blink together. |
| `morphDuration` | `number` | `460` | Shape morph length in ms. `0` snaps. |
| `style` | `ViewStyle` | | Applied to the canvas. |

### Ref handle

```tsx
const ref = useRef<AgentAvatarHandle>(null);
<AgentAvatar ref={ref} name="Nova" mood="done" />

const image = ref.current?.snapshot({ size: 1024, background: '#0e1113' }); // SkImage
const base64 = image?.encodeToBase64();
ref.current?.restart();
```

`snapshot` renders offscreen with Skia, so it works for still avatars too and is not limited to the on-screen resolution.

## Exports outside the app

```ts
import { renderAvatarSvg, renderAnimatedAvatarSvg, computeFrame, identityFromName } from 'react-native-agent-avatar';

const spec = { ...identityFromName('Nova'), mood: 'thinking', eyeColor: '#FFFFFF' };
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

Each `AgentAvatar` is its own Skia canvas with its own clock. A handful of animated avatars on a screen is cheap. For long lists, render rows with `animated={false}` and animate only the avatar the user is looking at. The example's Wall runs 45 animated avatars at once on an iPhone simulator without dropping frames, but treat that as the upper end.

## Core API

```ts
import { computeFrame, identityFromName, seedFromName, loopLength, MOODS, CUTS, PALETTE } from 'react-native-agent-avatar/core';

const spec = { ...identityFromName('Nova'), mood: 'done', eyeColor: '#FFFFFF' };
const frame = computeFrame(spec, 1.25); // plain numbers: eyes, tilt, light position, lit/shade hues, swirls, sleep marks
```

## Example app

`example/` is an Expo app with a Studio (name, colour, cut, eyes, mood, play/pause, restart, randomise, export panel) and a Wall of every cut × mood. It also accepts deep-link parameters so it can be driven from a script:

```bash
cd example && npx expo start --ios
xcrun simctl openurl booted "exp://<host>:8081/--/?tab=studio&mood=failed&still=0.6&cut=burst"
```

Parameters: `tab`, `name`, `color`, `cut`, `mood`, `eyes`, `paused`, `bg`, `morph`, `still`, `export` (`png`, `svg`, `asvg`), `restart`, `scroll` (`top`, `end`), `shuffle`, `theme`.

## Development

```bash
bun test                                    # core invariants + SVG well-formedness (xmllint)
npm run typecheck
npm run harness:build && python3 -m http.server 8765 -d dev   # canvas harness at http://localhost:8765
npm run build                               # bob → lib/
```

## Credits

The idea of a single-colour agent face whose whole personality lives in two eyes comes from Plane's [Agent Avatar Lab](https://agents.plane.so/). The surface treatment, geometry, palette, timing and code here are original.

## License

MIT
