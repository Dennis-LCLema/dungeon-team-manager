/* Battle engine. State-changing functions run inside update(). */
import { T, fmt, roll, rollDice, uid } from '../lib/util';
import { CAST, LAYERS, STATUS, STATUS_MOVES, STATUS_SAVE, SURPRISE } from './data';
import { getMove, getPokemonAny, prevoOf } from './dex';
import { G, addLog, canEdit, isDM, owns } from './store';
import type { AttackResult, Battle, Char, Enemy, Fighter, Move, OrderEntry, Shared, Status } from './types';
import {
  AC, M, SAC, SHADOW_RUSH, abilityOf, XP_FINISH, addLoot, clampHP, critOn, customMove, diff, effectiveness, enemyXP, gameLvl, heldDmg, heldFx,
  hpMaxOf, maxHP, nameOf, processLevelUps, prof, rollChest, rollDrop, toTableMove, typesOf, tryReviver, weaponHit,
} from './rules';

export const BT = () => G().game.battle;
export const bGet = (o: OrderEntry | undefined): Fighter | null => {
  if (!o) return null;
  return o.ref === 'pc' ? G().chars.find(c => c.id === o.id) || null : BT()?.enemies.find(e => e.id === o.id) || null;
};
export const isOut = (x: Fighter | null | undefined) => !x || x.hpCur <= 0 || !!(x.kind === 'enemy' && x.outReason);
export const sideOf = (o: OrderEntry): 'team' | 'enemy' => (o.ref === 'pc' ? 'team' : (bGet(o) as Enemy | null)?.side === 'npc' ? 'team' : 'enemy');
export const controls = (o: OrderEntry) => (o.ref === 'pc' ? canEdit(bGet(o) as Char) : isDM());
/** The hero whose turn it is, if this person controls it. */
export function myTurnChar(): Char | null {
  const b = BT();
  if (!b || b.result || b.phase === 'intro') return null;
  const cur = b.order[b.turn];
  if (!cur || cur.ref !== 'pc') return null;
  const x = bGet(cur) as Char | null;
  return x && owns(x) && !isOut(x) ? x : null;
}
export function blog(t: string) { const b = BT(); if (!b) return; b.log.unshift(t); if (b.log.length > 80) b.log.length = 80; }

export function buildEnemy(sp: string, level: number, shadow: boolean, side: 'enemy' | 'npc'): Enemy {
  const p = getPokemonAny(sp);
  if (side === 'npc') shadow = false;
  const e: Enemy = {
    id: uid(), kind: 'enemy', side, species: p.species, types: p.types, base: p.stats, level, bonus: {}, heart: 10, shadow,
    heartGauge: shadow ? 100 : 0, moves: [], hpMax: 1, hpCur: 1, name: '',
  };
  for (const m of p.levelMoves.filter(m => m.level <= gameLvl(level)).slice(-4)) {
    try { e.moves.push(toTableMove(getMove(m.name))); } catch { /* move missing from dex */ }
  }
  if (!e.moves.length) e.moves.push(customMove('tackle', 'normal', 'physical', '1d8', null));
  if (shadow) { e.moves.unshift(SHADOW_RUSH()); e.moves = e.moves.slice(0, 4); }
  e.hpMax = Math.max(1, Math.round(maxHP(e) * (shadow ? 1.25 : 1) * diff().hp));
  e.hpCur = e.hpMax;
  e.name = (shadow ? 'Shadow ' : '') + T(p.species);
  const same = G().game.bsetup.enemies.filter(x => x.species === e.species && x.shadow === shadow).length;
  if (same) e.name += ' ' + String.fromCharCode(65 + same);
  return e;
}

// surprise: 'normal' | 'ambush' (foes caught the team off guard) | 'jump' (the team got the jump on the foes)
function initRoll(x: Fighter, isTeam: boolean, surprise: string) {
  const ab = abilityOf(x);
  const mod = M(x, 'spe') + (heldFx(x).init || 0) + (ab === 'limber' ? 2 : 0) + (ab === 'unburden' && !x.held ? 3 : 0) + (ab === 'heavy-metal' ? -2 : 0);
  const dis = (surprise === 'ambush' && isTeam && ab !== 'inner-focus') || (surprise === 'jump' && !isTeam);
  const r1 = roll(20), r2 = dis ? roll(20) : null, d = dis ? Math.min(r1, r2!) : r1;
  return { init: d + mod, r1, r2, mod };
}
export function rollSurprise(party: Fighter[], enemies: Enemy[]) {
  const team = party.length ? Math.max(...party.map(x => roll(20) + M(x, 'spd'))) : 0;
  const foes = enemies.length ? roll(20) + Math.max(...enemies.map(e => M(e, 'spe'))) : 0;
  const kind: Battle['surprise'] = team <= foes - 5 ? 'ambush' : team >= foes + 5 ? 'jump' : 'normal';
  return { kind, text: `Team awareness ${team} vs foes' stealth ${foes}.` };
}

export function startBattle(pcIds: string[], enemiesIn: Enemy[], room: Battle['room'], surprise: string, why?: string) {
  const s = G();
  const pcs = pcIds.map(id => s.chars.find(x => x.id === id)).filter(Boolean) as Char[];
  const enemies: Enemy[] = JSON.parse(JSON.stringify(enemiesIn));
  const sp = (SURPRISE[surprise] ? surprise : 'normal') as Battle['surprise'];
  const order: OrderEntry[] = [
    ...pcs.map(x => Object.assign({ ref: 'pc' as const, id: x.id }, initRoll(x, true, sp))),
    ...enemies.map(e => Object.assign({ ref: 'enemy' as const, id: e.id }, initRoll(e, e.side === 'npc', sp))),
  ].sort((p, q) => q.init - p.init || Number(q.ref === 'pc') - Number(p.ref === 'pc'));
  s.chars.forEach(x => { x.megaOn = null; });
  const { bg, scene } = battleBackground(s, room);
  s.game.battle = { id: uid(), phase: 'intro', surprise: sp, why: why || '', round: 1, turn: 0, order, enemies, log: [], result: null, room: room || null, boost: {}, megaUsed: {}, flags: {}, bg, scene };
  blog(`${SURPRISE[sp].n}${why ? ' ' + why : ''} Initiative: ` + order.map(o => `${nameOf(bGet(o)!)} ${o.init}`).join(', '));
  addLog('A battle started against ' + enemies.filter(e => e.side !== 'npc').map(e => e.name).join(', ') + '.');
  if (isOut(bGet(order[0]))) nextTurn();
  checkEnd();
}

/** Which background image a battle uses (public/backgrounds/<bg>.webp), and which drawn layer scene shows until it exists. */
export function battleBackground(s: Shared, room: Battle['room']) {
  const dg = s.dungeon, layer = s.world.layer;
  if (room?.world) return { bg: `overworld-${layer}`, scene: layer };
  if (room && dg.state === 'in') {
    if (dg.kind === 'labyrinth') return { bg: `labyrinth-${dg.to}`, scene: dg.to ?? layer };
    if (dg.kind === 'rift') return { bg: `rift-${dg.layer}`, scene: dg.layer ?? layer };
    return { bg: 'dungeon', scene: roll(LAYERS.length) - 1 };
  }
  return { bg: 'battle', scene: layer };
}

export function checkEnd() {
  const b = BT();
  if (!b || b.result) return;
  const team = b.order.some(o => sideOf(o) === 'team' && !isOut(bGet(o)));
  const foes = b.order.some(o => sideOf(o) === 'enemy' && !isOut(bGet(o)));
  if (!foes) { b.result = 'win'; blog('All enemies are down. Victory!'); addLog('The team won a battle!'); onBattleWon(b); }
  else if (!team) { b.result = 'lose'; blog('Every team member has fainted.'); addLog('The team fainted in battle.'); }
  if (b.result) G().chars.forEach(x => { x.status = null; if (x.megaOn != null) { x.megaOn = null; clampHP(x); } });
}

function onBattleWon(b: Battle) {
  const s = G();
  const team = b.order.filter(o => o.ref === 'pc').map(bGet).filter(Boolean) as Char[], up = team.filter(x => x.hpCur > 0), gains: Record<string, number> = {};
  const beaten = b.enemies.filter(e => e.side !== 'npc' && (e.outReason === 'Fainted' || /Purified|Fled/.test(e.outReason || '')));
  beaten.forEach(e => {
    const base = enemyXP(e);
    up.forEach(x => { gains[x.id] = (gains[x.id] || 0) + base * (e.killer === x.id ? XP_FINISH : 1); });
  });
  b.xp = team.map(x => {
    const g = x.hpCur > 0 ? Math.round(gains[x.id] || 0) : 0;
    if (g) x.xp = (x.xp || 0) + g;
    return { id: x.id, n: nameOf(x), g, fin: beaten.some(e => e.killer === x.id) && x.hpCur > 0 };
  });
  addLog('XP: ' + b.xp.map(z => (z.g ? `${z.n} +${z.g}${z.fin ? ' (finishing blow)' : ''}` : `${z.n} fainted, no XP`)).join(', ') + '.');
  team.forEach(x => { if (x.hpCur <= 0) { x.hpCur = 1; addLog(`${nameOf(x)} woke up after the battle with 1 HP.`); } });
  processLevelUps();
  const lines = [];
  for (const e of b.enemies.filter(e => e.side !== 'npc')) {
    const pur = /Purified/.test(e.outReason || '');
    if (e.outReason === 'Fainted' || pur) lines.push(...rollDrop(e, { purified: pur, boss: e.boss }));
  }
  if (b.room?.world) { const ev = s.world.area[b.room.world]; if (ev) ev.done = true; }
  const dg = s.dungeon;
  if (b.room && !b.room.world && dg.state === 'in' && dg.map && dg.floor === b.room.floor && b.room.pos && dg.map.cells[b.room.pos]) {
    dg.map.cells[b.room.pos].done = true;
    if (b.room.boss) {
      dg.cleared = true;
      lines.push(...rollChest((dg.lvl || 1) + 2, true, 'Boss treasure'));
      addLog(`The team defeated the boss of ${dg.name}! The dungeon is cleared.`);
    }
  }
  addLoot(lines);
}

export function nextTurn(depth = 0) {
  const b = BT();
  if (!b || b.result) return;
  for (let i = 0; i < b.order.length; i++) {
    b.turn++;
    if (b.turn >= b.order.length) {
      b.turn = 0; b.round++; blog(`— Round ${b.round} —`);
      (b.fx || []).forEach(f => { f.rounds--; if (f.rounds <= 0) blog(`${f.name} fades.`); });
      if (b.fx) b.fx = b.fx.filter(f => f.rounds > 0);
    }
    if (!isOut(bGet(b.order[b.turn]))) break;
  }
  const x = bGet(b.order[b.turn]), f = heldFx(x);
  if (x && !isOut(x) && f.regen && x.hpCur < hpMaxOf(x)) {
    x.hpCur = Math.min(hpMaxOf(x), x.hpCur + f.regen);
    blog(`${nameOf(x)} restored a little HP with its Leftovers.`);
  }
  // A status can cost this fighter its turn; move on, but never loop forever.
  if (x && !isOut(x) && statusTick(x)) { checkEnd(); if (depth < b.order.length * 2) nextTurn(depth + 1); }
}

/** Give a fighter a status (or clear it with null). Returns a message, or why it didn't stick. */
export function setStatus(x: Fighter, st: Status | null): string {
  if (!st) { x.status = null; return `${nameOf(x)} is no longer affected.`; }
  const t = typesOf(x).find(ty => STATUS[st].immune.includes(ty));
  if (t) return `${nameOf(x)} is ${T(t)} type, so it can't be ${STATUS[st].n.toLowerCase()}.`;
  x.status = st;
  return `${nameOf(x)} is ${STATUS[st].n.toLowerCase()}! ${STATUS[st].g}`;
}

/** Start-of-turn status effects. Returns true if the fighter loses this turn. */
export function statusTick(x: Fighter): boolean {
  const st = x.status, n = nameOf(x), max = hpMaxOf(x);
  if (!st) return false;
  const hurt = (dmg: number, why: string) => { x.hpCur = Math.max(0, x.hpCur - dmg); blog(`${n} ${why} (−${dmg} HP).`); if (x.hpCur <= 0) knockout(x, null); return x.hpCur <= 0; };
  switch (st) {
    case 'burn': return hurt(Math.max(roll(4), Math.floor(max / 16)), 'is hurt by its burn');
    case 'poison': return hurt(Math.max(roll(6), Math.floor(max / 10)), 'is hurt by poison');
    case 'paralysis': if (roll(4) === 1) { blog(`${n} is paralyzed! It can't move.`); return true; } return false;
    case 'sleep': { const r = roll(20); if (r >= 11) { x.status = null; blog(`${n} woke up! (d20 ${r})`); return false; } blog(`${n} is fast asleep. (d20 ${r})`); return true; }
    case 'freeze': { const r = roll(20); if (r >= 16) { x.status = null; blog(`${n} thawed out! (d20 ${r})`); return false; } blog(`${n} is frozen solid. (d20 ${r})`); return true; }
    case 'confusion': {
      const r = roll(20);
      if (r >= 15) { x.status = null; blog(`${n} snapped out of its confusion! (d20 ${r})`); return false; }
      if (roll(3) === 1) { hurt(roll(6), 'hurt itself in its confusion'); return true; }
      return false;
    }
  }
  return false;
}

export function handleKO(target: Fighter, actor: Fighter | null) {
  if (target.hpCur > 0) return;
  if (target.kind === 'enemy') {
    if (actor && actor.kind !== 'enemy') target.killer = actor.id;
    if (target.shadow) {
      if (target.heartGauge <= 30) {
        target.outReason = '✨ Purified';
        const pc = actor && actor.kind !== 'enemy' ? actor : null;
        const mv = target.moves.find(m => m.type !== 'shadow' && m.dice) || target.moves[0];
        if (pc) pc.assists.push({ name: T(target.species), move: T(mv.name), note: 'Purified in battle', used: true });
        blog(`${target.name}'s heart opens! It is purified${pc ? ' and becomes an Assist for ' + nameOf(pc) : ''}.`);
        addLog(`${target.name} was purified${pc ? ' by ' + nameOf(pc) : ''}.`);
      } else {
        target.outReason = 'Fled (heart still closed)';
        blog(`${target.name} breaks away and flees into the dungeon. It will return stronger.`);
      }
    } else { target.outReason = 'Fainted'; blog(`${target.name} fainted.`); }
  } else blog(`${nameOf(target)} fainted!`);
}
export function knockout(t: Fighter, by: Fighter | null) {
  if (t.hpCur > 0) return;
  if (t.kind !== 'enemy' && tryReviver(t)) return;
  handleKO(t, by);
}

/** Per-battle ability state for one fighter. */
function flag(id: string) {
  const b = BT();
  if (!b) return {} as Record<string, boolean>;
  b.flags ||= {};
  return (b.flags[id] ||= {});
}

/** Attack bonus and the defense it must reach, including abilities. Also used to preview a player's own d20. */
/** Field effects working for or against this attacker's side right now. */
export function fieldFor(b: Battle | null | undefined, aTeam: boolean) {
  const side = aTeam ? 'team' : 'enemy', fx = b?.fx || [];
  const mine = fx.filter(f => f.side === side), theirs = fx.filter(f => f.side !== side && f.kind === 'dis');
  const sum = (k: string) => mine.filter(f => f.kind === k).reduce((t, f) => t + (f.amt || 0), 0);
  return { adv: mine.some(f => f.kind === 'adv'), dis: theirs.length > 0, hit: sum('hit'), dmg: sum('dmg'), names: [...mine, ...theirs].map(f => f.name) };
}
const onTeam = (x: Fighter) => !(x.kind === 'enemy' && x.side !== 'npc');

export function toHit(actor: Fighter, mv: Move, target: Fighter) {
  const ab = abilityOf(actor), f = BT()?.flags?.[actor.id] || {};
  let bonus = prof(actor.level) + M(actor, mv.cls === 'physical' ? 'atk' : 'spa') + fieldFor(BT(), onTeam(actor)).hit + weaponHit(actor, mv);
  if (ab === 'unburden' && !actor.held) bonus += 1;
  if (ab === 'steadfast' && f.steady) bonus += 2;
  if (ab === 'infiltrator' && target.hpCur >= hpMaxOf(target)) bonus += 2;
  return { bonus, def: mv.cls === 'physical' ? AC(target) : SAC(target), defName: mv.cls === 'physical' ? 'Guard' : 'Sp. Guard' };
}

/** Resolve one move and record the result on the battle so every screen can show the hit/miss popup.
    `manual` holds a player's own dice: the d20 they rolled, and their damage dice total if it hits. */
export function resolveMove(actor: Fighter, mv: Move, target: Fighter, manual?: { d20: number; dmg?: number }): AttackResult | null {
  const who = nameOf(actor), tn = nameOf(target), bt = BT();
  if (mv.ppMax != null) { if (mv.ppCur <= 0) return null; mv.ppCur--; }
  const aTeam = onTeam(actor), fld = fieldFor(bt, aTeam);
  const res: AttackResult = { id: uid(), actor: who, actorSide: aTeam ? 'team' : 'enemy', target: tn, move: T(mv.name), moveType: mv.type, manual: !!manual };
  const record = () => { if (bt) bt.last = res; return res; };
  const ab = abilityOf(actor), tab = abilityOf(target);
  if (mv.cls === 'status' || !mv.dice) {
    res.status = true;
    res.dc = 8 + prof(actor.level) + M(actor, 'spa') + (ab === 'prankster' ? 2 : 0);
    const st = STATUS_MOVES[mv.name];
    if (st && onTeam(actor) !== onTeam(target) && !isOut(target)) {
      const key = STATUS_SAVE[st], label = { def: 'CON', spe: 'DEX', spd: 'WIS' }[key], d = roll(20), m = M(target, key), ok = d + m >= res.dc;
      const why = target.status ? `${tn} is already ${STATUS[target.status].n.toLowerCase()}.` : ok ? `${tn} resists!` : setStatus(target, st);
      res.save = `${label} save ${d}${fmt(m)} = ${d + m} vs DC ${res.dc}: ${ok ? 'saved' : 'failed'}. ${why}`;
      blog(`${who} used ${T(mv.name)} on ${tn}. ${res.save}`);
      return record();
    }
    blog(`${who} used ${T(mv.name)} on ${tn}. ${mv.desc || ''} (Save DC ${res.dc})`);
    return record();
  }
  const key = mv.cls === 'physical' ? 'atk' : 'spa';
  const { bonus, def, defName } = toHit(actor, mv, target);
  if (ab === 'steadfast') flag(actor.id).steady = false;
  const surpriseAdv = !!bt && bt.round === 1 && ((bt.surprise === 'ambush' && !aTeam) || (bt.surprise === 'jump' && aTeam));
  // Advantage and disadvantage cancel out, as in tabletop rules.
  const up = surpriseAdv || fld.adv, down = fld.dis, adv = !manual && up && !down, dis = !manual && down && !up;
  const d20 = manual ? manual.d20 : adv ? Math.max(roll(20), roll(20)) : dis ? Math.min(roll(20), roll(20)) : roll(20), total = d20 + bonus;
  const crit = d20 >= critOn(actor);
  Object.assign(res, { d20, bonus, total, def, defName, adv, dis, crit, fx: fld.names.join(', ') || undefined });
  const tag = manual ? ' (own dice)' : '';
  if (d20 === 1 || (!crit && total < def)) {
    res.hit = false;
    res.fumble = d20 === 1;
    blog(`${who} used ${T(mv.name)} on ${tn}: rolled ${d20}${fmt(bonus)} = ${total} vs ${def}${tag}. Miss!`);
    return record();
  }
  let extra = '';
  const stab = typesOf(actor).includes(mv.type);
  const dice = manual?.dmg != null ? manual.dmg : rollDice(mv.dice, crit);
  let dmg = dice + M(actor, key) + (stab ? prof(actor.level) : 0) + heldDmg(actor, mv);
  if (ab === 'rock-head' && mv.cls === 'physical') dmg += 2;
  dmg += fld.dmg;
  if (ab === 'flash-fire' && mv.type === 'fire' && flag(actor.id).flash) { const fb = rollDice('1d6'); dmg += fb; extra += ` Flash Fire adds ${fb}.`; }
  let eff = effectiveness(mv.type, target);
  if (tab === 'flash-fire' && mv.type === 'fire') { eff = 0; flag(target.id).flash = true; extra += ` ${tn}'s Flash Fire soaks up the flames and powers up!`; }
  if (ab === 'mold-breaker' && eff === 0.5) { eff = 1; extra += ' Mold Breaker ignores the resistance!'; }
  dmg = eff === 0 ? 0 : Math.max(1, Math.floor(dmg * eff));
  if (dmg > 0 && !aTeam && target.kind !== 'enemy') dmg = Math.max(1, Math.round(dmg * diff().dmg));
  if (dmg >= target.hpCur && target.hpCur > 1) {
    if (tab === 'sturdy' && !flag(target.id).sturdy) { dmg = target.hpCur - 1; flag(target.id).sturdy = true; extra += ` ${tn} is Sturdy and hangs on with 1 HP!`; }
    else if (heldFx(target).sash && !target.sashUsed && target.hpCur >= hpMaxOf(target)) { dmg = target.hpCur - 1; target.sashUsed = true; extra += ` ${tn} hung on with its Focus Sash!`; }
  }
  target.hpCur = Math.max(0, target.hpCur - dmg);
  if (dmg > 0 && mv.type === 'fire' && target.status === 'freeze') { target.status = null; extra += ` ${tn} thawed out!`; }
  if (dmg > 0 && tab === 'steadfast') flag(target.id).steady = true;
  if (heldFx(actor).lifeOrb && dmg > 0 && ab !== 'rock-head') { const rc = roll(4); actor.hpCur = Math.max(0, actor.hpCur - rc); extra += ` ${who} took ${rc} Life Orb recoil.`; }
  if (tab === 'flame-body' && mv.cls === 'physical' && dmg > 0) { const fb = roll(4); actor.hpCur = Math.max(0, actor.hpCur - fb); extra += ` ${tn}'s Flame Body burns ${who} for ${fb}.`; }
  const effTxt = eff === 0 ? " It doesn't affect them." : eff > 1 ? " It's super effective!" : eff < 1 ? " It's not very effective." : '';
  blog(`${who} used ${T(mv.name)} on ${tn}: ${d20}${fmt(bonus)} = ${total} vs ${def}${adv ? ' (advantage)' : dis ? ' (disadvantage)' : ''}${fld.names.length ? ' [' + fld.names.join(', ') + ']' : ''}${tag}.${crit ? ' Critical hit!' : ''} ${dmg} damage.${effTxt}${extra}`);
  Object.assign(res, { hit: true, dmg, eff, extra: extra.trim() });
  knockout(target, actor);
  if (actor.hpCur <= 0) knockout(actor, null);
  res.ko = target.hpCur <= 0 || (target.kind === 'enemy' && !!target.outReason);
  res.hpLeft = target.hpCur;
  res.hpMax = hpMaxOf(target);
  return record();
}

/** Enemy or NPC picks a target and a move on its own: usually the best type match, sometimes random. */
export function autoTurn() {
  const b = BT();
  if (!b || b.result) return;
  const cur = b.order[b.turn];
  const actor = bGet(cur);
  if (!actor || isOut(actor)) { nextTurn(); return; }
  const side = sideOf(cur), targets = b.order.filter(o => sideOf(o) !== side && !isOut(bGet(o))).map(o => bGet(o)!) as Fighter[];
  if (!targets.length) { checkEnd(); return; }
  const smart = actor.kind === 'enemy' && !!actor.rival;
  // How hard this fighter's best damaging move hits a target (Flash Fire soaks up Fire).
  const punch = (x: Fighter) => Math.max(0, ...actor.moves.filter(m => m.dice && (m.ppMax == null || m.ppCur > 0))
    .map(m => (m.type === 'fire' && abilityOf(x) === 'flash-fire' ? 0 : effectiveness(m.type, x))));
  let focus = actor.kind === 'enemy' && actor.focus ? targets.find(x => x.id === actor.focus) : undefined;
  if (smart && focus && punch(focus) < 1) focus = undefined; // a smart rival doesn't keep hitting a wall
  // Rivals otherwise pick the target they hit hardest, then the weakest; everyone else picks at random.
  const plan = () => targets.slice().sort((p, q) => punch(q) - punch(p) || p.hpCur / hpMaxOf(p) - q.hpCur / hpMaxOf(q))[0];
  const t = focus || (smart ? plan() : targets[roll(targets.length) - 1]);
  const STRUGGLE = () => customMove('struggle', 'typeless', 'physical', '1d8', null, 'Used when no other move can hit.');
  const usable = actor.moves.filter(m => m.dice && (m.ppMax == null || m.ppCur > 0));
  // Out of damaging moves (no PP left): Struggle, as in the games, so a fight can't stall forever.
  const pool = usable.length ? usable : [STRUGGLE()];
  const best = pool.slice().sort((p, q) => effectiveness(q.type, t) - effectiveness(p.type, t))[0];
  let mv = smart || roll(3) < 3 ? best : pool[roll(pool.length) - 1];
  // Nothing it knows can touch this target: Struggle too.
  if (pool.every(m => effectiveness(m.type, t) === 0)) mv = STRUGGLE();
  resolveMove(actor, mv, t);
  checkEnd();
  nextTurn();
}

/** First form of a Pokémon's evolution line, e.g. Lucario → riolu. */
const lineRoot = (species: string) => { let r = species.toLowerCase().replace(/[^a-z0-9]/g, ''); for (let i = 0; i < 4 && prevoOf(r); i++) r = prevoOf(r)!; return r; };

/** Chapter 1's graduation spar: Team Razorwind at the players' levels, each rival going after the player it chose. */
export function startRivalSpar() {
  const s = G(), party = rivalParty();
  if (!party.length) throw new Error('Add the team first.');
  const enemies = buildRivals(CAST.filter(c => c.team === 'rivals').map(c => c.id));
  s.world.sparDone = true;
  startBattle(party.map(c => c.id), enemies, null, 'normal', 'The graduation spar! Team Razorwind steps into the ring, and each rival has already picked a target.');
  addLog('The graduation spar against Team Razorwind begins!');
}

const rivalParty = () => { const s = G(), p = s.chars.filter(c => c.player); return p.length ? p : s.chars; };
/** Team Razorwind members as fighters: same level as the player each one chose, hero-grade HP, smart moves. */
export function buildRivals(ids: string[]): Enemy[] {
  const s = G(), party = rivalParty();
  const avg = party.length ? Math.max(1, Math.round(party.reduce((t, c) => t + c.level, 0) / party.length)) : 1;
  return CAST.filter(c => ids.includes(c.id)).map(r => {
    const mark = party.find(c => lineRoot(c.species) === r.rivalOf);
    const e = buildEnemy(r.species, mark?.level ?? avg, false, 'enemy');
    e.name = `${r.name} (${T(r.species)})`;
    e.rival = true;
    if (mark) {
      e.focus = mark.id;
      // Same strength as the Pokémon they chose: scale base stats up to its stat total (Rookidee vs Hawlucha is otherwise no contest).
      const total = (x: { base: Record<string, number> }) => Object.values(x.base).reduce((t, v) => t + v, 0);
      const k = Math.min(2.5, Math.max(1, total(mark) / total(e)));
      // Offence and speed scale fully; HP and defences only by the square root, so fights stay short.
      Object.keys(e.base).forEach(key => { (e.base as Record<string, number>)[key] = Math.round((e.base as Record<string, number>)[key] * (['atk', 'spa', 'spe'].includes(key) ? k : Math.sqrt(k))); });
    }
    // Fellow graduates: they get the same HP formula as the heroes, so it's an even fight.
    e.hpMax = e.hpCur = maxHP({ ...e, kind: undefined } as unknown as Char);
    s.world.met[r.id] = true;
    return e;
  });
}
