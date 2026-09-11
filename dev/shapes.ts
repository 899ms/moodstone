/* Silhouette candidates for discussion. Every shape is a closed polyline in a 64-unit box. */
type Pt = [number, number];
const TAU = Math.PI * 2;
const N = 360;
const sgn = (v: number) => (v < 0 ? -1 : 1);

function normalise(pts: Pt[], size = 56): Pt[] {
  let maxR = 0;
  for (const [x, y] of pts) maxR = Math.max(maxR, Math.abs(x), Math.abs(y));
  const s = size / 2 / maxR;
  return pts.map(([x, y]) => [32 + x * s, 32 + y * s]);
}
function rotate(pts: Pt[], deg: number): Pt[] {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
}

/** |x/a|^n + |y/b|^n = 1. n=2 circle, ~4 squircle, 16 near-square. */
function superellipse(n: number, a = 1, b = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    out.push([a * sgn(c) * Math.pow(Math.abs(c), 2 / n), b * sgn(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  return out;
}
/** Polar radius of a superellipse at angle t (for lobe modulation on a squarish base). */
function seRadius(n: number, t: number): number {
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
}
/** k lobes of relative depth d; sharp>1 pinches the valleys (burst), <1 rounds them (scallop). */
function lobed(k: number, d: number, sharp = 1, base = 2, phase = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const w = (Math.cos(k * t + phase) + 1) / 2;         // 0..1
    const lobe = Math.pow(w, sharp) * 2 - 1;             // -1..1
    const r = seRadius(base, t) * (1 + d * lobe);
    out.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  return out;
}
/** Regular k-gon with corners rounded by cutting in `round` (0..0.5 of edge) and bridging with a quadratic. */
function polygon(k: number, round = 0.3, rot = -90): Pt[] {
  const v: Pt[] = [];
  for (let i = 0; i < k; i++) { const t = ((rot + (i * 360) / k) * Math.PI) / 180; v.push([Math.cos(t), Math.sin(t)]); }
  const out: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const p = v[(i + k - 1) % k], c = v[i], n = v[(i + 1) % k];
    const a: Pt = [c[0] + (p[0] - c[0]) * round, c[1] + (p[1] - c[1]) * round];
    const b: Pt = [c[0] + (n[0] - c[0]) * round, c[1] + (n[1] - c[1]) * round];
    for (let j = 0; j <= 24; j++) { const u = j / 24, m = 1 - u; out.push([m * m * a[0] + 2 * m * u * c[0] + u * u * b[0], m * m * a[1] + 2 * m * u * c[1] + u * u * b[1]]); }
  }
  return out;
}
/** Superellipse with low-frequency seeded wobble: no two pebbles alike. */
function pebble(n: number, seed: number, amount = 1): Pt[] {
  const p1 = seed * 1.7, p2 = seed * 2.9, p3 = seed * 4.3;
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const r = seRadius(n, t) * (1 + amount * (0.07 * Math.sin(2 * t + p1) + 0.05 * Math.sin(3 * t + p2) + 0.03 * Math.sin(5 * t + p3)));
    out.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  return out;
}
/** Shield: rounded shoulders, gentle point at the bottom. */
function shield(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    const x = sgn(c) * Math.pow(Math.abs(c), 2 / 5);
    let y = sgn(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? 2.2 : 6));   // pointy bottom (y>0 is down), flat top
    out.push([x * (1 - 0.18 * Math.max(0, y)), y]);
  }
  return out;
}
/** Egg: superellipse, narrower at the top. */
function egg(): Pt[] {
  return superellipse(3.2, 1, 1.08).map(([x, y]) => [x * (1 - 0.14 * Math.max(0, -y)), y]);
}

interface Tile { label: string; sub: string; pts: Pt[]; hue: number }
const rows: { title: string; tiles: Tile[] }[] = [
  { title: 'Superellipse family (one number: squareness)', tiles: [
    { label: 'Circle', sub: 'n = 2', pts: superellipse(2), hue: 20 },
    { label: 'Soft', sub: 'n = 3', pts: superellipse(3), hue: 40 },
    { label: 'Squircle', sub: 'n = 4.5', pts: superellipse(4.5), hue: 60 },
    { label: 'Rounded square', sub: 'n = 8', pts: superellipse(8), hue: 90 },
    { label: 'Square', sub: 'n = 16', pts: superellipse(16), hue: 150 },
    { label: 'Diamond', sub: 'n = 4.5, rotated 45°', pts: rotate(superellipse(4.5), 45), hue: 200 },
    { label: 'Soft diamond', sub: 'n = 3, rotated 45°', pts: rotate(superellipse(3), 45), hue: 260 },
    { label: 'Chip', sub: 'n = 5, 1.35 : 0.85', pts: superellipse(5, 1.35, 0.85), hue: 320 },
  ]},
  { title: 'Rounded polygons (sides + corner roundness)', tiles: [
    { label: 'Triangle', sub: '3 sides', pts: polygon(3, 0.38), hue: 10 },
    { label: 'Pentagon', sub: '5 sides', pts: polygon(5, 0.32), hue: 50 },
    { label: 'Hexagon', sub: '6 sides', pts: polygon(6, 0.3), hue: 100 },
    { label: 'Hexagon flat', sub: '6 sides, rotated', pts: polygon(6, 0.3, -60), hue: 130 },
    { label: 'Octagon', sub: '8 sides', pts: polygon(8, 0.3, -90 + 22.5), hue: 190 },
    { label: 'Shield', sub: 'custom', pts: shield(), hue: 230 },
    { label: 'Egg', sub: 'asymmetric', pts: egg(), hue: 290 },
  ]},
  { title: 'Lobed (count, depth, sharpness)', tiles: [
    { label: 'Badge', sub: '8 lobes, shallow', pts: lobed(8, 0.07, 0.8, 2.4), hue: 30 },
    { label: 'Scallop', sub: '6 lobes, round', pts: lobed(6, 0.11, 0.6), hue: 60 },
    { label: 'Flower', sub: '8 lobes, deeper', pts: lobed(8, 0.13, 0.7), hue: 100 },
    { label: 'Burst', sub: '12 lobes, sharp', pts: lobed(12, 0.11, 1.6), hue: 170 },
    { label: 'Sun', sub: '16 lobes, sharp', pts: lobed(16, 0.09, 2.2), hue: 200 },
    { label: 'Gear', sub: '10 lobes, flat tops', pts: lobed(10, 0.09, 0.35), hue: 250 },
    { label: 'Star', sub: '5 lobes, deep', pts: lobed(5, 0.22, 1.3), hue: 300 },
    { label: 'Clover', sub: '4 lobes', pts: lobed(4, 0.14, 0.7), hue: 340 },
  ]},
  { title: 'Organic (seeded wobble on a superellipse: every agent unique)', tiles: [
    { label: 'Pebble', sub: 'seed 1', pts: pebble(3.2, 1), hue: 25 },
    { label: 'Pebble', sub: 'seed 2', pts: pebble(3.2, 2), hue: 75 },
    { label: 'Pebble', sub: 'seed 3', pts: pebble(3.2, 3), hue: 125 },
    { label: 'Pebble', sub: 'seed 4', pts: pebble(3.2, 4), hue: 175 },
    { label: 'Wobbly squircle', sub: 'n = 5, seed 5', pts: pebble(5, 5, 0.7), hue: 225 },
    { label: 'Blob', sub: 'seed 6, more', pts: pebble(2.4, 6, 1.8), hue: 275 },
    { label: 'Blob', sub: 'seed 7, more', pts: pebble(2.4, 7, 1.8), hue: 325 },
  ]},
];

function tileSvg(t: Tile): string {
  const pts = normalise(t.pts);
  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join('') + 'Z';
  // inscribed radius → how far to pull the eyes in
  let inscribed = 1e9;
  for (const [x, y] of pts) inscribed = Math.min(inscribed, Math.hypot(x - 32, y - 32));
  const cs = Math.max(0.55, Math.min(1, inscribed / 27));
  const eye = (cx: number) => `<rect x="${(32 + (cx - 32) * cs - 3.5 * cs).toFixed(2)}" y="${(32 + (43 - 32) * cs - 5.25 * cs).toFixed(2)}" width="${(7 * cs).toFixed(2)}" height="${(10.5 * cs).toFixed(2)}" rx="${(2 * cs).toFixed(2)}" fill="#fff"/>`;
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<figure><svg viewBox="0 0 64 64" width="112" height="112"><defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="20" cy="18" r="70"><stop offset="0" stop-color="hsl(${t.hue + 10} 80% 68%)"/><stop offset="1" stop-color="hsl(${t.hue - 14} 60% 40%)"/></radialGradient></defs><path d="${d}" fill="url(#${id})"/>${eye(22)}${eye(42)}</svg><figcaption><b>${t.label}</b><br>${t.sub}</figcaption></figure>`;
}

const html = `<!doctype html><meta charset="utf-8"><title>Silhouette candidates</title>
<style>body{background:#0e1113;color:#cfd6d8;font:13px/1.4 system-ui,sans-serif;margin:0;padding:24px}h2{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.6;margin:22px 0 10px}.row{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0;text-align:center;width:120px}figcaption{margin-top:6px;font-size:12px;opacity:.85}figcaption b{font-weight:600}</style>
<h1 style="font-size:16px;margin:0">Silhouette candidates</h1><p style="opacity:.6;margin:4px 0 0">All drawn by the same polar shape engine. Eyes pull inward automatically from the shape's inscribed radius.</p>
${rows.map((r) => `<h2>${r.title}</h2><div class="row">${r.tiles.map(tileSvg).join('')}</div>`).join('')}`;
await Bun.write('dev/shapes.html', html);
console.log('wrote dev/shapes.html', rows.reduce((n, r) => n + r.tiles.length, 0), 'tiles');
