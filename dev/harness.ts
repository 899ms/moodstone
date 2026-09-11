import {
  computeFrame,
  loopLength,
  randomSeed,
  CUT_KEYS,
  CUTS,
  MOODS,
  PALETTE,
  PALETTE_KEYS,
  type AvatarSpec,
  type Cut,
  type Mood,
} from '../src/core';
import { drawAvatar } from '../src/canvas2d';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

interface Tile {
  spec: AvatarSpec;
  ctx: CanvasRenderingContext2D;
  offset: number;
  el: HTMLCanvasElement;
}

const TILE = 100;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const grid = document.getElementById('grid')!;
const fpsEl = document.getElementById('fps')!;
const eyesSel = document.getElementById('eyes') as HTMLSelectElement;
const focusCanvas = document.getElementById('focusCanvas') as HTMLCanvasElement;
const focusCtx = focusCanvas.getContext('2d')!;
const focusMeta = document.getElementById('focusMeta')!;

let tiles: Tile[] = [];
let focus: { spec: AvatarSpec; offset: number } | null = null;

function makeSpec(cut: Cut, mood: Mood): AvatarSpec {
  return { seed: randomSeed(), color: PALETTE[pick(PALETTE_KEYS)], cut, mood, eyeColor: eyesSel.value };
}

function build() {
  grid.innerHTML = '';
  tiles = [];
  grid.appendChild(Object.assign(document.createElement('div'), { className: 'colhead', textContent: '' }));
  for (const m of MOODS) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'colhead', textContent: m.label }));
  }
  for (const cut of CUT_KEYS) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'rowhead', textContent: CUTS[cut].label }));
    for (const m of MOODS) {
      const wrap = document.createElement('div');
      wrap.className = 'tile';
      const c = document.createElement('canvas');
      c.width = c.height = TILE * dpr;
      wrap.appendChild(c);
      grid.appendChild(wrap);
      const spec = makeSpec(cut, m.key);
      const tile: Tile = { spec, ctx: c.getContext('2d')!, offset: Math.random() * 8, el: c };
      tiles.push(tile);
      wrap.onclick = () => {
        focus = { spec: tile.spec, offset: tile.offset };
        focusMeta.textContent = `${CUTS[cut].label} · ${m.label} (${m.hint}) · ${spec.color} · loop ${loopLength(m.key)}s`;
      };
    }
  }
}

let frames = 0;
let lastFps = performance.now();
function loop(now: number) {
  const t = now / 1000;
  for (const tile of tiles) {
    drawAvatar(tile.ctx, tile.spec, computeFrame(tile.spec, t + tile.offset), { size: TILE, dpr });
  }
  if (focus) {
    drawAvatar(focusCtx, focus.spec, computeFrame(focus.spec, t + focus.offset), { size: 320, dpr: 2 });
  }
  frames++;
  if (now - lastFps > 1000) {
    fpsEl.textContent = `${frames} fps · ${tiles.length} tiles`;
    frames = 0;
    lastFps = now;
  }
  requestAnimationFrame(loop);
}

document.getElementById('shuffle')!.onclick = build;
document.getElementById('theme')!.onclick = () => document.body.classList.toggle('light');
eyesSel.onchange = () => {
  for (const tile of tiles) tile.spec.eyeColor = eyesSel.value;
  if (focus) focus.spec.eyeColor = eyesSel.value;
};
build();
requestAnimationFrame(loop);
