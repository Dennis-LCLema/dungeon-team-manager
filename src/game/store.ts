/* The game store. Shared state (synced between players) changes only through update(), which runs the
   recipe on an immer draft. Rules code reads the state with G(): inside update() that is the draft,
   otherwise the latest snapshot. Per-device UI state lives in a separate small store. */
import { produce } from 'immer';
import { useSyncExternalStore } from 'react';
import { lsGet, lsSet, uid } from '../lib/util';
import type { AttackResult, Char, Shared, User } from './types';

export const LS_KEY = 'pmd-team-v2';
const ME_KEY = 'pmd-me';

const DEFAULT_USERS: User[] = [
  { name: 'Dennis', role: 'dm' }, { name: 'Christian', role: 'player' }, { name: 'Luis', role: 'player' },
  { name: 'Juan', role: 'player' }, { name: 'Alfred', role: 'player' },
];
export const blankShared = (): Shared => ({
  chars: [],
  game: { battle: null, bsetup: { pcs: [], enemies: [] } },
  dungeon: { state: 'idle', name: '' },
  loot: { lines: [] },
  rules: { difficulty: 'normal' },
  world: { layer: 0, at: '0:waystone', unlocked: [0], deepest: 0, votes: {}, shop: {}, area: {}, rifts: {}, announce: null, met: {}, bond: {}, quests: [] },
  storage: { items: [], poke: 0 },
  log: { entries: [] },
  users: { list: DEFAULT_USERS.map(u => ({ ...u })) },
});
const SHARED_KEYS = ['game', 'dungeon', 'loot', 'rules', 'world', 'storage', 'log', 'users'] as const;

/** Fill in missing pieces so old or partial saves still work. Mutates s. */
export function normalize(s: Shared) {
  const b = blankShared(), any = s as any;
  SHARED_KEYS.forEach(k => { any[k] = Object.assign({}, b[k], any[k] || {}); });
  s.game.bsetup = Object.assign({ pcs: [], enemies: [] }, s.game.bsetup || {});
  const old = any.game.dungeon;
  if (old) {
    if (old.state && old.state !== 'idle' && s.dungeon.state === 'idle') s.dungeon = old;
    delete any.game.dungeon;
  }
  if (!Array.isArray(s.users.list) || !s.users.list.length) s.users.list = b.users.list;
  if (!Array.isArray(s.storage.items)) s.storage.items = [];
  if (!Array.isArray(s.log.entries)) s.log.entries = [];
  if (!Array.isArray(s.loot.lines)) s.loot.lines = [];
  (['votes', 'shop', 'area', 'rifts', 'met', 'bond'] as const).forEach(k => { if (!s.world[k] || typeof s.world[k] !== 'object') (s.world as any)[k] = {}; });
  if (!Array.isArray(s.world.quests)) s.world.quests = [];
  if (!Array.isArray(s.world.unlocked) || !s.world.unlocked.length) s.world.unlocked = [0];
  if (!Array.isArray(s.chars)) s.chars = [];
}

/* ---------- Shared state ---------- */
const saved = lsGet<Partial<Shared> & { tab?: string; activeId?: string | null }>(LS_KEY, {});
const savedShared: Partial<Shared> & { tab?: unknown; activeId?: unknown } = { ...saved };
delete savedShared.tab;
delete savedShared.activeId;
let current: Shared = produce(Object.assign(blankShared(), savedShared), normalize);
let draft: Shared | null = null;
const listeners = new Set<() => void>();
let onLocalChange: (() => void) | null = null;

export const G = (): Shared => draft ?? current;
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useGame = () => useSyncExternalStore(subscribe, () => current);

let warnedLocal = false;
function persist() {
  if (!lsSet(LS_KEY, { ...current, tab: uiState.tab, activeId: uiState.activeId }) && !warnedLocal && !remote.live) {
    warnedLocal = true;
    toast('This browser blocked saving. Export your team from the Admin tab to keep it.', 'bad');
  }
}

/** Change shared state. Nested calls run inside the outer draft. */
export function update(recipe: (s: Shared) => void) {
  if (draft) { recipe(draft); return; }
  const next = produce(current, d => {
    draft = d;
    try { recipe(d); } finally { draft = null; }
  });
  if (next === current) return;
  current = next;
  persist();
  onLocalChange?.();
  emit();
}

/** Replace shared state with data that came from the shared database (no write-back of its own). */
export function replaceFromRemote(next: Shared) {
  current = produce(next, normalize);
  persist();
  onLocalChange?.();
  emit();
}
export const setLocalChangeHandler = (fn: () => void) => { onLocalChange = fn; };

/** Log line for the shared adventure log. Call inside update(). */
export function addLog(text: string) {
  const s = G();
  s.log.entries.unshift({ id: uid(), t: Date.now(), who: me()?.name || '', text });
  if (s.log.entries.length > 80) s.log.entries.length = 80;
}

/* ---------- Per-device UI state ---------- */
export interface Toast { id: string; msg: string; kind?: 'bad' }
export type Modal =
  | { kind: 'ask'; msg: string; ok: string; resolve: (v: boolean) => void }
  | { kind: 'text'; name: string; text: string };
export interface Evo { from: string; to: string; name: string; types: string[]; img: string }
export interface UiState {
  tab: string; activeId: string | null; meName: string | null; busy: string; evo: Evo | null;
  toasts: Toast[]; modal: Modal | null; seenAnn: string | null; seenHit: string | null; popup: AttackResult | null;
}
let uiState: UiState = {
  tab: saved.tab || 'party', activeId: saved.activeId || null, meName: lsGet<string | null>(ME_KEY, null), busy: '', evo: null,
  toasts: [], modal: null, seenAnn: lsGet<string | null>('pmd-ann', null), seenHit: null, popup: null,
};
const uiListeners = new Set<() => void>();
const uiSubscribe = (l: () => void) => { uiListeners.add(l); return () => { uiListeners.delete(l); }; };
export const getUi = () => uiState;
export function setUi(patch: Partial<UiState>) {
  uiState = { ...uiState, ...patch };
  if ('meName' in patch) lsSet(ME_KEY, patch.meName ?? null);
  if ('seenAnn' in patch) lsSet('pmd-ann', patch.seenAnn ?? null);
  if ('tab' in patch || 'activeId' in patch) persist();
  uiListeners.forEach(l => l());
}
export const useUi = () => useSyncExternalStore(uiSubscribe, () => uiState);

export function toast(msg: string, kind?: 'bad') {
  const t = { id: uid(), msg, kind };
  setUi({ toasts: [...uiState.toasts, t] });
  setTimeout(() => setUi({ toasts: uiState.toasts.filter(x => x.id !== t.id) }), 4200);
}
export function ask(msg: string, ok = 'Yes'): Promise<boolean> {
  return new Promise(resolve => setUi({ modal: { kind: 'ask', msg, ok, resolve } }));
}

/* ---------- Sync status (set by sync.ts) ---------- */
export const remote = { live: false, readOnly: false };
export function setRemote(p: Partial<typeof remote>) { Object.assign(remote, p); setUi({}); }

/* ---------- Who is using the app ---------- */
export const me = (): User | null => {
  const n = uiState.meName;
  return G().users.list.find(u => !!n && u.name.toLowerCase() === String(n).toLowerCase()) || null;
};
export const isDM = () => me()?.role === 'dm';
export const owns = (c: Char | null | undefined) => !!me() && !!c && String(c.player || '').toLowerCase() === me()!.name.toLowerCase();
export const canEdit = (c: Char | null | undefined) => isDM() || owns(c);
export const players = () => G().users.list.filter(u => u.role !== 'dm');
export const activeChar = () => G().chars.find(c => c.id === uiState.activeId) || null;
export const charById = (id: string | undefined | null) => G().chars.find(c => c.id === id) || null;

export async function hashPw(name: string, pw: string) {
  const txt = 'pmd|' + name.toLowerCase() + '|' + pw;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 2166136261;
    for (const ch of txt) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return 'f' + (h >>> 0).toString(16);
  }
}
export async function checkPw(u: User, pw: string) {
  return u.hash ? (await hashPw(u.name, pw)) === u.hash : pw === u.name.toLowerCase();
}

/* ---------- Files ---------- */
declare global {
  interface Window { claude?: { use: (cap: string) => Promise<any> } }
}
export const inClaude = () => !!window.claude?.use;

export async function exportFile(name: string, obj: unknown) {
  const text = JSON.stringify(obj, null, 2);
  if (inClaude()) {
    let dl: any;
    try { dl = await window.claude!.use('downloads'); } catch { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name, data: text }); return; } catch (e: any) { if (e?.code === 'declined') return; }
    }
    setUi({ modal: { kind: 'text', name, text } });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
