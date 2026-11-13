// Shapes of the saved game data. They match the original single-file app, so old saves and the shared team keep loading.
export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type Stats = Record<StatKey, number>;
export type MoveClass = 'physical' | 'special' | 'status';

export interface Move {
  name: string; type: string; cls: MoveClass; power: number | null; gamePP: number | null; desc: string;
  dice: string; ppMax: number | null; ppCur: number; custom?: boolean;
}
export interface BagItem { name: string; qty: number; note: string; itemId: string; tm: string }
export interface Held { itemId: string; name: string }
export interface EvoTarget { name: string; minLevel: number | null; how: string }
/** `fx` is a bonus the engine applies while the entry is unlocked (see TREE_FX). `prop` is a player's own entry, waiting for the DM. */
export interface TreeNode { name: string; desc: string; on: boolean; fx?: string; prop?: { name: string; desc: string; fx?: string } }
export type Branch = 'ability' | 'special' | 'physical';
export type Tree = Record<Branch, { label: string; nodes: TreeNode[] }>;
export interface Assist { name: string; move: string; note: string; used: boolean }

/** What a player-made ability does when its player triggers it in battle. Without one, the DM resolves it. */
export interface AbilityFx { kind: 'status' | 'heal' | 'power' | 'guard'; status?: Status }

/** Fields shared by heroes and enemies, so rules functions can take either. */
export type Status = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze' | 'confusion';
export interface Mon {
  id: string; species: string; types: string[]; awakenedType?: string; base: Stats; level: number;
  bonus: Partial<Record<StatKey | 'heart', number>>; heart: number; moves: Move[]; hpCur: number;
  status?: Status | null; held?: Held | null; weapon?: Held | null; armor?: Held | null; megaOn?: number | null; shiny?: boolean; img?: string; nickname?: string;
  kind?: 'enemy'; sashUsed?: boolean; items?: BagItem[];
}
export interface Char extends Mon {
  kind?: undefined;
  form: string; nickname: string; player: string; abilities: string[]; levelMoves: { name: string; level: number }[];
  evo: { stage: number; targets: EvoTarget[] }; evoLevel: number | null; evoChoice: string; equipped: string[];
  items: BagItem[]; assists: Assist[]; notes: string; history: { from: string; to: string; level: number }[];
  inDungeon: boolean; img: string; hpv?: number; xp?: number; createdAt?: number; custom?: boolean; tree: Tree;
  megaForm?: number; megaReady?: boolean; mega?: { state: 'draft' | 'pending' | 'active' | 'passed'; trial: string; by?: string };
  blessings?: number; friend?: number;
  /** Waiting in the Safe Zone: not on the travelling team, so no battles, dungeons, loot or XP until called back. */
  reserve?: boolean;
  /** Six ability scores rolled once (4d6, drop the lowest). The player places them, then they lock for good. */
  rolled?: number[];
  /** Where the rolled scores went. Once set, these replace the scores worked out from the species. */
  scores?: Partial<Record<StatKey | 'heart', number>>;
  /** Personality from the quiz. The nature's boost and the in-character card count once the DM approves (`ok`). */
  persona?: { nature: string; demeanor: string; ok?: boolean };
  /** Earned by staying in character: advantage on the next attack. */
  inspired?: boolean;
  /** PP already spent on moves that were forgotten, so forgetting and relearning a move can't refill it. Cleared by a long rest. */
  ppSpent?: Record<string, number>;
  /** Moves the player hopes to learn (slugs), for the DM to see. */
  wish?: string[];
  /** Chosen preset ability (slug). Defaults to the first in `abilities`. */
  ability?: string;
  /** Player-made ability. Once the DM approves it, it replaces the preset one. */
  homebrew?: { name: string; desc: string; state: 'draft' | 'pending' | 'approved'; fx?: AbilityFx };
}
export interface Enemy extends Mon {
  kind: 'enemy'; side: 'enemy' | 'npc'; name: string; shadow: boolean; heartGauge: number; hpMax: number;
  boss?: boolean; gatekeeper?: boolean; rift?: boolean; minion?: boolean; outReason?: string; killer?: string; overworld?: boolean;
  /** The hero who last reached out to this Shadow Pokémon. It becomes their Assist if nobody lands the final blow (a burn, say). */
  purifier?: string;
  /** Id of the team member this foe goes after first (a rival). */
  focus?: string;
  /** A Team Razorwind rival: hero-grade HP and smart move choices. */
  rival?: boolean;
}
export type Fighter = Char | Enemy;

export interface OrderEntry { ref: 'pc' | 'enemy'; id: string; init: number; r1: number; r2: number | null; mod: number }
export interface AttackResult {
  id: string; actor: string; actorSide: 'team' | 'enemy'; target: string; move: string; moveType: string;
  status?: boolean; dc?: number; d20?: number; bonus?: number; total?: number; def?: number; defName?: string;
  hit?: boolean; crit?: boolean; fumble?: boolean; dmg?: number; eff?: number; adv?: boolean; extra?: string;
  ko?: boolean; hpLeft?: number; hpMax?: number; manual?: boolean; dis?: boolean; fx?: string;
  /** A status move the engine resolved: the save line, e.g. "WIS save 9 + 1 = 10 vs DC 13: failed. Asleep!" */
  save?: string;
  /** A triggered ability rather than a move. */
  ability?: boolean;
  /** A stunt the DM ruled on. */
  stunt?: boolean;
  /** Physical moves slash across the battle scene; special moves fly across it. */
  cls?: MoveClass;
  /** HP restored, for the green number on the battle scene. */
  heal?: number;
}
/** A creative moment in battle (e.g. Fire on Water makes Steam Fog). Helps `side` until `rounds` runs out. */
export interface FieldFx { id: string; name: string; side: 'team' | 'enemy'; kind: 'adv' | 'dis' | 'hit' | 'dmg'; amt: number; rounds: number; note?: string }
export interface Battle {
  id: string; phase: 'intro' | 'fight'; surprise: 'normal' | 'ambush' | 'jump'; why: string; round: number; turn: number;
  order: OrderEntry[]; enemies: Enemy[]; log: string[]; result: null | 'win' | 'lose';
  room: { pos?: string; floor?: number; boss?: boolean; world?: string } | null;
  boost: Record<string, number>; megaUsed: Record<string, boolean>;
  xp?: { id: string; n: string; g: number; fin: boolean }[]; last?: AttackResult;
  /** Per-battle ability state, by fighter id (e.g. Sturdy used, Flash Fire powered up). */
  flags?: Record<string, Record<string, boolean>>;
  fx?: FieldFx[];
  /** Times each hero has triggered its ability this battle. */
  uses?: Record<string, number>;
  /** A stunt a player described, waiting for the DM to say how hard it is. `stat` is the ability it rolls. */
  stunt?: { id: string; text: string; stat: string };
  /** A player picked this move (-1 is Purify) and is rolling real dice; the DM types the result in. */
  ask?: { move: number; target: string };
  /** Stat changes from moves like Growl and Swords Dance, by fighter id: -3 to +3 each, until the battle ends. */
  stage?: Record<string, Record<string, number>>;
  /** Background image name (public/backgrounds/<bg>.webp) and the layer whose drawn scene shows until that image exists. */
  bg?: string; scene?: number;
}

/** Something every device shows once: a level-up (to its owner), an evolution or a Mega Evolution (to everyone).
    'item' never leaves the device: it is the card a player sees when someone gives them an item. */
export interface GameEvent {
  id: string; t: number; kind: 'level' | 'evo' | 'mega' | 'item'; char: string; name: string; level?: number; notes?: string[];
  from?: string; to?: string; species?: string; form?: string; types?: string[]; shiny?: boolean;
}

export interface LootLine {
  id: string; kind: 'item' | 'money'; itemId?: string; tm?: string; name?: string; r?: string; desc?: string; qty?: number;
  money?: number; src: string; roll: string; to: string; why: string; price?: number; sold?: boolean; special?: boolean;
  /** Shop price before any discount, so a discount can be changed without stacking. */
  base?: number;
}
export interface TrapResult { n: string; r: number; m: number; tot: number; ok: boolean; dmg: number }
export interface CellEv { enemies?: Enemy[]; trap?: number; stock?: LootLine[]; flavor?: string; results?: TrapResult[]; ambush?: boolean }
export interface Cell { t: string; v?: boolean; done?: boolean; ev?: CellEv }
export interface FloorMap {
  w: number; h: number; cells: Record<string, Cell>; edges: Record<string, number>; pos: string;
  rev?: boolean; trapsSeen?: boolean; stairsSeen?: boolean;
}
export interface Dungeon {
  state: 'idle' | 'prep' | 'in'; name: string; floor?: number; floors?: number; lvl?: number; types?: string[]; extra?: string;
  map?: FloorMap | null; cleared?: boolean; kind?: 'labyrinth' | 'rift' | 'wild'; node?: string; layer?: number; to?: number;
  start?: number; gatekeeper?: string | null;
}
export interface AreaEv {
  kind: 'battle' | 'forage' | 'merchant' | 'rescue' | 'treasure'; roll: number; text: string; enemies?: Enemy[];
  item?: LootLine; stock?: LootLine[]; xp?: number; poke?: number; done?: boolean;
}
export interface Announce { id: string; title: string; sub: string; tone: string }
export interface Quest { id: string; title: string; giver: string; xp: number; poke: number; item?: string; qty?: number; done?: boolean }
export interface World {
  layer: number; at: string; unlocked: number[]; deepest: number; votes: Record<string, string>;
  /** Shops by place id. `dm` is the one the DM opens anywhere, when the players go looking for a shop or a merchant. */
  shop: Record<string, { stock: LootLine[]; off?: number; name?: string }>; area: Record<string, AreaEv>; rifts: Record<string, string>; announce: Announce | null; met: Record<string, boolean>; bond: Record<string, number>; quests: Quest[]; graduated?: boolean; sparDone?: boolean;
  /** Characters the DM added, what happened when the team met each character (players can read it), and when they met. */
  people?: Person[]; notes?: Record<string, string>; metAt?: Record<string, number>;
}
export interface User { name: string; role: 'dm' | 'player'; hash?: string }
/** `kind` picks the log an entry shows in. Without one, the text decides (see logKind in store.ts). */
export interface LogEntry { id: string; t: number; who: string; text: string; kind?: 'story' | 'battle' | 'item' | 'roll' }
/** A character the DM added in the app. Same shape as the built-in story cast. */
export interface Person { id: string; name: string; species: string; role: string; desc: string; secret?: string; layer?: number; types?: string[] }

export interface Shared {
  chars: Char[];
  game: { battle: Battle | null; bsetup: { pcs: string[]; enemies: Enemy[] }; events?: GameEvent[] };
  dungeon: Dungeon;
  loot: { lines: LootLine[] };
  rules: { difficulty: string; /** Players roll real dice for attacks and the DM types them in. */ ownDice?: boolean; /** Players who chose real dice for themselves, by lowercase name. */ dice?: Record<string, boolean> };
  world: World;
  storage: { items: BagItem[]; poke: number };
  log: { entries: LogEntry[] };
  users: { list: User[] };
}
export type SharedDocKey = Exclude<keyof Shared, 'chars'>;
