/* Shared team sync through the Claude artifact database, or through Firebase outside Claude (see firebase.ts).
   With neither, the team stays saved on each device. Document paths and shapes match
   the original app, so an existing shared team keeps working.

   A battle change goes out at once, together with the HP and PP it changed, as one all-or-nothing commit that the
   database only accepts if nobody changed the battle first (where the database supports it: Firebase does).
   So a move is never half-applied, and a phone that was asleep can't overwrite newer turns with an old one. */
import { G, getUi, remote, replaceFromRemote, setLocalChangeHandler, setRemote, toast, trimLog } from './store';
import type { Char, LogEntry, Shared, SharedDocKey } from './types';
import { stable, uid } from '../lib/util';
import { FIREBASE_CONFIG, firebaseDb, gameCode } from './firebase';

const DOCS: Record<SharedDocKey, string> = {
  game: 'game/current', dungeon: 'game/dungeon', loot: 'game/loot', rules: 'config/rules',
  world: 'game/world', storage: 'game/storage', log: 'game/log', users: 'config/users',
};
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));

let db: any = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const known: Record<string, string | undefined> = {};
const queue: Record<string, Promise<void>> = {};
const ready: Record<string, boolean> = {};

/* ---------- Battle commits ---------- */
type GameDoc = Shared['game'] & { rev?: number; by?: string };
/** One document to send. No `j` means delete it. */
interface Write { key: string; path: string; j?: string; ref: () => any }
const ME = uid();                 // this device, to recognise its own battle writes when they come back
let baseRev = 0;                  // revision of the battle this device last got from the database
let sending = false;              // a battle commit is on its way
let batch: { writes: Write[]; before: Record<string, string | undefined> } | null = null; // that commit, or one waiting to be retried
let held: GameDoc | null = null;  // a battle that arrived while a commit was on its way
let offline = false;
const mark = (key: string, j: string | undefined) => { if (j === undefined) delete known[key]; else known[key] = j; };
/** Count a commit's documents as not sent, unless something newer has arrived for them since. */
const unsend = (b: NonNullable<typeof batch>) => b.writes.forEach(w => { if (known[w.key] === w.j) mark(w.key, b.before[w.key]); });

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

/** Everything that differs from what the database has. */
function pending(): Write[] {
  const s = G(), out: Write[] = [];
  if (ready.chars) {
    const seen = new Set<string>();
    s.chars.forEach(c => {
      seen.add(c.id);
      const key = 'c:' + c.id, j = stable(c);
      if (known[key] !== j) out.push({ key, path: 'chars/' + c.id, j, ref: () => db.collection('chars').doc(c.id) });
    });
    Object.keys(known).filter(k => k.startsWith('c:') && !seen.has(k.slice(2))).forEach(key => {
      const id = key.slice(2);
      out.push({ key, path: 'chars/' + id, ref: () => db.collection('chars').doc(id) });
    });
  }
  (Object.entries(DOCS) as [SharedDocKey, string][]).forEach(([k, path]) => {
    if (!ready[k]) return;
    const j = stable(s[k]);
    if (known[k] !== j) out.push({ key: k, path, j, ref: () => db.doc(path) });
  });
  return out;
}

function flush() {
  if (!db || remote.readOnly || sending) return;
  const writes = pending(), game = writes.find(w => w.key === 'game');
  if (!writes.length) return;
  const body = (w: Write) => (w.key === 'game' ? { ...JSON.parse(w.j!), rev: baseRev + 1, by: ME } : JSON.parse(w.j!));
  const before = Object.fromEntries(writes.map(w => [w.key, known[w.key]]));
  const bodies = writes.map(w => (w.j ? body(w) : null));
  writes.forEach(w => mark(w.key, w.j));
  if (!game || !db.commit) {
    // Sheet edits, votes and the like: each document on its own. These queue up if the connection drops.
    writes.forEach((w, i) => write(w.key, () => (bodies[i] ? w.ref().set(bodies[i]) : w.ref().delete())));
    if (game) baseRev++;
    return;
  }
  const mine = { writes, before }, rev = baseRev;
  batch = mine;
  sending = true;
  db.commit(writes.map((w, i) => ({ path: w.path, body: bodies[i] })), { path: DOCS.game, rev }).then((theirs: GameDoc | null) => {
    sending = false;
    if (offline) { offline = false; toast('Back online. Your change was sent.'); }
    if (!theirs) { batch = null; baseRev = Math.max(baseRev, rev + 1); }
    else if (theirs.by === ME) { unsend(mine); baseRev = Math.max(baseRev, theirs.rev || 0); } // an earlier try landed after all: send this on top of it
    else onGame(theirs);
    return true;
  }, () => {
    // No connection: keep the change on this device and try again shortly.
    sending = false;
    unsend(mine);
    if (!offline) { offline = true; toast('No connection. Your change will send as soon as this device is back online.', 'bad'); }
    setTimeout(flush, 2000);
    return false;
  }).then((sent: boolean) => {
    const h = held;
    held = null;
    if (h) onGame(h);
    if (sent) flush();
  });
}
function scheduleFlush() {
  if (!db || remote.readOnly) return;
  clearTimeout(timer);
  // A battle change goes out at once so everyone sees the turn right away. Typing on a sheet waits for a pause.
  timer = setTimeout(flush, ready.game && stable(G().game) !== known.game ? 0 : 350);
}

/** The battle as the database has it. If this device had a battle change that didn't make it, that change is undone
    (with the HP and PP that went with it), because someone else's move got there first. */
function onGame(raw: GameDoc, first = false) {
  if (sending) { held = raw; return; }
  const { rev, by, ...d } = raw, j = stable(d);
  let s = G();
  const mine = stable(s.game), unsent = !!batch || mine !== known.game;
  if (by === ME) {
    // My own write coming back. Only take it if this device somehow shows something else and has nothing to send.
    baseRev = Math.max(baseRev, rev || 0);
    if (unsent || j === mine) return;
  } else if (rev != null && rev < baseRev && !first) return; // older than what this device already has
  baseRev = rev || 0;
  known.game = j;
  if (unsent && !first) {
    const chars = s.chars.slice(), docs: Partial<Shared> = {};
    if (batch) unsend(batch);
    (batch?.writes || []).forEach(w => {
      const old = batch!.before[w.key];
      if (w.key === 'game' || !old) return; // a brand-new Pokémon stays, and is sent again
      if (!w.key.startsWith('c:')) { if (stable(s[w.key as SharedDocKey]) === w.j) (docs as any)[w.key] = JSON.parse(old); return; }
      const i = chars.findIndex(c => c.id === w.key.slice(2));
      if (i < 0) { if (!w.j) chars.push(JSON.parse(old)); } // a deleted one comes back
      else if (stable(chars[i]) === w.j) chars[i] = JSON.parse(old);
    });
    s = { ...s, ...docs, chars: chars.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)) };
    toast("Someone else's move reached the game first, so your last change was undone. Check the battle and try again.", 'bad');
  }
  batch = null;
  if (j !== mine || s !== G()) replaceFromRemote({ ...s, game: d as Shared['game'] });
}

function mergeLog(a: Shared['log'], b: Shared['log']) {
  const seen: Record<string, LogEntry> = {};
  [...(a.entries || []), ...(b.entries || [])].forEach(e => { if (e?.id) seen[e.id] = e; });
  return { entries: trimLog(Object.values(seen).sort((x, y) => y.t - x.t)) };
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
    if (k === 'game') { onGame(d, first); return; }
    const s = G(), mine = stable(s[k]), j = stable(d), dirty = !first && mine !== known[k];
    known[k] = j;
    if (j === mine) return; // nothing new: skip the redraw
    if (!dirty) replaceFromRemote({ ...s, [k]: d });
    else if (k === 'log') replaceFromRemote({ ...s, log: mergeLog(s.log, d) });
    else if (k === 'world') { replaceFromRemote({ ...s, world: mergeWorld(s.world, d, getUi().meName) }); scheduleFlush(); }
    // shortcut: other documents are last-writer-wins; fine while one person acts at a time (turns, DM-only screens).
    else scheduleFlush();
  }, () => {});
}

/** Connect the store to a database (the Claude one, the Firebase wrapper, or a test double). */
export function startSync(database: any) {
  db = database;
  setLocalChangeHandler(scheduleFlush);
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
    let changed = remoteChars.length !== s.chars.length;
    const next = remoteChars.map(c => {
      const key = 'c:' + c.id, loc = local[c.id], j = stable(c), lj = loc && stable(loc);
      const same = lj === j, dirty = loc && !same && lj !== known[key];
      known[key] = j;
      if (!same && !dirty) changed = true;
      return same || dirty ? loc : c;
    });
    s.chars.forEach(c => { if (!remoteIds.has(c.id) && !known['c:' + c.id]) { next.push(c); changed = true; } });
    Object.keys(known).forEach(k => { if (k.startsWith('c:') && !remoteIds.has(k.slice(2))) delete known[k]; });
    if (changed) replaceFromRemote({ ...s, chars: next.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)) });
    else scheduleFlush();
  }, () => { setRemote({ live: false }); toast('Lost the connection to the shared team. Reload to reconnect.', 'bad'); });
  (Object.entries(DOCS) as [SharedDocKey, string][]).forEach(([k, p]) => watchDoc(k, p));
}

export async function initSync() {
  let database: any;
  if (window.claude?.use) {
    try { database = await window.claude.use('db'); } catch { database = null; }
    if (!database) return;
    try {
      const user = await window.claude.use('user');
      if (user?.can && (await user.can('data.write')) === false) setRemote({ readOnly: true });
    } catch { /* no user capability */ }
  } else {
    const code = gameCode();
    if (!FIREBASE_CONFIG || !code) return;
    try { database = await firebaseDb(code); } catch { toast('Could not reach the shared team. Check your internet, then reload.', 'bad'); return; }
  }
  startSync(database);
}
