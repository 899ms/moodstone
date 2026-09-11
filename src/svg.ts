import type { AvatarSpec, Frame } from './core/types';
import { BOX, CENTER, CUTS, PLANES, PLANE_ALPHA } from './core/geometry';
import { selfMultiply } from './core/color';
import { computeFrame, swirlPoints } from './core/frame';
import { loopLength } from './core/moods';
import { clamp } from './core/math';

const f = (n: number) => {
  const v = +n.toFixed(2);
  return Object.is(v, -0) ? '0' : String(v);
};
const RAD2DEG = 180 / Math.PI;

function cutRects(spec: AvatarSpec, attrs: string): string {
  return CUTS[spec.cut].parts
    .map(
      (p) =>
        `<rect x="${f(CENTER - p.w / 2)}" y="${f(CENTER - p.h / 2)}" width="${f(p.w)}" height="${f(p.h)}" rx="${f(p.r)}" transform="rotate(${f(p.rot)} ${CENTER} ${CENTER})"${attrs}/>`,
    )
    .join('');
}

function polylineD(flat: number[]): string {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) d += (i === 0 ? 'M' : 'L') + f(flat[i]) + ' ' + f(flat[i + 1]);
  return d;
}

function zD(x: number, y: number, size: number): string {
  const s = size / 2;
  return polylineD([x - s, y - s, x + s, y - s, x - s, y + s, x + s, y + s]);
}

export interface SvgOptions {
  /** Output width/height in px. Default 240. */
  size?: number;
  /** Optional solid background. */
  background?: string;
}

/**
 * Render a single frame as a static SVG string. Uses no blend modes:
 * the facets are drawn with the self-multiplied colour at 30% opacity,
 * which is equivalent to a 30% multiply layer over the surface.
 */
export function renderAvatarSvg(spec: AvatarSpec, frame: Frame, opts: SvgOptions = {}): string {
  const size = opts.size ?? 240;
  // The clip depends only on the cut, so equal ids across avatars on one page are harmless.
  const clipId = `agent-avatar-cut-${spec.cut}`;
  const facet = selfMultiply(frame.color);
  const planes = PLANES.map((pl, i) => {
    const deg = frame.planeAngles[i] * RAD2DEG;
    return `<rect x="${f(pl.cx - pl.w / 2)}" y="${f(pl.cy - pl.h / 2)}" width="${f(pl.w)}" height="${f(pl.h)}" rx="${f(pl.r)}" fill="${facet}" fill-opacity="${PLANE_ALPHA}" transform="rotate(${f(deg)} ${f(pl.cx)} ${f(pl.cy)})"/>`;
  }).join('');
  const eyes = frame.eyes
    .filter((e) => e.alpha > 0 && e.w > 0 && e.h > 0)
    .map((e) => {
      const rot = e.rot !== 0 ? ` transform="rotate(${f(e.rot * RAD2DEG)} ${f(e.cx)} ${f(e.cy)})"` : '';
      const op = e.alpha < 1 ? ` opacity="${f(e.alpha)}"` : '';
      return `<rect x="${f(e.cx - e.w / 2)}" y="${f(e.cy - e.h / 2)}" width="${f(e.w)}" height="${f(e.h)}" rx="${f(e.r)}" fill="${spec.eyeColor}"${rot}${op}/>`;
    })
    .join('');
  const swirls = frame.swirls
    .map(
      (sw) =>
        `<path d="${polylineD(swirlPoints(sw))}" fill="none" stroke="${spec.eyeColor}" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" opacity="${f(sw.alpha)}"/>`,
    )
    .join('');
  const zs = frame.sleepMarks
    .map(
      (m) =>
        `<path d="${zD(m.x, m.y, m.size)}" fill="none" stroke="${spec.eyeColor}" stroke-width="${f(Math.max(0.6, m.size * 0.22))}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(m.alpha)}"/>`,
    )
    .join('');
  const bg = opts.background ? `<rect width="${BOX}" height="${BOX}" fill="${opts.background}"/>` : '';
  const body = `translate(${f(frame.offset[0])} ${f(frame.offset[1])}) rotate(${f(frame.tilt)} ${CENTER} ${CENTER})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BOX} ${BOX}">` +
    bg +
    `<defs><clipPath id="${clipId}">${cutRects(spec, '')}</clipPath></defs>` +
    `<g transform="${body}">` +
    `<g clip-path="url(#${clipId})"><rect width="${BOX}" height="${BOX}" fill="${frame.color}"/>${planes}</g>` +
    eyes +
    swirls +
    zs +
    `</g></svg>`
  );
}

export interface AnimatedSvgOptions extends SvgOptions {
  /** Samples per second of the loop. Default 24. */
  fps?: number;
}

/**
 * Render the whole mood loop as a self-contained animated SVG (SMIL).
 * Every animatable attribute is sampled from `computeFrame`, so the
 * export matches what the component shows on screen, and the loop is
 * seamless because the last sample equals the first.
 */
export function renderAnimatedAvatarSvg(spec: AvatarSpec, opts: AnimatedSvgOptions = {}): string {
  const size = opts.size ?? 240;
  const L = loopLength(spec.mood);
  const N = clamp(Math.round(L * (opts.fps ?? 24)), 24, 240);
  const frames: Frame[] = [];
  for (let i = 0; i <= N; i++) frames.push(computeFrame(spec, (i / N) * L));
  const keyTimes = frames.map((_, i) => f(i / N)).join(';');
  const dur = `${f(L)}s`;
  const anim = (name: string, values: string[]) =>
    `<animate attributeName="${name}" values="${values.join(';')}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>`;
  const animT = (type: string, values: string[]) =>
    `<animateTransform attributeName="transform" type="${type}" values="${values.join(';')}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>`;
  const varies = (vals: number[]) => vals.some((v) => Math.abs(v - vals[0]) > 1e-3);
  const clipId = `agent-avatar-cut-${spec.cut}`;

  // Body motion.
  const tx = frames.map((fr) => fr.offset[0]);
  const ty = frames.map((fr) => fr.offset[1]);
  const tilt = frames.map((fr) => fr.tilt);
  const translateAnim = varies(tx) || varies(ty) ? animT('translate', frames.map((fr) => `${f(fr.offset[0])} ${f(fr.offset[1])}`)) : '';
  const rotateAnim = varies(tilt) ? animT('rotate', tilt.map((v) => `${f(v)} ${CENTER} ${CENTER}`)) : '';

  // Surface colour (the `done` mood cycles it) and facets.
  const colors = frames.map((fr) => fr.color);
  const colorVaries = colors.some((c) => c !== colors[0]);
  const surface = `<rect width="${BOX}" height="${BOX}" fill="${colors[0]}">${colorVaries ? anim('fill', colors) : ''}</rect>`;
  const facets = colors.map(selfMultiply);
  const planes = PLANES.map((pl, i) => {
    const vals = frames.map((fr) => `${f(fr.planeAngles[i] * RAD2DEG)} ${f(pl.cx)} ${f(pl.cy)}`);
    const spins = varies(frames.map((fr) => fr.planeAngles[i]));
    const staticRot = spins ? '' : ` transform="rotate(${vals[0]})"`;
    return (
      `<rect x="${f(pl.cx - pl.w / 2)}" y="${f(pl.cy - pl.h / 2)}" width="${f(pl.w)}" height="${f(pl.h)}" rx="${f(pl.r)}" fill="${facets[0]}" fill-opacity="${PLANE_ALPHA}"${staticRot}>` +
      (colorVaries ? anim('fill', facets) : '') +
      (spins ? animT('rotate', vals) : '') +
      `</rect>`
    );
  }).join('');

  // Eyes: one rect per slot that is ever visible.
  const eyes = [0, 1, 2, 3]
    .filter((k) => frames.some((fr) => fr.eyes[k].alpha > 0 && fr.eyes[k].w > 0))
    .map((k) => {
      const es = frames.map((fr) => fr.eyes[k]);
      const e0 = es[0];
      const alphas = es.map((e) => e.alpha);
      const rots = es.map((e) => e.rot);
      return (
        `<rect x="${f(e0.cx - e0.w / 2)}" y="${f(e0.cy - e0.h / 2)}" width="${f(e0.w)}" height="${f(e0.h)}" rx="${f(e0.r)}" ry="${f(e0.r)}" fill="${spec.eyeColor}">` +
        anim('x', es.map((e) => f(e.cx - e.w / 2))) +
        anim('y', es.map((e) => f(e.cy - e.h / 2))) +
        anim('width', es.map((e) => f(e.w))) +
        anim('height', es.map((e) => f(e.h))) +
        anim('rx', es.map((e) => f(e.r))) +
        anim('ry', es.map((e) => f(e.r))) +
        (varies(alphas) ? anim('opacity', alphas.map(f)) : '') +
        (varies(rots) ? animT('rotate', es.map((e) => `${f(e.rot * RAD2DEG)} ${f(e.cx)} ${f(e.cy)}`)) : '') +
        `</rect>`
      );
    })
    .join('');

  // Dizzy swirls: same point count every sample, so `d` interpolates smoothly.
  let swirls = '';
  if (frames.some((fr) => fr.swirls.length > 0)) {
    for (let j = 0; j < 2; j++) {
      const ds = frames.map((fr) => {
        const s = fr.swirls[j];
        if (s) return polylineD(swirlPoints(s));
        const e = fr.eyes[j];
        return polylineD(swirlPoints({ cx: e.cx, cy: e.cy, radius: 0, dir: j === 0 ? -1 : 1, grow: 0, rot: 0, alpha: 0 }));
      });
      const alphas = frames.map((fr) => fr.swirls[j]?.alpha ?? 0);
      swirls += `<path d="${ds[0]}" fill="none" stroke="${spec.eyeColor}" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" opacity="0">${anim('d', ds)}${anim('opacity', alphas.map(f))}</path>`;
    }
  }

  // Sleep marks.
  let zs = '';
  if (frames.some((fr) => fr.sleepMarks.length > 0)) {
    for (let j = 0; j < 3; j++) {
      const ms = frames.map((fr) => fr.sleepMarks[j]);
      const ds = ms.map((m) => (m ? zD(m.x, m.y, m.size) : zD(CENTER, CENTER, 0)));
      const alphas = ms.map((m) => (m ? m.alpha : 0));
      const widths = ms.map((m) => (m ? Math.max(0.6, m.size * 0.22) : 0.6));
      zs += `<path d="${ds[0]}" fill="none" stroke="${spec.eyeColor}" stroke-width="${f(widths[0])}" stroke-linecap="round" stroke-linejoin="round" opacity="0">${anim('d', ds)}${anim('opacity', alphas.map(f))}${anim('stroke-width', widths.map(f))}</path>`;
    }
  }

  const bg = opts.background ? `<rect width="${BOX}" height="${BOX}" fill="${opts.background}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BOX} ${BOX}">` +
    bg +
    `<defs><clipPath id="${clipId}">${cutRects(spec, '')}</clipPath></defs>` +
    `<g>${translateAnim}<g>${rotateAnim}` +
    `<g clip-path="url(#${clipId})">${surface}${planes}</g>` +
    eyes +
    swirls +
    zs +
    `</g></g></svg>`
  );
}
