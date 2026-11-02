// Original 16×16 pixel sprites. Rows of 8 characters are the left half and get mirrored; rows of 16 are drawn as-is.
import { toID } from '../lib/util';

const PAL: Record<string, string> = {
  k: '#23232b', w: '#f4f3f8', s: '#c9ced8', g: '#8b92a3', d: '#3b3e4a', b: '#4aa3ff', y: '#f5cf45', o: '#f0883a',
  r: '#e0453b', G: '#46a84f', B: '#3d80d9', n: '#1d1d25', c: '#f1e2b3', p: '#cfc8db', f: '#8e59d6', F: '#c79dff',
};

const SPRITES: Record<string, string[]> = {
  aron: [
    '........', '....kkkk', '...kwsss', '..kwssss', '..ksssss', '.kssddds', '.ksdbbds', '.ksdbwds',
    '.ksdddds', '.kgsssss', '.kggssss', '..kgggss', '..kdddkk', '..kdk...', '..kkk...', '........',
  ],
  hawlucha: [
    '......kk', '.....krr', '....krrr', '...krwww', '...kwkyw', '...krwww', '....krrG', 'kk...kGG',
    'kook.kGG', 'kyookGGG', '.kyokgGG', '..kkkgGG', '.....kgG', '....kGkG', '....kk.k', '........',
  ],
  riolu: [
    '..k.....', '.kBk....', '.kBBk...', '..kBBkkk', '..kBBBBB', '..knnnnn', '..knrwnn', '..knnnnn',
    '...kBBcc', '....kBBB', '...kBBBB', '..kBkBBc', '...k.kBB', '....knnn', '....knk.', '....kkk.',
  ],
  litwick: [
    '.......kk.......', '......kFFk......', '.....kFffFk.....', '......kffk......', '.......kk.......', '.....kkkkkk.....',
    '....kwwwwwwk....', '...kwwwwwwwwk...', '...kppwwwwwwk...', '...kpppwwykwk...', '...kppwwwyywk...', '...kpwwwwwwwk...',
    '...kwwwwwwwwk...', '...kwwwpwwwwk...', '....kwwwwwwk....', '.....kkkkkk.....',
  ],
};

export const hasSprite = (species: string) => !!SPRITES[toID(species)];

export function Sprite({ species, size }: { species: string; size: number }) {
  const rows = SPRITES[toID(species)];
  if (!rows) return null;
  const px: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    const full = row.length === 8 ? row + [...row].reverse().join('') : row;
    [...full].forEach((ch, x) => { if (PAL[ch]) px.push(<rect key={x + ':' + y} x={x} y={y} width="1.02" height="1.02" fill={PAL[ch]} />); });
  });
  return <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" className="sprite">{px}</svg>;
}
