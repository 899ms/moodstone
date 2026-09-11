import {
  drawAsImageFromPicture,
  PaintStyle,
  PointMode,
  Skia,
  StrokeCap,
  StrokeJoin,
} from "@shopify/react-native-skia";

import {
  BOX,
  CENTER,
  sleepMarkPoints,
  SWIRL_STROKE,
  swirlPoints,
} from "../core";
import { surfacePath, toSkPoints } from "./paths";
import { makeSurfaceShader } from "./shader";

import type { AvatarSpec, Frame } from "../core";
import type { SkCanvas, SkImage } from "@shopify/react-native-skia";

const RAD2DEG = 180 / Math.PI;

export interface SkiaDrawOptions {
  /** Pixel size of the square to draw. */
  size: number;
  /** Optional solid background colour. */
  background?: string;
}

/** Imperatively draw one frame onto a Skia canvas. Used for snapshots and offscreen rendering. */
export function drawAvatarSkia(
  canvas: SkCanvas,
  spec: AvatarSpec,
  frame: Frame,
  opts: SkiaDrawOptions,
): void {
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
  canvas.drawPath(surfacePath(spec), fill);

  // Eyes, swirls and sleep marks all take the eye colour. Setting the colour resets the alpha, so both are set per mark.
  const eyeColor = Skia.Color(spec.eyeColor);
  const eye = Skia.Paint();
  eye.setAntiAlias(true);
  for (const e of frame.eyes) {
    if (e.alpha <= 0 || e.w <= 0 || e.h <= 0) continue;
    eye.setColor(eyeColor);
    eye.setAlphaf(e.alpha);
    canvas.save();
    if (e.rot !== 0) canvas.rotate(e.rot * RAD2DEG, e.cx, e.cy);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(e.cx - e.w / 2, e.cy - e.h / 2, e.w, e.h),
        e.r,
        e.r,
      ),
      eye,
    );
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
      stroke.setColor(eyeColor);
      stroke.setAlphaf(sw.alpha);
      stroke.setStrokeWidth(SWIRL_STROKE);
      canvas.drawPoints(PointMode.Polygon, toSkPoints(swirlPoints(sw)), stroke);
    }
    for (const m of frame.sleepMarks) {
      stroke.setColor(eyeColor);
      stroke.setAlphaf(m.alpha);
      stroke.setStrokeWidth(m.strokeWidth);
      canvas.drawPoints(
        PointMode.Polygon,
        toSkPoints(sleepMarkPoints(m)),
        stroke,
      );
    }
  }
  canvas.restore();
}

/** Render one frame to an image, offscreen. Encode with `image.encodeToBase64()` or `encodeToBytes()`. */
export function renderAvatarImage(
  spec: AvatarSpec,
  frame: Frame,
  opts: SkiaDrawOptions,
): SkImage | null {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(0, 0, opts.size, opts.size),
  );
  drawAvatarSkia(canvas, spec, frame, opts);
  const picture = recorder.finishRecordingAsPicture();
  return drawAsImageFromPicture(picture, {
    width: opts.size,
    height: opts.size,
  });
}
