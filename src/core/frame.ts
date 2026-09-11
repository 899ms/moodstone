import type { AvatarSpec, EyeRect, Frame, Mood, SleepMark, Swirl } from './types';
import { TAU, clamp, lerp, easeInOut, easeBack, pwl, ramp, pulse, smoothstep, wrap01 } from './math';
import { CENTER, CUTS, EYE, LIGHT_ORBIT } from './geometry';
import { MOOD_CYCLE, MOOD_REPS } from './moods';
import { celebrationColor, litShade } from './color';

/* ------------------------------------------------------------------
   Everything below is a pure function of (spec, time). It runs on the
   UI thread as a Reanimated worklet in React Native, on the main thread
   in a browser, and in Node. No classes, no closures over
   mutable state, only numbers and plain objects.
   ------------------------------------------------------------------ */

interface Pose {
  cx: number;
  cy: number;
  w: number;
  h: number;
  r: number;
  rot: number;
  alpha: number;
}

function restPose(side: 0 | 1, dx: number, dy: number, lift: number): Pose {
  'worklet';
  return {
    cx: (side === 1 ? EYE.cxR : EYE.cxL) + dx,
    cy: EYE.cy + lift + dy,
    w: EYE.w,
    h: EYE.h,
    r: EYE.r,
    rot: 0,
    alpha: 1,
  };
}

function lerpPose(a: Pose, b: Pose, u: number): Pose {
  'worklet';
  return {
    cx: lerp(a.cx, b.cx, u),
    cy: lerp(a.cy, b.cy, u),
    w: lerp(a.w, b.w, u),
    h: lerp(a.h, b.h, u),
    r: lerp(a.r, b.r, u),
    rot: lerp(a.rot, b.rot, u),
    alpha: lerp(a.alpha, b.alpha, u),
  };
}

function hiddenEye(): EyeRect {
  'worklet';
  return { cx: CENTER, cy: CENTER, w: 0, h: 0, r: 0, rot: 0, alpha: 0 };
}

/* ---- gaze tracks: rows of [t, leftDx, leftDy, rightDx, rightDy, overshoot] ---- */
type Track = ReadonlyArray<readonly [number, number, number, number, number, number]>;

const IDLE_TRACK: Track = [
  [0, 0, 0, 0, 0, 0],
  [0.3, 1.5, -1, 1.2, -1, 0],
  [0.62, -1.2, 0.6, -1.5, 0.6, 0],
  [1, 0, 0, 0, 0, 0],
];

const OBSERVE_TRACK: Track = [
  [0, 0, 0, 0, 0, 0],
  [0.09, 0, 0, 0, 0, 0],
  [0.17, 11, -15, 6, -15, 1],
  [0.33, 11, -15, 6, -15, 0],
  [0.44, -6, -11, -11, -11, 1],
  [0.64, -6, -11, -11, -11, 0],
  [0.72, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0],
];

function gazeAt(track: Track, p: number): [number, number, number, number] {
  'worklet';
  for (let k = 0; k < track.length - 1; k++) {
    const a = track[k];
    const b = track[k + 1];
    if (p >= a[0] && p <= b[0]) {
      const u = clamp((p - a[0]) / (b[0] - a[0] || 1), 0, 1);
      const e = b[5] === 1 ? easeBack(u) : easeInOut(u);
      return [lerp(a[1], b[1], e), lerp(a[2], b[2], e), lerp(a[3], b[3], e), lerp(a[4], b[4], e)];
    }
  }
  const z = track[track.length - 1];
  return [z[1], z[2], z[3], z[4]];
}

/* ---- blinks: cosine both ways, shut faster than open ---- */
function blinkCurve(d: number, closeN: number, openN: number): number {
  'worklet';
  if (d < -closeN || d > openN) return 1;
  if (d < 0) {
    const ph = (d + closeN) / closeN;
    return 0.5 * (1 + Math.cos(Math.PI * ph));
  }
  const ph = d / openN;
  return 0.5 * (1 - Math.cos(Math.PI * ph));
}

function opennessAt(p: number, cycle: number, blinks: ReadonlyArray<number>, speed: number): number {
  'worklet';
  let o = 1;
  const cN = (0.09 * speed) / cycle;
  const oN = (0.14 * speed) / cycle;
  for (let i = 0; i < blinks.length; i++) {
    let d = p - blinks[i];
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    o = Math.min(o, blinkCurve(d, cN, oN));
  }
  return clamp(o, 0, 1);
}

const IDLE_BLINKS: readonly number[] = [0.3, 0.8];
const OBSERVE_BLINKS: readonly number[] = [0.135, 0.455, 0.735];
const WORK_BLINKS: readonly number[] = [0.303, 0.637, 0.97];
const SINGLE_EARLY_BLINK: readonly number[] = [0.1];
const SINGLE_FIRST_BLINK: readonly number[] = [0.07];

/* ---- thinking: the light races around while the dot bobs (2 revolutions per cycle) ---- */
const THINK_WARP: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.32, 0.3],
  [0.82, 1.7],
  [1, 2],
];

/* ---- processing: four dots orbit; node 0,1 come from the left eye, 2,3 from the right ---- */
const ORBIT_ANGLES: readonly number[] = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

/* ---- failed: gravity drop with decaying bounces ---- */
const F_TOP = EYE.cy;
const F_GND = EYE.cy + 9.5;
const F_DROP = F_GND - F_TOP;
const F_START = 0.14;
const F_END = 0.38;

function bounceHeight(u: number): number {
  'worklet';
  const r = 0.55;
  const durs = [1, 2 * r, 2 * r * r, 2 * r * r * r, 2 * r * r * r * r];
  let total = 0;
  for (let i = 0; i < durs.length; i++) total += durs[i];
  const t = u * total;
  let acc = 0;
  for (let k = 0; k < durs.length; k++) {
    const d = durs[k];
    if (t <= acc + d) {
      const seg = (t - acc) / d;
      if (k === 0) return 1 - seg * seg;
      const hk = Math.pow(r, 2 * k);
      return hk * (1 - Math.pow(2 * seg - 1, 2));
    }
    acc += d;
  }
  return 0;
}

function failedEyeY(p: number): number {
  'worklet';
  if (p < F_START) return F_TOP;
  if (p < F_END) return F_GND - bounceHeight((p - F_START) / (F_END - F_START)) * F_DROP;
  if (p < 0.82) return F_GND;
  if (p < 0.9) return lerp(F_GND, F_TOP, easeBack((p - 0.82) / 0.08));
  return F_TOP;
}

/* ---- inactive: three "z" marks drifting up and right ---- */
function sleepMarksAt(p: number, cs: number): SleepMark[] {
  'worklet';
  const marks: SleepMark[] = [];
  for (let k = 0; k < 3; k++) {
    const ph = wrap01(p + k / 3);
    const x = 45 + ph * 6;
    const y = 39 - ph * 18;
    const a = ph < 0.16 ? ph / 0.16 : ph > 0.72 ? (1 - ph) / 0.28 : 1;
    marks.push({
      x: CENTER + (x - CENTER) * cs,
      y: CENTER + (y - CENTER) * cs,
      size: (5 + ph * 4) * cs,
      alpha: clamp(a, 0, 1) * 0.92,
    });
  }
  return marks;
}

function finishEye(pose: Pose, cs: number, sx: number, sy: number): EyeRect {
  'worklet';
  const cx = CENTER + (pose.cx - CENTER) * cs;
  const cy = CENTER + (pose.cy - CENTER) * cs;
  const w = pose.w * cs * sx;
  const h = pose.h * cs * sy;
  const r = Math.min(pose.r * cs * Math.min(sx, sy), w / 2, h / 2);
  return { cx, cy, w, h, r: Math.max(0, r), rot: pose.rot, alpha: pose.alpha };
}

/** Flat [x0, y0, x1, y1, ...] polyline for a swirl, in box units. */
export function swirlPoints(s: Swirl): number[] {
  'worklet';
  const n = 36;
  const turns = 2.3;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * s.grow;
    const th = s.dir * turns * TAU * f + s.rot;
    const r = s.radius * f;
    out.push(s.cx + r * Math.cos(th), s.cy + r * Math.sin(th));
  }
  return out;
}

/**
 * Compute one frame of an avatar at absolute time `t` (seconds).
 * The result is periodic with period `loopLength(spec.mood)`.
 */
export function computeFrame(spec: AvatarSpec, t: number): Frame {
  'worklet';
  const mood: Mood = spec.mood;
  const cycle = MOOD_CYCLE[mood];
  const L = cycle * MOOD_REPS[mood];
  const tl = ((t % L) + L) % L;
  const p = wrap01(tl / cycle);
  const cutDef = CUTS[spec.cut];
  const cs = spec.contentScale !== undefined ? spec.contentScale : cutDef.contentScale;
  const lift = cutDef.eyeLift;
  const base = spec.seed;

  let tilt = 0;
  let ox = 0;
  let oy = 0;
  let color = spec.color;
  let openness = 1;
  let revs = 0;
  let warp = -1;
  let poses: Pose[];
  let swirlAmt = 0;
  let sleepMarks: SleepMark[] = [];

  switch (mood) {
    case 'observing': {
      const g = gazeAt(OBSERVE_TRACK, p);
      const ax = (g[0] + g[2]) / 2;
      const amt = clamp(Math.abs(ax) / 9.5, 0, 1) * 0.3;
      const l = restPose(0, g[0], g[1], lift);
      const r = restPose(1, g[2], g[3], lift);
      if (ax > 0) r.w *= 1 - amt;
      else if (ax < 0) l.w *= 1 - amt;
      poses = [l, r];
      tilt = -ax * 0.65;
      openness = opennessAt(p, cycle, OBSERVE_BLINKS, 1);
      revs = 1;
      break;
    }
    case 'thinking': {
      const merge = pulse(p, 0.2, 0.32, 0.82, 0.96);
      const lp = clamp((p - 0.32) / 0.5, 0, 1);
      const dot: Pose = {
        cx: CENTER,
        cy: CENTER + 12 * Math.sin(TAU * 3 * lp),
        w: 7.8,
        h: 7.8,
        r: 3.9,
        rot: 0,
        alpha: 1,
      };
      poses = [lerpPose(restPose(0, 0, 0, lift), dot, merge), lerpPose(restPose(1, 0, 0, lift), dot, merge)];
      if (lp > 0 && lp < 1) oy += 1.2 * Math.sin(TAU * 3 * lp);
      openness = opennessAt(p, cycle, SINGLE_EARLY_BLINK, 1);
      warp = pwl(p, THINK_WARP);
      break;
    }
    case 'processing': {
      const m = easeInOut(pulse(p, 0.22, 0.32, 0.86, 0.94));
      const rot = p < 0.32 || p > 0.86 ? 0 : 2 * TAU * easeInOut((p - 0.32) / 0.54);
      const R = 18;
      const D = 7.4;
      poses = [];
      for (let i = 0; i < 4; i++) {
        const a = ORBIT_ANGLES[i] + rot;
        const dot: Pose = {
          cx: CENTER + R * Math.cos(a),
          cy: CENTER + R * Math.sin(a),
          w: D,
          h: D,
          r: D / 2,
          rot: 0,
          alpha: 1,
        };
        poses.push(lerpPose(restPose(i < 2 ? 0 : 1, 0, 0, lift), dot, m));
      }
      openness = opennessAt(p, cycle, SINGLE_EARLY_BLINK, 1);
      revs = 1;
      break;
    }
    case 'working': {
      const frac = (p * 3) % 1;
      const idx = Math.floor(p * 3) % 3;
      const A = 9;
      const dx = frac < 0.82 ? -A + 2 * A * (frac / 0.82) : A - 2 * A * easeInOut((frac - 0.82) / 0.18);
      let dy = -10 + idx * 8;
      if (frac >= 0.82) {
        const next = idx === 2 ? -10 : -10 + (idx + 1) * 8;
        dy = lerp(dy, next, easeInOut((frac - 0.82) / 0.18));
      }
      poses = [restPose(0, dx, dy, lift), restPose(1, dx, dy, lift)];
      tilt = -0.35 * dx;
      openness = opennessAt(p, cycle, WORK_BLINKS, 0.7);
      revs = 1;
      break;
    }
    case 'done': {
      const cel = p < 0.06 ? p / 0.06 : 1 - ramp(p, 0.65, 0.82);
      const sq = pulse(p, 0.08, 0.16, 0.36, 0.5);
      const slide = cel * 7 * Math.sin(TAU * 7 * p);
      const up = cel * 15;
      poses = [];
      for (let i = 0; i < 2; i++) {
        const o = restPose(i === 1 ? 1 : 0, 0, 0, lift);
        const z: Pose = { cx: o.cx, cy: o.cy - 0.5, w: 6.2, h: 2.4, r: 1.2, rot: i === 1 ? 0.34 : -0.34, alpha: 1 };
        const e = lerpPose(o, z, sq);
        e.cx += slide;
        e.cy -= up;
        poses.push(e);
      }
      tilt = cel * 12 * Math.sin(TAU * 7 * p);
      color = celebrationColor(spec.color, p, cel);
      revs = 1;
      break;
    }
    case 'failed': {
      const y = failedEyeY(p);
      const hn = clamp((F_GND - y) / F_DROP, 0, 1);
      const cq = clamp(1 - hn / 0.1, 0, 1);
      let sy = 1 + 0.3 * (1 - hn);
      sy = lerp(sy, 0.5, cq);
      const sx = 1 / Math.sqrt(sy);
      const w = EYE.w * sx;
      const h = EYE.h * sy;
      const r = Math.min(EYE.r, w / 2, h / 2);
      poses = [
        { cx: EYE.cxL, cy: y + lift, w, h, r, rot: 0, alpha: 1 },
        { cx: EYE.cxR, cy: y + lift, w, h, r, rot: 0, alpha: 1 },
      ];
      const t0 = 0.215;
      const d = 0.13;
      if (p >= t0 && p <= t0 + d) {
        const u = (p - t0) / d;
        const dec = Math.pow(1 - u, 2);
        const amp = 2.2;
        ox += amp * 0.5 * dec * Math.sin(TAU * 8 * u + 1);
        oy += amp * dec * Math.sin(TAU * 9 * u);
      }
      swirlAmt = pulse(p, 0.37, 0.53, 0.72, 0.82);
      openness = opennessAt(p, cycle, SINGLE_FIRST_BLINK, 1);
      break;
    }
    case 'invalid': {
      const c = pulse(p, 0.2, 0.27, 0.55, 0.63);
      const sh = p < 0.27 || p > 0.55 ? 0 : Math.sin(TAU * 3 * ((p - 0.27) / 0.28));
      const l = restPose(0, 5 * sh, 0, lift);
      const r = restPose(1, 5 * sh, 0, lift);
      l.h = lerp(EYE.h, 1.2, c);
      r.h = l.h;
      poses = [l, r];
      ox += 2 * sh;
      openness = opennessAt(p, cycle, SINGLE_FIRST_BLINK, 1);
      break;
    }
    case 'inactive': {
      poses = [restPose(0, 0, 4, lift), restPose(1, 0, 4, lift)];
      openness = 0.05 + 0.02 * Math.sin(p * TAU);
      sleepMarks = sleepMarksAt(p, cs);
      break;
    }
    case 'idle':
    default: {
      const g = gazeAt(IDLE_TRACK, p);
      poses = [restPose(0, g[0], g[1], lift), restPose(1, g[2], g[3], lift)];
      openness = opennessAt(p, cycle, IDLE_BLINKS, 1);
      revs = 1;
      break;
    }
  }

  // The light source orbits the centre: whole revolutions per loop keep it seamless.
  // Direction and orbit radius come from the seed so agents drift differently.
  const dir = base[1] > Math.PI ? -1 : 1;
  const orbit = LIGHT_ORBIT * (0.85 + 0.3 * (base[2] / TAU));
  const angle = warp >= 0 ? base[0] + dir * TAU * warp : base[0] + dir * revs * TAU * (tl / L);
  const light: [number, number] = [CENTER + orbit * Math.cos(angle), CENTER + orbit * Math.sin(angle)];
  const [lit, shade] = litShade(color);

  // Blink squash: shut eyes get a touch wider and almost flat.
  const sx = 1 + 0.05 * (1 - openness);
  const sy = 0.08 + 0.92 * openness;

  const eyes: [EyeRect, EyeRect, EyeRect, EyeRect] = [hiddenEye(), hiddenEye(), hiddenEye(), hiddenEye()];
  for (let i = 0; i < poses.length && i < 4; i++) eyes[i] = finishEye(poses[i], cs, sx, sy);

  const swirls: Swirl[] = [];
  if (swirlAmt > 0.001) {
    const grow = smoothstep((swirlAmt - 0.12) / 0.88);
    const rot = 1.75 * TAU * Math.pow(1 - swirlAmt, 3);
    const eyeScale = clamp(1 - swirlAmt * 1.3, 0, 1);
    const eyeAlpha = clamp(1 - swirlAmt * 1.6, 0, 1);
    const alpha = clamp(swirlAmt * 2.5, 0, 1);
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      swirls.push({ cx: e.cx, cy: e.cy, radius: 3.6 * cs, dir: i === 0 ? -1 : 1, grow, rot, alpha });
      eyes[i] = { cx: e.cx, cy: e.cy, w: e.w * eyeScale, h: e.h * eyeScale, r: e.r * eyeScale, rot: e.rot, alpha: eyeAlpha };
    }
  }

  return {
    t: tl,
    phase: p,
    color,
    tilt,
    offset: [ox, oy],
    light,
    lit,
    shade,
    eyes,
    swirls,
    sleepMarks,
  };
}
