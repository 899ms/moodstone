# Moodstone

![Dozens of Moodstone avatars in every cut, mood and palette colour](assets/cover.png)

Animated, procedurally generated avatars for AI agents in React Native. Give an agent a mood and the face reacts. Rendered with [React Native Skia](https://shopify.github.io/react-native-skia/) on the UI thread.

```tsx
import { Moodstone } from "moodstone";

<Moodstone color="pine" mood="thinking" size={48} />;
```

## What you get

- **Lit surface.** The body is a two-hue gradient from a light source that slowly orbits, with a soft highlight and a per-pixel grain, all in one Skia runtime shader. Highlights lean warm, shadows lean cool.
- **Nine moods**, each a seamless loop: `idle`, `observing`, `thinking`, `processing`, `working`, `done`, `failed`, `invalid`, `inactive`.
- **Seven cuts** (silhouettes) from one polar shape engine: `circle`, `squircle`, `square`, `diamond`, `hexagon`, `badge`, `burst`. Changing the cut morphs the shape, and the eyes fit themselves to the silhouette automatically.
- **Twelve palette colours**, or any hex. White or black eyes.
- **UI-thread animation.** One pure function, `computeFrame(spec, t)`, describes every frame. Skia reads it through Reanimated derived values, so the JS thread stays idle. Pause, restart, or offset the loop.
- **Exports.** PNG at any size through a ref, a still SVG, and a self-contained animated SVG of the whole loop.
- **Still frames** for lists (`animated={false}`). A still shows its mood's key pose in the avatar's own colour and light, so a list of stills tells you at a glance what each agent is doing.
- **Platform-agnostic core.** `moodstone/core` has no React Native imports. The same maths drives the Skia renderer and the SVG exports.

## Install

```bash
npx expo install @shopify/react-native-skia react-native-reanimated react-native-worklets
npm install moodstone
```

Peer dependencies: React 19+, React Native 0.78+, Skia 2+, Reanimated 4+ and Worklets 0.7+. In Expo Go the JavaScript versions must match the native ones baked into the Go binary, which is exactly what `npx expo install` gives you.

## Props

| Prop            | Type                        | Default        | Notes                                                                                                                                                                                                                  |
| --------------- | --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mood`          | `Mood`                      | `'idle'`       | See the list above. Changing it restarts the loop from its rest pose.                                                                                                                                                  |
| `color`         | palette key or hex          | `'pine'`       | `'pine'`, `'#1F8A70'`.                                                                                                                                                                                                 |
| `cut`           | `Cut`                       | `'circle'`     | Silhouette preset. Changing it morphs.                                                                                                                                                                                 |
| `tune`          | `Tune`                      |                | Adjusts the cut's preset. Only the parameters that cut exposes are accepted, see [Tuning a cut](#tuning-a-cut). Changes morph.                                                                                         |
| `shape`         | `Partial<ShapeParams>`      |                | Custom silhouette from the shape engine, replacing the cut's geometry: `{ n: 4.5 }`, `{ lobes: 12, depth: 0.11, sharp: 1.6 }`, `{ sides: 6, round: 0.3 }`. Can't be combined with `tune`. Changes morph too.           |
| `eyeColor`      | `'white' \| 'black' \| hex` | `'white'`      |                                                                                                                                                                                                                        |
| `seed`          | `[number, number, number]`  | `DEFAULT_SEED` | Light start angle, drift direction and orbit size, each in `0..2π`. `randomSeed()` gives a fresh one.                                                                                                                  |
| `size`          | `number`                    | `64`           | dp.                                                                                                                                                                                                                    |
| `animated`      | `boolean`                   | `true`         | `false` renders one frame: the mood's key pose, or `phase` when set.                                                                                                                                                   |
| `paused`        | `boolean`                   | `false`        | Freezes the loop in place.                                                                                                                                                                                             |
| `phase`         | `0..1`                      |                | Loop position for stills, start offset for animated avatars. Unset, a still shows its mood's key pose and an animated avatar starts at `0`. Give avatars on one screen different phases so they don't blink in unison. |
| `morphDuration` | `number`                    | `460`          | Shape morph length in ms. `0` snaps, and stills always snap.                                                                                                                                                           |
| `style`         | `StyleProp<ViewStyle>`      |                | Applied to the canvas.                                                                                                                                                                                                 |
| `ref`           | `Ref<MoodstoneHandle>`      |                | See [Ref handle](#ref-handle).                                                                                                                                                                                         |

### Tuning a cut

Each cut exposes the shape parameters that visibly change it, listed in `CUT_TUNES`, and `tune` accepts only those:

| Cut                             | Tunable                   |
| ------------------------------- | ------------------------- |
| `circle`                        | `n`, `ax`                 |
| `squircle`, `square`, `diamond` | `n`, `rot`, `ax`          |
| `hexagon`                       | `sides`, `round`, `rot`   |
| `badge`, `burst`                | `lobes`, `depth`, `sharp` |

```tsx
<Moodstone cut="hexagon" tune={{ sides: 5 }} />  // ok
<Moodstone cut="circle" tune={{ rot: 30 }} />    // type error: rotating a circle does nothing
```

The check needs a literal `cut`. When the cut comes from state, TypeScript can't pair it with the tune, so take the keys from `CUT_TUNES[cut]` and cast the pair to `CutTune`. Keys a cut doesn't expose are ignored at runtime either way. Outside React, set the spec's `shape` to `tunedShape(cut, tune)` and pass the spec through `resolveSpec`, which fills in the face scale for the shape, as the component does.

### Ref handle

```tsx
const ref = useRef<MoodstoneHandle>(null);
<Moodstone ref={ref} mood="done" />;

const image = ref.current?.snapshot({ size: 1024, background: "#0e1113" }); // SkImage
const base64 = image?.encodeToBase64(); // PNG
ref.current?.restart();
const spec = ref.current?.getSpec(); // AvatarSpec
```

`snapshot` renders offscreen with Skia, so it works for still avatars too and is not limited to the on-screen resolution. It captures the frame on screen, or the loop position you pass as `phase` (`0..1`). `size` defaults to 1024 px, and the background is transparent unless you set one. `restart` replays the mood from its rest pose; stills ignore it. `getSpec` returns the resolved spec, with colours as hex, ready for the SVG exports below.

## Exports outside the app

```ts
import {
  renderAvatarSvg,
  renderAnimatedAvatarSvg,
  stillFrame,
  DEFAULT_SEED,
  PALETTE,
  type AvatarSpec,
} from "moodstone";

const spec: AvatarSpec = {
  seed: DEFAULT_SEED,
  color: PALETTE.pine,
  cut: "circle",
  mood: "thinking",
  eyeColor: "#FFFFFF",
};
const still = renderAvatarSvg(spec, stillFrame(spec), { size: 240 }); // the mood's key pose
const loop = renderAnimatedAvatarSvg(spec, {
  size: 240,
  fps: 24,
  background: "#0e1113",
});
```

`stillFrame(spec)` is the frame a still `Moodstone` shows; pass `computeFrame(spec, t)` for any other moment. The animated SVG uses SMIL, samples every attribute from `computeFrame`, and loops seamlessly. GIF and WebM encoders are not bundled; `computeFrame` plus `renderAvatarImage` give you every frame if you want to encode one natively.

### From the command line

A clone of this repo can also write these SVGs to files, straight from the library source, with no app and no build step. It needs Node 22.18 or later.

```bash
npm run export-svg -- --mood thinking --cut hexagon --color sky
npm run export-svg -- --mood all --animated --out ~/Desktop/moodstone
```

The flags follow the example app's deep-link parameters: `--color` (a palette key or hex), `--cut`, `--mood`, `--eyes` (`white`, `black` or hex) and any tunable parameter (`--lobes 9`, `--sides 5`), which applies when the cut exposes it. Stills show the mood's key pose; `--animated` exports the whole loop instead. `--phase`, `--seed` (three numbers or `random`), `--size`, `--background` and `--fps` mirror the props and options above. `--color`, `--cut` and `--mood` also take a comma-separated list or `all`, and every combination is exported, named like `thinking-hexagon-sky.svg`. Files go to `./avatars/` in the directory you run the command from, unless `--out` names another directory or a single `.svg` file. Quote hex colours (`'#1f8a70'`) or leave off the `#`. `--help` lists every option.

## Mapping agent state to moods

| Agent is…                               | Mood         |
| --------------------------------------- | ------------ |
| ready, waiting for input                | `idle`       |
| reading context, awaiting a tool result | `observing`  |
| searching, short tool call              | `thinking`   |
| long reasoning                          | `processing` |
| streaming output                        | `working`    |
| finished successfully                   | `done`       |
| errored                                 | `failed`     |
| rejected the input                      | `invalid`    |
| offline, paused                         | `inactive`   |

## Performance notes

Each `Moodstone` is its own Skia canvas with its own clock. A handful of animated avatars on a screen is cheap. For long lists, render rows with `animated={false}` and animate only the avatar the user is looking at.

## Core API

```ts
import {
  computeFrame,
  stillFrame,
  randomSeed,
  loopLength,
  MOODS,
  CUTS,
  PALETTE,
  shapeRadii,
  type AvatarSpec,
} from "moodstone/core";

const spec: AvatarSpec = {
  seed: randomSeed(),
  color: PALETTE.sky,
  cut: "hexagon",
  mood: "done",
  eyeColor: "#FFFFFF",
};
const frame = computeFrame(spec, 1.25); // plain numbers: eyes, tilt, light position, lit/shade hues, swirls, sleep marks
const still = stillFrame(spec); // the mood's key pose, in the spec's own colour and light
```

A spec with a custom `shape` needs its face scale before `computeFrame` or `stillFrame` can place the eyes. `resolveSpec(spec)` fills it in; `renderAnimatedAvatarSvg` does this for you.

The main `moodstone` entry re-exports the core and adds the Skia layer the component is built from, for drawing into a canvas of your own: `useAvatarSpec(props)` turns component props into a resolved spec, `drawAvatarSkia(canvas, spec, frame, { size })` draws one frame, `surfacePath(spec)` builds the silhouette, and `makeSurfaceShader(frame, px)` returns the surface shader, whose source is `SURFACE_SKSL`.

## Example app

`example/` is an Expo app with a single-screen Studio: colour, cut, mood, motion (animated or still), eye colour and tuning sliders for the parameters the selected cut exposes, plus a light/dark theme toggle and a shuffle button that randomises the seed, colour, cut, mood and eyes. It is an npm workspace, so `npm install` at the root sets it up, and Metro resolves `moodstone` from `../src`, so library edits show up without a build. It also accepts deep-link parameters so it can be driven from a script:

```bash
cd example && npx expo start --ios
xcrun simctl openurl booted "exp://<host>:8081/--/?mood=failed&cut=burst&lobes=9"
```

Parameters: `color` (a palette key), `cut`, `mood`, `motion` (`animated` or `still`), `eyes` (`white` or `black`), `theme` (`dark` or `light`), `scroll` (`top` or `end`) to scroll the controls, and any tunable parameter (`n`, `ax`, `rot`, `lobes`, `depth`, `sharp`, `sides`, `round`), which applies when the cut exposes it.

## Development

```bash
npm install        # the library and the example workspace
npm run check      # ESLint, Prettier and tsc
npm run format     # Prettier, then ESLint --fix
npm run typecheck  # tsc only
npm run build      # bob → lib/
npm run export-svg # avatars as SVG files, --help for the flags
```

## Credits & inspirations

The idea of a single-colour agent face whose whole personality lives in two eyes comes from Plane's [Agent Avatar Lab](https://agents.plane.so/). The surface treatment, geometry, palette, timing and code here are original.

Treating the face as a readout of what a persistent agent is doing, so a glance at a list of avatars tells you which agents are idle, working or done, was inspired by [Designing Grok Bot for a world of persistent agents](https://x.ai/news/designing-grok-bot).

## License

MIT
