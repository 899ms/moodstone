import { DEFAULT_SEED, MOOD_KEYS, CUT_KEYS, PALETTE, PALETTE_KEYS } from '../src/core';
import { renderAnimatedAvatarSvg } from '../src/svg';
const tiles = MOOD_KEYS.map((mood, i) => {
  const spec = { seed: DEFAULT_SEED, color: PALETTE[PALETTE_KEYS[i % PALETTE_KEYS.length]], cut: CUT_KEYS[i % CUT_KEYS.length], mood, eyeColor: i % 4 === 3 ? '#111111' : '#FFFFFF' };
  return `<figure style="margin:0;text-align:center;color:#8a969b;font:12px system-ui">${renderAnimatedAvatarSvg(spec, { size: 140 })}<figcaption>${mood}</figcaption></figure>`;
});
const html = `<!doctype html><meta charset="utf-8"><title>animated svg sample</title><body style="background:#0e1113;display:flex;flex-wrap:wrap;gap:16px;padding:20px">${tiles.join('')}</body>`;
await Bun.write('dev/asvg-sample.html', html);
console.log('wrote', tiles.length, 'animated svgs,', Math.round(html.length / 1024), 'KB');
