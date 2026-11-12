/* Dungeon crawl and the Labyrinth overworld. State-changing functions run inside update().
   The Labyrinth has 40 floors. Every 5 floors a Gatekeeper guards the way down, and beyond it a new overworld (a Layer)
   opens with Safe Zones, wild areas, two Red Rifts, a Waystone for teleporting, and the next descent. */
import { clampN, roll, toID, uid } from '../lib/util';
import { CAST, FLAVOR, ITEMS, ITEM_BY_ID, LAB_FLOORS, LAYERS, NODE_POS, RAR, RESCUES, THEME, TRAPS, labLvl, layerLvl } from './data';
import { dex } from './dex';
import { G, addLog, me } from './store';
import type { AreaEv, Dungeon, Enemy, FloorMap, LootLine } from './types';
import { TIER, addLoot, blessTeam, levelCap, lootLine, lootTeam, pickItem, randomTM, rollChest, rollRarity } from './rules';
import { buildEnemy, buildRivals } from './battle';

export const ek = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
export const partyChars = () => { const p = G().chars.filter(c => c.inDungeon); return p.length ? p : G().chars.filter(c => c.player); };
export const mapNb = (m: FloorMap, k: string) => Object.keys(m.edges).filter(e => e.split('|').includes(k)).map(e => e.split('|').find(z => z !== k)!);

export function genFloor(dg: Dungeon): FloorMap {
  const W = 5, H = 5, cells: FloorMap['cells'] = {}, edges: FloorMap['edges'] = {}, K = (x: number, y: number) => x + ',' + y;
  let x = 2, y = 2;
  cells[K(x, y)] = { t: 'start', v: true, done: true };
  const want = 9 + roll(4);
  let guard = 0;
  while (Object.keys(cells).length < want && guard++ < 800) {
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][roll(4) - 1];
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    edges[ek(K(x, y), K(nx, ny))] = 1;
    x = nx; y = ny;
    if (!cells[K(x, y)]) cells[K(x, y)] = { t: '' };
    if (roll(5) === 1) { const ks = Object.keys(cells); [x, y] = ks[roll(ks.length) - 1].split(',').map(Number); }
  }
  const m: FloorMap = { w: W, h: H, cells, edges, pos: '2,2' };
  const dist: Record<string, number> = { '2,2': 0 }, q = ['2,2'];
  while (q.length) { const k = q.shift()!; mapNb(m, k).forEach(n => { if (dist[n] == null) { dist[n] = dist[k] + 1; q.push(n); } }); }
  const far = Object.keys(cells).sort((a, b) => (dist[b] || 0) - (dist[a] || 0))[0];
  cells[far].t = (dg.floor || 1) >= (dg.floors || 1) ? 'boss' : 'stairs';
  const open = Object.keys(cells).filter(k => !cells[k].t);
  let shop = false;
  open.forEach(k => {
    const r = roll(100);
    let t = r <= 38 ? 'enemy' : r <= 56 ? 'empty' : r <= 70 ? 'treasure' : r <= 81 ? 'trap' : r <= 89 ? 'rest' : r <= 95 ? ((dg.floor || 1) > 1 ? 'house' : 'enemy') : 'shop';
    if (t === 'shop') { if (shop) t = 'treasure'; shop = true; }
    cells[k].t = t;
  });
  const fights = open.filter(k => cells[k].t === 'enemy' || cells[k].t === 'house');
  if (fights.length < 2) open.filter(k => cells[k].t === 'empty').slice(0, 2 - fights.length).forEach(k => { cells[k].t = 'enemy'; });
  return m;
}

const bst = (b: number[]) => b.reduce((a, v) => a + v, 0);
const poolCache: Record<string, string[]> = {};
function speciesPool(dg: Pick<Dungeon, 'lvl' | 'types' | 'extra'>) {
  const ck = [dg.lvl, (dg.types || []).join(','), dg.extra || ''].join('|');
  return (poolCache[ck] ||= speciesPoolRaw(dg));
}
function speciesPoolRaw(dg: Pick<Dungeon, 'lvl' | 'types' | 'extra'>) {
  const S = dex().s;
  const extra = String(dg.extra || '').split(',').map(toID).filter(id => S[id]);
  if (extra.length) return extra;
  const tier = TIER(dg.lvl || 1), cap = [0, 405, 480, 535, 599][tier], maxG = tier === 1 ? 1 : tier === 2 ? 2 : 3;
  const ids = Object.keys(S);
  let pool = ids.filter(id => {
    const s = S[id];
    return s.g <= maxG && bst(s.b) <= cap && s.l.length > 3 && (!s.n.includes('-') || /-(Alola|Galar|Hisui|Paldea)$/.test(s.n)) &&
      (!dg.types || !dg.types.length || s.t.some(t => dg.types!.includes(t)));
  });
  if (pool.length < 3) pool = ids.filter(id => S[id].g === 1 && bst(S[id].b) <= 405);
  return pool;
}

export function rollEncounter(dg: Dungeon, type: string): Enemy[] {
  const S = dex().s, pool = speciesPool(dg), size = partyChars().length || 1, out: Enemy[] = [];
  const lvl0 = dg.lvl || 1, floor = dg.floor || 1, floors = dg.floors || 1;
  const n = type === 'house' ? size + roll(2) : type === 'boss' ? 1 + roll(2) : clampN(Math.ceil(size / 2) + roll(3) - 2, 1, 5);
  for (let i = 0; i < n; i++) {
    const boss = type === 'boss' && i === 0;
    let id = pool[roll(pool.length) - 1];
    if (boss && dg.gatekeeper && S[toID(dg.gatekeeper)]) id = toID(dg.gatekeeper);
    else if (boss) {
      const picks = Array.from({ length: 6 }, () => pool[roll(pool.length) - 1]);
      id = picks.sort((a, b) => bst(S[b].b) - bst(S[a].b))[0];
      if (TIER(lvl0) >= 2 && S[id].e.length && S[S[id].e[0]]) id = S[id].e[0];
    }
    const depth = dg.kind === 'labyrinth' ? ((floor - 1) % 5) + 1 : dg.kind === 'rift' ? floor + 3 : dg.kind === 'wild' ? 1 : floor;
    const lvl = clampN((dg.kind ? lvl0 : lvl0 + Math.floor((floor - 1) / 2)) + (boss ? 2 : roll(3) - 2), 1, 20);
    const shadow = boss || roll(100) <= 25 + depth * 10;
    const e = buildEnemy(S[id].n, lvl, shadow, 'enemy');
    if (boss) { e.hpMax *= 2; e.hpCur = e.hpMax; e.boss = true; if (dg.gatekeeper) e.gatekeeper = true; }
    if (dg.kind === 'rift') e.rift = true;
    if (type === 'house') { e.hpMax = Math.max(1, Math.ceil(e.hpMax / 2)); e.hpCur = e.hpMax; e.minion = true; }
    out.push(e);
  }
  const counts: Record<string, number> = {};
  out.forEach(e => { e.name = e.name.replace(/ [A-Z]$/, ''); counts[e.name] = (counts[e.name] || 0) + 1; });
  const seen: Record<string, number> = {};
  out.forEach(e => {
    if (counts[e.name] > 1) { seen[e.name] = (seen[e.name] || 0) + 1; e.name += ' ' + String.fromCharCode(64 + seen[e.name]); }
    if (e.boss) e.name += e.gatekeeper ? (floors >= LAB_FLOORS ? ' (Heart of the Labyrinth)' : ' (Gatekeeper)') : dg.kind === 'rift' ? ' (Rift Lord)' : ' (Boss)';
  });
  return out;
}

function rollShop(dg: Dungeon) {
  const tier = TIER(dg.lvl || 1), stock = [];
  for (let i = 0; i < 4; i++) {
    const rr = rollRarity(tier, 10), def = pickItem(rr.r, tier);
    stock.push(Object.assign(lootLine(def, 'Kecleon Shop', ''), { price: Math.max(30, def.v || 100), sold: false }));
  }
  return stock;
}

export function enterRoom(k: string) {
  const dg = G().dungeon, c = dg.map?.cells[k];
  if (!dg.map || !c) return;
  dg.map.pos = k;
  if (c.v) return;
  c.v = true;
  if (['enemy', 'house', 'boss'].includes(c.t)) c.ev = { enemies: rollEncounter(dg, c.t) };
  else if (c.t === 'trap') c.ev = { trap: roll(TRAPS.length) - 1 };
  else if (c.t === 'shop') c.ev = { stock: rollShop(dg) };
  else if (c.t === 'empty') { c.ev = { flavor: FLAVOR[roll(FLAVOR.length) - 1] }; c.done = true; }
  const msg = ({
    enemy: 'Wild Pokémon appear!', house: "It's a Monster House!", boss: 'The boss of the dungeon blocks the way!', treasure: 'The team found a treasure chest.',
    trap: `Click! The team stepped on a ${TRAPS[c.ev?.trap || 0].n}.`, shop: 'A Kecleon Shop!', rest: 'The team found a Wonder Spring.', stairs: 'The team found the stairs down.',
  } as Record<string, string>)[c.t];
  if (msg) addLog(`${dg.name}, floor ${dg.floor}: ${msg}`);
}

export function nextFloor() {
  const dg = G().dungeon;
  if ((dg.floor || 1) >= (dg.floors || 1)) return;
  dg.floor = (dg.floor || 1) + 1;
  if (dg.kind === 'labyrinth') dg.lvl = labLvl(dg.floor);
  dg.map = genFloor(dg);
  floorAnnounce(dg);
  addLog(`The team went down to floor ${dg.floor} of ${dg.name}.`);
}

export function floorAnnounce(dg: Dungeon) {
  const floor = dg.floor || 1, floors = dg.floors || 1;
  if (dg.kind === 'labyrinth') {
    if (floor >= floors) {
      announce(floor >= LAB_FLOORS ? 'THE HEART OF THE LABYRINTH' : `FLOOR ${floor} · GATEKEEPER`,
        floor >= LAB_FLOORS ? 'The air stops moving. Something ancient and furious waits at the bottom of the world.'
          : `A Shadow ${dg.gatekeeper || 'guardian'} guards the way to ${LAYERS[dg.to ?? -1] ? LAYERS[dg.to!].n : 'the next layer'}. There is no going around it.`, 'red');
    } else announce(`FLOOR ${floor}`, `The Labyrinth shifts around you. Wild Pokémon here are around level ${dg.lvl}.`, 'blue');
  } else if (dg.kind === 'rift' && floor > 1) {
    announce(`RIFT DEPTH ${floor}`, floor >= floors ? 'The Rift Lord is close. You can feel it breathing.' : 'The Rift pulls you deeper.', 'red');
  }
}

export function leaveDungeon(msg: string) {
  const s = G();
  s.dungeon = { state: 'idle', name: '' };
  s.chars.forEach(x => { x.inDungeon = false; });
  addLog(msg);
}

/* ---------- Overworld ---------- */
export interface WorldNode { id: string; kind: 'waystone' | 'haven' | 'wild' | 'rift' | 'stairs'; t?: string | null; n: string; d: string; pos: [number, number] }
export function layerNodes(k: number): WorldNode[] {
  const L = LAYERS[k], out: WorldNode[] = [];
  out.push({ id: k + ':waystone', kind: 'waystone', n: k ? `${L.n} Waystone` : 'Waystone of Beginnings', d: 'An ancient ring of stone humming with Unown script. Touch it to teleport to any Waystone you have reached.', pos: NODE_POS.waystone });
  L.havens.forEach((h, i) => out.push({ id: `${k}:h-${h.k}`, kind: 'haven', t: h.t, n: h.n, d: h.d, pos: NODE_POS['h' + i] }));
  L.wilds.forEach((x, i) => out.push({ id: `${k}:w-${x.k}`, kind: 'wild', n: x.n, d: x.d, pos: L.wilds.length === 1 ? [500, 430] : NODE_POS['w' + i] }));
  L.rifts.forEach((x, i) => out.push({ id: `${k}:r-${x.k}`, kind: 'rift', n: x.n, d: x.d, pos: NODE_POS['r' + i] }));
  if (k < LAYERS.length - 1) {
    out.push({ id: k + ':stairs', kind: 'stairs', n: k ? `Descent to Floor ${5 * k + 1}` : 'The Labyrinth Gate',
      d: k ? `The Labyrinth continues below. Floors ${5 * k + 1} to ${5 * k + 5}, with a Gatekeeper on floor ${5 * k + 5}.` : 'A spiral staircase carved by something that was not human, leading down into the dark.',
      pos: NODE_POS.stairs });
  }
  return out;
}
export const nodeById = (id: string) => { const k = +String(id).split(':')[0]; return LAYERS[k] ? layerNodes(k).find(n => n.id === id) || null : null; };
export function announce(title: string, sub: string, tone?: string) { G().world.announce = { id: uid(), title, sub, tone: tone || 'blue' }; }

export function arriveLayer(k: number, why?: string) {
  const w = G().world;
  w.layer = k; w.at = k + ':waystone'; w.votes = {};
  if (!w.unlocked.includes(k)) w.unlocked.push(k);
  Object.keys(w.rifts).forEach(id => { if (id.startsWith(k + ':')) delete w.rifts[id]; });
  announce(k ? `LAYER ${k} · ${LAYERS[k].n.toUpperCase()}` : 'THE SURFACE · LUMEN REST', LAYERS[k].intro, 'blue');
  addLog(why || `The team arrived at ${LAYERS[k].n}.`);
}

/** A layer's wild areas and Red Rifts close for good once the team clears the Labyrinth section below it. */
export const layerClosed = (k: number) => k < LAYERS.length - 1 && (G().world.deepest || 0) >= 5 * k + 5;

export function rollHavenShop(k: number, t: string | null | undefined, markup?: number) {
  const tier = TIER(layerLvl(k)), out: ReturnType<typeof lootLine>[] = [], seen = new Set<string>();
  const add = (def: (typeof ITEM_BY_ID)[string] | undefined, special?: boolean) => {
    if (!def || seen.has(def.n)) return;
    seen.add(def.n);
    out.push(Object.assign(lootLine(def, 'Shop', ''), { price: Math.max(30, Math.round((def.v || 100) * (markup || 1) * (0.9 + roll(5) * 0.04))), sold: false, special: !!special }));
  };
  const theme = (THEME[t || ''] || THEME.normal).map(id => ITEM_BY_ID[id]).filter(Boolean);
  for (let i = 0; i < 3 && theme.length; i++) add(theme[roll(theme.length) - 1]);
  add(ITEM_BY_ID.oran);
  add(ITEM_BY_ID.potion);
  for (let i = 0; i < 3; i++) { const rr = rollRarity(tier, 5); add(pickItem(rr.r, tier)); }
  if (roll(100) <= 15) { const rr = rollRarity(tier, 40); add(pickItem(rr.r === 'c' ? 'r' : rr.r, tier), true); }
  return out;
}

/** Shops the DM can open anywhere, when the players go looking for one. `cats` are item categories; null is a bit of everything. */
export const SHOP_KINDS: Record<string, { n: string; cats: string[] | null }> = {
  travel: { n: 'Traveling merchant', cats: null }, general: { n: 'General store', cats: ['berry', 'med', 'seed', 'gear'] },
  berry: { n: 'Berry stand', cats: ['berry'] }, med: { n: 'Potion shop', cats: ['med'] }, seed: { n: 'Seed and orb seller', cats: ['seed', 'orb'] },
  weapon: { n: 'Weaponsmith', cats: ['weapon'] }, armor: { n: 'Armorer', cats: ['armor'] }, held: { n: 'Held item shop', cats: ['held'] },
  evo: { n: 'Evolution stone dealer', cats: ['evo'] }, gear: { n: 'Explorer outfitter', cats: ['gear'] },
  material: { n: 'Material and treasure trader', cats: ['treasure', 'gummi', 'shadow'] }, tm: { n: 'TM seller', cats: ['tm'] },
};
const shopLine = (def: (typeof ITEMS)[number], markup = 1) =>
  Object.assign(lootLine(def, 'Shop', ''), { price: Math.max(30, Math.round((def.v || 100) * markup * (0.9 + roll(5) * 0.04))), sold: false });
/** Stock for one of the DM's shops: up to 8 items of its kind, none rarer than the layer allows. */
export function rollDmShop(kind: string, k: number) {
  const cats = SHOP_KINDS[kind]?.cats, tier = TIER(layerLvl(k));
  if (!cats) return rollHavenShop(k, null, 1.2);
  if (cats.includes('tm')) {
    const seen = new Set<string>(), out: ReturnType<typeof shopLine>[] = [];
    for (let i = 0; i < 30 && out.length < 6; i++) { const tm = randomTM(tier); if (tm && !seen.has(tm.n)) { seen.add(tm.n); out.push(shopLine(tm)); } }
    return out;
  }
  return ITEMS.filter(i => cats.includes(i.cat) && 'curvl'.indexOf(i.r) <= tier + 1).sort(() => Math.random() - 0.5).slice(0, 8).map(d => shopLine(d));
}
/** Set a shop's discount (0 to 100%), always from each item's first price, so changing it twice doesn't stack. */
export function setShopOff(sh: { stock: LootLine[]; off?: number }, off: number) {
  sh.off = Math.max(0, Math.min(100, Math.round(off) || 0));
  sh.stock.forEach(l => { if (l.sold) return; l.base ??= l.price || 0; l.price = Math.round(l.base * (100 - sh.off!) / 100); });
}

export function prepRun(cfg: Partial<Dungeon> & { name: string }) {
  const s = G();
  s.dungeon = Object.assign({ state: 'prep' as const, floor: 0, map: null, cleared: false, extra: '' }, cfg);
  s.chars.forEach(x => { x.inDungeon = false; });
  addLog(`${me()?.name} called the team to ${cfg.name}. Lock in your moves!`);
}

export function finishRun(g: Dungeon) {
  const w = G().world;
  if (g.kind === 'labyrinth' && g.to != null) {
    const first = (g.floors || 0) > (w.deepest || 0);
    w.deepest = Math.max(w.deepest || 0, g.floors || 0);
    arriveLayer(g.to, `The team beat the Gatekeeper of floor ${g.floors} and stepped out into ${LAYERS[g.to].n}!`);
    if (first) addLog(`The wild areas and Red Rifts of ${LAYERS[g.to - 1].n} have closed for good.`);
    if (first && w.announce) {
      w.announce.sub += ` BLESSING: every Pokémon on the team gains +1 level and +1 skill point. The level cap rises to ${levelCap()}.`;
      w.announce.tone = 'gold';
      blessTeam(g.to);
    }
  } else if (g.kind === 'rift' && g.node) {
    w.rifts[g.node] = 'cleared';
    addLoot(rollChest(Math.min(20, (g.lvl || 1) + 2), true, 'Rift treasure'));
    announce('RIFT SEALED', `${g.name} collapses behind you. Its treasure is yours.`, 'gold');
  }
}

/** Roll what the team finds in a wild area. The DM can pass `force` (a d20 result) to choose it instead. */
export function exploreWild(k: number, node: WorldNode, force?: number): AreaEv {
  const lvl = layerLvl(k), tier = TIER(lvl), r = force || roll(20);
  if (r <= 8) {
    // Overworld fights are high risk, high reward: tougher foes, 1.5× XP and better loot.
    const enemies = rollEncounter({ state: 'in', name: node.n, lvl: Math.min(20, lvl + 1), types: LAYERS[k].types, floor: 1, kind: 'wild', extra: '' }, 'enemy');
    enemies.forEach(e => { e.overworld = true; });
    return { kind: 'battle', roll: r, text: 'Wild Pokémon burst out of hiding!', enemies };
  }
  if (r <= 12) {
    const rr = rollRarity(tier, 0), def = pickItem(rr.r, tier);
    return { kind: 'forage', roll: r, text: `The team searched the area and found ${def.n}.`, item: lootLine(def, node.n, `Foraging, ${RAR[def.r]}`) };
  }
  if (r <= 14) return { kind: 'merchant', roll: r, text: 'A wandering Kecleon sets up a stall on the path. Prices are a little high out here.', stock: rollHavenShop(k, null, 1.2).slice(0, 4) };
  if (r <= 16 || (r <= 18 && !G().world.sparDone && !force)) return { kind: 'rescue', roll: r, text: RESCUES[roll(RESCUES.length) - 1], xp: 20 * lvl, poke: 40 * lvl };
  if (r <= 18) {
    // After the graduation spar, Team Razorwind turns up on the road: one or two rivals looking for a rematch.
    const rivals = CAST.filter(c => c.team === 'rivals').sort(() => Math.random() - 0.5).slice(0, roll(2));
    const enemies = buildRivals(rivals.map(c => c.id));
    enemies.forEach(e => { e.overworld = true; });
    const names = rivals.map(c => c.name).join(' and ');
    return { kind: 'battle', roll: r, text: `${names} of Team Razorwind block${rivals.length > 1 ? '' : 's'} the path. "Fancy seeing you out here, graduates. Round two?"`, enemies };
  }
  return { kind: 'treasure', roll: r, text: 'A half-buried treasure chest glints in the dirt.' };
}

export { lootTeam };
