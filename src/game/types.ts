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
export interface TreeNode { name: string; desc: string; on: boolean }
export type Branch = 'ability' | 'special' | 'physical';
export type Tree = Record<Branch, { label: string; nodes: TreeNode[] }>;
export interface Assist { name: string; move: string; note: string; used: boolean }

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
  /** Chosen preset ability (slug). Defaults to the first in `abilities`. */
  ability?: string;
  /** Player-made ability. Once the DM approves it, it replaces the preset one. */
  homebrew?: { name: string; desc: string; state: 'draft' | 'pending' | 'approved' };
}
export interface Enemy extends Mon {
  kind: 'enemy'; side: 'enemy' | 'npc'; name: string; shadow: boolean; heartGauge: number; hpMax: number;
  boss?: boolean; gatekeeper?: boolean; rift?: boolean; minion?: boolean; outReason?: string; killer?: string; overworld?: boolean;
  /** Id of the team member this foe goes after first (a rival). */
  focus?: string;
}
export type Fighter = Char | Enemy;

export interface OrderEntry { ref: 'pc' | 'enemy'; id: string; init: number; r1: number; r2: number | null; mod: number }
export interface AttackResult {
  id: string; actor: string; actorSide: 'team' | 'enemy'; target: string; move: string; moveType: string;
  status?: boolean; dc?: number; d20?: number; bonus?: number; total?: number; def?: number; defName?: string;
  hit?: boolean; crit?: boolean; fumble?: boolean; dmg?: number; eff?: number; adv?: boolean; extra?: string;
  ko?: boolean; hpLeft?: number; hpMax?: number; manual?: boolean; dis?: boolean; fx?: string;
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
  /** Background image name (public/backgrounds/<bg>.webp) and the layer whose drawn scene shows until that image exists. */
  bg?: string; scene?: number;
}

export interface LootLine {
  id: string; kind: 'item' | 'money'; itemId?: string; tm?: string; name?: string; r?: string; desc?: string; qty?: number;
  money?: number; src: string; roll: string; to: string; why: string; price?: number; sold?: boolean; special?: boolean;
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
  shop: Record<string, { stock: LootLine[]; off?: number }>; area: Record<string, AreaEv>; rifts: Record<string, string>; announce: Announce | null; met: Record<string, boolean>; bond: Record<string, number>; quests: Quest[]; graduated?: boolean;
}
export interface User { name: string; role: 'dm' | 'player'; hash?: string }
export interface LogEntry { id: string; t: number; who: string; text: string }

export interface Shared {
  chars: Char[];
  game: { battle: Battle | null; bsetup: { pcs: string[]; enemies: Enemy[] } };
  dungeon: Dungeon;
  loot: { lines: LootLine[] };
  rules: { difficulty: string };
  world: World;
  storage: { items: BagItem[]; poke: number };
  log: { entries: LogEntry[] };
  users: { list: User[] };
}
export type SharedDocKey = Exclude<keyof Shared, 'chars'>;
