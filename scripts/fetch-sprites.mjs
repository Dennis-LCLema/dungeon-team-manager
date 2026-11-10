// Downloads a PokéAPI pixel sprite for every species in public/dex.json into public/sprites.json,
// so sprites load from the app itself (Claude pages block images from other sites).
// Run: node scripts/fetch-sprites.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
// Shiny sprites to bundle too (each adds ~1 KB). Add species here when a player gets a shiny.
const SHINY = ['aron', 'lairon', 'aggron'];
const slug = s => String(s).trim().toLowerCase().replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[.'’:]/g, '').replace(/\s+/g, '-');
// Same matching as resolveId in src/game/pokeapi.ts.
function resolveId(map, name) {
  let n = slug(name);
  while (n) {
    if (map[n]) return map[n];
    const form = Object.keys(map).find(k => k.startsWith(n + '-'));
    if (form) return map[form];
    n = n.includes('-') ? n.slice(0, n.lastIndexOf('-')) : '';
  }
  return null;
}

const list = (await (await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000')).json()).results;
const map = Object.fromEntries(list.map(p => [p.name, Number(p.url.split('/').filter(Boolean).pop())]));
const { s: dex, mg = {} } = JSON.parse(readFileSync('public/dex.json', 'utf8'));
const names = {}, img = {};
for (const sp of Object.values(dex)) { const id = resolveId(map, sp.n); if (id) names[slug(sp.n)] = id; }
// Mega forms get their own sprite where PokéAPI has one under the same name (e.g. charizard-mega-x).
for (const f of Object.values(mg).flat()) { const id = map[slug(f[0])]; if (id) names[slug(f[0])] = id; }
const ids = [...new Set(Object.values(names))];
let done = 0, failed = 0;
for (let i = 0; i < ids.length; i += 20) {
  await Promise.all(ids.slice(i, i + 20).map(async id => {
    const r = await fetch(ART + id + '.png');
    if (!r.ok) { failed++; return; }
    img[id] = 'data:image/png;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
    done++;
  }));
}
for (const [n, id] of Object.entries(names)) if (!img[id]) delete names[n];
const shiny = {};
for (const n of SHINY) {
  const id = names[n], r = id && await fetch(ART + 'shiny/' + id + '.png');
  if (r && r.ok) shiny[id] = 'data:image/png;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
  else console.log('no shiny sprite for', n);
}
writeFileSync('public/sprites.json', JSON.stringify({ names, img, shiny }));
console.log(`${Object.keys(names).length} species, ${done} sprites, ${Object.keys(shiny).length} shiny, ${failed} missing`);
