/* Shared team sync through the Claude artifact database, or through Firebase outside Claude (see firebase.ts).
   With neither, the team stays saved on each device. Document paths and shapes match
   the original app, so an existing shared team keeps working. */
import { G, getUi, remote, replaceFromRemote, setLocalChangeHandler, setRemote, toast } from './store';
import type { Char, LogEntry, Shared, SharedDocKey } from './types';
import { stable } from '../lib/util';
import { FIREBASE_CONFIG, firebaseDb, gameCode } from './firebase';

const DOCS: Record<SharedDocKey, string> = {
  game: 'game/current', dungeon: 'game/dungeon', loot: 'game/loot', rules: 'config/rules',
  world: 'game/world', storage: 'game/storage', log: 'game/log', users: 'config/users',
};
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));

let db: any = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const known: Record<string, string> = {};
const queue: Record<string, Promise<void>> = {};
const ready: Record<string, boolean> = {};

function write(key: string, fn: () => Promise<void>, retried = false) {
  const prev = queue[key] || Promise.resolve();
  queue[key] = prev.then(fn).catch((e: any) => {
    const code = e?.code;
    if (code === 'unavailable' && !retried) { setTimeout(() => write(key, fn, true), 800 + Math.random() * 800); return; }
    delete known[key];
    if (code === 'invalid_argument') {
      if (!remote.readOnly) { setRemote({ readOnly: true }); toast("This Claude account can view the team but can't change it. Ask Dennis for Contributor access.", 'bad'); }
    } else if (code === 'quota_exceeded') toast('The shared team is full. Delete an old character to make room.', 'bad');
    else toast('A change did not reach the shared team. Reload to sync again.', 'bad');
  });
}

function flush() {
  if (!db || remote.readOnly) return;
  const s = G();
  if (ready.chars) {
    const seen = new Set<string>();
    s.chars.forEach(c => {
      seen.add(c.id);
      const key = 'c:' + c.id, j = stable(c);
      if (known[key] !== j) { known[key] = j; const body = clone(c); write(key, () => db.collection('chars').doc(c.id).set(body)); }
    });
    Object.keys(known).filter(k => k.startsWith('c:') && !seen.has(k.slice(2))).forEach(k => {
      delete known[k];
      const id = k.slice(2);
      write(k, () => db.collection('chars').doc(id).delete());
    });
  }
  (Object.entries(DOCS) as [SharedDocKey, string][]).forEach(([k, path]) => {
    if (!ready[k]) return;
    const j = stable(s[k]);
    if (known[k] !== j) { known[k] = j; const body = clone(s[k]); write(k, () => db.doc(path).set(body)); }
  });
}
function scheduleFlush() {
  if (!db || remote.readOnly) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 350);
}

function mergeLog(a: Shared['log'], b: Shared['log']) {
  const seen: Record<string, LogEntry> = {};
  [...(a.entries || []), ...(b.entries || [])].forEach(e => { if (e?.id) seen[e.id] = e; });
  return { entries: Object.values(seen).sort((x, y) => y.t - x.t).slice(0, 80) };
}

/** Two phones changed the World at once: take theirs, then put my own vote back (each player only ever changes their own). */
export function mergeWorld(mine: Shared['world'], theirs: Shared['world'], myName: string | null): Shared['world'] {
  const votes = { ...theirs.votes };
  if (myName) { if (mine.votes?.[myName]) votes[myName] = mine.votes[myName]; else delete votes[myName]; }
  return { ...theirs, votes };
}

function watchDoc(k: SharedDocKey, path: string) {
  db.doc(path).onSnapshot((snap: any) => {
    const first = !ready[k];
    ready[k] = true;
    if (!snap.exists) { scheduleFlush(); return; }
    const d = clone(snap.data());
    const s = G(), dirty = !first && stable(s[k]) !== known[k];
    known[k] = stable(d);
    if (!dirty) replaceFromRemote({ ...s, [k]: d });
    else if (k === 'log') replaceFromRemote({ ...s, log: mergeLog(s.log, d) });
    else if (k === 'world') { replaceFromRemote({ ...s, world: mergeWorld(s.world, d, getUi().meName) }); scheduleFlush(); }
    // shortcut: other documents are last-writer-wins; fine while one person acts at a time (turns, DM-only screens).
    else scheduleFlush();
  }, () => {});
}

export async function initSync() {
  setLocalChangeHandler(scheduleFlush);
  if (window.claude?.use) {
    try { db = await window.claude.use('db'); } catch { db = null; }
    if (!db) return;
    try {
      const user = await window.claude.use('user');
      if (user?.can && (await user.can('data.write')) === false) setRemote({ readOnly: true });
    } catch { /* no user capability */ }
  } else {
    const code = gameCode();
    if (!FIREBASE_CONFIG || !code) return;
    try { db = await firebaseDb(code); } catch { db = null; toast('Could not reach the shared team. Check your internet, then reload.', 'bad'); return; }
  }
  db.collection('chars').onSnapshot((snap: any) => {
    const remoteChars: Char[] = snap.docs.filter((d: any) => d.exists).map((d: any) => clone(d.data()));
    const s = G();
    if (!ready.chars) {
      ready.chars = true;
      setRemote({ live: true });
      if (!remoteChars.length && s.chars.length && !remote.readOnly) { scheduleFlush(); return; }
      remoteChars.forEach(c => { known['c:' + c.id] = stable(c); });
      replaceFromRemote({ ...s, chars: remoteChars.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)) });
      return;
    }
    const local = Object.fromEntries(s.chars.map(c => [c.id, c]));
    const remoteIds = new Set(remoteChars.map(c => c.id));
    const next = remoteChars.map(c => {
      const key = 'c:' + c.id, loc = local[c.id];
      const dirty = loc && stable(loc) !== known[key];
      known[key] = stable(c);
      return dirty ? loc : c;
    });
    s.chars.forEach(c => { if (!remoteIds.has(c.id) && !known['c:' + c.id]) next.push(c); });
    Object.keys(known).forEach(k => { if (k.startsWith('c:') && !remoteIds.has(k.slice(2))) delete known[k]; });
    replaceFromRemote({ ...s, chars: next.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)) });
  }, () => { setRemote({ live: false }); toast('Lost the connection to the shared team. Reload to reconnect.', 'bad'); });
  (Object.entries(DOCS) as [SharedDocKey, string][]).forEach(([k, p]) => watchDoc(k, p));
}
