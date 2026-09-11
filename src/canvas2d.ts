import type { AvatarSpec, Cut, Frame, SleepMark } from './core/types';
import { BOX, CENTER, CUTS, PLANES, PLANE_ALPHA } from './core/geometry';
import { swirlPoints } from './core/frame';

/**
 * HTML canvas renderer. Used by the dev harness and usable on the web
 * (react-native-web, plain DOM) where Skia is not available.
 */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const surfaceCache = new Map<Cut, Path2D>();

/** Silhouette as a Path2D in box coordinates. */
export function surfacePath2D(cut: Cut): Path2D {
  const hit = surfaceCache.get(cut);
  if (hit) return hit;
  const path = new Path2D();
  for (const part of CUTS[cut].parts) {
    const sub = new Path2D();
    const hw = part.w / 2;
    const hh = part.h / 2;
    const r = part.r;
    sub.moveTo(-hw + r, -hh);
    sub.arcTo(hw, -hh, hw, hh, r);
    sub.arcTo(hw, hh, -hw, hh, r);
    sub.arcTo(-hw, hh, -hw, -hh, r);
    sub.arcTo(-hw, -hh, hw, -hh, r);
    sub.closePath();
    path.addPath(sub, new DOMMatrix().translateSelf(CENTER, CENTER).rotateSelf(part.rot));
  }
  surfaceCache.set(cut, path);
  return path;
}

function drawZ(ctx: CanvasRenderingContext2D, m: SleepMark) {
  const s = m.size;
  ctx.lineWidth = Math.max(0.6, s * 0.22);
  ctx.beginPath();
  ctx.moveTo(m.x - s / 2, m.y - s / 2);
  ctx.lineTo(m.x + s / 2, m.y - s / 2);
  ctx.lineTo(m.x - s / 2, m.y + s / 2);
  ctx.lineTo(m.x + s / 2, m.y + s / 2);
  ctx.stroke();
}

export interface DrawOptions {
  /** Pixel size of the square canvas area to draw into. */
  size: number;
  /** Optional solid background; omit for transparent. */
  background?: string;
  /** Multiply the whole drawing by a device pixel ratio already applied to the canvas. */
  dpr?: number;
}

/** Draw one frame onto a 2D context. Clears the square first. */
export function drawAvatar(ctx: CanvasRenderingContext2D, spec: AvatarSpec, frame: Frame, opts: DrawOptions) {
  const size = opts.size;
  const dpr = opts.dpr ?? 1;
  const s = (size / BOX) * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size * dpr, size * dpr);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, size * dpr, size * dpr);
  }
  ctx.setTransform(s, 0, 0, s, 0, 0);

  ctx.save();
  ctx.translate(frame.offset[0], frame.offset[1]);
  if (frame.tilt !== 0) {
    ctx.translate(CENTER, CENTER);
    ctx.rotate((frame.tilt * Math.PI) / 180);
    ctx.translate(-CENTER, -CENTER);
  }

  // Surface + facet planes (clipped).
  ctx.save();
  ctx.clip(surfacePath2D(spec.cut));
  ctx.fillStyle = frame.color;
  ctx.fillRect(0, 0, BOX, BOX);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = PLANE_ALPHA;
  for (let i = 0; i < 3; i++) {
    const pl = PLANES[i];
    ctx.save();
    ctx.translate(pl.cx, pl.cy);
    ctx.rotate(frame.planeAngles[i]);
    roundRect(ctx, -pl.w / 2, -pl.h / 2, pl.w, pl.h, pl.r);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Eyes (not clipped, so a celebration lift can cross the edge).
  ctx.fillStyle = spec.eyeColor;
  for (const e of frame.eyes) {
    if (e.alpha <= 0 || e.w <= 0 || e.h <= 0) continue;
    ctx.globalAlpha = e.alpha;
    ctx.save();
    ctx.translate(e.cx, e.cy);
    if (e.rot !== 0) ctx.rotate(e.rot);
    roundRect(ctx, -e.w / 2, -e.h / 2, e.w, e.h, e.r);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Dizzy swirls.
  if (frame.swirls.length > 0) {
    ctx.strokeStyle = spec.eyeColor;
    ctx.lineWidth = 0.85;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const sw of frame.swirls) {
      const pts = swirlPoints(sw);
      ctx.globalAlpha = sw.alpha;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(pts[0], pts[1]);
        else ctx.lineTo(pts[i], pts[i + 1]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Sleep marks.
  if (frame.sleepMarks.length > 0) {
    ctx.strokeStyle = spec.eyeColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const m of frame.sleepMarks) {
      ctx.globalAlpha = m.alpha;
      drawZ(ctx, m);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
