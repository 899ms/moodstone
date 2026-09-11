export type PaletteKey =
  | 'sand'
  | 'lemon'
  | 'tangerine'
  | 'rose'
  | 'salmon'
  | 'cherry'
  | 'lilac'
  | 'sky'
  | 'plum'
  | 'lime'
  | 'mint'
  | 'pine';

export const PALETTE: Record<PaletteKey, string> = {
  sand: '#F5D48A',
  lemon: '#FFD447',
  tangerine: '#FF9F43',
  rose: '#F48FB1',
  salmon: '#F2705B',
  cherry: '#D63A2F',
  lilac: '#C9B8F0',
  sky: '#3FC1F5',
  plum: '#9B59B6',
  lime: '#C5D94A',
  mint: '#5FC7B0',
  pine: '#1F8A70',
};

export const PALETTE_KEYS: readonly PaletteKey[] = [
  'sand',
  'lemon',
  'tangerine',
  'rose',
  'salmon',
  'cherry',
  'lilac',
  'sky',
  'plum',
  'lime',
  'mint',
  'pine',
];

export const EYE_WHITE = '#FFFFFF';
export const EYE_BLACK = '#111111';

/** Accepts a palette key or any hex colour. */
export function resolveColor(c: string): string {
  const hit = (PALETTE as Record<string, string>)[c];
  return hit ?? c;
}
