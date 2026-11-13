import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rollDice } from '../lib/util';
import { abilityInfo, bGet, buildEnemy, handleKO, resolveStunt, nextTurn, resolveMove, setInitRoll, sideStatus, stageFx, startBattle, toHit, triggerAbility } from './battle';
import { setDex } from './dex';
import { musicFor } from './music';
import { AC, M, MAX_TEAM, activeTeam, lootTeam, setReserve, realDice, cleanChar, forgetMove, learnMove, longRest, toTableMove, changeLevel, createChar, effectiveness, equippedOf, haggleOff, healPrice, lockScores, maxHP, quizResult, score } from './rules';
import { G, LOG_KEEP, addLog, logKind, setUi, update } from './store';
import { getMove } from './dex';
import type { AttackResult, Char, Enemy } from './types';

beforeAll(() => { setDex(JSON.parse(readFileSync('public/dex.json', 'utf8'))); });
afterEach(() => { vi.restoreAllMocks(); });

/** Start a 1v1 battle: a level 5 Charmander against a non-shadow Bulbasaur. */
function duel() {
  const hero = createChar('Charmander', 'Blaze', 'Luis', 5);
  update(s => {
    s.chars = [hero];
    const foe = buildEnemy('Bulbasaur', 5, false, 'enemy');
    startBattle([hero.id], [foe], null, 'normal');
    s.game.battle!.phase = 'fight';
  });
  const b = G().game.battle!;
  return { heroId: hero.id, foeId: b.enemies[0].id };
}
function attack(heroId: string, foeId: string): AttackResult | null {
  let res: AttackResult | null = null;
  update(s => {
    const b = s.game.battle!, hero = s.chars.find(c => c.id === heroId)!;
    const foe = bGet(b.order.find(o => o.id === foeId)) as Enemy;
    const mv = equippedOf(hero as Char).find(m => m.dice)!;
    res = resolveMove(hero, mv, foe);
  });
  return res;
}

describe('rollDice', () => {
  it('handles dice, modifiers and bad input', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(rollDice('2d6+3')).toBe(15);
    expect(rollDice('1d8-1')).toBe(7);
    expect(rollDice('2d6', true)).toBe(24);
    expect(rollDice('nonsense')).toBe(0);
  });
});

describe('resolveMove', () => {
  it('a natural 1 always misses and deals no damage', () => {
    const { heroId, foeId } = duel();
    const before = G().game.battle!.enemies[0].hpCur;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack(heroId, foeId)!;
    expect(r.hit).toBe(false);
    expect(r.fumble).toBe(true);
    expect(r.d20).toBe(1);
    expect(G().game.battle!.enemies[0].hpCur).toBe(before);
    expect(G().game.battle!.last?.id).toBe(r.id);
  });

  it('a natural 20 crits, and the popup damage matches the HP lost', () => {
    const { heroId, foeId } = duel();
    const before = G().game.battle!.enemies[0].hpCur;
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = attack(heroId, foeId)!;
    expect(r.hit).toBe(true);
    expect(r.crit).toBe(true);
    expect(r.dmg).toBeGreaterThan(0);
    expect(before - G().game.battle!.enemies[0].hpCur).toBe(Math.min(before, r.dmg!));
    expect(r.hpLeft).toBe(G().game.battle!.enemies[0].hpCur);
    expect(r.total).toBe(r.d20! + r.bonus!);
  });
});

describe('effectiveness', () => {
  it('uses the type chart', () => {
    const foe = { kind: 'enemy', types: ['grass', 'poison'], shadow: false } as unknown as Enemy;
    expect(effectiveness('fire', foe)).toBe(2);
    expect(effectiveness('water', foe)).toBe(0.5);
    expect(effectiveness('shadow', foe)).toBe(1.5);
  });
});

/** Hero (species, ability) against a Bulbasaur. Returns ids. */
function versus(species: string, ability: string) {
  const hero = createChar(species, '', 'Luis', 5);
  hero.ability = ability;
  update(s => {
    s.chars = [hero];
    startBattle([hero.id], [buildEnemy('Bulbasaur', 5, false, 'enemy')], null, 'normal');
    s.game.battle!.phase = 'fight';
  });
  return { heroId: hero.id, foeId: G().game.battle!.enemies[0].id };
}
function foeHits(heroId: string, foeId: string, moveType?: string) {
  let res: AttackResult | null = null;
  update(s => {
    const b = s.game.battle!, hero = s.chars.find(c => c.id === heroId)!, foe = b.enemies.find(e => e.id === foeId)!;
    const mv = { ...foe.moves.find(m => m.dice)!, ppMax: null, ...(moveType ? { type: moveType } : {}) };
    res = resolveMove(foe, mv, hero);
  });
  return res!;
}

describe('abilities', () => {
  it('Sturdy survives one knockout hit per battle at 1 HP', () => {
    const { heroId, foeId } = versus('Aron', 'sturdy');
    update(s => { s.chars[0].hpCur = 3; });
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = foeHits(heroId, foeId);
    expect(G().chars[0].hpCur).toBe(1);
    expect(r.extra).toMatch(/Sturdy/);
    update(s => { s.chars[0].hpCur = 3; });
    foeHits(heroId, foeId);
    expect(G().chars[0].hpCur).toBe(0);
  });

  it('Flash Fire takes no damage from Fire moves', () => {
    const { heroId, foeId } = versus('Litwick', 'flash-fire');
    const before = G().chars[0].hpCur;
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = foeHits(heroId, foeId, 'fire');
    expect(r.dmg).toBe(0);
    expect(G().chars[0].hpCur).toBe(before);
    expect(G().game.battle!.flags?.[heroId]?.flash).toBe(true);
  });
});

describe('own dice', () => {
  it("uses the player's d20 and damage roll, adding the usual bonuses", () => {
    const one = (dmg: number) => {
      const { heroId, foeId } = duel();
      let res: AttackResult | null = null;
      update(s => {
        const hero = s.chars.find(c => c.id === heroId)!, foe = s.game.battle!.enemies.find(e => e.id === foeId)!;
        const mv = equippedOf(hero).find(m => m.name === 'flamethrower')!;
        res = resolveMove(hero, mv, foe, { d20: 20, dmg });
      });
      return res!;
    };
    const a = one(5), b = one(10);
    expect(a.manual).toBe(true);
    expect(a.d20).toBe(20);
    expect(a.hit).toBe(true);
    expect(b.dmg! - a.dmg!).toBe(10); // 5 more dice damage, doubled: Fire is super effective on Bulbasaur
  });
});

describe('Rescue Corps field heal', () => {
  it('costs less the better the team gets along', () => {
    expect(healPrice(2, -2)).toBeNull();
    expect(healPrice(2, 0)).toBe(300);
    expect(healPrice(2, 1)).toBe(150);
    expect(healPrice(2, 2)).toBe(0);
  });
});

describe('haggle', () => {
  it('gives bigger discounts for higher Charisma totals', () => {
    expect([9, 10, 14, 15, 19, 20, 25].map(haggleOff)).toEqual([0, 10, 10, 20, 20, 30, 30]);
  });
});


describe('music', () => {
  it('picks the track for the scene, most specific first', () => {
    const { heroId } = duel();
    expect(musicFor(G())).toEqual(['battle']);
    update(s => { s.game.battle!.enemies[0].boss = true; });
    expect(musicFor(G())).toEqual(['boss', 'battle']);
    update(s => { s.game.battle = null; s.dungeon = { state: 'in', name: 'L', kind: 'labyrinth', to: 3 } as typeof s.dungeon; });
    expect(musicFor(G())).toEqual(['labyrinth-3', 'labyrinth']);
    update(s => { s.dungeon = { state: 'idle', name: '' }; s.world.layer = 1; s.world.at = '1:waystone'; });
    expect(musicFor(G())).toEqual(['town-1', 'town']);
    expect(heroId).toBeTruthy();
  });
});

describe('field effects', () => {
  it('Steam Fog gives the other side disadvantage', () => {
    const { heroId, foeId } = duel();
    update(s => { s.game.battle!.fx = [{ id: 'f1', name: 'Steam Fog', side: 'enemy', kind: 'dis', amt: 0, rounds: 2 }]; });
    const rolls = [0.95, 0.05]; // a 20 then a 2: disadvantage keeps the 2
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.5);
    const r = attack(heroId, foeId)!;
    expect(r.dis).toBe(true);
    expect(r.d20).toBe(2);
    expect(r.fx).toBe('Steam Fog');
  });
  it('counts down at the end of each round and then fades', () => {
    duel();
    update(s => { const b = s.game.battle!; b.fx = [{ id: 'f2', name: 'Tailwind', side: 'team', kind: 'hit', amt: 2, rounds: 1 }]; b.turn = b.order.length - 1; nextTurn(); });
    expect(G().game.battle!.fx).toEqual([]);
  });
});

describe('game codes', () => {
  it('need 8 to 40 letters, numbers or dashes', async () => {
    const { validCode } = await import('./firebase');
    expect(['labyrinth-crew-42', 'ABCDEFGH', ' team-1234 '].map(validCode)).toEqual([true, true, true]);
    expect(['short', 'has space here', 'emoji🔥code', 'a'.repeat(41)].map(validCode)).toEqual([false, false, false, false]);
  });
});

describe('item notifications', () => {
  it('reports items that arrive in my bag or team storage, not in other bags', async () => {
    const { itemGains, blankShared } = await import('./store');
    const mk = (id: string, player: string, items: { name: string; qty: number }[]) => ({ id, player, species: 'aron', nickname: '', items }) as unknown as Char;
    const prev = { ...blankShared(), chars: [mk('a', 'Luis', [{ name: 'Oran Berry', qty: 1 }]), mk('b', 'Juan', [])] };
    const next = { ...blankShared(), chars: [mk('a', 'Luis', [{ name: 'Oran Berry', qty: 3 }, { name: 'Escape Rope', qty: 1 }]), mk('b', 'Juan', [{ name: 'Potion', qty: 1 }])],
      storage: { items: [{ name: 'Apple', qty: 1, note: '', itemId: 'apple', tm: '' }], poke: 0 } };
    const msgs = itemGains(prev as never, next as never, c => c.player === 'Luis');
    expect(msgs).toEqual(['🎁 Aron got Oran Berry ×2, Escape Rope!', '📦 Team storage got Apple.']);
  });
});

describe('shiny sprites', () => {
  it('use the bundled shiny Aron line, and the normal sprite for other shinies', async () => {
    const sprites = JSON.parse(readFileSync('public/sprites.json', 'utf8'));
    vi.stubGlobal('fetch', async () => ({ json: async () => sprites }));
    const { loadSpriteIds, spriteUrl } = await import('./pokeapi');
    await loadSpriteIds();
    expect(spriteUrl('Aron', true)).toBe(sprites.shiny[sprites.names.aron]);
    expect(spriteUrl('Aggron', true)).not.toBe(spriteUrl('Aggron', false));
    expect(spriteUrl('Riolu', true)).toBe(spriteUrl('Riolu', false));
    expect(spriteUrl('Aggron-Mega', true)).not.toBe(spriteUrl('Aggron-Mega', false)); // shiny stays shiny when it Mega Evolves
    vi.unstubAllGlobals();
  });
});

describe('graduation spar', () => {
  it('matches each rival to the player line it chose, at that level, and attacks them first', async () => {
    const { startRivalSpar, autoTurn } = await import('./battle');
    const riolu = createChar('Riolu', '', 'Juan', 6), aron = createChar('Aron', '', 'Christian', 3);
    update(s => { s.chars = [riolu, aron]; s.game.battle = null; startRivalSpar(); s.game.battle!.phase = 'fight'; });
    const b = G().game.battle!;
    const kip = b.enemies.find(e => e.name.startsWith('Kip'))!, pebble = b.enemies.find(e => e.name.startsWith('Pebble'))!;
    expect(b.enemies).toHaveLength(4);
    expect([kip.focus, kip.level]).toEqual([riolu.id, 6]);
    expect([pebble.focus, pebble.level]).toEqual([aron.id, 3]);
    expect(b.enemies.find(e => e.name.startsWith('Zephyr'))!.focus).toBeUndefined();
    // With a move that hits Riolu normally, Kip goes after the rival it chose.
    update(s => { const bb = s.game.battle!; bb.enemies.find(e => e.id === kip.id)!.moves = [{ name: 'slash', type: 'normal', cls: 'physical', dice: '2d8', ppMax: null, ppCur: 0 } as never]; bb.turn = bb.order.findIndex(o => o.id === kip.id); autoTurn(); });
    expect(G().game.battle!.last?.target).toBe('Riolu');
    // Evolved into Lucario (Steel), Kip's moves barely scratch it, so a smart rival picks another target.
    update(s => { const c = s.chars.find(x => x.id === riolu.id)!; c.species = 'lucario'; c.types = ['fighting', 'steel']; const bb = s.game.battle!; bb.enemies.find(e => e.id === kip.id)!.moves.push({ name: 'assurance', type: 'dark', cls: 'physical', dice: '2d6', ppMax: null, ppCur: 0 } as never); bb.turn = bb.order.findIndex(o => o.id === kip.id); autoTurn(); });
    expect(G().game.battle!.last?.target).not.toBe('Lucario');
  });
});

describe('weapons and armor', () => {
  it('armor raises Guard; a physical weapon helps physical moves only', async () => {
    const { AC, SAC, weaponHit, heldDmg } = await import('./rules');
    const c = createChar('Aron', '', 'Luis', 5);
    const g0 = AC(c), s0 = SAC(c);
    c.armor = { itemId: 'dragonhide', name: 'Dragonhide Armor' };
    expect([AC(c) - g0, SAC(c) - s0]).toEqual([2, 1]);
    c.weapon = { itemId: 'spikedbracer', name: 'Spiked Bracer' };
    const phys = { cls: 'physical', type: 'rock' } as never, spec = { cls: 'special', type: 'rock' } as never;
    expect([heldDmg(c, phys), heldDmg(c, spec)]).toEqual([2, 0]);
    c.weapon = { itemId: 'championgauntlet', name: "Champion's Gauntlet" };
    expect([weaponHit(c, phys), weaponHit(c, spec)]).toEqual([2, 2]);
  });
});

describe('status conditions', () => {
  it('burns hurt, sleep skips turns, types are immune, and battles clear them', async () => {
    const { setStatus, statusTick, checkEnd } = await import('./battle');
    const { heroId, foeId } = duel();
    update(s => {
      const hero = s.chars.find(c => c.id === heroId)!, foe = s.game.battle!.enemies.find(e => e.id === foeId)!;
      expect(setStatus(hero, 'burn')).toMatch(/can't be burned/); // Charmander is Fire type
      expect(hero.status).toBeFalsy();
      setStatus(foe, 'burn');
      const hp = foe.hpCur;
      expect(statusTick(foe)).toBe(false);
      expect(foe.hpCur).toBeLessThan(hp);
      setStatus(foe, 'sleep');
      vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1: stays asleep
      expect(statusTick(foe)).toBe(true);
      vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 = 20: wakes
      expect(statusTick(foe)).toBe(false);
      expect(foe.status).toBeNull();
      setStatus(hero, 'paralysis');
      foe.hpCur = 0; foe.outReason = 'Fainted'; checkEnd();
      expect(s.game.battle!.result).toBe('win');
      expect(hero.status).toBeNull();
    });
  });
});

describe('previously on', () => {
  it('recaps the highlights of the last finished session, oldest first', async () => {
    const { recapLines } = await import('./recap');
    const h = 3600e3, now = 100 * h;
    const log = [ // newest first
      { id: '1', t: now - 1 * h, who: '', text: 'The team traveled to Lumen Market.' },
      { id: '2', t: now - 30 * h, who: '', text: 'Riolu reached level 3.' },
      { id: '3', t: now - 30.5 * h, who: '', text: 'Dennis bought Potion for ₽ 50.' },
      { id: '4', t: now - 31 * h, who: '', text: 'Quest complete: Find the lost Pichu.' },
      { id: '5', t: now - 60 * h, who: '', text: 'Aron evolved into Lairon!' },
    ];
    expect(recapLines(log, now)).toEqual(['Quest complete: Find the lost Pichu.', 'Riolu reached level 3.']);
  });
});

describe('rivals in the overworld', () => {
  it('only show up after the graduation spar', async () => {
    const { exploreWild, layerNodes } = await import('./explore');
    const meadow = layerNodes(0).find(n => n.kind === 'wild')!;
    update(s => { s.chars = [createChar('Riolu', '', 'Juan', 4)]; s.world.sparDone = false; });
    vi.spyOn(Math, 'random').mockReturnValue(0.85); // d20 = 18
    update(() => { expect(exploreWild(0, meadow).kind).toBe('rescue'); });
    update(s => { s.world.sparDone = true; });
    update(() => {
      const ev = exploreWild(0, meadow);
      expect(ev.kind).toBe('battle');
      expect(ev.text).toMatch(/Team Razorwind/);
      expect(ev.enemies!.every(e => e.rival && e.overworld && e.level === 4)).toBe(true);
    });
  });
});

describe('backups', () => {
  it('restore the whole game, fill gaps in damaged Pokémon, and refuse junk', async () => {
    const { parseBackup } = await import('./rules');
    const c = createChar('Aron', 'Tank', 'Luis', 4);
    const full = parseBackup(JSON.stringify({ kind: 'pmd-team', version: 3, state: { chars: [c], world: { layer: 2, quests: [] }, log: { entries: [] } } }));
    expect(full.kind).toBe('team');
    expect(full.kind === 'team' && full.state.world?.layer).toBe(2);
    const old = parseBackup(JSON.stringify({ kind: 'pmd-team', state: { chars: [c], storage: { items: [], poke: 5 } } }));
    expect(old.kind === 'team' && old.state.world).toBeUndefined(); // older backups keep world progress as it is
    const damaged = parseBackup(JSON.stringify({ kind: 'pmd-character', char: { species: 'riolu', level: 99, moves: 'oops' } }));
    expect(damaged.kind).toBe('char');
    if (damaged.kind === 'char') {
      expect(damaged.char.level).toBe(20);
      expect([damaged.char.moves, damaged.char.items, damaged.char.equipped]).toEqual([[], [], []]);
      expect(damaged.char.hpCur).toBeGreaterThan(0);
    }
    expect(parseBackup('{"kind":"pmd-character","char":{"level":3}}').kind).toBe('error');
    expect(parseBackup('not json').kind).toBe('error');
    expect(parseBackup(JSON.stringify({ kind: 'pmd-team', state: { chars: [{ nope: 1 }] } })).kind).toBe('error');
  });
});

describe('sync', () => {
  it("keeps both players' votes when they vote at the same moment", async () => {
    const { mergeWorld } = await import('./sync');
    const base = blankSharedWorld();
    const mine = { ...base, votes: { Luis: '0:h-market' } }, theirs = { ...base, layer: 0, votes: { Juan: '0:stairs' } };
    expect(mergeWorld(mine, theirs, 'Luis').votes).toEqual({ Juan: '0:stairs', Luis: '0:h-market' });
    expect(mergeWorld({ ...base, votes: {} }, { ...base, votes: { Luis: 'x', Juan: 'y' } }, 'Luis').votes).toEqual({ Juan: 'y' }); // I un-voted
  });
});
function blankSharedWorld() { return { layer: 0, at: '0:waystone', unlocked: [0], deepest: 0, votes: {} as Record<string, string>, shop: {}, area: {}, rifts: {}, announce: null, met: {}, bond: {}, quests: [] }; }

describe('undo', () => {
  it("reverses the DM's last change, and is cleared when someone else changes the game", async () => {
    const { undo, canUndo, replaceFromRemote } = await import('./store');
    update(s => { s.storage.poke = 100; });
    const layer = G().world.layer;
    update(s => { s.storage.poke = 999; s.world.layer = 7; });
    undo();
    expect([G().storage.poke, G().world.layer]).toEqual([100, layer]);
    update(s => { s.storage.poke = 5; });
    expect(canUndo()).toBe(true);
    replaceFromRemote({ ...G(), storage: { ...G().storage, poke: 7 } }); // another player's change arrives
    expect(canUndo()).toBe(false);
    expect(G().storage.poke).toBe(7);
  });
});

describe('automatic backups', () => {
  it('keep one copy per day for the last 3 days', async () => {
    const { saveBackup, autoBackups } = await import('./store');
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } });
    const day = 86400e3, t0 = Date.UTC(2026, 10, 1, 12);
    for (const [d, poke] of [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5]]) saveBackup({ ...G(), storage: { items: [], poke } }, t0 + d * day);
    const list = autoBackups();
    expect(list.map(b => b.day)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02']);
    expect(list.map(b => b.state.storage.poke)).toEqual([5, 4, 3]);
    vi.unstubAllGlobals();
  });
});

describe('status moves', () => {
  it('roll a save against the DC and apply the status on a fail', () => {
    const { heroId, foeId } = duel();
    const wave = { name: 'thunder-wave', type: 'electric', cls: 'status', dice: '', ppMax: null, ppCur: 0, desc: '' } as never;
    vi.spyOn(Math, 'random').mockReturnValue(0); // the target rolls a 1
    let r: AttackResult | null = null;
    update(s => { const hero = s.chars.find(c => c.id === heroId)!, foe = s.game.battle!.enemies.find(e => e.id === foeId)!; r = resolveMove(hero, wave, foe); });
    expect(r!.save).toMatch(/failed\. .*paralyzed/i);
    expect(G().game.battle!.enemies.find(e => e.id === foeId)!.status).toBe('paralysis');
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // a 20 always saves
    update(s => { const hero = s.chars.find(c => c.id === heroId)!, foe = s.game.battle!.enemies.find(e => e.id === foeId)!; foe.status = null; r = resolveMove(hero, wave, foe); });
    expect(r!.save).toMatch(/saved\. .*resists/);
    // Will-O-Wisp on a Fire type: fails the save but is immune.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    update(s => { const hero = s.chars.find(c => c.id === heroId)!, foe = s.game.battle!.enemies.find(e => e.id === foeId)!; r = resolveMove(foe, { ...(wave as object), name: 'will-o-wisp', type: 'fire' } as never, hero); });
    expect(r!.save).toMatch(/can't be burned/);
  });
});

describe('initiative re-rolls', () => {
  it('lets only the DM type a new d20, and only before the fight begins', () => {
    const { heroId } = duel();
    const entry = () => G().game.battle!.order.find(o => o.id === heroId)!;
    update(s => { s.game.battle!.phase = 'intro'; });
    setUi({ meName: 'Luis' });
    const before = entry().init;
    update(() => setInitRoll(heroId, 20));
    expect(entry().init).toBe(before); // a player can't
    setUi({ meName: 'Dennis' });
    update(() => setInitRoll(heroId, 20));
    expect(entry()).toMatchObject({ r1: 20, r2: null, init: 20 + entry().mod });
    expect(G().game.battle!.order[0].id).toBe(heroId); // the order re-sorts (a hero wins ties)
    update(s => { s.game.battle!.phase = 'fight'; setInitRoll(heroId, 2); });
    expect(entry().r1).toBe(20);
    setUi({ meName: null });
  });
});

describe('level-ups and evolutions', () => {
  it('are announced to every device, and an evolution resets the picture', () => {
    const c = createChar('Mudkip', '', 'Luis', 3);
    c.img = 'data:old-picture';
    update(s => { s.chars = [c]; s.game.events = []; changeLevel(s.chars[0], 1); }); // Mudkip evolves at level 4
    const [lvl, evo] = G().game.events!;
    expect(lvl).toMatchObject({ kind: 'level', char: c.id, level: 4 });
    expect(evo).toMatchObject({ kind: 'evo', char: c.id, from: 'Mudkip', to: 'Marshtomp', species: 'marshtomp' });
    expect(G().chars[0]).toMatchObject({ species: 'marshtomp', img: '' });
  });
});

describe('automatic move effects', () => {
  const both = (fn: (hero: Char, foe: Enemy) => void) => update(s => fn(s.chars[0], s.game.battle!.enemies[0]));
  const mv = (o: object) => ({ name: 'x', type: 'normal', cls: 'status', dice: '', ppMax: null, ppCur: 0, desc: '', ...o }) as never;

  it('reads stat changes and status chances from the move text', () => {
    expect(stageFx("Raises the user's Attack and Defense by 1.")).toEqual({ who: 'self', by: 1, stats: ['atk', 'def'] });
    expect(stageFx('Lowers the foe(s) Sp. Atk by 2 if opposite gender.')).toEqual({ who: 'foes', by: -2, stats: ['spa'] });
    expect(stageFx('Heals the user.')).toBeNull();
    expect(sideStatus('10% chance to burn. 10% chance to flinch.')).toEqual({ pct: 10, st: 'burn' });
    expect(sideStatus('Lasts 2-3 turns. Confuses the user afterwards.')).toBeNull();
  });

  it('Swords Dance and Leer change the to-hit math, up to 3 stages', () => {
    duel();
    const tackle = mv({ cls: 'physical', dice: '1d8' });
    let base = 0, baseDef = 0;
    both((hero, foe) => { ({ bonus: base, def: baseDef } = toHit(hero, tackle, foe)); });
    both((hero, foe) => { resolveMove(hero, mv({ desc: "Raises the user's Attack by 2." }), foe); resolveMove(hero, mv({ desc: 'Lowers the foe(s) Defense by 1.' }), foe); });
    both((hero, foe) => { expect(toHit(hero, tackle, foe)).toMatchObject({ bonus: base + 2, def: baseDef - 1 }); });
    both((hero, foe) => { resolveMove(hero, mv({ desc: "Raises the user's Attack by 2." }), foe); expect(toHit(hero, tackle, foe).bonus).toBe(base + 3); });
  });

  it('a hit rolls the move’s own status chance', () => {
    duel();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 hits; d100 51 is within 100%
    both((hero, foe) => { foe.hpCur = foe.hpMax = 500; resolveMove(hero, mv({ cls: 'physical', dice: '1d8', desc: '100% chance to paralyze the target.' }), foe); });
    expect(G().game.battle!.enemies[0].status).toBe('paralysis');
  });

  it('a homebrew ability resolves itself once per battle', () => {
    duel();
    vi.spyOn(Math, 'random').mockReturnValue(0); // the foe rolls a 1 on its save
    both(hero => { hero.homebrew = { name: 'Cinder Glare', desc: 'A stare that burns.', state: 'approved', fx: { kind: 'status', status: 'paralysis' } }; });
    both((hero, foe) => { expect(abilityInfo(hero)).toMatchObject({ name: 'Cinder Glare', used: false }); triggerAbility(hero, foe); });
    expect(G().game.battle!.enemies[0].status).toBe('paralysis');
    expect(G().game.battle!.last).toMatchObject({ ability: true, move: 'Cinder Glare' });
    expect(() => both((hero, foe) => triggerAbility(hero, foe))).toThrow(/already used/);
  });

  it('a shield ability halves the next hit only', () => {
    duel();
    both(hero => { hero.homebrew = { name: 'Wax Shield', desc: 'Hardened wax.', state: 'approved', fx: { kind: 'guard' } }; });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hit = () => { let d = 0; both((hero, foe) => { hero.hpCur = 999; d = resolveMove(foe, mv({ cls: 'physical', dice: '1d8' }), hero)!.dmg!; }); return d; };
    const full = hit();
    both((hero, foe) => triggerAbility(hero, foe));
    expect(hit()).toBe(Math.max(1, Math.floor(full / 2)));
    expect(hit()).toBe(full);
  });

  it('every other status move resolves itself: heals, Protect, and a simple edge for the rest', () => {
    duel();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const tackle = mv({ cls: 'physical', dice: '1d8' });
    both((hero, foe) => { hero.hpCur = 1; const r = resolveMove(hero, mv({ desc: 'Heals the user by 50% of its max HP.' }), foe)!; expect(r.heal).toBe(Math.floor(maxHP(hero) / 2)); expect(hero.hpCur).toBe(1 + r.heal!); });
    both((hero, foe) => {
      resolveMove(hero, mv({ desc: 'Prevents moves from affecting the user this turn.' }), foe);
      const hp = hero.hpCur, r = resolveMove(foe, tackle, hero)!;
      expect(r.hit).toBe(false); expect(r.extra).toMatch(/protected itself/); expect(hero.hpCur).toBe(hp);
      expect(resolveMove(foe, tackle, hero)!.d20).toBe(11); // only the first attack is blocked
    });
    vi.spyOn(Math, 'random').mockReturnValue(0); // the foe fails its save
    both((hero, foe) => {
      expect(resolveMove(hero, mv({ desc: 'Target repeats its last move for its next 3 turns.' }), foe)!.save).toMatch(/failed\. .*disadvantage/);
      expect(resolveMove(foe, tackle, hero)!.dis).toBe(true);
      expect(resolveMove(hero, mv({ desc: 'No competitive use.' }), hero)!.save).toMatch(/advantage on its next attack/);
      expect(resolveMove(hero, tackle, foe)!.adv).toBe(true);
      expect(resolveMove(hero, tackle, foe)!.adv).toBe(false);
    });
  });

  it('unlocked skill-tree entries with a bonus change the numbers, and add ability uses', () => {
    duel();
    const tackle = mv({ cls: 'physical', dice: '1d8' });
    let hit = 0, guard = 0, hp = 0;
    both((hero, foe) => { hit = toHit(hero, tackle, foe).bonus; guard = AC(hero); hp = maxHP(hero); });
    both(hero => { const n = hero.tree.physical.nodes; ['hit', 'guard', 'hp', 'uses'].forEach((fx, i) => { n[i].fx = fx; n[i].on = i !== 1; }); });
    both((hero, foe) => { expect(toHit(hero, tackle, foe).bonus).toBe(hit + 1); expect(AC(hero)).toBe(guard); expect(maxHP(hero)).toBe(hp + 4); });
    both((hero, foe) => { hero.ability = 'blaze'; expect(abilityInfo(hero)).toMatchObject({ left: 2 }); triggerAbility(hero, foe); triggerAbility(hero, foe); expect(abilityInfo(hero)!.used).toBe(true); });
  });
});

describe('rolled stats and personality', () => {
  it('rolls six scores at creation, and locks them once the player places them', () => {
    const c = createChar('Charmander', '', 'Luis', 3);
    expect(c.rolled).toHaveLength(6);
    c.rolled!.forEach(n => { expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(18); });
    c.rolled = [18, 15, 14, 12, 10, 8];
    update(s => {
      s.chars = [c];
      expect(() => lockScores(c, { atk: 0, def: 0, spe: 2, spa: 3, spd: 4, heart: 5 })).toThrow(/every stat/);
      lockScores(c, { atk: 5, def: 1, spe: 2, spa: 0, spd: 4, heart: 3 });
      expect([score(c, 'spa'), score(c, 'atk'), score(c, 'heart')]).toEqual([18, 8, 12]);
      expect(c.hpCur).toBe(maxHP(c));
      expect(() => lockScores(c, { atk: 0, def: 1, spe: 2, spa: 3, spd: 4, heart: 5 })).toThrow(/already locked/);
    });
  });

  it('an approved nature shifts two modifiers, and the quiz gives a nature and a demeanor', () => {
    const c = createChar('Charmander', '', 'Luis', 3), atk = M(c, 'atk'), spa = M(c, 'spa');
    c.persona = { nature: 'adamant', demeanor: 'suspicious' };
    expect(M(c, 'atk')).toBe(atk); // not approved yet
    c.persona.ok = true;
    expect([M(c, 'atk'), M(c, 'spa'), M(c, 'def')]).toEqual([atk + 1, spa - 1, M({ ...c, persona: undefined } as Char, 'def')]);
    expect(quizResult([0, 1, 2, 2, 2, 3, 0, 3])).toMatchObject({ demeanor: 'suspicious' });
    expect(quizResult([3, 3, 0, 1, 1, 1, 2, 0])).toEqual({ nature: 'lonely', demeanor: 'fearless' });
  });

  it('Inspiration gives advantage on one attack', () => {
    const { heroId, foeId } = duel();
    update(s => { s.chars[0].inspired = true; });
    expect(attack(heroId, foeId)!.adv).toBe(true);
    expect(G().chars[0].inspired).toBe(false);
    expect(attack(heroId, foeId)!.adv).toBe(false);
  });
});

describe('PP', () => {
  it('every move in the Pokédex gets valid PP and dice', () => {
    const dex = JSON.parse(readFileSync('public/dex.json', 'utf8'));
    const names = Object.values(dex.m as Record<string, [string]>).map(m => m[0]);
    expect(names.length).toBeGreaterThan(500);
    names.forEach(n => {
      const mv = toTableMove(getMove(n));
      expect(mv.ppMax === null || [1, 3, 5, 6].includes(mv.ppMax), `${n} PP ${mv.ppMax}`).toBe(true);
      expect(mv.ppCur, n).toBe(mv.ppMax);
      expect(mv.cls === 'status' ? mv.dice === '' : /^\dd\d$/.test(mv.dice), `${n} dice ${mv.dice}`).toBe(true);
    });
  });

  it('forgetting and relearning a move does not refill its PP, but a long rest does', () => {
    const c = createChar('Charmander', '', 'Luis', 5), flame = () => toTableMove(getMove('Surf'));
    expect(learnMove(c, flame())).toBe(true);
    expect(learnMove(c, flame())).toBe(false); // already known
    const mv = c.moves.find(m => m.name === 'surf')!;
    mv.ppCur = 1;
    forgetMove(c, 'surf');
    learnMove(c, flame());
    expect(c.moves.find(m => m.name === 'surf')!.ppCur).toBe(1);
    forgetMove(c, 'surf');
    longRest(c);
    learnMove(c, flame());
    const again = c.moves.find(m => m.name === 'surf')!;
    expect(again.ppCur).toBe(again.ppMax);
  });

  it('a damaged file gets its PP put back in range', () => {
    const c = createChar('Charmander', '', 'Luis', 5), raw = JSON.parse(JSON.stringify(c));
    raw.moves = [{ ...toTableMove(getMove('Flamethrower')), ppCur: 99 }, { ...toTableMove(getMove('Fire Blast')), ppCur: null }, { ...toTableMove(getMove('Slash')), ppCur: -4 }];
    expect(cleanChar(raw)!.moves.map(m => [m.ppCur, m.ppMax])).toEqual([[5, 5], [1, 1], [0, 6]]);
  });
});

describe('the three logs', () => {
  it('sorts entries into adventure, battle and items, and keeps each kind separately', () => {
    const kinds = (texts: string[]) => texts.map(text => logKind({ text }));
    expect(kinds(['The team met Guildmaster Ivy.', 'The team traveled to Bloomrest Glade.', 'Dennis gave 30 XP to the team.', 'Riolu reached level 4.', 'Dennis rolled stats for Aron: 10, 12, 9, 14, 15, 8.'])).toEqual(['story', 'story', 'story', 'story', 'story']);
    expect(kinds(['The team won a battle!', 'XP: Riolu +40.', 'Wick used Ember: 14 to hit (rolled 12+2), 5 fire damage.', 'Shadow Zubat was purified by Riolu.'])).toEqual(['battle', 'battle', 'battle', 'battle']);
    expect(kinds(['Luis bought Oran Berry for ₽50. It went to team storage.', 'Loot found: Potion, ₽120.', 'Dennis gave Escape Rope to Riolu.', 'Riolu is now holding Soothe Bell.'])).toEqual(['item', 'item', 'item', 'item']);
    expect(logKind({ text: 'The team won a battle!', kind: 'story' })).toBe('story');
    update(s => { s.log.entries = []; addLog('The team met Old Maren.'); for (let i = 0; i < LOG_KEEP + 30; i++) addLog('The team won a battle!'); });
    const e = G().log.entries;
    expect(e.filter(x => logKind(x) === 'battle')).toHaveLength(LOG_KEEP);
    expect(e.some(x => x.text === 'The team met Old Maren.')).toBe(true);
  });
});

describe('DM shops and chosen encounters', () => {
  it('stocks a shop by kind, and a discount never stacks', async () => {
    const { SHOP_KINDS, rollDmShop, setShopOff, exploreWild, layerNodes } = await import('./explore');
    const { ITEM_BY_ID } = await import('./data');
    for (const kind of ['berry', 'weapon', 'armor', 'med', 'material']) {
      const stock = rollDmShop(kind, 2);
      expect(stock.length, kind).toBeGreaterThan(0);
      stock.forEach(l => expect(SHOP_KINDS[kind].cats, `${kind}: ${l.name}`).toContain(ITEM_BY_ID[l.itemId!].cat));
    }
    const tms = rollDmShop('tm', 2);
    expect(tms.length).toBeGreaterThan(2);
    tms.forEach(l => expect(l.name).toMatch(/^TM /));
    const sh = { stock: [{ ...tms[0], price: 200 }, { ...tms[1], price: 100, sold: true }] } as { stock: typeof tms; off?: number };
    setShopOff(sh, 50); setShopOff(sh, 25);
    expect(sh.stock.map(l => l.price)).toEqual([150, 100]); // from the first price, and sold lines stay put
    setShopOff(sh, 100);
    expect(sh.stock[0].price).toBe(0);
    setShopOff(sh, 0);
    expect(sh.stock[0].price).toBe(200);
    const wild = layerNodes(1).find(n => n.kind === 'wild')!;
    update(() => { expect([1, 9, 13, 15, 19].map(f => exploreWild(1, wild, f).kind)).toEqual(['battle', 'forage', 'merchant', 'rescue', 'treasure']); });
  });

  it('a purified Shadow joins the hero who reached out when nobody lands the final blow', () => {
    const hero = createChar('Charmander', 'Blaze', 'Luis', 5);
    update(s => {
      s.chars = [hero];
      const foe = buildEnemy('Zubat', 5, true, 'enemy');
      startBattle([hero.id], [foe], null, 'normal');
      const e = s.game.battle!.enemies[0];
      e.heartGauge = 20; e.purifier = hero.id; e.hpCur = 0;
      handleKO(e, null); // fainted from a burn
      expect(e.outReason).toMatch(/Purified/);
      expect(hero.assists.map(a => a.name)).toEqual(['Zubat']);
    });
  });
});

describe('real dice and several Pokémon per player', () => {
  it('a player chooses real dice for themselves, or the DM turns it on for everyone', () => {
    const a = createChar('Riolu', '', 'Juan', 3), b = createChar('Aron', '', 'Luis', 3);
    update(s => { s.chars = [a, b]; s.rules = { difficulty: 'normal' }; });
    expect([realDice(a), realDice(b)]).toEqual([false, false]);
    update(s => { s.rules.dice = { juan: true }; });
    expect([realDice(a), realDice(b)]).toEqual([true, false]);
    update(s => { s.rules.ownDice = true; });
    expect(realDice(b)).toBe(true);
    update(s => { s.rules = { difficulty: 'normal' }; });
  });

  it('keeps a travelling team of 6: extras wait in the Safe Zone and stay out of battles and loot', async () => {
    const { layerNodes } = await import('./explore');
    const haven = layerNodes(0).find(n => n.kind === 'haven')!, wild = layerNodes(0).find(n => n.kind === 'wild')!;
    const seven = Array.from({ length: 7 }, (_, i) => createChar('Riolu', 'R' + i, 'Juan', 1));
    seven[6].reserve = true;
    update(s => { s.chars = seven; s.game.battle = null; s.dungeon.state = 'idle'; s.world.at = wild.id; });
    expect(MAX_TEAM).toBe(6);
    expect(activeTeam()).toHaveLength(6);
    expect(lootTeam().some(c => c.reserve)).toBe(false);
    setUi({ meName: 'Juan' });
    expect(() => update(s => setReserve(s.chars[0], true))).toThrow(/Safe Zone/); // players swap only in a Safe Zone
    update(s => { s.world.at = haven.id; });
    expect(() => update(s => setReserve(s.chars[6], false))).toThrow(/full/);
    update(s => { setReserve(s.chars[0], true); setReserve(s.chars[6], false); });
    expect(activeTeam().map(c => c.nickname)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    setUi({ meName: 'Dennis' });
    update(s => { s.world.at = wild.id; setReserve(s.chars[1], true); }); // the DM can anywhere
    expect(activeTeam()).toHaveLength(5);
  });

  it('a stunt the DM rules on gives the next attack an edge, or trips it up', () => {
    const { heroId, foeId } = duel();
    setUi({ meName: 'Dennis' });
    const tryIt = (level: string, d20: number) => { update(s => { s.game.battle!.stunt = { id: heroId, text: 'Backflip strike', stat: 'spe' }; resolveStunt(level, d20); }); return G().game.battle!; };
    let b = tryIt('wild', 20);
    expect(b.last).toMatchObject({ stunt: true });
    expect(b.last!.save).toMatch(/it works! .*\+2d6/);
    expect(b.stunt).toBeUndefined();
    expect(attack(heroId, foeId)!.adv).toBe(true);
    expect(attack(heroId, foeId)!.adv).toBe(false);
    b = tryIt('easy', 1);
    expect(b.last!.save).toMatch(/goes wrong/);
    expect(attack(heroId, foeId)!.dis).toBe(true);
  });
});
