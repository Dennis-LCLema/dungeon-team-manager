import { lsGet, lsSet, slug } from '../lib/util';

/** Pixel sprites from PokéAPI (https://pokeapi.co). The name → number list is fetched once and kept in this browser. */
const KEY = 'pmd-pokeapi-ids';
const LIST = 'https://pokeapi.co/api/v2/pokemon?limit=2000';
const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
let ids: Record<string, number> = lsGet(KEY, {});
/** Sprites bundled with the app (scripts/fetch-sprites.mjs), so they work where other sites are blocked. */
let local: { names: Record<string, number>; img: Record<string, string> } | null = null;

/** Load the list if this browser doesn't have it yet. Never throws: offline just means no sprites. */
export async function loadSpriteIds(timeoutMs = 4000) {
  try { local = await (await fetch('sprites.json')).json(); } catch { /* not bundled: use PokéAPI directly */ }
  if (Object.keys(ids).length) return;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    const j: { results: { name: string; url: string }[] } = await (await fetch(LIST, { signal: ctl.signal })).json();
    clearTimeout(t);
    ids = Object.fromEntries(j.results.map(p => [p.name, Number(p.url.split('/').filter(Boolean).pop())]));
    lsSet(KEY, ids);
  } catch { /* offline or blocked: avatars fall back to letters */ }
}

/** Our species name → PokéAPI number. Forms PokéAPI lacks fall back to the base form ("arceus-bug" → "arceus"). */
export function resolveId(map: Record<string, number>, species: string): number | null {
  let n = slug(species);
  while (n) {
    if (map[n]) return map[n];
    const form = Object.keys(map).find(k => k.startsWith(n + '-'));
    if (form) return map[form];
    n = n.includes('-') ? n.slice(0, n.lastIndexOf('-')) : '';
  }
  return null;
}

export function spriteUrl(species: string, shiny?: boolean) {
  const own = !shiny && local ? local.img[local.names[slug(species)]] : undefined;
  if (own) return own;
  const id = resolveId(ids, species);
  return id ? `${ART}${shiny ? 'shiny/' : ''}${id}.png` : null;
}
