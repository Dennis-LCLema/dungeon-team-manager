import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rollDice } from '../lib/util';
import { bGet, buildEnemy, nextTurn, resolveMove, startBattle } from './battle';
import { setDex } from './dex';
import { resolveId } from './pokeapi';
import { musicFor } from './music';
import { createChar, effectiveness, equippedOf, haggleOff, healPrice } from './rules';
import { G, update } from './store';
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

describe('PokéAPI sprite ids', () => {
  it('matches exact names, then a listed form, then the base species', () => {
    const map = { aron: 304, 'deoxys-normal': 386, arceus: 493, 'vulpix-alola': 10103 };
    expect(resolveId(map, 'Aron')).toBe(304);
    expect(resolveId(map, 'Vulpix-Alola')).toBe(10103);
    expect(resolveId(map, 'Deoxys')).toBe(386);
    expect(resolveId(map, 'Arceus-Bug')).toBe(493);
    expect(resolveId(map, 'Notamon')).toBeNull();
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
    await loadSpriteIds(1);
    expect(spriteUrl('Aron', true)).toBe(sprites.shiny[sprites.names.aron]);
    expect(spriteUrl('Aggron', true)).not.toBe(spriteUrl('Aggron', false));
    expect(spriteUrl('Riolu', true)).toBe(spriteUrl('Riolu', false));
    vi.unstubAllGlobals();
  });
});

describe('graduation spar', () => {
  it('matches each rival to the player line it chose, at that level, and attacks them first', async () => {
    const { startRivalSpar, autoTurn } = await import('./battle');
    const riolu = createChar('Lucario', '', 'Juan', 6), aron = createChar('Aron', '', 'Christian', 3);
    update(s => { s.chars = [riolu, aron]; s.game.battle = null; startRivalSpar(); s.game.battle!.phase = 'fight'; });
    const b = G().game.battle!;
    const kip = b.enemies.find(e => e.name.startsWith('Kip'))!, pebble = b.enemies.find(e => e.name.startsWith('Pebble'))!;
    expect(b.enemies).toHaveLength(4);
    expect([kip.focus, kip.level]).toEqual([riolu.id, 6]);
    expect([pebble.focus, pebble.level]).toEqual([aron.id, 3]);
    expect(b.enemies.find(e => e.name.startsWith('Zephyr'))!.focus).toBeUndefined();
    update(s => { const bb = s.game.battle!; bb.turn = bb.order.findIndex(o => o.id === kip.id); autoTurn(); });
    expect(G().game.battle!.last?.target).toBe('Lucario');
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
