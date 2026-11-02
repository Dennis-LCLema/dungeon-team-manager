// Pokédex data (public/dex.json and public/dexinfo.json, served beside the page).
import { slug, toID } from '../lib/util';
import type { EvoTarget, Move, MoveClass, Stats } from './types';

export interface DexSpecies {
  n: string; t: string[]; b: number[]; a: string[]; l: [string, number][]; e: string[]; g: number;
  v?: [number | null, string?, string?, string?];
}
/** Mega form: [name, types, base stats, ability, stone]. */
export type MegaForm = [string, string[], number[], string, string?];
export interface Dex {
  s: Record<string, DexSpecies>;
  m: Record<string, [string, string, MoveClass, number, number, string]>;
  mg?: Record<string, MegaForm[]>;
}
export interface DexInfo { s: Record<string, [string?, string?, number?, number?]>; a: Record<string, string>; aId: Record<string, [string, string]> }

export const LVL_RATIO = 5;
let DEX: Dex | null = null;
let dexPromise: Promise<Dex> | null = null;

export const dex = (): Dex => {
  if (!DEX) throw new Error('The Pokédex is still loading.');
  return DEX;
};
export const dexReady = () => !!DEX;
/** For tests and tools that read dex.json themselves. */
export const setDex = (d: Dex) => { DEX = d; };

export function loadDex(): Promise<Dex> {
  if (!dexPromise) {
    dexPromise = fetch('dex.json')
      .then(r => { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then((j: Dex) => (DEX = j))
      .catch(() => { dexPromise = null; throw new Error('The Pokédex data did not load. Reload the page to try again.'); });
  }
  return dexPromise;
}

let INFO: DexInfo | null = null;
let infoPromise: Promise<DexInfo | null> | null = null;
export const dexInfo = () => INFO;
export function loadInfo(): Promise<DexInfo | null> {
  if (!infoPromise) {
    infoPromise = fetch('dexinfo.json')
      .then(r => { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then((j: Omit<DexInfo, 'aId'>) => {
        const aId: DexInfo['aId'] = {};
        Object.keys(j.a).forEach(k => { aId[toID(k)] = [k, j.a[k]]; });
        return (INFO = { ...j, aId });
      })
      .catch(() => { infoPromise = null; return null; });
  }
  return infoPromise;
}

export function getPokemonAny(name: string) {
  const D = dex(), sp = D.s[toID(name)];
  if (!sp) throw new Error(`No Pokémon called "${name}". Check the spelling, or make a custom Pokémon.`);
  const [hp, atk, def, spa, spd, spe] = sp.b;
  const stats: Stats = { hp, atk, def, spa, spd, spe };
  return {
    name: slug(sp.n), species: slug(sp.n), types: sp.t.slice(), stats, abilities: sp.a.map(slug),
    levelMoves: sp.l.filter(([m]) => D.m[m]).map(([m, l]) => ({ name: slug(D.m[m][0]), level: l })),
  };
}

export function describeEvo(v: DexSpecies['v']) {
  if (!v) return '';
  const [lvl, type, item, cond] = v;
  if (type === 'useItem') return 'Use ' + item;
  if (type === 'trade') return 'Trade' + (item ? ' holding ' + item : '');
  if (lvl) return 'Level ' + Math.max(1, Math.ceil(lvl / LVL_RATIO)) + (cond ? ', ' + cond : '');
  if (type === 'levelFriendship') return 'High friendship' + (cond ? ', ' + cond : '');
  return cond || 'Special level up';
}

export function getEvos(speciesName: string): { stage: number; targets: EvoTarget[] } {
  const D = dex(), sp = D.s[toID(speciesName)];
  if (!sp) return { stage: 1, targets: [] };
  return {
    stage: sp.g,
    targets: sp.e.filter(id => D.s[id]).map(id => {
      const t = D.s[id];
      return { name: slug(t.n), minLevel: (t.v && t.v[0]) || null, how: describeEvo(t.v) };
    }),
  };
}

export function getMove(name: string): Omit<Move, 'dice' | 'ppMax' | 'ppCur'> {
  const m = dex().m[toID(name)];
  if (!m) throw new Error(`No move called "${name}". Check the spelling, or add it as a custom move.`);
  return { name: slug(m[0]), type: m[1], cls: m[2], power: m[3], gamePP: m[4], desc: m[5] };
}

let PREVO: Record<string, string> | null = null;
export function prevoOf(id: string) {
  if (!PREVO) {
    PREVO = {};
    Object.entries(dex().s).forEach(([k, s]) => s.e.forEach(e => { PREVO![e] = k; }));
  }
  return PREVO[id] || null;
}
export function evoLine(id: string) {
  let root = id;
  for (let i = 0; i < 4 && prevoOf(root); i++) root = prevoOf(root)!;
  const steps: { id: string; n: string; how: string; depth: number }[] = [];
  const walk = (k: string, depth: number) => {
    const sp = dex().s[k];
    if (!sp || depth > 3) return;
    steps.push({ id: k, n: sp.n, how: depth ? describeEvo(sp.v) : '', depth });
    sp.e.forEach(e => walk(e, depth + 1));
  };
  walk(root, 0);
  return steps;
}
