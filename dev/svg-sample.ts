import { computeFrame, identityFromName, MOOD_KEYS, CUT_KEYS } from '../src/core';
import { renderAvatarSvg } from '../src/svg';
const tiles: string[] = [];
MOOD_KEYS.forEach((mood, i) => {
  const cut = CUT_KEYS[i % CUT_KEYS.length];
  const spec = { ...identityFromName('Nova' + i), cut, mood, eyeColor: '#FFFFFF' };
  const t = [0.2, 1.0, 2.0, 3.5][i % 4];
  tiles.push(renderAvatarSvg(spec, computeFrame(spec, t), { size: 120 }));
});
const html = `<!doctype html><meta charset="utf-8"><body style="background:#0e1113;display:flex;flex-wrap:wrap;gap:12px;padding:20px">${tiles.join('')}</body>`;
await Bun.write('/Users/karaca/Personal/agent-avatar/dev/svg-sample.html', html);
console.log('wrote', tiles.length, 'svgs; first length', tiles[0].length);
