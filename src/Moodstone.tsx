import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Ref } from 'react';
import { PixelRatio } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Canvas, Group, Path, Points, RoundedRect, Shader, interpolatePaths } from '@shopify/react-native-skia';
import type { SkImage, SkPath, SkPoint } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import {
  BOX,
  CENTER,
  DEFAULT_SEED,
  EYE_BLACK,
  EYE_WHITE,
  SWIRL_STROKE,
  computeFrame,
  easeInOut,
  loopLength,
  resolveColor,
  resolveSpec,
  sleepMarkPoints,
  specShapeKey,
  swirlPoints,
  tunedShape,
} from './core';
import type { AvatarSpec, Cut, CutTune, Frame, Mood, PaletteKey, Seed, ShapeParams, Tune } from './core';
import { surfacePath, toSkPoints } from './skia/paths';
import { surfaceEffect, surfaceUniforms } from './skia/shader';
import { renderAvatarImage } from './skia/draw';

const DEG = Math.PI / 180;
const ORIGIN = { x: CENTER, y: CENTER };
const NO_POINTS: SkPoint[] = [];

interface BaseProps {
  /** How the light moves: start angle, drift direction and orbit size (see `Seed`). Default `DEFAULT_SEED`. */
  seed?: Seed;
  /** Palette key (`'pine'`) or any hex colour. Default `'pine'`. */
  color?: PaletteKey | (string & {});
  /** Animation state. Default `'idle'`. */
  mood?: Mood;
  /** `'white'`, `'black'` or a hex colour. Default white. */
  eyeColor?: 'white' | 'black' | (string & {});
  /** Rendered size in dp. Default 64. */
  size?: number;
  /** Animate on the UI thread. Set false for a still frame. Default true. */
  animated?: boolean;
  /** Freeze the animation in place. Default false. */
  paused?: boolean;
  /**
   * 0..1 position within the mood's loop. For still avatars this picks the
   * frame; for animated ones it offsets the start so a wall of avatars
   * doesn't blink in unison.
   */
  phase?: number;
  /** Duration of the shape morph when the silhouette changes, in ms. 0 disables it. Default 460. */
  morphDuration?: number;
  style?: StyleProp<ViewStyle>;
  /** Handle for snapshots and restarts. */
  ref?: Ref<MoodstoneHandle>;
}

/**
 * The silhouette: a `cut` (default `'circle'`), optionally adjusted by a `tune`
 * that accepts only the parameters that cut exposes (`CUT_TUNES`), or a custom
 * `shape`. Changing any of them morphs the shape.
 */
type SilhouetteProps =
  | (CutTune & { shape?: undefined })
  | { cut?: undefined; tune?: Tune<'circle'>; shape?: undefined }
  | {
      cut?: Cut;
      tune?: undefined;
      /**
       * Custom silhouette from the shape engine, replacing `cut`'s geometry:
       * `{ n: 4.5 }` squircle, `{ lobes: 12, depth: 0.11, sharp: 1.6 }` burst,
       * `{ sides: 6, round: 0.3 }` hexagon. Can't be combined with `tune`.
       */
      shape?: Partial<ShapeParams>;
    };

export type MoodstoneProps = BaseProps & SilhouetteProps;

export interface SnapshotOptions {
  /** Pixel size of the output image. Default 1024. */
  size?: number;
  /** Solid background colour; omit for transparent. */
  background?: string;
  /** Render this loop position instead of the frame currently on screen. */
  phase?: number;
}

export interface MoodstoneHandle {
  /** Render the avatar to an image, offscreen. */
  snapshot(opts?: SnapshotOptions): SkImage | null;
  /** Restart the current mood's loop from its rest pose. */
  restart(): void;
  /** The resolved spec (seed, colour, cut, mood, eye colour). */
  getSpec(): AvatarSpec;
}

function resolveEyeColor(c: string | undefined): string {
  if (!c || c === 'white') return EYE_WHITE;
  if (c === 'black') return EYE_BLACK;
  return c;
}

/** Build the full spec from props, filling gaps with defaults. */
export function useAvatarSpec(props: MoodstoneProps): AvatarSpec {
  const { seed, color = 'pine', cut = 'circle', mood = 'idle', eyeColor, shape, tune } = props;
  // Seeds and shapes usually arrive as fresh literals each render, so the spec is memoised on their contents, not their identity.
  const s0 = seed?.[0];
  const s1 = seed?.[1];
  const s2 = seed?.[2];
  const custom = shape ?? (tune ? tunedShape(cut, tune) : undefined);
  const shapeKey = custom ? JSON.stringify(custom) : '';
  return useMemo(
    () =>
      resolveSpec({
        seed: s0 !== undefined && s1 !== undefined && s2 !== undefined ? [s0, s1, s2] : DEFAULT_SEED,
        color: resolveColor(color),
        cut,
        mood,
        eyeColor: resolveEyeColor(eyeColor),
        shape: shapeKey ? (JSON.parse(shapeKey) as Partial<ShapeParams>) : undefined,
      }),
    [s0, s1, s2, color, cut, mood, eyeColor, shapeKey],
  );
}

/* ---- scene ---- */

interface SceneProps {
  frame: SharedValue<Frame>;
  surface: SharedValue<SkPath>;
  eyeColor: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}

/** One eye, swirl or sleep mark: which slot of the frame it draws, and in what colour. */
interface MarkProps {
  frame: SharedValue<Frame>;
  index: number;
  color: string;
}

function Eye({ frame, index, color }: MarkProps) {
  const rect = useDerivedValue(() => {
    const e = frame.value.eyes[index];
    return { rect: { x: e.cx - e.w / 2, y: e.cy - e.h / 2, width: e.w, height: e.h }, rx: e.r, ry: e.r };
  });
  const opacity = useDerivedValue(() => frame.value.eyes[index].alpha);
  const origin = useDerivedValue(() => ({ x: frame.value.eyes[index].cx, y: frame.value.eyes[index].cy }));
  const transform = useDerivedValue(() => [{ rotate: frame.value.eyes[index].rot }]);
  return <RoundedRect rect={rect} color={color} opacity={opacity} origin={origin} transform={transform} />;
}

function SwirlMark({ frame, index, color }: MarkProps) {
  const points = useDerivedValue(() => {
    const s = frame.value.swirls[index];
    return s ? toSkPoints(swirlPoints(s)) : NO_POINTS;
  });
  const opacity = useDerivedValue(() => frame.value.swirls[index]?.alpha ?? 0);
  return (
    <Points points={points} mode="polygon" color={color} style="stroke" strokeWidth={SWIRL_STROKE} strokeCap="round" strokeJoin="round" opacity={opacity} />
  );
}

function SleepMark({ frame, index, color }: MarkProps) {
  const points = useDerivedValue(() => {
    const m = frame.value.sleepMarks[index];
    return m ? toSkPoints(sleepMarkPoints(m)) : NO_POINTS;
  });
  const opacity = useDerivedValue(() => frame.value.sleepMarks[index]?.alpha ?? 0);
  const strokeWidth = useDerivedValue(() => frame.value.sleepMarks[index]?.strokeWidth ?? 0);
  return (
    <Points points={points} mode="polygon" color={color} style="stroke" strokeWidth={strokeWidth} strokeCap="round" strokeJoin="round" opacity={opacity} />
  );
}

function Scene({ frame, surface, eyeColor, size, style }: SceneProps) {
  const effect = useMemo(() => surfaceEffect(), []);
  const px = (size * PixelRatio.get()) / BOX;
  const scale = useMemo(() => [{ scale: size / BOX }], [size]);
  const body = useDerivedValue(() => [
    { translateX: frame.value.offset[0] },
    { translateY: frame.value.offset[1] },
    { rotate: frame.value.tilt * DEG },
  ]);
  const uniforms = useDerivedValue(() => surfaceUniforms(frame.value, px), [px]);
  return (
    <Canvas style={[{ width: size, height: size }, style]}>
      <Group transform={scale}>
        <Group origin={ORIGIN} transform={body}>
          <Path path={surface}>
            <Shader source={effect} uniforms={uniforms} />
          </Path>
          <Eye frame={frame} index={0} color={eyeColor} />
          <Eye frame={frame} index={1} color={eyeColor} />
          <Eye frame={frame} index={2} color={eyeColor} />
          <Eye frame={frame} index={3} color={eyeColor} />
          <SwirlMark frame={frame} index={0} color={eyeColor} />
          <SwirlMark frame={frame} index={1} color={eyeColor} />
          <SleepMark frame={frame} index={0} color={eyeColor} />
          <SleepMark frame={frame} index={1} color={eyeColor} />
          <SleepMark frame={frame} index={2} color={eyeColor} />
        </Group>
      </Group>
    </Canvas>
  );
}

/* ---- frame sources ---- */

interface StillProps {
  spec: AvatarSpec;
  size: number;
  phase: number;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<MoodstoneHandle>;
}

interface AnimatedProps extends StillProps {
  paused: boolean;
  morphDuration: number;
}

/** Render `spec` offscreen: at `opts.phase` when given, else as `current` shows it. */
function snapshotOf(spec: AvatarSpec, current: Frame, opts: SnapshotOptions = {}): SkImage | null {
  const frame = opts.phase !== undefined ? computeFrame(spec, opts.phase * loopLength(spec.mood)) : current;
  return renderAvatarImage(spec, frame, { size: opts.size ?? 1024, background: opts.background });
}

/** The silhouette path for a spec, rebuilt only when the silhouette changes, not on every new spec. */
function useSurfacePath(spec: AvatarSpec): SkPath {
  const shapeKey = specShapeKey(spec);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => surfacePath(spec), [shapeKey]);
}

/**
 * Milliseconds of loop played since the mood last changed or restarted.
 * It only advances while playing: pausing stops the frame callback, so a
 * paused avatar neither recomputes nor redraws.
 */
function useLoopTime(mood: Mood, paused: boolean): SharedValue<number> {
  const elapsed = useSharedValue(0);
  const ticker = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet';
    // Null on the first frame after starting or resuming.
    if (timeSincePreviousFrame) elapsed.value += timeSincePreviousFrame;
  }, !paused);
  useEffect(() => {
    ticker.setActive(!paused);
  }, [paused, ticker]);
  useEffect(() => {
    // Each mood starts from its rest pose.
    elapsed.value = 0;
  }, [mood, elapsed]);
  return elapsed;
}

/** Eased blend between two outlines with the same point count. */
function blendPaths(from: SkPath, to: SkPath, u: number): SkPath {
  'worklet';
  return interpolatePaths(easeInOut(u), [0, 1], [from, to]);
}

/**
 * The silhouette, morphing over `morphDuration` ms whenever it changes.
 * A morph interrupted by another starts from wherever the outline is.
 */
function useSurfaceMorph(spec: AvatarSpec, morphDuration: number): SharedValue<SkPath> {
  const target = useSurfacePath(spec);
  const shown = useRef(target);
  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const progress = useSharedValue(1); // 0..1 through the morph from `from` to `to`, 1 once settled
  useEffect(() => {
    if (shown.current === target) return;
    shown.current = target;
    const u = progress.value;
    from.value = u >= 1 ? to.value : blendPaths(from.value, to.value, u);
    to.value = target;
    if (morphDuration > 0) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: morphDuration, easing: Easing.linear });
    } else {
      progress.value = 1;
    }
  }, [target, morphDuration, from, to, progress]);
  return useDerivedValue(() => (progress.value >= 1 ? to.value : blendPaths(from.value, to.value, progress.value)));
}

function AnimatedAvatar({ spec, size, phase, paused, morphDuration, style, ref }: AnimatedProps) {
  const elapsed = useLoopTime(spec.mood, paused);
  const offset = phase * loopLength(spec.mood);
  const frame = useDerivedValue(() => computeFrame(spec, elapsed.value / 1000 + offset), [spec, offset]);
  const surface = useSurfaceMorph(spec, morphDuration);
  useImperativeHandle(
    ref,
    () => ({
      snapshot: (opts) => snapshotOf(spec, frame.value, opts),
      restart: () => {
        elapsed.value = 0;
      },
      getSpec: () => spec,
    }),
    [spec, frame, elapsed],
  );
  return <Scene frame={frame} surface={surface} eyeColor={spec.eyeColor} size={size} style={style} />;
}

function StillAvatar({ spec, size, phase, style, ref }: StillProps) {
  const still = useMemo(() => computeFrame(spec, phase * loopLength(spec.mood)), [spec, phase]);
  const path = useSurfacePath(spec);
  const frame = useSharedValue(still);
  const surface = useSharedValue(path);
  useEffect(() => {
    frame.value = still;
    surface.value = path;
  }, [still, path, frame, surface]);
  useImperativeHandle(
    ref,
    () => ({
      snapshot: (opts) => snapshotOf(spec, still, opts),
      restart: () => {},
      getSpec: () => spec,
    }),
    [spec, still],
  );
  return <Scene frame={frame} surface={surface} eyeColor={spec.eyeColor} size={size} style={style} />;
}

/** An animated agent avatar rendered with Skia. */
export function Moodstone(props: MoodstoneProps) {
  const { size = 64, animated = true, paused = false, phase = 0, morphDuration = 460, style, ref } = props;
  const spec = useAvatarSpec(props);
  return animated ? (
    <AnimatedAvatar ref={ref} spec={spec} size={size} phase={phase} paused={paused} morphDuration={morphDuration} style={style} />
  ) : (
    <StillAvatar ref={ref} spec={spec} size={size} phase={phase} style={style} />
  );
}
