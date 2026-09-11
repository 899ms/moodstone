import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { PixelRatio } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Canvas, Group, Path, Points, RoundedRect, Shader, interpolatePaths, useClock } from '@shopify/react-native-skia';
import type { SkImage, SkPath, SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { BOX, CENTER, EYE_BLACK, EYE_WHITE, clamp, computeFrame, easeInOut, identityFromName, loopLength, resolveColor, shapeContentScale, specShapeKey, swirlPoints } from './core';
import type { AvatarSpec, Cut, Frame, Mood, PaletteKey, Seed, ShapeParams } from './core';
import { surfacePath } from './skia/paths';
import { surfaceEffect, surfaceUniforms } from './skia/shader';
import { renderAvatarImage } from './skia/draw';

const DEG = Math.PI / 180;
const ORIGIN = { x: CENTER, y: CENTER };
const NO_POINTS: SkPoint[] = [];
const FAR_PAST = -1e12;

export interface AgentAvatarProps {
  /**
   * The agent's name. Drives the default seed, colour and cut, so the same
   * name always renders the same avatar.
   */
  name?: string;
  /** Override the facet composition (three angles in radians). */
  seed?: Seed;
  /** Palette key (`'pine'`) or any hex colour. Defaults to a palette colour picked from the name. */
  color?: PaletteKey | (string & {});
  /** Surface silhouette. Defaults to one picked from the name. Changing it morphs the shape. */
  cut?: Cut;
  /**
   * Custom silhouette from the shape engine, overriding `cut`'s geometry:
   * `{ n: 4.5 }` squircle, `{ lobes: 12, depth: 0.11, sharp: 1.6 }` burst,
   * `{ sides: 6, round: 0.3 }` hexagon. Changes morph like a cut change.
   */
  shape?: Partial<ShapeParams>;
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
  /** Duration of the shape morph when `cut` changes, in ms. 0 disables it. Default 460. */
  morphDuration?: number;
  style?: StyleProp<ViewStyle>;
}

export interface SnapshotOptions {
  /** Pixel size of the output image. Default 1024. */
  size?: number;
  /** Solid background colour; omit for transparent. */
  background?: string;
  /** Render this loop position instead of the frame currently on screen. */
  phase?: number;
}

export interface AgentAvatarHandle {
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

/** Build the full spec from props, filling gaps from the name. */
export function useAvatarSpec(props: AgentAvatarProps): AvatarSpec {
  const { name = 'Agent', seed, color, cut, mood = 'idle', eyeColor, shape } = props;
  const s0 = seed?.[0];
  const s1 = seed?.[1];
  const s2 = seed?.[2];
  const shapeKey = shape ? JSON.stringify(shape) : '';
  return useMemo(() => {
    const id = identityFromName(name);
    const custom = shapeKey ? (JSON.parse(shapeKey) as Partial<ShapeParams>) : undefined;
    return {
      seed: s0 !== undefined && s1 !== undefined && s2 !== undefined ? [s0, s1, s2] : id.seed,
      color: resolveColor(color ?? id.color),
      cut: cut ?? id.cut,
      mood,
      eyeColor: resolveEyeColor(eyeColor),
      shape: custom,
      contentScale: custom ? shapeContentScale(custom) : undefined,
    };
  }, [name, s0, s1, s2, color, cut, mood, eyeColor, shapeKey]);
}

/* ---- scene ---- */

interface SceneProps {
  frame: SharedValue<Frame>;
  surface: SharedValue<SkPath>;
  eyeColor: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}

function Eye({ frame, index, color }: { frame: SharedValue<Frame>; index: number; color: string }) {
  const rect = useDerivedValue(() => {
    const e = frame.value.eyes[index];
    return { rect: { x: e.cx - e.w / 2, y: e.cy - e.h / 2, width: e.w, height: e.h }, rx: e.r, ry: e.r };
  });
  const opacity = useDerivedValue(() => frame.value.eyes[index].alpha);
  const origin = useDerivedValue(() => ({ x: frame.value.eyes[index].cx, y: frame.value.eyes[index].cy }));
  const transform = useDerivedValue(() => [{ rotate: frame.value.eyes[index].rot }]);
  return <RoundedRect rect={rect} color={color} opacity={opacity} origin={origin} transform={transform} />;
}

function SwirlMark({ frame, index, color }: { frame: SharedValue<Frame>; index: number; color: string }) {
  const points = useDerivedValue(() => {
    const s = frame.value.swirls[index];
    if (!s) return NO_POINTS;
    const flat = swirlPoints(s);
    const out: SkPoint[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
    return out;
  });
  const opacity = useDerivedValue(() => frame.value.swirls[index]?.alpha ?? 0);
  return (
    <Points points={points} mode="polygon" color={color} style="stroke" strokeWidth={0.85} strokeCap="round" strokeJoin="round" opacity={opacity} />
  );
}

function SleepMark({ frame, index, color }: { frame: SharedValue<Frame>; index: number; color: string }) {
  const points = useDerivedValue(() => {
    const m = frame.value.sleepMarks[index];
    if (!m) return NO_POINTS;
    const s = m.size / 2;
    return [
      { x: m.x - s, y: m.y - s },
      { x: m.x + s, y: m.y - s },
      { x: m.x - s, y: m.y + s },
      { x: m.x + s, y: m.y + s },
    ];
  });
  const opacity = useDerivedValue(() => frame.value.sleepMarks[index]?.alpha ?? 0);
  const strokeWidth = useDerivedValue(() => {
    const m = frame.value.sleepMarks[index];
    return m ? Math.max(0.6, m.size * 0.22) : 0.6;
  });
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

interface SourceProps {
  spec: AvatarSpec;
  size: number;
  phase: number;
  paused: boolean;
  morphDuration: number;
  style?: StyleProp<ViewStyle>;
}

const AnimatedAvatar = forwardRef<AgentAvatarHandle, SourceProps>(function AnimatedAvatar(
  { spec, size, phase, paused, morphDuration, style },
  ref,
) {
  const clock = useClock();
  const start = useSharedValue(0);
  const frozen = useSharedValue(0);
  const offset = phase * loopLength(spec.mood);

  useEffect(() => {
    // Restart the loop when the mood changes so it begins from its rest pose.
    start.value = clock.value;
    frozen.value = 0;
  }, [spec.mood, clock, start, frozen]);

  useEffect(() => {
    if (paused) frozen.value = clock.value - start.value;
    else start.value = clock.value - frozen.value;
  }, [paused, clock, start, frozen]);

  const frame = useDerivedValue(() => {
    const ms = paused ? frozen.value : clock.value - start.value;
    return computeFrame(spec, ms / 1000 + offset);
  }, [spec, offset, paused]);

  // Shape morph: interpolate between the previous and the new silhouette.
  const shapeKey = specShapeKey(spec);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const target = useMemo(() => surfacePath(spec), [shapeKey]);
  const from = useSharedValue<SkPath>(target);
  const to = useSharedValue<SkPath>(target);
  const morphStart = useSharedValue(FAR_PAST);
  useEffect(() => {
    if (to.value === target) return;
    const u = morphDuration > 0 ? clamp((clock.value - morphStart.value) / morphDuration, 0, 1) : 1;
    from.value = u >= 1 ? to.value : interpolatePaths(easeInOut(u), [0, 1], [from.value, to.value]);
    to.value = target;
    morphStart.value = morphDuration > 0 ? clock.value : FAR_PAST;
  }, [target, morphDuration, clock, from, to, morphStart]);
  const surface = useDerivedValue(() => {
    const u = morphDuration > 0 ? clamp((clock.value - morphStart.value) / morphDuration, 0, 1) : 1;
    if (u >= 1) return to.value;
    return interpolatePaths(easeInOut(u), [0, 1], [from.value, to.value]);
  }, [morphDuration]);

  useImperativeHandle(
    ref,
    () => ({
      snapshot: (opts) => {
        const fr = opts?.phase !== undefined ? computeFrame(spec, opts.phase * loopLength(spec.mood)) : frame.value;
        return renderAvatarImage(spec, fr, { size: opts?.size ?? 1024, background: opts?.background });
      },
      restart: () => {
        start.value = clock.value;
        frozen.value = 0;
      },
      getSpec: () => spec,
    }),
    [spec, frame, clock, start, frozen],
  );

  return <Scene frame={frame} surface={surface} eyeColor={spec.eyeColor} size={size} style={style} />;
});

const StillAvatar = forwardRef<AgentAvatarHandle, SourceProps>(function StillAvatar({ spec, size, phase, style }, ref) {
  const t = phase * loopLength(spec.mood);
  const frame = useSharedValue<Frame>(computeFrame(spec, t));
  const surface = useSharedValue<SkPath>(surfacePath(spec));
  useEffect(() => {
    frame.value = computeFrame(spec, t);
    surface.value = surfacePath(spec);
  }, [spec, t, frame, surface]);
  useImperativeHandle(
    ref,
    () => ({
      snapshot: (opts) => {
        const fr = opts?.phase !== undefined ? computeFrame(spec, opts.phase * loopLength(spec.mood)) : frame.value;
        return renderAvatarImage(spec, fr, { size: opts?.size ?? 1024, background: opts?.background });
      },
      restart: () => {},
      getSpec: () => spec,
    }),
    [spec, frame],
  );
  return <Scene frame={frame} surface={surface} eyeColor={spec.eyeColor} size={size} style={style} />;
});

/** An animated agent avatar rendered with Skia. */
export const AgentAvatar = forwardRef<AgentAvatarHandle, AgentAvatarProps>(function AgentAvatar(props, ref) {
  const { size = 64, animated = true, paused = false, phase = 0, morphDuration = 460, style } = props;
  const spec = useAvatarSpec(props);
  return animated ? (
    <AnimatedAvatar ref={ref} spec={spec} size={size} phase={phase} paused={paused} morphDuration={morphDuration} style={style} />
  ) : (
    <StillAvatar ref={ref} spec={spec} size={size} phase={phase} paused={paused} morphDuration={0} style={style} />
  );
});
