import { PaintStyle, PointMode, Skia, StrokeCap, StrokeJoin, drawAsImageFromPicture } from '@shopify/react-native-skia';
import type { SkCanvas, SkImage, SkPoint } from '@shopify/react-native-skia';
import { BOX, CENTER, swirlPoints } from '../core';
import type { AvatarSpec, Frame } from '../core';
import { cutPath } from './paths';
import { makeSurfaceShader } from './shader';

const RAD2DEG = 180 / Math.PI;

export interface SkiaDrawOptions {
  /** Pixel size of the square to draw. */
  size: number;
  /** Optional solid background colour. */
  background?: string;
}

/** Imperatively draw one frame onto a Skia canvas. Used for snapshots and offscreen rendering. */
export function drawAvatarSkia(canvas: SkCanvas, spec: AvatarSpec, frame: Frame, opts: SkiaDrawOptions): void {
  const s = opts.size / BOX;
  if (opts.background) {
    const bg = Skia.Paint();
    bg.setColor(Skia.Color(opts.background));
    canvas.drawRect(Skia.XYWHRect(0, 0, opts.size, opts.size), bg);
  }
  canvas.save();
  canvas.scale(s, s);
  canvas.translate(frame.offset[0], frame.offset[1]);
  if (frame.tilt !== 0) canvas.rotate(frame.tilt, CENTER, CENTER);

  // Surface: lit gradient with grain, clipped to the silhouette.
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setShader(makeSurfaceShader(frame, s));
  canvas.drawPath(cutPath(spec.cut), fill);

  // Eyes.
  const eye = Skia.Paint();
  eye.setAntiAlias(true);
  for (const e of frame.eyes) {
    if (e.alpha <= 0 || e.w <= 0 || e.h <= 0) continue;
    eye.setColor(Skia.Color(spec.eyeColor));
    eye.setAlphaf(e.alpha);
    canvas.save();
    if (e.rot !== 0) canvas.rotate(e.rot * RAD2DEG, e.cx, e.cy);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(e.cx - e.w / 2, e.cy - e.h / 2, e.w, e.h), e.r, e.r), eye);
    canvas.restore();
  }

  // Strokes: dizzy swirls and sleep marks.
  if (frame.swirls.length > 0 || frame.sleepMarks.length > 0) {
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeCap(StrokeCap.Round);
    stroke.setStrokeJoin(StrokeJoin.Round);
    for (const sw of frame.swirls) {
      const flat = swirlPoints(sw);
      const pts: SkPoint[] = [];
      for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
      stroke.setColor(Skia.Color(spec.eyeColor));
      stroke.setAlphaf(sw.alpha);
      stroke.setStrokeWidth(0.85);
      canvas.drawPoints(PointMode.Polygon, pts, stroke);
    }
    for (const m of frame.sleepMarks) {
      const h = m.size / 2;
      stroke.setColor(Skia.Color(spec.eyeColor));
      stroke.setAlphaf(m.alpha);
      stroke.setStrokeWidth(Math.max(0.6, m.size * 0.22));
      canvas.drawPoints(
        PointMode.Polygon,
        [
          { x: m.x - h, y: m.y - h },
          { x: m.x + h, y: m.y - h },
          { x: m.x - h, y: m.y + h },
          { x: m.x + h, y: m.y + h },
        ],
        stroke,
      );
    }
  }
  canvas.restore();
}

/** Render one frame to an image, offscreen. Encode with `image.encodeToBase64()` or `encodeToBytes()`. */
export function renderAvatarImage(spec: AvatarSpec, frame: Frame, opts: SkiaDrawOptions): SkImage | null {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, opts.size, opts.size));
  drawAvatarSkia(canvas, spec, frame, opts);
  const picture = recorder.finishRecordingAsPicture();
  return drawAsImageFromPicture(picture, { width: opts.size, height: opts.size });
}
