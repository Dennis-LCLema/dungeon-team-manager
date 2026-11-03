// Static game tables, carried over unchanged from the original app.
import { T, slug } from '../lib/util';
import type { StatKey } from './types';

export interface Fx {
  heal?: string; cure?: string; pp?: number | string; autoRevive?: boolean; throw?: string; save?: string; revealTraps?: boolean;
  levelUp?: number; escape?: boolean; reveal?: boolean; stat?: Partial<Record<StatKey | 'heart', number>>; init?: number; crit?: number;
  regen?: number; sash?: boolean; lifeOrb?: boolean; friend?: boolean; noEvo?: boolean; typeDmg?: string; evo?: string; evoTrade?: boolean;
  purify?: number; heart?: number; teamHeal?: string; keep?: boolean; revealStairs?: boolean; box?: boolean; revive?: number; tm?: string;
  /** Weapon: to-hit and damage bonuses (wDie rolled each hit), only for moves of class wCls when set. Armor: Guard and Sp. Guard. */
  wHit?: number; wDmg?: number; wDie?: string; wCls?: 'physical' | 'special'; guard?: number; spguard?: number;
}
export interface ItemDef { id: string; n: string; cat: string; r: string; v: number; d: string; fx: Fx; noDrop?: boolean }

export const CHART: Record<string, Record<string, number>> = {
  normal:{rock:.5,ghost:0,steel:.5},
  fire:{fire:.5,water:.5,grass:2,ice:2,bug:2,rock:.5,dragon:.5,steel:2},
  water:{fire:2,water:.5,grass:.5,ground:2,rock:2,dragon:.5},
  electric:{water:2,electric:.5,grass:.5,ground:0,flying:2,dragon:.5},
  grass:{fire:.5,water:2,grass:.5,poison:.5,ground:2,flying:.5,bug:.5,rock:2,dragon:.5,steel:.5},
  ice:{fire:.5,water:.5,grass:2,ice:.5,ground:2,flying:2,dragon:2,steel:.5},
  fighting:{normal:2,ice:2,poison:.5,flying:.5,psychic:.5,bug:.5,rock:2,ghost:0,dark:2,steel:2,fairy:.5},
  poison:{grass:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0,fairy:2},
  ground:{fire:2,electric:2,grass:.5,poison:2,flying:0,bug:.5,rock:2,steel:2},
  flying:{electric:.5,grass:2,fighting:2,bug:2,rock:.5,steel:.5},
  psychic:{fighting:2,poison:2,psychic:.5,dark:0,steel:.5},
  bug:{fire:.5,grass:2,fighting:.5,poison:.5,flying:.5,psychic:2,ghost:.5,dark:2,steel:.5,fairy:.5},
  rock:{fire:2,ice:2,fighting:.5,ground:.5,flying:2,bug:2,steel:.5},
  ghost:{normal:0,psychic:2,ghost:2,dark:.5},
  dragon:{dragon:2,steel:.5,fairy:0},
  dark:{fighting:.5,psychic:2,ghost:2,dark:.5,fairy:.5},
  steel:{fire:.5,water:.5,electric:.5,ice:2,rock:2,steel:.5,fairy:2},
  fairy:{fire:.5,fighting:2,poison:.5,dragon:2,dark:2,steel:.5}
};
export const TYPES = Object.keys(CHART);
export const TCOL: Record<string, string> = {normal:'#A8A77A',fire:'#EE8130',water:'#6390F0',electric:'#F7D02C',grass:'#7AC74C',ice:'#96D9D6',fighting:'#C22E28',poison:'#A33EA1',ground:'#E2BF65',flying:'#A98FF3',psychic:'#F95587',bug:'#A6B91A',rock:'#B6A136',ghost:'#735797',dragon:'#6F35FC',dark:'#705746',steel:'#B7B7CE',fairy:'#D685AD',shadow:'#3b2a5c'};
export const LIGHT_TYPES = ['electric','ice','ground','steel','normal','bug','grass','rock','flying','fairy'];

export const MASTERY: Record<number, string> = {
  1:'STAB: add your proficiency bonus to damage with moves of your own type.',
  2:'Type rider: on a crit with your type, apply a status (burn, paralyze, etc., DM picks).',
  3:'Awakening: you may awaken a second type (the DM sets it in Species data).',
  4:'Type aura: allies who share your type get +1 to attack rolls within 15 ft.'
};

export const STATS: [StatKey, string, string][] = [['atk','Attack','STR'],['def','Defense','CON'],['spe','Speed','DEX'],['spa','Sp. Atk','INT'],['spd','Sp. Def','WIS']];
export const DIFF: Record<string, { n: string; hp: number; dmg: number; d: string }> = {
  easy:{ n:'Easy', hp:.85, dmg:.75, d:'Enemies have less HP and hit softer. Good for learning the game.' },
  normal:{ n:'Normal', hp:1.1, dmg:1, d:'Fights take a few rounds and cost some HP. Heroes rarely faint, but a long dungeon wears the team down.' },
  hard:{ n:'Hard', hp:1.3, dmg:1.25, d:'Tougher, harder-hitting enemies. Plan moves and use items.' },
  brutal:{ n:'Brutal', hp:1.6, dmg:1.5, d:'For a strong or high-level team. Expect someone to faint.' }
};

export const RAR: Record<string, string> = { c:'Common', u:'Uncommon', r:'Rare', v:'Very rare', l:'Legendary' };
export const CATS: Record<string, string> = { berry:'Berries', seed:'Seeds', orb:'Orbs', med:'Medicine', held:'Held items', weapon:'Weapons', armor:'Armor', evo:'Evolution items', shadow:'Purification', gear:'Explorer gear', treasure:'Treasure', gummi:'Gummis', tm:'TMs' };
const It = (id: string, n: string, cat: string, r: string, v: number, d: string, fx?: Fx, extra?: Partial<ItemDef>): ItemDef => Object.assign({ id, n, cat, r, v, d, fx: fx || {} }, extra || {});
export const ITEMS: ItemDef[] = [
  It('oran', 'Oran Berry', 'berry', 'c', 20, 'Eat: heal 2d4+2 HP.', { heal:'2d4+2' }),
  It('sitrus', 'Sitrus Berry', 'berry', 'u', 80, 'Eat: heal 4d4+4 HP.', { heal:'4d4+4' }),
  It('pecha', 'Pecha Berry', 'berry', 'c', 30, 'Eat: cure poison.', { cure:'poison' }),
  It('cheri', 'Cheri Berry', 'berry', 'c', 30, 'Eat: cure paralysis.', { cure:'paralysis' }),
  It('rawst', 'Rawst Berry', 'berry', 'c', 30, 'Eat: cure a burn.', { cure:'burn' }),
  It('chesto', 'Chesto Berry', 'berry', 'c', 30, 'Eat: wake up from sleep.', { cure:'sleep' }),
  It('aspear', 'Aspear Berry', 'berry', 'c', 30, 'Eat: thaw out of a freeze.', { cure:'freeze' }),
  It('persim', 'Persim Berry', 'berry', 'c', 30, 'Eat: snap out of confusion.', { cure:'confusion' }),
  It('lum', 'Lum Berry', 'berry', 'u', 150, 'Eat: cure every status condition.', { cure:'all' }),
  It('leppa', 'Leppa Berry', 'berry', 'u', 120, 'Eat: restore 2 PP to your most-used move.', { pp:2 }),

  It('potion', 'Potion', 'med', 'c', 50, 'Drink: heal 2d4+2 HP. Same as a D&D Potion of Healing.', { heal:'2d4+2' }),
  It('superpotion', 'Super Potion', 'med', 'u', 150, 'Drink: heal 4d4+4 HP (Greater Healing).', { heal:'4d4+4' }),
  It('hyperpotion', 'Hyper Potion', 'med', 'r', 500, 'Drink: heal 8d4+8 HP (Superior Healing).', { heal:'8d4+8' }),
  It('fullrestore', 'Full Restore', 'med', 'v', 2000, 'Heal to full HP and cure every status (Supreme Healing).', { heal:'full', cure:'all' }),
  It('fullheal', 'Full Heal', 'med', 'u', 100, 'Cure every status condition.', { cure:'all' }),
  It('revive', 'Revive', 'med', 'r', 600, 'Use on a fainted ally: they come back with half their HP.', { revive:.5 }),
  It('maxrevive', 'Max Revive', 'med', 'v', 2500, 'Use on a fainted ally: they come back with full HP.', { revive:1 }),
  It('ether', 'Ether', 'med', 'u', 300, 'Restore all PP to the move that has spent the most.', { pp:'move' }),
  It('maxelixir', 'Max Elixir', 'med', 'r', 900, 'Restore all PP to every equipped move.', { pp:'all' }),

  It('reviver', 'Reviver Seed', 'seed', 'r', 800, 'Keep it in your bag. When you faint, it is eaten on its own and you come back with full HP.', { autoRevive:true }),
  It('healseed', 'Heal Seed', 'seed', 'c', 40, 'Eat: cure every status condition.', { cure:'all' }),
  It('blastseed', 'Blast Seed', 'seed', 'u', 100, 'Throw at a foe: 3d6 fire damage, DEX save DC 13 for half.', { throw:'3d6', save:'DEX 13' }),
  It('sleepseed', 'Sleep Seed', 'seed', 'u', 100, 'Throw: the target makes a WIS save DC 13 or falls asleep for 1 minute.', { save:'WIS 13' }),
  It('stunseed', 'Stun Seed', 'seed', 'u', 100, 'Throw: the target makes a CON save DC 13 or is stunned until the end of its next turn.', { save:'CON 13' }),
  It('vileseed', 'Vile Seed', 'seed', 'u', 120, "Throw: the target makes a CON save DC 13 or its Guard and Sp. Guard drop by 2 for 1 minute.", { save:'CON 13' }),
  It('eyedrop', 'Eyedrop Seed', 'seed', 'c', 40, 'Eat: see invisible creatures and hidden traps for 10 minutes. Reveals traps on this floor.', { revealTraps:true }),
  It('warpseed', 'Warp Seed', 'seed', 'u', 90, 'Eat or throw: the target teleports to a random room on this floor (DM places it).'),
  It('joyseed', 'Joy Seed', 'seed', 'v', 3000, 'Eat: gain one level right away.', { levelUp:1 }),

  It('escaperope', 'Escape Rope', 'gear', 'c', 150, 'Use it: the whole team climbs out of the dungeon and keeps its loot. Useless in a sealed Rift.', { escape:true }),
  It('escapeorb', 'Escape Orb', 'orb', 'u', 200, 'Break it: the whole team warps out of the dungeon and keeps its loot. Works like an Escape Rope.', { escape:true }),
  It('luminous', 'Luminous Orb', 'orb', 'u', 250, 'Break it: reveal the whole map of this floor.', { reveal:true }),
  It('trapsee', 'Trap-See Orb', 'orb', 'c', 80, 'Break it: reveal every trap on this floor.', { revealTraps:true }),
  It('petrify', 'Petrify Orb', 'orb', 'r', 500, 'Throw at a foe: CON save DC 14 or it is paralyzed for 1 minute (repeat the save each turn).', { save:'CON 14' }),
  It('totter', 'Totter Orb', 'orb', 'u', 200, 'Throw at a foe: WIS save DC 13 or it is confused for 1 minute.', { save:'WIS 13' }),
  It('allpower', 'All-Power Orb', 'orb', 'r', 600, 'Break it: every ally gets +2 to attack rolls for 1 minute (DM tracks it).'),
  It('foeseal', 'Foe-Seal Orb', 'orb', 'u', 300, 'Break it: foes in the room cannot use moves with PP for 1 round.'),
  It('wonderorb', 'Wonder Orb', 'orb', 'u', 150, 'Break it: the DM rolls a random orb effect.'),

  It('powerband', 'Power Band', 'held', 'u', 400, 'Hold: +2 Attack score.', { stat:{ atk:2 } }),
  It('specialband', 'Special Band', 'held', 'u', 400, 'Hold: +2 Sp. Atk score.', { stat:{ spa:2 } }),
  It('defensescarf', 'Defense Scarf', 'held', 'u', 400, 'Hold: +2 Defense score (better Guard and more HP). Like a Cloak of Protection.', { stat:{ def:2 } }),
  It('zincband', 'Zinc Band', 'held', 'u', 400, 'Hold: +2 Sp. Def score.', { stat:{ spd:2 } }),
  It('heartbandana', 'Heart Bandana', 'held', 'u', 400, 'Hold: +2 Heart score, for purifying Shadow Pokémon.', { stat:{ heart:2 } }),
  It('quickclaw', 'Quick Claw', 'held', 'u', 350, 'Hold: +5 to initiative rolls.', { init:5 }),
  It('scopelens', 'Scope Lens', 'held', 'r', 800, 'Hold: your moves score a critical hit on a 19 or 20.', { crit:19 }),
  It('leftovers', 'Leftovers', 'held', 'r', 900, 'Hold: in battle, regain 1 HP at the start of each of your turns.', { regen:1 }),
  It('focussash', 'Focus Sash', 'held', 'r', 900, 'Hold: once per long rest, a hit that would knock you out from full HP leaves you at 1 HP.', { sash:true }),
  It('lifeorb', 'Life Orb', 'held', 'v', 1500, 'Hold: your damaging moves deal +1d6 damage, but you take 1d4 recoil each hit.', { lifeOrb:true }),
  It('soothebell', 'Soothe Bell', 'held', 'r', 1000, 'Hold: builds friendship. After 3 long rests holding it, friendship evolutions (like Riolu → Lucario) are ready.', { friend:true }),
  It('everstone', 'Everstone', 'held', 'c', 100, 'Hold: you will not evolve while holding this.', { noEvo:true }),

  // Weapons and armor: their own slots, worn alongside a held item.
  It('ironclaws', 'Iron Claws', 'weapon', 'c', 150, 'Weapon: +1 to hit with physical moves.', { wHit:1, wCls:'physical' }),
  It('spikedbracer', 'Spiked Bracer', 'weapon', 'u', 400, 'Weapon: +2 damage with physical moves.', { wDmg:2, wCls:'physical' }),
  It('focuscrystal', 'Focus Crystal', 'weapon', 'u', 400, 'Weapon: +2 damage with special moves.', { wDmg:2, wCls:'special' }),
  It('razorfangblade', 'Razor Fang Blade', 'weapon', 'r', 900, 'Weapon: physical moves get +1 to hit and +1d4 damage.', { wHit:1, wDie:'1d4', wCls:'physical' }),
  It('mysticstaff', 'Mystic Staff', 'weapon', 'r', 900, 'Weapon: special moves get +1 to hit and +1d4 damage.', { wHit:1, wDie:'1d4', wCls:'special' }),
  It('championgauntlet', "Champion's Gauntlet", 'weapon', 'v', 2500, 'Weapon: every damaging move gets +2 to hit and +2 damage.', { wHit:2, wDmg:2 }),
  It('shellplate', 'Shell Plate', 'armor', 'c', 150, 'Armor: +1 Guard (vs physical moves).', { guard:1 }),
  It('leafcloak', 'Leaf Cloak', 'armor', 'c', 150, 'Armor: +1 Sp. Guard (vs special moves).', { spguard:1 }),
  It('ironscalemail', 'Iron Scale Mail', 'armor', 'u', 450, 'Armor: +2 Guard.', { guard:2 }),
  It('mirrormantle', 'Mirror Mantle', 'armor', 'u', 450, 'Armor: +2 Sp. Guard.', { spguard:2 }),
  It('dragonhide', 'Dragonhide Armor', 'armor', 'r', 1200, 'Armor: +2 Guard and +1 Sp. Guard.', { guard:2, spguard:1 }),
  It('titansaegis', "Titan's Aegis", 'armor', 'v', 3000, 'Armor: +3 Guard and +3 Sp. Guard. Forged from a fossil titan\'s shell.', { guard:3, spguard:3 }),
  ...[['charcoal','Charcoal','fire'],['mysticwater','Mystic Water','water'],['miracleseed','Miracle Seed','grass'],['magnet','Magnet','electric'],
      ['nevermeltice','Never-Melt Ice','ice'],['blackbelt','Black Belt','fighting'],['poisonbarb','Poison Barb','poison'],['softsand','Soft Sand','ground'],
      ['sharpbeak','Sharp Beak','flying'],['twistedspoon','Twisted Spoon','psychic'],['silverpowder','Silver Powder','bug'],['hardstone','Hard Stone','rock'],
      ['spelltag','Spell Tag','ghost'],['dragonfang','Dragon Fang','dragon'],['blackglasses','Black Glasses','dark'],['metalcoat','Metal Coat','steel'],
      ['fairyfeather','Fairy Feather','fairy'],['silkscarf','Silk Scarf','normal']]
    .map(([id, n, t]) => It(id, n, 'held', 'u', 300, `Hold: +2 damage with ${T(t)}-type moves.${id === 'metalcoat' ? ' Also used for some trade evolutions.' : ''}`, Object.assign({ typeDmg:t }, id === 'metalcoat' ? { evo:'Metal Coat' } : {}))),

  ...['Fire Stone','Water Stone','Thunder Stone','Leaf Stone','Moon Stone','Sun Stone','Shiny Stone','Dusk Stone','Dawn Stone','Ice Stone']
    .map(n => It(slug(n).replace(/-/g, ''), n, 'evo', 'r', 1000, `Use: evolves a Pokémon that needs a ${n}.`, { evo:n })),
  It('linkingcord', 'Linking Cord', 'evo', 'r', 1200, 'Use: counts as a trade, for Pokémon that evolve by trading (Haunter, Machoke and others).', { evoTrade:true }),
  It('dragonscale', 'Dragon Scale', 'evo', 'r', 1000, 'Use: evolves a Pokémon that trades holding a Dragon Scale.', { evo:'Dragon Scale' }),
  It('kingsrock', "King's Rock", 'evo', 'r', 1000, "Use: evolves a Pokémon that trades holding a King's Rock.", { evo:"King's Rock" }),
  It('razorclaw', 'Razor Claw', 'evo', 'r', 1000, 'Use: evolves a Pokémon that levels up holding a Razor Claw.', { evo:'Razor Claw' }),

  It('purifycharm', 'Purify Charm', 'shadow', 'u', 400, 'Use in battle: your next Heart check has advantage and lowers the Heart Gauge 10 more.', { purify:10 }),
  It('joyscent', 'Joy Scent', 'shadow', 'c', 150, 'Use on a Shadow Pokémon in battle: its Heart Gauge drops by 10.', { heart:10 }),
  It('excitescent', 'Excite Scent', 'shadow', 'u', 300, 'Use on a Shadow Pokémon in battle: its Heart Gauge drops by 20.', { heart:20 }),
  It('vividscent', 'Vivid Scent', 'shadow', 'r', 600, 'Use on a Shadow Pokémon in battle: its Heart Gauge drops by 30.', { heart:30 }),
  It('timeflute', 'Time Flute', 'shadow', 'l', 8000, 'Play it in battle: one Shadow Pokémon has its Heart Gauge drop to 0.', { heart:100 }),
  It('shadowshard', 'Shadow Shard', 'shadow', 'c', 60, 'A dark crystal left by a Shadow Pokémon. Sell it, or trade 5 at the Guild for a Purify Charm.', {}, { noDrop:true }),

  It('apple', 'Apple', 'gear', 'c', 15, 'Eat a meal: heal 1d4 HP. Counts as a day of rations.', { heal:'1d4' }),
  It('bigapple', 'Big Apple', 'gear', 'u', 60, 'Feeds the whole team: everyone heals 1d6 HP.', { teamHeal:'1d6' }),
  It('rope', 'Explorer Rope', 'gear', 'c', 50, '50 ft of rope. Advantage on climbing and pulling checks.', { keep:true }),
  It('lantern', 'Luminous Moss Lantern', 'gear', 'c', 40, 'Bright light 20 ft. Dark floors no longer give disadvantage.', { keep:true }),
  It('explorerkit', 'Explorer Kit', 'gear', 'u', 200, 'Rations, rope and tools. Advantage on survival checks and one free short rest per floor.', { keep:true }),
  It('mapfrag', 'Map Fragment', 'gear', 'u', 150, 'Use in a dungeon: reveal where the stairs are on this floor.', { revealStairs:true }),
  It('treasurebox', 'Treasure Box', 'gear', 'u', 0, 'A locked box. Use it to open it and find an uncommon or better item.', { box:true }, { noDrop:true }),
  It('wondergummi', 'Wonder Gummi', 'gummi', 'r', 1200, 'Eat: permanent +1 to one stat of your choice (the DM adds it). Max +2 from Gummis.'),
  It('goldgummi', 'Gold Gummi', 'gummi', 'v', 2500, 'Eat: permanent +1 Heart and +1 to one other stat (the DM adds it).'),

  It('heartscale', 'Heart Scale', 'treasure', 'u', 300, 'Trade it to relearn one forgotten move, or learn an egg move with DM approval.'),
  It('pearl', 'Pearl', 'treasure', 'c', 150, 'A pretty pearl. Sell for ₽ 75.'),
  It('stardust', 'Stardust', 'treasure', 'c', 200, 'Sparkly red sand. Sell for ₽ 100.'),
  It('nugget', 'Nugget', 'treasure', 'u', 500, 'Pure gold. Sell for ₽ 250.'),
  It('bigpearl', 'Big Pearl', 'treasure', 'u', 600, 'Sell for ₽ 300.'),
  It('starpiece', 'Star Piece', 'treasure', 'r', 1000, 'Sell for ₽ 500.'),
  It('bignugget', 'Big Nugget', 'treasure', 'r', 2000, 'Sell for ₽ 1,000.'),
  It('relicgold', 'Relic Gold', 'treasure', 'v', 5000, 'An ancient coin. Sell for ₽ 2,500.'),
  It('relicvase', 'Relic Crown', 'treasure', 'l', 15000, 'A crown from a lost Pokémon kingdom. Sell for ₽ 7,500, or keep it for a story hook.')
];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const ITEM_BY_NAME: Record<string, ItemDef> = Object.fromEntries(ITEMS.map(i => [i.n.toLowerCase(), i]));

export const ROOM: Record<string, { n: string; g: string }> = {
  start:{ n:'Entrance', g:'S' }, empty:{ n:'Empty room', g:'·' }, enemy:{ n:'Wild Pokémon', g:'⚔' }, house:{ n:'Monster House', g:'!' },
  treasure:{ n:'Treasure chest', g:'◆' }, trap:{ n:'Trap', g:'▲' }, rest:{ n:'Wonder Spring', g:'✚' }, shop:{ n:'Kecleon Shop', g:'₽' },
  stairs:{ n:'Stairs down', g:'▼' }, boss:{ n:'Boss', g:'★' }
};
export const TRAPS: { n: string; save?: StatKey; dc?: number; dmg?: string; half?: boolean; d: string; special?: string }[] = [
  { n:'Spiky Trap', save:'spe', dc:12, dmg:'2d6', half:true, d:'Spikes shoot up. DEX save, half damage on a success.' },
  { n:'Poison Trap', save:'def', dc:12, dmg:'1d6', d:'A gas vent hisses. CON save or take 1d6 and be poisoned until a rest.' },
  { n:'Mud Trap', save:'spe', dc:11, d:'Thick mud. DEX save or lose your first turn in the next battle on this floor.' },
  { n:'Sticky Trap', save:'spd', dc:12, d:'Goo splashes the bags. WIS save or one random bag item is stuck until the next floor.' },
  { n:'Grimy Trap', save:'spd', dc:12, d:'Sludge spoils food. WIS save or one berry or apple in your bag rots.' },
  { n:'Explosion Trap', save:'spe', dc:13, dmg:'3d6', half:true, d:'Boom! DEX save, half damage on a success.' },
  { n:'Slumber Trap', save:'spd', dc:12, d:'Sleepy spores. WIS save or fall asleep until an ally uses its action to wake you.' },
  { n:'Warp Trap', d:'The floor glows and the team is warped to a random room.', special:'warp' },
  { n:'Pitfall Trap', save:'spe', dc:13, dmg:'1d6', d:'The floor gives way. DEX save or take 1d6. The whole team falls to the next floor.', special:'pitfall' },
  { n:'Summon Trap', d:'A loud whistle. Wild Pokémon rush into the room!', special:'summon' }
];
export const FLAVOR = ['Dust drifts through quiet halls.', 'Faint footprints lead off into the dark.', 'Water drips somewhere nearby.', 'Old claw marks scar the walls.', 'The air hums with Shadow energy.', 'Moss glows softly along the floor.', 'A cold draft blows from the next room.'];
export const SAVE_LABEL: Record<string, string> = { spe:'DEX', def:'CON', spd:'WIS' };

export interface Layer { n: string; motif: string; pal: { sky: string; mid: string; ground: string; glow: string }; intro: string; havens: { k: string; n: string; t: string | null; d: string }[]; wilds: { k: string; n: string; d: string }[]; rifts: { k: string; n: string; d: string }[]; gate: string | null; types: string[] }
export const LAYERS: Layer[] = ([
  { n:'Lumen Rest', motif:'town', pal:{ sky:'#1c2a52', mid:'#7a4f7d', ground:'#2f4a3a', glow:'#ffcf73' },
    intro:"The lantern-lit home of Pokémon who have sheltered in the Labyrinth since the war with the humans, 500 years ago. Thirty years ago the Great Calamity sealed the gates and split families apart. Now the Explorers' Guild trains its youth to open them.",
    havens:[{ k:'guild', n:"Explorers' Guild", t:null, d:'Free beds, a quest board, and a wall of names for the ones who never came back.' }, { k:'market', n:'Lumen Market', t:'normal', d:'The Kecleon brothers run every stall. Their stock changes every time you walk in.' }],
    wilds:[{ k:'meadow', n:'Training Meadow', d:'Gentle hills outside town. The Labyrinth gave most Pokémon here a voice and a mind, but not all of them. Since the Calamity, the wild ones attack anyone who wanders too close.' }], rifts:[], gate:null },
  { n:'Verdant Hollow', motif:'forest', pal:{ sky:'#0f2a22', mid:'#1f5a3a', ground:'#183d22', glow:'#9cff8a' },
    intro:'A drowned forest under a false sky of glowing roots. Spores drift like snow, and something huge breathes in the canopy.',
    havens:[{ k:'hearth', n:'Hearthroot Camp', t:'normal', d:'A camp built inside a hollow tree. A Chansey nurse keeps the kettle on.' }, { k:'bloom', n:'Bloomrest Glade', t:'grass', d:'A ring of flowers no Shadow Pokémon will cross. Bellossom dance at dusk.' }, { k:'silk', n:'Silkwing Hamlet', t:'bug', d:'Houses spun from silk hang between trunks. Ninjask couriers zip between them.' }],
    wilds:[{ k:'thicket', n:'Whisperleaf Thicket', d:'The leaves whisper your name. Most of the time it is only the wind.' }, { k:'ravine', n:'Mosslight Ravine', d:'A canyon lit by glowing moss. Easy to get lost, easier to get ambushed.' }],
    rifts:[{ k:'rot', n:'Rotheart Burrow', d:'A sick root system pulsing with Shadow energy. The way out closes behind you.' }, { k:'thorn', n:'The Thornmaw', d:'A briar maze that grows shut after every step.' }], gate:'Scyther' },
  { n:'Tidecaller Grotto', motif:'sea', pal:{ sky:'#06203a', mid:'#0d4a6e', ground:'#0a2f4a', glow:'#7fe7ff' },
    intro:'An underground sea lit by drifting jellyfish. Frost creeps across the tide pools, and the water hums a song no one taught it.',
    havens:[{ k:'coral', n:'Coralight Harbor', t:'water', d:'Boats tied to giant Corsola. The harbor master is a very old Lapras.' }, { k:'rime', n:'Rimefrost Lodge', t:'ice', d:'A lodge carved into a glacier, warmed by Magcargo stoves.' }],
    wilds:[{ k:'brine', n:'Brinefall Shallows', d:'Knee-deep water full of things that bite.' }, { k:'glacier', n:'Glacier Teeth', d:'Ice spikes jut from the sea like a jaw about to close.' }],
    rifts:[{ k:'bell', n:'The Drowned Bell', d:'A sunken temple. Its bell rings when something wakes.' }, { k:'maw', n:'Frozen Maw', d:'A cave of black ice that freezes the way back.' }], gate:'Lapras' },
  { n:'Stormspire Highlands', motif:'storm', pal:{ sky:'#141a33', mid:'#3a3f6e', ground:'#262b45', glow:'#ffe45c' },
    intro:'Floating cliffs ride a storm that never ends. Lightning paints the sky every few seconds, and the wind tries to throw you off the edge.',
    havens:[{ k:'volt', n:'Voltcrest Outpost', t:'electric', d:'A lightning-rod fortress run by Ampharos lighthouse keepers.' }, { k:'aerie', n:'Skyreach Aerie', t:'flying', d:'Nests the size of houses. Pidgeot carry travelers between cliffs.' }],
    wilds:[{ k:'plateau', n:'Thunderstep Plateau', d:'Every step sparks. Electric Pokémon gather here to feed.' }, { k:'bridges', n:'Galeborne Bridges', d:'Rope bridges between floating rocks. Do not look down.' }],
    rifts:[{ k:'eye', n:'The Eye of the Storm', d:'A calm center where the air goes still. That is the warning.' }, { k:'spire', n:'Shattered Spire', d:'A broken tower full of lightning that never grounds.' }], gate:'Zapdos' },
  { n:'Emberdeep Caldera', motif:'lava', pal:{ sky:'#2a0c08', mid:'#6e1d0e', ground:'#2b130d', glow:'#ff8a3d' },
    intro:'A sea of slow lava under a ceiling of black glass. The ground is warm enough to cook on, and the shadows move against the light.',
    havens:[{ k:'cinder', n:'Cinder Sanctum', t:'fire', d:'A temple of eternal flame tended by Ninetales priestesses.' }, { k:'dune', n:'Dunehold Waystation', t:'ground', d:'A sandstone fort where Hippowdon caravans rest.' }],
    wilds:[{ k:'ash', n:'Ashfall Wastes', d:'Gray snow that burns. Footprints fill in behind you.' }, { k:'veins', n:'Magma Veins', d:'Tunnels where lava runs like blood through the rock.' }],
    rifts:[{ k:'forge', n:'The Forge Below', d:'An ancient smithy still burning. Its anvils are not empty.' }, { k:'sand', n:'Sandglass Pit', d:'A sinking pit where time moves strangely.' }], gate:'Moltres' },
  { n:'Duskwood Necropolis', motif:'grave', pal:{ sky:'#120a24', mid:'#3a1f5a', ground:'#1a1030', glow:'#c79bff' },
    intro:'A city of graves under an endless twilight. Lanterns float with no one holding them, and every door you pass is slightly open.',
    havens:[{ k:'lantern', n:'Lanternwake Chapel', t:'ghost', d:'Chandelure light the pews. The dead here are friendly. Mostly.' }, { k:'umbral', n:'Umbral Bazaar', t:'dark', d:'A night market run by Sableye. Everything has a price, including secrets.' }],
    wilds:[{ k:'gravebloom', n:'Gravebloom Fields', d:'Flowers that only open over graves. Something feeds them.' }, { k:'hollow', n:'Hollow Avenue', d:'An empty street that loops back on itself.' }],
    rifts:[{ k:'crypt', n:'Crypt of a Thousand Eyes', d:'Every wall watches. The way out is sealed until they all close.' }, { k:'below', n:'The Black Market Below', d:'Where the Bazaar sells what it cannot sell above.' }], gate:'Gengar' },
  { n:'Mirage Sanctum', motif:'crystal', pal:{ sky:'#1a0f3a', mid:'#5a3a8e', ground:'#2a1d52', glow:'#ff9ce6' },
    intro:'Crystal islands drift in a sky that shows you your own memories. Some of them are not yours.',
    havens:[{ k:'mind', n:'Mindspire Observatory', t:'psychic', d:'Alakazam scholars map the Labyrinth by thought alone.' }, { k:'veil', n:'Glimmerveil Grove', t:'fairy', d:'A grove where Clefairy hold moonlight festivals.' }],
    wilds:[{ k:'prism', n:'Prism Steppes', d:'Fields of rainbow glass that bend light and direction.' }, { k:'dream', n:'Dreamtide Shore', d:'A beach where the waves are made of sleep.' }],
    rifts:[{ k:'mirror', n:'Mirror of Regrets', d:'A hall of mirrors. Your reflection fights back.' }, { k:'fey', n:'Fey Hollow', d:'A fairy court that does not let guests leave.' }], gate:'Gardevoir' },
  { n:'Ironroot Foundry', motif:'machine', pal:{ sky:'#0d1614', mid:'#2a3a35', ground:'#141f1c', glow:'#7dffb0' },
    intro:"A dead civilization's machine city. Toxic rivers feed engines that never stopped running, and they are getting louder.",
    havens:[{ k:'forge', n:'Forgeheart Bastion', t:'steel', d:'A fortress of living steel. Bronzong ring the hours.' }, { k:'dojo', n:'Dojo of the Hundred Fists', t:'fighting', d:'Hitmonchan masters train anyone who can survive a lesson.' }, { k:'fen', n:'Miasma Fen Refuge', t:'poison', d:'A gas-masked town on stilts. Muk keep the sludge away from the beds.' }],
    wilds:[{ k:'gears', n:'Gearfall Yards', d:'Giant gears grind overhead. Timing matters here.' }, { k:'canals', n:'Venom Canals', d:'Glowing green water and something swimming in it.' }],
    rifts:[{ k:'engine', n:'The Engine Heart', d:'The core that powers the city. It knows you are here.' }, { k:'plague', n:'Plague Vault', d:'A sealed lab. The seal is the only thing that was keeping it in.' }], gate:'Metagross' },
  { n:'Primordial Throne', motif:'throne', pal:{ sky:'#1a0c0c', mid:'#4a1f1a', ground:'#24110e', glow:'#ffb35c' },
    intro:'The bottom of everything. Fossil titans sleep in the walls, and dragons nest in the bones of the world.',
    havens:[{ k:'wyrm', n:'Wyrmcrown Citadel', t:'dragon', d:'A castle built on a sleeping dragon. Its keepers speak only in old tongues.' }, { k:'petra', n:'Petra Bastion', t:'rock', d:'A fortress of fossil stone. Aerodactyl guard the walls.' }],
    wilds:[{ k:'bones', n:'Boneyard of Titans', d:'Ribcages as tall as towers. Some still have heartbeats.' }, { k:'crater', n:'Skyfall Crater', d:'Where the first star fell into the Labyrinth.' }],
    rifts:[{ k:'egg', n:'The First Egg', d:'A chamber older than the Labyrinth itself. A cracked, pulsing egg of pure Shadow sits at its heart. This is where the Great Calamity began.' }, { k:'requiem', n:"Dragon's Requiem", d:'A graveyard of dragons that refuses to stay buried.' }], gate:'Lugia' }
] as Omit<Layer, "types">[]).map(L => ({ ...L, types: [] as string[] }));
LAYERS.forEach((L, i) => { L.types = L.havens.map(h => h.t).filter((t): t is string => !!t && t !== 'normal').concat(L.havens.some(h => h.t === 'normal') && i !== 0 ? ['normal'] : []); });
export const LAB_FLOORS = 40;
export const layerLvl = (k: number) => k ? Math.min(20, Math.ceil(5 * k / 2)) : 1;
export const labLvl = (f: number) => Math.min(20, Math.max(1, Math.ceil(f / 2)));
export const NODE_POS: Record<string, [number, number]> = { waystone:[500, 92], h0:[195, 218], h1:[805, 218], h2:[500, 300], w0:[250, 430], w1:[750, 430], r0:[150, 548], r1:[850, 548], stairs:[500, 560] };
export const RING: Record<string, string> = { dark:'#c2a58f', ghost:'#b7a0e6', dragon:'#a98bff', fighting:'#ff7d75', poison:'#de8be0', normal:'#e2dfb8', rock:'#d6c46a', ground:'#ecd08a' };
export const ringOf = (t: string) => RING[t] || TCOL[t];
export const KIND: Record<string, { n: string; g: string; c: string }> = { waystone:{ n:'Waystone', g:'✧', c:'#d8b8ff' }, haven:{ n:'Safe Zone', g:'⌂', c:'#ffd37a' }, wild:{ n:'Wild area', g:'❖', c:'#8ef0a7' }, rift:{ n:'Red Rift', g:'◈', c:'#ff4d6d' }, stairs:{ n:'Labyrinth', g:'▼', c:'#8fb2ff' } };
export const THEME: Record<string, string[]> = {
  normal:['silkscarf', 'potion', 'apple', 'escaperope', 'escapeorb', 'explorerkit'], fire:['charcoal', 'firestone', 'sunstone', 'rawst', 'blastseed'], water:['mysticwater', 'waterstone', 'sitrus', 'kingsrock'],
  grass:['miracleseed', 'leafstone', 'sunstone', 'oran', 'lum', 'leafcloak'], bug:['silverpowder', 'sleepseed', 'stunseed', 'pecha'], electric:['magnet', 'thunderstone', 'cheri', 'quickclaw'],
  flying:['sharpbeak', 'warpseed', 'luminous'], ice:['nevermeltice', 'icestone', 'aspear'], ground:['softsand', 'mapfrag', 'trapsee'], rock:['hardstone', 'focussash', 'defensescarf', 'shellplate'],
  ghost:['spelltag', 'duskstone', 'revive', 'reviver'], dark:['blackglasses', 'duskstone', 'razorclaw', 'vileseed'], psychic:['twistedspoon', 'dawnstone', 'persim', 'purifycharm', 'heartbandana', 'focuscrystal', 'mirrormantle'],
  fairy:['fairyfeather', 'moonstone', 'shinystone', 'soothebell'], steel:['metalcoat', 'linkingcord', 'powerband', 'specialband', 'ironscalemail', 'ironclaws'], fighting:['blackbelt', 'powerband', 'focussash', 'scopelens', 'ironclaws', 'spikedbracer'],
  poison:['poisonbarb', 'pecha', 'healseed', 'lifeorb'], dragon:['dragonfang', 'dragonscale', 'maxelixir', 'leftovers', 'dragonhide']
};
export const RESCUES = ['A lost Pichu is stuck in a thorn bush and crying for its mother.', 'An injured Bidoof is trapped under fallen rocks.', 'A Wooper wandered too far from its pond and cannot find the way back.', 'Two young Eevee are surrounded by a Shadow Pokémon scout.', 'A Chingling fell into a pit and its bell is cracked.', 'An old Torkoal is out of breath halfway up a cliff.'];

export const SURPRISE: Record<string, { n: string; d: string }> = {
  normal:{ n:'Normal start', d:'' },
  ambush:{ n:'Ambush!', d:'The team was caught off guard. Your Pokémon roll initiative with disadvantage, and foes attack with advantage in round 1.' },
  jump:{ n:'You got the jump!', d:'The team spotted them first. Foes roll initiative with disadvantage, and your Pokémon attack with advantage in round 1.' }
};

/** Tabletop versions of abilities. The battle engine applies these automatically. */
export const ABILITY_RULES: Record<string, string> = {
  sturdy: 'Once per battle, a hit that would knock you out leaves you at 1 HP instead.',
  'rock-head': 'Your physical moves deal +2 damage, and you never take recoil.',
  'heavy-metal': '+2 Guard, but −2 initiative.',
  limber: "+2 initiative, and you can't be paralyzed.",
  unburden: 'While you hold no item: +3 initiative and +1 to hit.',
  'mold-breaker': 'Your moves ignore resistances: "not very effective" hits deal normal damage.',
  steadfast: 'After you take damage, your next attack gets +2 to hit.',
  'inner-focus': "You're never caught off guard: ambushes don't give you disadvantage on initiative.",
  prankster: 'Your status moves get +2 to their save DC.',
  'flash-fire': 'Fire moves deal you no damage. After one targets you, your Fire moves deal +1d6 for the rest of the battle.',
  'flame-body': 'When a foe hits you with a physical move, it takes 1d4 fire damage.',
  infiltrator: '+2 to hit against foes at full HP.',
};

/** Teams the players keep running into. Everyone in them graduated from (or taught at) Orrin's Adventure School. */
export const TEAMS = {
  rivals: { n: 'Team Razorwind', d: "Top of the players' graduating class, and they never let anyone forget it. Each one picked a player to beat." },
  medics: { n: 'Hearthroot Rescue Corps', d: 'Field medics who travel the Labyrinth patching up explorers. They taught first aid at the Adventure School.' },
};

/** Story cast. `layer` unset = roams every layer. `secret` is shown to the DM only. */
export interface CastMember { id: string; layer?: number; team?: keyof typeof TEAMS; keeper?: boolean; rivalOf?: string; name: string; species: string; role: string; desc: string; secret?: string; level?: number }
export const CAST: CastMember[] = [
  { id: 'zoroark', name: 'The Trickster', species: 'Zoroark', level: 15, role: 'Villain · roams every layer',
    desc: 'A sly, grinning shape that always seems to be one step ahead of the team.',
    secret: 'Uses Illusion to disguise herself as any Pokémon, including the guides on this page, and always leaves one small tell (wrong eye colour, a red tuft of fur, a laugh at the wrong moment). Each gate guardian holds immense Shadow power. Zoroark takes it from every guardian the team defeats, hoping to reach the source of the Calamity, the First Egg on the deepest layer, even if that means starting it again. She is searching for her older sister, lost in the Calamity, and believes the Egg can bring her back. The power makes her stronger but is killing her, and she dies before she reaches it.' },
  { id: 'orrin', layer: 0, name: 'Guildmaster Orrin', species: 'Noctowl', role: "Guildmaster of Lumen Rest",
    desc: 'Runs the guild and its Adventure School. Thirty years after the Great Calamity, he sends each graduating class out with one promise: reach the sealed gates and open them.',
    secret: 'His family was on the other side of the first gate when the Calamity sealed it. When the team opens it, Orrin is there. Everyone flinches as it grinds open, but he walks forward and smiles at the team before going to find them.' },
  { id: 'mabel', team: 'medics', name: 'Nurse Mabel', species: 'Chansey', role: 'Leader of the Rescue Corps',
    desc: 'Patched up every student at the Adventure School at least once. Treats the players like her own kids, and scolds them like it too.',
    secret: 'She knew the Scyther that guards the gate before the Calamity. It was called the Pale Blade, and it protected this forest.' },
  { id: 'ivy', layer: 1, name: 'Guildmaster Ivy', species: 'Meganium', role: 'Guildmaster of Hearthroot Camp',
    desc: 'Has led Verdant Hollow alone since the Calamity. Her flower gives off a scent that calms anyone nearby, even wild Pokémon. Gentle, tired, and fiercely protective of her village.',
    secret: "Orrin's mate. A Noctowl and a Meganium met as young explorers on a rescue mission and never stopped arguing about who saved whom. She has raised their two children alone behind the sealed gate for 30 years: Sage, a Hoothoot who can't sit still, and Clover, a Chikorita who hasn't forgiven her father for not coming sooner. She is who Orrin walks toward when the first gate opens." },
  { id: 'maren', layer: 2, name: 'Old Maren', species: 'Lapras', role: 'Guildmaster of Coralight Harbor',
    desc: 'The oldest Pokémon on the underground sea. She sings to the boats at night.',
    secret: 'The Shadow Lapras at the gate is her child, lost in the Calamity.' },
  { id: 'volta', layer: 3, name: 'Captain Volta', species: 'Luxray', role: 'Guildmaster of Voltcrest Outpost',
    desc: 'Runs the only post that can see through the storm. Stern, fair, and always short on scouts.',
    secret: 'Holds a Skyreach Aerie sky-duel tournament. A Hawlucha in the team would be invited.' },
  { id: 'smolder', layer: 4, name: 'Brother Smolder', species: 'Torkoal', role: 'Guildmaster of Cinder Sanctum',
    desc: 'A slow-talking monk who reads the lava like a book.',
    secret: 'He knows Rasp, the Krookodile at Dunehold, sells Shadow shards. He is too afraid to stop it.' },
  { id: 'wick', layer: 5, name: 'Sister Wick', species: 'Chandelure', role: 'Guildmaster of Lanternwake Chapel',
    desc: 'Lights the floating lanterns of the Necropolis, one soul at a time.',
    secret: 'She knows what a Litwick can become, a guiding light or a Shadow. She will test it.' },
  { id: 'watcher', layer: 6, name: 'The Watcher', species: 'Xatu', role: 'Guildmaster of Mindspire Observatory',
    desc: 'Stands still for days, staring at the sky. Speaks only in short, strange answers.',
    secret: 'The Mirror of Regrets will show a Riolu the Lucario it once failed.' },
  { id: 'ferra', layer: 7, name: 'Forgemother Ferra', species: 'Aggron', role: 'Guildmaster of Forgeheart Bastion',
    desc: 'Hammers steel all day and night. Her armour is scarred from a hundred battles.',
    secret: "She forged an Aron's shell long ago, and she knows why it was left behind." },
  { id: 'basalt', layer: 8, name: 'Guildmaster Basalt', species: 'Tyranitar', level: 20, role: 'Guildmaster of the Primordial Throne · missing',
    desc: 'The strongest guildmaster who ever lived. Intense, blunt, and impossible to impress. He walked into the dark toward the source of the Calamity and was never seen again.',
    secret: "Thirty years ago, Basalt went alone to the First Egg to stop the Calamity at its source. He failed to destroy it, but he never left. He stands at the last gate holding back Shadow Lugia with his own body, and has for 30 years. The Labyrinth's sandstorms on the deepest floors are his. When the team reaches the last gate, he is there: scarred, exhausted, still standing. He does not thank them. He tells them they are late." },
  { id: 'vael', layer: 8, name: 'Elder Vael', species: 'Dragonite', role: 'Elder of Wyrmcrown Citadel · acting leader',
    desc: 'The last Pokémon alive who remembers the world before the Calamity. Leads the Citadel until Basalt comes back. He still sets a place for him at every meal.',
    secret: 'Saw the First Egg crack open 30 years ago. That was the Great Calamity. If it is fed enough Shadow power, it will hatch again. Vael watched Basalt walk toward it and did not stop him. He has never forgiven himself.' },
  // Team Razorwind: rivals, one per player
  { id: 'kip', team: 'rivals', rivalOf: 'riolu', name: 'Kip', species: 'Pawniard', role: 'Leader · rival to Riolu',
    desc: 'Sharp tongue, sharper blades. Was beaten once by Riolu in a school sparring match and has trained every day since.',
    secret: 'Kip lost an older sibling in the Calamity. Opening the gates is personal.' },
  { id: 'zephyr', team: 'rivals', rivalOf: 'hawlucha', name: 'Zephyr', species: 'Rookidee', role: 'Scout · rival to Hawlucha',
    desc: 'A show-off flyer who narrates his own stunts. Wants a sky duel with Hawlucha, badly.',
    secret: 'Afraid of the dark. The deeper layers scare him more than he lets on.' },
  { id: 'sable', team: 'rivals', rivalOf: 'litwick', name: 'Sable', species: 'Fennekin', role: 'Strategist · rival to Litwick',
    desc: 'Cool, clever and always three moves ahead. Thinks Litwick is a fire type that does not take fire seriously.',
    secret: 'Secretly admires Litwick. Will help the team once, in secret, if they are kind to her.' },
  { id: 'pebble', team: 'rivals', rivalOf: 'aron', name: 'Pebble', species: 'Rolycoly', role: 'Muscle · rival to Aron',
    desc: 'Loud, friendly and always hungry. Treats every contest with Aron like a festival.',
    secret: 'The easiest rival to turn into a friend. Could switch teams if Razorwind treats him badly.' },
  // Hearthroot Rescue Corps: medics led by Mabel
  { id: 'pip', team: 'medics', name: 'Doc Pip', species: 'Audino', role: 'Field medic',
    desc: 'Hears a heartbeat through stone. Calm in every crisis, a nervous wreck at parties.' },
  { id: 'lei', team: 'medics', name: 'Lei', species: 'Comfey', role: 'Herbalist',
    desc: 'Grows healing flowers in her own hair. Hands out Oran Berries like candy.' },
  { id: 'haul', team: 'medics', name: 'Haul', species: 'Mudbray', role: 'Stretcher carrier',
    desc: 'Has carried half the guild out of the Labyrinth on his back. Says almost nothing.' },
  // Shopkeepers
  { id: 'kecleon', keeper: true, layer: 0, name: 'Lark and Lev', species: 'Kecleon', role: 'Shopkeepers · Lumen Market',
    desc: 'Brothers who run every stall in town. Lark haggles, Lev remembers every debt.' },
  { id: 'sylva', keeper: true, layer: 1, name: 'Sylva', species: 'Leavanny', role: 'Tailor · Silkwing Hamlet',
    desc: 'Stitches scarves and bandanas from fresh silk. Fusses over every torn seam.' },
  { id: 'barb', keeper: true, layer: 2, name: 'Old Barb', species: 'Barbaracle', role: 'Trader · Coralight Harbor',
    desc: 'Seven heads, seven opinions on every price. Trades in pearls and sea salvage.' },
  { id: 'dynamo', keeper: true, layer: 3, name: 'Dynamo', species: 'Heliolisk', role: 'Quartermaster · Voltcrest Outpost',
    desc: 'Runs the outpost supply shed. Charges extra during storms, which is always.' },
  { id: 'rasp', keeper: true, layer: 4, name: 'Rasp', species: 'Krookodile', role: 'Merchant · Dunehold Waystation',
    desc: 'Smiles a lot, says "friend" a lot, and always has exactly what you need.',
    secret: 'Sells Shadow shards out the back. Has done business with the Trickster.' },
  { id: 'glint', keeper: true, layer: 5, name: 'Glint', species: 'Sableye', role: 'Fence · Umbral Bazaar',
    desc: 'Buys anything, sells anything, asks nothing. Eats the gems he does not like.' },
  { id: 'tessel', keeper: true, layer: 6, name: 'Madame Tessel', species: 'Hatterene', role: 'Curio dealer · Glimmerveil Grove',
    desc: 'Sells charms and dreams in bottles. Asks the team to keep their thoughts quiet in her shop.' },
  { id: 'bolt', keeper: true, layer: 7, name: 'Bolt', species: 'Klinklang', role: 'Scrap dealer · Gearfall Yards',
    desc: 'Three gears, one voice. Pays well for machine parts from the old city.' },
  { id: 'facet', keeper: true, layer: 8, name: 'Facet', species: 'Carbink', role: 'Gem trader · Petra Bastion',
    desc: 'Older than the war. Trades gems only with explorers it trusts.' },
];

/** Orrin's first jobs for new graduates (Chapter 1). */
export const STARTER_QUESTS = [
  { title: 'Find the lost Pichu crying in the Training Meadow', giver: 'Guildmaster Orrin', xp: 40, poke: 100, item: 'Oran Berry', qty: 2 },
  { title: 'Gather 5 Oran Berries for Lei of the Rescue Corps', giver: 'Lei', xp: 30, poke: 80, item: 'Heal Seed', qty: 1 },
  { title: 'Drive off the wild Pokémon raiding the supply carts', giver: 'Guildmaster Orrin', xp: 60, poke: 150, item: 'Explorer Kit', qty: 1 },
];

/** Quick creative moments for the DM. `kind`: adv = attack with advantage, dis = the other side attacks with disadvantage,
    hit = + to hit, dmg = + damage. Anything else the players invent goes in the custom form. */
export const FIELD_PRESETS = [
  { name: '🌫 Steam Fog', note: 'Fire hits Water. The other side can barely see.', kind: 'dis', amt: 0, rounds: 2 },
  { name: '💨 Tailwind', note: 'A Flying move whips the air behind you.', kind: 'hit', amt: 2, rounds: 3 },
  { name: '⚡ Charged Puddles', note: 'Electric meets Water on the floor.', kind: 'dmg', amt: 3, rounds: 2 },
  { name: '🪨 Rock Cover', note: 'A Rock or Ground move throws up cover to strike from.', kind: 'adv', amt: 0, rounds: 1 },
  { name: '🔥 Smoke Screen', note: 'Fire on Grass fills the room with smoke.', kind: 'dis', amt: 0, rounds: 1 },
  { name: '🧊 Ice Rink', note: 'Ice on Water. Fast footing for you, slippery for them.', kind: 'hit', amt: 1, rounds: 3 },
] as const;
export const FIELD_KINDS: Record<string, string> = { adv: 'attack with advantage', dis: 'the other side attacks with disadvantage', hit: '+ to hit', dmg: '+ damage' };

/** Status conditions the battle engine runs at the start of each affected Pokémon's turn. `immune` types can't get it. */
export const STATUS: Record<string, { n: string; g: string; d: string; immune: string[] }> = {
  burn: { n: 'Burned', g: '🔥', d: 'Takes damage at the start of each turn.', immune: ['fire'] },
  poison: { n: 'Poisoned', g: '☠️', d: 'Takes more damage at the start of each turn.', immune: ['poison', 'steel'] },
  paralysis: { n: 'Paralyzed', g: '⚡', d: '1 in 4 chance to lose each turn.', immune: ['electric'] },
  sleep: { n: 'Asleep', g: '💤', d: 'Loses its turn. Rolls d20 each turn: 11+ wakes up.', immune: [] },
  freeze: { n: 'Frozen', g: '🧊', d: 'Loses its turn. Rolls d20 each turn: 16+ thaws. A Fire hit thaws it.', immune: ['ice'] },
  confusion: { n: 'Confused', g: '💫', d: 'Each turn: d20 15+ snaps out; otherwise 1 in 3 chance to hurt itself and lose the turn.', immune: [] },
};
