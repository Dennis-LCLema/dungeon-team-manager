/* Character rules: stats, HP, levels, XP, evolution, items and loot. Functions that change state
   must run inside update(); they read and write through G(). */
import { T, roll, rollDice, slug, toID, uid, fmt, money } from '../lib/util';
import { CHART, DIFF, ITEMS, ITEM_BY_ID, ITEM_BY_NAME, LAYERS, RAR, type ItemDef } from './data';
import { LVL_RATIO, dex, dexReady, evoLine, getEvos, getMove, getPokemonAny, type MegaForm } from './dex';
import { G, addLog, me, setUi, toast } from './store';
import type { BagItem, Char, EvoTarget, Fighter, LootLine, Mon, Move, MoveClass, StatKey, Tree } from './types';
import { BT, blog, knockout } from './battle';
import { leaveDungeon, partyChars } from './explore';

export const MAX_LEVEL = 20;
export const MEGA_LEVEL = 10;

/* ---------- Moves ---------- */
export function diceFor(power: number | null, cls: MoveClass) {
  if (cls === 'status') return '';
  const p = power || 60;
  if (p <= 40) return '1d8'; if (p <= 60) return '2d6'; if (p <= 80) return '2d8';
  if (p <= 100) return '3d8'; if (p <= 120) return '4d8'; return '5d8';
}
export function ppFor(pp: number | null, power: number | null) {
  if (pp == null) return 3;
  if (pp >= 25 && (power || 0) <= 60) return null;
  if (pp >= 20) return 6; if (pp >= 15) return 5; if (pp >= 10) return 3; return 1;
}
export function toTableMove(m: Omit<Move, 'dice' | 'ppMax' | 'ppCur'>): Move {
  const ppMax = ppFor(m.gamePP, m.power);
  return { ...m, ppMax, ppCur: ppMax as number, dice: diceFor(m.power, m.cls) };
}
export function customMove(name: string, type: string, cls: MoveClass, dice: string, ppMax: number | null, desc?: string): Move {
  return { name: slug(name), type, cls, power: null, gamePP: null, desc: desc || 'Custom move.', dice: cls === 'status' ? '' : dice, ppMax, ppCur: ppMax as number, custom: true };
}
export const SHADOW_RUSH = () => customMove('shadow-rush', 'shadow', 'physical', '1d8', null, 'Shadow move. Deals 1.5× damage to every non-Shadow Pokémon.');

/* ---------- Stats ---------- */
export const megaForms = (c: Fighter | null | undefined): MegaForm[] => (dexReady() && c && c.kind !== 'enemy' && dex().mg?.[toID(c.species)]) || [];
export const megaOf = (c: Fighter | null | undefined) => (c && c.megaOn != null ? megaForms(c)[c.megaOn] || null : null);
export const fmtMega = (n: string) => n.replace(/(.+)-Mega(.*)/, 'Mega $1$2').replace(/-/g, ' ');
/** Mega forms for this Pokémon, or for later forms in its line. Null when the line has no Mega. */
export function canMegaInfo(c: Char) {
  if (!dexReady() || c.custom) return null;
  const forms = megaForms(c), lineMega = evoLine(toID(c.species)).filter(st => dex().mg?.[st.id]);
  return forms.length || lineMega.length ? { forms, lineMega } : null;
}
export function megaBase(c: Fighter) {
  const m = megaOf(c);
  if (!m) return null;
  const [hp, atk, def, spa, spd, spe] = m[2];
  return { hp, atk, def, spa, spd, spe };
}
export function score(c: Mon, k: StatKey | 'heart') {
  const b = (c.bonus?.[k] || 0) + (heldFx(c).stat?.[k] || 0);
  if (k === 'heart') return (c.heart || 10) + b;
  const base = megaBase(c as Fighter) || c.base;
  return Math.min(20, Math.max(4, Math.round(6 + ((base && base[k]) || 50) / 12))) + b;
}
export const mod = (s: number) => Math.floor((s - 10) / 2);
export const M = (c: Mon, k: StatKey | 'heart') => mod(score(c, k));
export const prof = (l: number) => 2 + Math.floor((Math.max(1, l) - 1) / 4);
export const hitDie = (c: Mon) => { const h = c.base?.hp || 50; return h <= 50 ? 6 : h <= 80 ? 8 : h <= 110 ? 10 : 12; };
// Heroes get a +10 HP cushion, a bigger share of their base HP, and +1 HP per level, so a level 1 Pokémon survives 3 or 4 hits.
const HERO_BONUS = 10;
export const maxHP = (c: Mon) => {
  const hd = hitDie(c), con = M(c, 'def'), base = c.base?.hp || 50, hero = c.kind !== 'enemy';
  return Math.max(1, hd + con + Math.floor(base / (hero ? 5 : 10)) + (hero ? HERO_BONUS : 0) + (c.level - 1) * Math.max(1, hd / 2 + 1 + con + (hero ? 1 : 0)));
};
export const diff = () => DIFF[G().rules?.difficulty] || DIFF.normal;
export const hpMaxOf = (x: Fighter) => (x.kind === 'enemy' ? x.hpMax : maxHP(x));
export const mastery = (l: number) => (l >= 15 ? 4 : l >= 10 ? 3 : l >= 5 ? 2 : 1);
/** Active ability slug: an approved homebrew replaces the preset one (and has no automatic effect). */
export const abilityOf = (x: Fighter | Mon) => {
  if (x.kind === 'enemy') return '';
  const c = x as Char;
  return c.homebrew?.state === 'approved' ? 'homebrew' : c.ability || c.abilities?.[0] || '';
};
export const AC = (c: Mon) => 11 + M(c, 'def') + (abilityOf(c) === 'heavy-metal' ? 2 : 0) + (armorFx(c).guard || 0);
export const SAC = (c: Mon) => 11 + M(c, 'spd') + (armorFx(c).spguard || 0);
export const typesOf = (c: Fighter | Mon) => {
  const m = megaOf(c as Fighter);
  return [...new Set([...(m ? m[1] : c.types || []), c.awakenedType].filter(Boolean) as string[])];
};
export const gameLvl = (l: number) => l * LVL_RATIO;
export const appLvl = (g: number) => Math.max(1, Math.ceil(g / LVL_RATIO));
export const defaultEvoLevel = (ev: { targets: EvoTarget[] }) => {
  const lv = (ev.targets || []).map(t => t.minLevel).filter(Boolean) as number[];
  return lv.length ? Math.min(MAX_LEVEL, appLvl(Math.min(...lv))) : null;
};
export const nameOf = (x: Fighter) => (x.kind === 'enemy' ? x.name : (x.megaOn != null ? 'Mega ' : '') + (x.nickname || T(x.species)));
export const equippedOf = (c: Char) => c.equipped.map(n => c.moves.find(m => m.name === n)).filter(Boolean) as Move[];
export function effectiveness(moveType: string, target: Fighter) {
  if (moveType === 'shadow') return target.kind === 'enemy' && target.shadow ? 0.5 : 1.5;
  let m = 1;
  typesOf(target).forEach(t => { const v = CHART[moveType]?.[t]; if (v != null) m *= v; });
  return m === 0 ? 0 : m > 1 ? 2 : m < 1 ? 0.5 : 1;
}
export const spentPoints = (c: Char) => (['ability', 'special', 'physical'] as const).reduce((s, b) => s + c.tree[b].nodes.filter(n => n.on).length, 0);
export const clampHP = (c: Char) => { c.hpCur = Math.max(0, Math.min(maxHP(c), c.hpCur)); };
export const fresh = (c: Char) => G().chars.find(x => x.id === c.id) || c;
export function matchups(types: string[]) {
  const out: Record<string, number> = {};
  Object.keys(CHART).forEach(atk => {
    let m = 1;
    types.forEach(t => { const v = CHART[atk]?.[t]; if (v != null) m *= v; });
    if (m !== 1) out[atk] = m;
  });
  return out;
}

/* ---------- Skill tree ---------- */
export function defaultTree(c: Pick<Char, 'abilities'>): Tree {
  const ab = T(c.abilities?.[0] || 'ability');
  const n = (name: string, desc: string) => ({ name, desc, on: false });
  return {
    ability: { label: 'Ability: ' + ab, nodes: [
      n('Awaken ' + ab, 'Your ability triggers more easily (DM sets the trigger).'),
      n(ab + ' II', 'Your ability gets a stronger effect once per short rest.'),
      n('Signature Trick', 'Create one new use for your ability with your DM.'),
      n(ab + ' III', 'Your ability also helps one ally within 15 ft.'),
      n(ab + ' Mastery', 'Once per long rest, your ability is always on for 1 minute.'),
      n('Resilience I', '+1 to all saving throws.'),
      n(ab + ' IV', 'Use your Signature Trick twice per long rest.'),
      n('Resilience II', '+1 Guard and +1 Sp. Guard.'),
      n(ab + ' V', 'Your ability II effect works once per short rest and once more per long rest.'),
      n(ab + ' Legend', 'Once per battle, your ability helps the whole team for 1 round.'),
    ] },
    special: { label: 'Special Power', nodes: [
      n('Focused Power', '+1 damage die on one special move each turn.'),
      n('Wide Blast', 'Pick one special move. It can hit a 15 ft cone instead.'),
      n('Charged Shot', '+2 to special attack rolls.'),
      n('Overcharge', 'Once per rest, double the damage of one special move.'),
      n('Special Mastery', 'Special moves crit on 19 or 20.'),
      n('Special Edge I', '+1 to special move damage.'),
      n('Deep Reserves', '+1 PP on every special move with PP.'),
      n('Special Edge II', '+1 more to special move damage.'),
      n('Piercing Power', 'Special moves treat not very effective hits as normal damage.'),
      n('Special Legend', 'Once per battle, one special move hits every foe.'),
    ] },
    physical: { label: 'Physical Might', nodes: [
      n('Power Strike', '+1 damage die on one physical move each turn.'),
      n('Quick Footwork', '+10 ft speed. No opportunity attacks after a physical move.'),
      n('Brute Force', '+2 to physical attack rolls.'),
      n('Relentless', 'Once per rest, use a second physical move as a bonus action.'),
      n('Physical Mastery', 'Physical moves crit on 19 or 20.'),
      n('Physical Edge I', '+1 to physical move damage.'),
      n('Toughness', '+1 max HP per level (DM adds it as a Defense bonus if needed).'),
      n('Physical Edge II', '+1 more to physical move damage.'),
      n('Unstoppable', 'Physical moves treat not very effective hits as normal damage.'),
      n('Physical Legend', 'Once per battle, one physical move hits every foe.'),
    ] },
  };
}

/** One-time data upgrades from older saves. Call inside update(). */
export function migrateChars() {
  G().chars.forEach(c => {
    if (c.tree) {
      const full = defaultTree(c);
      (['ability', 'special', 'physical'] as const).forEach(b => {
        const nodes = c.tree[b]?.nodes;
        if (nodes && nodes.length < full[b].nodes.length) nodes.push(...full[b].nodes.slice(nodes.length));
      });
    }
    if (c.hpv !== 2) {
      const hd = hitDie(c), con = M(c, 'def');
      const old = Math.max(1, hd + con + Math.floor((c.base?.hp || 50) / 10) + (c.level - 1) * Math.max(1, hd / 2 + 1 + con)), n = maxHP(c);
      c.hpCur = c.hpCur >= old ? n : Math.min(n, Math.max(c.hpCur > 0 ? 1 : 0, Math.round((c.hpCur / old) * n)));
      c.hpv = 2;
    }
  });
}
export const needsMigration = (chars: Char[]) =>
  chars.some(c => c.hpv !== 2 || (c.tree && (['ability', 'special', 'physical'] as const).some(b => (c.tree[b]?.nodes?.length ?? 10) < 10)));

/* ---------- Creating and growing characters ---------- */
export function createChar(species: string, nick: string, player: string, level: number): Char {
  const p = getPokemonAny(species), ev = getEvos(p.species);
  const c: Char = {
    id: uid(), species: p.species, form: p.name, nickname: nick, player, level, types: p.types, awakenedType: '',
    base: p.stats, abilities: p.abilities, levelMoves: p.levelMoves, evo: ev, evoLevel: defaultEvoLevel(ev),
    evoChoice: ev.targets[0]?.name || '', bonus: {}, heart: 10, moves: [], equipped: [], items: [], assists: [],
    notes: '', history: [], inDungeon: false, hpCur: 0, img: '', hpv: 2, xp: 0, createdAt: Date.now(), tree: undefined as unknown as Tree,
  };
  c.tree = defaultTree(c);
  c.hpCur = maxHP(c);
  for (const lm of p.levelMoves.filter(m => m.level <= gameLvl(level)).slice(-4)) {
    try { const mv = toTableMove(getMove(lm.name)); c.moves.push(mv); c.equipped.push(mv.name); } catch { /* move missing from dex */ }
  }
  return c;
}
export function createManual(name: string, nick: string, player: string, level: number): Char {
  const c: Char = {
    id: uid(), species: slug(name || 'mystery'), form: '', nickname: nick, player, level, types: ['normal'], awakenedType: '',
    base: { hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, abilities: ['custom-ability'], levelMoves: [], evo: { stage: 1, targets: [] },
    evoLevel: null, evoChoice: '', bonus: {}, heart: 10, moves: [], equipped: [], items: [], assists: [], notes: '', history: [],
    inDungeon: false, hpCur: 0, img: '', custom: true, hpv: 2, createdAt: Date.now(), tree: undefined as unknown as Tree,
  };
  c.tree = defaultTree(c);
  c.hpCur = maxHP(c);
  return c;
}

export function changeLevel(c: Char, d: number) {
  const old = c.level, oldMax = maxHP(c);
  c.level = Math.max(1, Math.min(MAX_LEVEL, c.level + d));
  if (c.level === old) return;
  const newMax = maxHP(c);
  c.hpCur = Math.max(0, Math.min(newMax, c.hpCur + Math.max(0, newMax - oldMax)));
  if (d > 0) {
    const newly = c.levelMoves.filter(m => m.level > gameLvl(old) && m.level <= gameLvl(c.level) && !c.moves.some(x => x.name === m.name));
    addLog(`${nameOf(c)} reached level ${c.level}.`);
    toast(`${nameOf(c)} reached level ${c.level}! +1 skill point.`);
    if (newly.length) toast('Can now learn: ' + newly.map(m => T(m.name)).join(', '));
    if (mastery(c.level) > mastery(old)) toast(`Type Mastery rank ${mastery(c.level)} unlocked!`);
    const ready = c.evoLevel && c.level >= c.evoLevel && c.evo.targets.length;
    if (ready && heldFx(c).noEvo) toast(`${nameOf(c)}'s Everstone stopped it from evolving.`);
    else if (ready) evolve(c, c.evoChoice || c.evo.targets[0].name);
  }
}

export function evolve(c: Char, target: string) {
  try {
    const p = getPokemonAny(target), ev = getEvos(p.species);
    const ratio = c.hpCur / maxHP(c), from = T(c.species);
    c.species = p.species; c.form = p.name; c.types = p.types; c.base = p.stats; c.abilities = p.abilities;
    c.levelMoves = p.levelMoves; c.evo = ev; c.evoLevel = defaultEvoLevel(ev); c.evoChoice = ev.targets[0]?.name || '';
    if (c.evoLevel && c.evoLevel <= c.level) c.evoLevel = c.level + 1;
    c.custom = false;
    c.hpCur = Math.max(1, Math.round(ratio * maxHP(c)));
    c.history.push({ from, to: T(p.species), level: c.level });
    addLog(`${c.nickname || from} evolved into ${T(p.species)}!`);
    setUi({ evo: { from, to: T(p.species), name: c.nickname, types: [...c.types], img: c.img } });
  } catch (e: any) {
    toast('Evolution failed: ' + e.message, 'bad');
  }
}

/* XP: Exp. Share is always on. Every team member still standing when a battle is won gets XP for each defeated foe.
   The one who landed the finishing blow on a foe gets 15% more for that foe. Fainted members get none for that battle. */
export const xpNeed = (l: number) => 250 * l;
export const XP_FINISH = 1.15;
const bstOf = (x: Mon) => Object.values(x.base || {}).reduce((a, v) => a + (+v || 0), 0) || 300;
export const enemyXP = (e: import('./types').Enemy) =>
  Math.max(1, Math.round((bstOf(e) * e.level) / 30 * (e.shadow ? 1.5 : 1) * (e.boss ? 3 : 1) * (e.minion ? 0.5 : 1) * (e.rift || e.overworld ? 1.5 : 1) * (e.gatekeeper ? 1.5 : 1) * (/Purified/.test(e.outReason || '') ? 1.2 : 1)));
// Level cap: 4 before the first Gatekeeper, +2 for each Gatekeeper beaten (20 after floor 40).
export const levelCap = () => Math.min(MAX_LEVEL, 4 + 2 * Math.floor((G().world?.deepest || 0) / 5));
export const pointsOf = (c: Char) => c.level + (c.blessings || 0) - spentPoints(c);

export function blessTeam(layer: number) {
  const cap = levelCap(), team = lootTeam(), L = LAYERS[layer];
  team.forEach(x => { x.blessings = (x.blessings || 0) + 1; });
  addLog(`Blessing of ${L?.n}: every team member gains +1 level and +1 skill point. The level cap is now ${cap}.`);
  for (const c of team) if (c.level < cap) changeLevel(c, 1);
  processLevelUps();
}
export function processLevelUps() {
  const s = G();
  for (let guard = 0; guard < 60; guard++) {
    const c = s.chars.find(x => x.level < levelCap() && (x.xp || 0) >= xpNeed(x.level));
    if (!c) break;
    c.xp = (c.xp || 0) - xpNeed(c.level);
    changeLevel(c, 1);
  }
  s.chars.forEach(x => { if (x.level >= levelCap() && (x.xp || 0) > xpNeed(x.level)) x.xp = xpNeed(x.level); });
}

export function longRest(c: Char) {
  c.hpCur = maxHP(c);
  c.moves.forEach(m => { if (m.ppMax != null) m.ppCur = m.ppMax; });
  c.assists.forEach(a => { a.used = false; });
  c.sashUsed = false;
  c.status = null;
  if (heldFx(c).friend) {
    c.friend = (c.friend || 0) + 1;
    if (c.friend === 3 && (c.evo.targets || []).some(t => /friendship/i.test(t.how))) addLog(`${nameOf(c)} trusts the team completely. It can evolve by friendship now!`);
  }
}
export const shortRestHeal = (c: Char) => Math.max(1, Math.floor(hitDie(c) / 2) + 1 + M(c, 'def'));

export function rollMoveOutside(c: Char, mv: Move) {
  if (mv.ppMax != null) {
    if (mv.ppCur <= 0) return toast(`${T(mv.name)} is out of PP. Take a long rest to restore it.`, 'bad');
    mv.ppCur--;
  }
  const who = nameOf(c);
  let text: string;
  if (mv.cls === 'status' || !mv.dice) {
    text = `${who} used ${T(mv.name)}. Save DC ${8 + prof(c.level) + M(c, 'spa')}.`;
  } else {
    const key = mv.cls === 'physical' ? 'atk' : 'spa', bonus = prof(c.level) + M(c, key) + weaponHit(c, mv), d20 = roll(20), crit = d20 >= critOn(c);
    const stab = typesOf(c).includes(mv.type);
    const dmg = Math.max(1, rollDice(mv.dice, crit) + M(c, key) + (stab ? prof(c.level) : 0) + heldDmg(c, mv));
    text = `${who} used ${T(mv.name)}: ${d20 + bonus} to hit (rolled ${d20}${fmt(bonus)})${crit ? ', critical hit' : ''}, ${dmg} ${mv.type} damage.`;
  }
  if (mv.ppMax != null) text += ` ${mv.ppCur}/${mv.ppMax} PP left.`;
  addLog(text);
  toast(text);
}

/* ---------- Items ---------- */
export const rarName = (r: string) => RAR[r];
export function tmDef(id: string, name?: string): ItemDef {
  const m = dexReady() ? dex().m[id] : null;
  if (!m) return { id: 'tm', n: name || 'TM', cat: 'tm', r: 'u', v: 500, d: 'Teaches a move.', fx: { tm: id } };
  return { id: 'tm', n: 'TM ' + m[0], cat: 'tm', r: 'u', v: 500, d: `Use: learn ${m[0]} (${T(m[1])}, ${m[2]}${m[3] ? ', power ' + m[3] : ''}).`, fx: { tm: id } };
}
export function defOf(it: { itemId?: string; tm?: string; name?: string } | null | undefined): ItemDef | null {
  if (!it) return null;
  if (it.itemId === 'tm' || it.tm) return tmDef(it.tm || '', it.name);
  return ITEM_BY_ID[it.itemId || ''] || ITEM_BY_NAME[String(it.name || '').toLowerCase()] || null;
}
export function defByName(n0: string): ItemDef | null {
  const n = String(n0 || '').trim();
  if (!n) return null;
  if (ITEM_BY_NAME[n.toLowerCase()]) return ITEM_BY_NAME[n.toLowerCase()];
  const tm = /^tm\s+(.+)$/i.exec(n);
  if (tm && dexReady() && dex().m[toID(tm[1])]) return tmDef(toID(tm[1]));
  return null;
}
export const looseDef = (it: BagItem): ItemDef => defOf(it) || { n: it.name, id: '', cat: 'gear', r: '', v: 0, d: it.note || '', fx: {} };
export function addItemTo(arr: BagItem[], def: Pick<ItemDef, 'n' | 'id' | 'fx'>, qty: number, note?: string) {
  const ex = arr.find(x => x.name.toLowerCase() === def.n.toLowerCase());
  if (ex) ex.qty += qty;
  else arr.push({ name: def.n, qty, note: note || '', itemId: def.id || '', tm: def.fx?.tm || '' });
}
export function takeOne(arr: BagItem[], name: string) {
  const x = arr.find(y => y.name === name);
  if (!x) return;
  x.qty -= 1;
  if (x.qty <= 0) arr.splice(arr.indexOf(x), 1);
}
export const heldFx = (x: Mon | null | undefined) => (x && x.held ? defOf(x.held)?.fx || {} : {});
export const critOn = (x: Mon) => heldFx(x).crit || 20;
export const armorFx = (x: Mon | null | undefined) => (x && x.armor ? defOf(x.armor)?.fx || {} : {});
/** The weapon's effect, if it works with this move's class. */
const weaponFor = (x: Mon, mv: Move) => { const f = x.weapon ? defOf(x.weapon)?.fx || {} : {}; return !f.wCls || f.wCls === mv.cls ? f : {}; };
export const weaponHit = (x: Mon, mv: Move) => weaponFor(x, mv).wHit || 0;
export const heldDmg = (x: Mon, mv: Move) => {
  const f = heldFx(x), w = weaponFor(x, mv);
  return (f.typeDmg && f.typeDmg === mv.type ? 2 : 0) + (f.lifeOrb ? roll(6) : 0) + (w.wDmg || 0) + (w.wDie ? rollDice(w.wDie) : 0);
};
/** Which slot an item goes in when equipped, or null if it is used up instead. */
export const slotOf = (def: { cat: string } | null | undefined) => (def && ['held', 'weapon', 'armor'].includes(def.cat) ? def.cat as 'held' | 'weapon' | 'armor' : null);

export function tryReviver(t: Fighter) {
  const items = t.items || [];
  const i = items.findIndex(it => defOf(it)?.fx.autoRevive);
  if (i < 0) return false;
  const it = items[i];
  it.qty -= 1;
  if (it.qty <= 0) items.splice(i, 1);
  t.hpCur = maxHP(t);
  const msg = `${nameOf(t)} fainted, but its Reviver Seed brought it back to full HP!`;
  if (BT()) blog(msg);
  addLog(msg);
  return true;
}
const ppMissing = (c: Char) => equippedOf(c).reduce((s, m) => s + (m.ppMax != null ? m.ppMax - m.ppCur : 0), 0);
const countItem = (c: Char, def: ItemDef) => (c.items || []).filter(x => x.name.toLowerCase() === def.n.toLowerCase()).reduce((s, x) => s + x.qty, 0);
export function evoTargetFor(c: Char, def: ItemDef) {
  const fx = def.fx || {};
  return (c.evo?.targets || []).find(t => (fx.evo && String(t.how).toLowerCase().includes(fx.evo.toLowerCase())) || (fx.evoTrade && /^trade/i.test(t.how)));
}
export const lootTeam = () => { const p = G().chars.filter(c => c.player); return p.length ? p : G().chars; };
export const avgLevel = () => { const p = lootTeam(); return p.length ? Math.max(1, Math.round(p.reduce((s, c) => s + c.level, 0) / p.length)) : 1; };
export const usableBag = (c: Char) =>
  (c.items || []).map((it, i) => [it, i] as const).filter(([it]) => { const d0 = defOf(it); return !d0 || (!slotOf(d0) && !d0.fx.autoRevive && !d0.fx.keep); });

// Who should get this item? Returns { to: character id or 'storage', why }.
export function suggestFor(def: ItemDef): { to: string; why: string } {
  const team = lootTeam(), fx = def.fx || {};
  if (!team.length) return { to: 'storage', why: 'Nobody is on the team yet' };
  const best = (fn: (c: Char) => number, why: string | ((c: Char) => string)) => {
    let top: Char | null = null, ts = -Infinity;
    team.forEach(c => { const s = fn(c); if (s > ts) { ts = s; top = c; } });
    const t = top as Char | null;
    return t ? { to: t.id, why: typeof why === 'function' ? why(t) : why } : { to: 'storage', why: 'Team storage' };
  };
  if (fx.evo || fx.evoTrade) {
    const c = team.find(x => evoTargetFor(x, def));
    if (c) return { to: c.id, why: `${nameOf(c)} can evolve with it into ${T(evoTargetFor(c, def)!.name)}` };
    if (!fx.typeDmg) return { to: 'storage', why: 'Nobody on the team evolves with it yet. Keep it or sell it' };
  }
  if (fx.friend) {
    const c = team.find(x => (x.evo?.targets || []).some(t => /friendship/i.test(t.how)));
    if (c) return { to: c.id, why: `${nameOf(c)} evolves through friendship` };
  }
  if (fx.noEvo) return { to: 'storage', why: 'Only useful for someone who wants to stop evolving' };
  if (fx.typeDmg) {
    const c = team.find(x => typesOf(x).includes(fx.typeDmg!) && !x.held) || team.find(x => typesOf(x).includes(fx.typeDmg!));
    if (c) return { to: c.id, why: `${T(fx.typeDmg)} type, so +2 damage on its STAB moves${c.held ? ` (swap out ${c.held.name})` : ''}` };
    return { to: 'storage', why: `No ${T(fx.typeDmg)} type on the team. Sell it or save it` };
  }
  if (fx.tm) {
    const mt = (dexReady() && dex().m[fx.tm]?.[1]) || '';
    const c = team.find(x => typesOf(x).includes(mt));
    if (c) return { to: c.id, why: `The move matches its ${T(mt)} type (STAB)` };
    return { to: 'storage', why: 'No type match on the team. Save it for later' };
  }
  if (fx.stat) {
    const k = Object.keys(fx.stat)[0] as StatKey | 'heart';
    const label = ({ atk: 'Attack', spa: 'Sp. Atk', def: 'Defense', spd: 'Sp. Def', spe: 'Speed', heart: 'Heart', hp: 'HP' } as const)[k];
    return best(c => score(c, k) - (c.held ? 3 : 0), c => `Highest ${label} on the team${c.held ? '' : ", and it isn't holding anything"}`);
  }
  if (def.cat === 'weapon') {
    const k = fx.wCls === 'special' ? 'spa' : fx.wCls === 'physical' ? 'atk' : null;
    return best(c => (k ? score(c, k) : Math.max(score(c, 'atk'), score(c, 'spa'))) - (c.weapon ? 4 : 0), c => `${fx.wCls ? 'Best ' + (k === 'spa' ? 'Sp. Atk' : 'Attack') : 'Hardest hitter'} on the team${c.weapon ? '' : ', with no weapon yet'}`);
  }
  if (def.cat === 'armor') return best(c => -AC(c) - SAC(c) - (c.armor ? 4 : 0), c => `Easiest to hit on the team${c.armor ? '' : ', with no armor yet'}`);
  if (fx.crit || fx.lifeOrb) return best(c => Math.max(score(c, 'atk'), score(c, 'spa')) - (c.held ? 3 : 0), 'Hardest hitter on the team');
  if (fx.init) return best(c => -score(c, 'spe') - (c.held ? 3 : 0), 'Slowest on the team, so it helps it act sooner');
  if (fx.autoRevive) return best(c => -maxHP(c) - countItem(c, def) * 20, 'Lowest max HP, so it needs the safety net most');
  if (fx.regen || fx.sash) return best(c => -maxHP(c) - (c.held ? 3 : 0), 'Lowest max HP, so it needs the safety net most');
  if (fx.heal || fx.revive || fx.teamHeal) return best(c => (1 - c.hpCur / maxHP(c)) * 100 - countItem(c, def) * 15, c => (c.hpCur < maxHP(c) ? `Most hurt right now (${c.hpCur}/${maxHP(c)} HP)` : 'Has the fewest of these in its bag'));
  if (fx.pp) return best(c => ppMissing(c) - countItem(c, def) * 3, c => (ppMissing(c) ? `Has spent the most PP (${ppMissing(c)} used)` : 'Spreads PP items around the team'));
  if (fx.cure) return best(c => -countItem(c, def) * 10 - (c.items || []).length, 'Has the fewest of these in its bag');
  if (fx.heart || fx.purify) return best(c => score(c, 'heart'), 'Best Heart score, your purifier');
  if (fx.levelUp || def.cat === 'gummi') return best(c => -c.level, 'Lowest level, so it helps it catch up');
  if (fx.escape || fx.reveal || fx.revealStairs || fx.revealTraps) return best(c => score(c, 'spe') - (c.items || []).length, 'Fastest, so it can use it before foes act');
  if (fx.throw || fx.save) return best(c => score(c, 'spe') - (c.items || []).length, 'Fastest, good at throwing first');
  if (fx.box) return { to: 'storage', why: 'Open it back in town, or let a player open it' };
  if (def.cat === 'treasure' || def.cat === 'shadow') return { to: 'storage', why: 'Worth selling at a Kecleon Shop' };
  if (def.cat === 'gear') return best(c => -(c.items || []).length, 'Lightest bag on the team');
  return { to: 'storage', why: 'Nobody needs it more than the others' };
}

/* ---------- Loot ---------- */
export const TIER = (lvl: number) => (lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1);
const RARITY_TABLE: Record<number, number[]> = { 1: [70, 95, 100, 101], 2: [50, 85, 98, 100], 3: [30, 70, 92, 99], 4: [15, 50, 82, 96] };
export function rollRarity(tier: number, bump?: number) {
  const d = roll(100), r = Math.min(100, d + (bump || 0)), t = RARITY_TABLE[tier];
  const key = r <= t[0] ? 'c' : r <= t[1] ? 'u' : r <= t[2] ? 'r' : r <= t[3] ? 'v' : 'l';
  return { r: key, roll: d, total: r };
}
function randomTM(tier: number) {
  if (!dexReady()) return null;
  const cap = [0, 70, 90, 110, 150][tier], M0 = dex().m;
  const ids = Object.keys(M0).filter(id => { const m = M0[id]; return m[2] !== 'status' && m[3] >= 40 && m[3] <= cap; });
  return ids.length ? tmDef(ids[roll(ids.length) - 1]) : null;
}
export function pickItem(r: string, tier: number): ItemDef {
  if ((r === 'u' || r === 'r') && roll(100) <= 12) { const tm = randomTM(tier); if (tm) return tm; }
  let pool = ITEMS.filter(i => i.r === r && !i.noDrop);
  if (!pool.length) pool = ITEMS.filter(i => i.r === 'r' && !i.noDrop);
  return pool[roll(pool.length) - 1];
}
export function lootLine(def: ItemDef, src: string, rollTxt: string): LootLine {
  const s = suggestFor(def);
  return { id: uid(), kind: 'item', itemId: def.id, tm: def.fx?.tm || '', name: def.n, r: def.r, desc: def.d, qty: 1, src, roll: rollTxt, to: s.to, why: s.why };
}
const moneyLine = (amt: number, src: string, rollTxt: string): LootLine => ({ id: uid(), kind: 'money', money: amt, src, roll: rollTxt, to: 'storage', why: 'Goes into the team bank' });
const rarTxt = (rr: ReturnType<typeof rollRarity>) => `rarity d100 ${rr.roll}${rr.total !== rr.roll ? ' (+' + (rr.total - rr.roll) + ')' : ''} → ${RAR[rr.r]}`;

export function rollDrop(e: { name: string; level: number; shadow?: boolean; rift?: boolean; overworld?: boolean }, o: { purified?: boolean; boss?: boolean } = {}) {
  const tier = TIER(e.level), out: LootLine[] = [], src = e.name;
  const d = roll(100), bonus = (e.shadow ? 10 : 0) + (o.purified ? 10 : 0) + (o.boss ? 30 : 0) + (e.rift ? 15 : 0) + (e.overworld ? 10 : 0), adj = d + bonus;
  const tag = `d100 ${d}${bonus ? ' (+' + bonus + ')' : ''}`;
  if (adj <= 30) addLog(`${src} dropped nothing (${tag}).`);
  else if (adj <= 55) out.push(moneyLine((roll(10) + roll(10)) * 5 * tier * (e.shadow ? 2 : 1) * (e.rift ? 2 : 1), src, `${tag} → Poké`));
  else { const rr = rollRarity(tier, (e.shadow ? 5 : 0) + (o.boss ? 25 : 0) + (e.rift ? 10 : 0)); out.push(lootLine(pickItem(rr.r, tier), src, `${tag} → item, ${rarTxt(rr)}`)); }
  if (e.shadow && roll(2) === 1) out.push(lootLine(ITEM_BY_ID.shadowshard, src, 'Shadow drop (50%)'));
  if (o.boss) out.push(moneyLine(100 * tier * roll(6), src, 'Boss purse'));
  return out;
}
export function rollChest(lvl: number, big?: boolean, src?: string) {
  const tier = TIER(lvl), out: LootLine[] = [], s = src || 'Treasure chest';
  for (let i = 0; i < (big ? 2 : 1); i++) {
    if (roll(100) <= 15) out.push(lootLine(ITEM_BY_ID.treasurebox, s, 'd100 → Treasure Box (15%)'));
    else { const rr = rollRarity(tier, big ? 30 : 10); out.push(lootLine(pickItem(rr.r, tier), s, rarTxt(rr))); }
  }
  out.push(moneyLine((roll(6) + roll(6)) * 10 * tier * (big ? 3 : 1), s, 'Coins in the chest'));
  return out;
}
export function addLoot(lines: LootLine[]) {
  if (!lines.length) return;
  G().loot.lines.push(...lines);
  addLog('Loot found: ' + lines.map(l => (l.kind === 'money' ? money(l.money) : l.name)).join(', ') + '.');
}
export function giveLine(l: LootLine, to: string) {
  const s = G(), who = me()?.name || 'The DM';
  if (l.kind === 'money') { s.storage.poke = (s.storage.poke || 0) + (l.money || 0); addLog(`${money(l.money)} went into the team bank.`); return; }
  const def = l.itemId === 'tm' ? tmDef(l.tm || '', l.name) : ITEM_BY_ID[l.itemId || ''] || { n: l.name || 'Item', id: '', fx: {} };
  const c = s.chars.find(x => x.id === to);
  if (c) { addItemTo(c.items, def, l.qty || 1); addLog(`${who} gave ${l.name} to ${nameOf(c)}.`); }
  else { addItemTo(s.storage.items, def, l.qty || 1); addLog(`${l.name} went into team storage.`); }
}

/** Use an item from a bag. Works outside battle (target = self) and in battle (target picked). Call inside update(). */
export function applyItem(user: Char, idx: number, target0: Fighter | null, inBattle: boolean): { ok: boolean; msg: string } | null {
  const it = user.items[idx];
  if (!it) return null;
  const def = looseDef(it), fx = def.fx || {}, who = nameOf(user);
  let target: Fighter = target0 || user;
  const ally = target.kind !== 'enemy' || target.side === 'npc', tn = nameOf(target);
  const take = () => takeOne(user.items, it.name);
  if (slotOf(def)) return { ok: false, msg: `${def.n} works when equipped. Tap ${def.cat === 'held' ? 'Hold' : 'Equip'} in the bag.` };
  if (fx.autoRevive) return { ok: false, msg: 'A Reviver Seed works on its own when you faint. Keep it in your bag.' };
  if (fx.heart || fx.purify) {
    if (!inBattle) return { ok: false, msg: `Use ${def.n} during a battle with a Shadow Pokémon.` };
    if (fx.heart) {
      if (target.kind !== 'enemy' || !target.shadow) return { ok: false, msg: 'Pick a Shadow Pokémon as the target.' };
      take();
      target.heartGauge = Math.max(0, target.heartGauge - fx.heart);
      return { ok: true, msg: `${who} used ${def.n} on ${tn}. Heart Gauge −${fx.heart} → ${target.heartGauge}.${target.heartGauge <= 30 ? ' Its heart is ready to open!' : ''}` };
    }
    take();
    const b = BT()!;
    b.boost = b.boost || {};
    b.boost[user.id] = fx.purify!;
    return { ok: true, msg: `${who} used ${def.n}. Its next Heart check has advantage.` };
  }
  if (fx.throw || fx.save) {
    if (!inBattle) { take(); return { ok: true, msg: `${who} used ${def.n}. ${def.d}` }; }
    if (ally) return { ok: false, msg: `Throw ${def.n} at a foe. Pick a foe as the target.` };
    take();
    const [ab, dcS] = String(fx.save || 'DEX 13').split(' '), dc = +dcS;
    const sk = ({ DEX: 'spe', CON: 'def', WIS: 'spd' } as Record<string, StatKey>)[ab] || 'spe';
    const sr = roll(20), sm = M(target, sk), sv = sr + sm, saved = sv >= dc;
    let msg = `${who} threw ${def.n} at ${tn}. ${ab} save ${sr}${fmt(sm)} = ${sv} vs ${dc}: ${saved ? 'saved' : 'failed'}.`;
    if (fx.throw) {
      let dmg = rollDice(fx.throw);
      if (saved) dmg = Math.floor(dmg / 2);
      target.hpCur = Math.max(0, target.hpCur - dmg);
      msg += ` ${dmg} damage.`;
      knockout(target, user);
    } else if (!saved) msg += ' ' + def.d.replace(/^Throw( at a foe)?:\s*/, '').replace(/^the target makes .*? or /i, 'It ');
    return { ok: true, msg };
  }
  if (fx.revive) {
    if (target.hpCur > 0) return { ok: false, msg: `${def.n} only works on a fainted Pokémon.` };
    take();
    target.hpCur = Math.max(1, Math.ceil(hpMaxOf(target) * fx.revive));
    if (target.kind === 'enemy' && target.outReason === 'Fainted') target.outReason = '';
    return { ok: true, msg: `${who} used ${def.n}. ${tn} is back with ${target.hpCur} HP!` };
  }
  if (inBattle && !ally) target = user;
  if (fx.heal || fx.cure || fx.pp || fx.teamHeal) {
    if (fx.heal && target.hpCur <= 0) return { ok: false, msg: `${nameOf(target)} has fainted. Use a Revive.` };
    take();
    let msg = `${who} used ${def.n}${target !== user ? ' on ' + nameOf(target) : ''}.`;
    if (fx.heal) {
      const before = target.hpCur;
      target.hpCur = Math.min(hpMaxOf(target), target.hpCur + (fx.heal === 'full' ? 9999 : rollDice(fx.heal)));
      msg += ` Healed ${target.hpCur - before} HP (${target.hpCur}/${hpMaxOf(target)}).`;
    }
    if (fx.teamHeal) { partyChars().forEach(x => { if (x.hpCur > 0) x.hpCur = Math.min(maxHP(x), x.hpCur + rollDice(fx.teamHeal)); }); msg += ' The whole team healed a little.'; }
    if (fx.cure) {
      if (fx.cure === 'all' || fx.cure === target.status) target.status = null;
      msg += fx.cure === 'all' ? ' Every status is cured.' : ` ${T(fx.cure)} is cured.`;
    }
    if (fx.pp && target.moves) {
      const lim = (target.kind === 'enemy' ? target.moves : equippedOf(target)).filter(m => m.ppMax != null);
      if (fx.pp === 'all') { lim.forEach(m => { m.ppCur = m.ppMax!; }); msg += ' All PP restored.'; }
      else {
        const m = lim.slice().sort((a, b) => (b.ppMax! - b.ppCur) - (a.ppMax! - a.ppCur))[0];
        if (m) { m.ppCur = Math.min(m.ppMax!, m.ppCur + (fx.pp === 'move' ? m.ppMax! : +fx.pp)); msg += ` ${T(m.name)} is at ${m.ppCur}/${m.ppMax} PP.`; }
      }
    }
    return { ok: true, msg };
  }
  if (inBattle) return { ok: false, msg: `${def.n} can't be used in battle.` };
  if (fx.evo || fx.evoTrade) {
    const t = evoTargetFor(user, def);
    if (!t) return { ok: false, msg: `${who} can't evolve with ${def.n}.` };
    if (heldFx(user).noEvo) return { ok: false, msg: `${who} is holding an Everstone. Take it off first.` };
    take();
    evolve(user, t.name);
    return { ok: true, msg: `${who} used ${def.n}.` };
  }
  if (fx.tm) {
    const mv = toTableMove(getMove(fx.tm));
    if (user.moves.some(m => m.name === mv.name)) return { ok: false, msg: `${nameOf(user)} already knows ${T(mv.name)}.` };
    take();
    user.moves.push(mv);
    if (!user.inDungeon && user.equipped.length < 4) user.equipped.push(mv.name);
    return { ok: true, msg: `${nameOf(user)} learned ${T(mv.name)} from the TM!` };
  }
  if (fx.levelUp) {
    if (user.level >= levelCap()) return { ok: false, msg: `${who} is at the level cap (${levelCap()}). Beat the next Gatekeeper first.` };
    take();
    changeLevel(user, 1);
    return { ok: true, msg: `${who} ate a ${def.n} and grew a level!` };
  }
  if (fx.box) {
    const rr = rollRarity(TIER(user.level), 30), found = pickItem(rr.r === 'c' ? 'u' : rr.r, TIER(user.level));
    take();
    addItemTo(user.items, found, 1);
    return { ok: true, msg: `${who} opened the Treasure Box and found ${found.n} (${RAR[found.r]})!` };
  }
  const dg = G().dungeon, inDg = dg.state === 'in' && dg.map;
  if (fx.escape) {
    if (!inDg) return { ok: false, msg: 'Use it inside a dungeon.' };
    if (dg.kind === 'rift' && !dg.cleared) return { ok: false, msg: `The Rift is sealed. ${def.n}s fail until the Rift Lord falls.` };
    take();
    leaveDungeon(`${who} used ${def.id === 'escaperope' ? 'an Escape Rope. The team climbed' : 'an Escape Orb. The team warped'} out of ${dg.name} with all its loot.`);
    return { ok: true, msg: `${who} used ${def.n}.` };
  }
  if (fx.reveal || fx.revealTraps || fx.revealStairs) {
    if (!inDg || !dg.map) return { ok: false, msg: 'Use it inside a dungeon.' };
    take();
    if (fx.reveal) dg.map.rev = true;
    if (fx.revealTraps) dg.map.trapsSeen = true;
    if (fx.revealStairs) dg.map.stairsSeen = true;
    return { ok: true, msg: `${who} used ${def.n}. ${fx.reveal ? 'The whole floor is revealed!' : fx.revealTraps ? 'Every trap on this floor is revealed.' : 'The stairs are marked on the map.'}` };
  }
  if (!fx.keep) take();
  return { ok: true, msg: `${who} used ${def.n}. ${def.d}` };
}

/** Rescue Corps field heal: free for close friends, half price for friends, refused by enemies. */
export const healPrice = (layer: number, bond: number) => bond <= -2 ? null : bond >= 2 ? 0 : (bond === 1 ? 50 : 100) * (layer + 1);
export const bondOf = (bond: Record<string, number>, id: string) => Math.max(-2, Math.min(2, bond[id] || 0));
/** Charisma haggle: % off a shop visit from the roll total (d20 + Charisma bonus + 2 per friendship step). */
export const haggleOff = (total: number) => total >= 20 ? 30 : total >= 15 ? 20 : total >= 10 ? 10 : 0;
