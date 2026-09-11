import type { AvatarSpec, Frame, SleepMark } from './core/types';
import { BOX, CENTER, GRAIN, LIGHT_REACH, specPoints, specShapeKey } from './core/geometry';
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

const surfaceCache = new Map<string, Path2D>();

let grainTile: HTMLCanvasElement | null = null;
/** A 256px tile of grey noise, drawn as a repeating pattern in overlay mode. */
function grainPattern(ctx: CanvasRenderingContext2D, pixelsPerUnit: number): CanvasPattern | null {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 96 + Math.floor(Math.random() * 64);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const pat = ctx.createPattern(grainTile, 'repeat');
  if (pat && 'setTransform' in pat) pat.setTransform(new DOMMatrix().scale(1.5 / pixelsPerUnit));
  return pat;
}

/** Silhouette as a Path2D in box coordinates. */
export function surfacePath2D(spec: Pick<AvatarSpec, 'cut' | 'shape'>): Path2D {
  const key = specShapeKey(spec);
  const hit = surfaceCache.get(key);
  if (hit) return hit;
  const pts = specPoints(spec);
  const path = new Path2D();
  path.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
  path.closePath();
  if (!spec.shape) surfaceCache.set(key, path);
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

  // Surface: radial two-hue gradient from the light, plus grain, clipped to the silhouette.
  ctx.save();
  ctx.clip(surfacePath2D(spec));
  const [lx, ly] = frame.light;
  const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, LIGHT_REACH);
  grad.addColorStop(0, frame.lit);
  grad.addColorStop(1, frame.shade);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BOX, BOX);
  const hi = ctx.createRadialGradient(lx, ly, 0, lx, ly, LIGHT_REACH * 0.5);
  hi.addColorStop(0, 'rgba(255,255,255,0.10)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, BOX, BOX);
  const pat = grainPattern(ctx, s);
  if (pat) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = GRAIN * 4;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, BOX, BOX);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
