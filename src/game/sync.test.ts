/* Battle sync: a move and the HP it changed land together, and a device that is behind can't overwrite newer turns. */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { G, update } from './store';
import { startSync } from './sync';
import type { Char } from './types';

/** An in-memory stand-in for the shared database, with the same calls firebase.ts offers. */
function fakeDb() {
  const docs: Record<string, any> = {}, subs: Record<string, (s: any) => void> = {}, commits: { path: string }[][] = [];
  let charSub: ((s: any) => void) | undefined;
  const snap = (path: string) => ({ exists: path in docs, data: () => docs[path] });
  const emit = (path: string) => (path.startsWith('chars/')
    ? charSub?.({ docs: Object.keys(docs).filter(p => p.startsWith('chars/')).map(snap) })
    : subs[path]?.(snap(path)));
  const put = (path: string, body: object | null) => { if (body) docs[path] = JSON.parse(JSON.stringify(body)); else delete docs[path]; emit(path); };
  const ref = (path: string) => ({ set: async (b: object) => put(path, b), delete: async () => put(path, null), onSnapshot: (cb: (s: any) => void) => { subs[path] = cb; cb(snap(path)); } });
  return {
    docs, put, commits, down: false,
    doc: ref,
    collection: () => ({ doc: (id: string) => ref('chars/' + id), onSnapshot: (cb: (s: any) => void) => { charSub = cb; emit('chars/'); } }),
    async commit(writes: { path: string; body: object | null }[], guard: { path: string; rev: number }) {
      if (this.down) throw new Error('offline');
      if ((docs[guard.path]?.rev || 0) !== guard.rev) return docs[guard.path] || {};
      commits.push(writes);
      writes.forEach(w => put(w.path, w.body));
      return null;
    },
  };
}

const db = fakeDb(), hero = { id: 'a', species: 'mudkip', nickname: '', player: 'Luis', items: [], hpCur: 10, createdAt: 1 } as unknown as Char;
const pcs = () => G().game.bsetup.pcs, hp = () => G().chars[0].hpCur;
const settle = () => vi.advanceTimersByTimeAsync(400);

beforeAll(() => {
  vi.useFakeTimers();
  db.docs['chars/a'] = hero;
  db.docs['game/current'] = { battle: null, bsetup: { pcs: [], enemies: [] }, rev: 3, by: 'someone' };
  startSync(db);
});
afterAll(() => { vi.useRealTimers(); });

it('sends a battle change and the HP it changed as one commit', async () => {
  expect(hp()).toBe(10);
  update(s => { s.game.bsetup.pcs = ['mine']; s.chars[0].hpCur = 7; });
  await settle();
  expect(db.commits.length).toBe(1);
  expect(db.commits[0].map(w => w.path)).toEqual(expect.arrayContaining(['chars/a', 'game/current']));
  expect(db.docs['game/current']).toMatchObject({ rev: 4, bsetup: { pcs: ['mine'] } });
  expect(db.docs['chars/a'].hpCur).toBe(7);
  expect(pcs()).toEqual(['mine']); // its own write coming back changes nothing
});

it("undoes a change that was based on an old battle, instead of overwriting someone else's move", async () => {
  // Another device moved the battle on, and this one hasn't heard yet.
  db.docs['game/current'] = { battle: null, bsetup: { pcs: ['theirs'], enemies: [] }, rev: 5, by: 'someone' };
  const n = db.commits.length;
  update(s => { s.game.bsetup.pcs = ['stale']; s.chars[0].hpCur = 1; });
  await settle();
  expect(db.commits.length).toBe(n);
  expect(db.docs['game/current'].bsetup.pcs).toEqual(['theirs']);
  expect(db.docs['chars/a'].hpCur).toBe(7);
  expect(pcs()).toEqual(['theirs']);
  expect(hp()).toBe(7);
});

it('takes a newer battle from another device, and ignores an older one', async () => {
  db.put('game/current', { battle: null, bsetup: { pcs: ['newer'], enemies: [] }, rev: 6, by: 'someone' });
  expect(pcs()).toEqual(['newer']);
  db.put('game/current', { battle: null, bsetup: { pcs: ['older'], enemies: [] }, rev: 2, by: 'someone' });
  expect(pcs()).toEqual(['newer']);
  db.docs['game/current'].rev = 6;
});

it('keeps a change while the connection is down and sends it when it is back', async () => {
  db.docs['game/current'] = { battle: null, bsetup: { pcs: ['newer'], enemies: [] }, rev: 6, by: 'someone' };
  db.down = true;
  update(s => { s.game.bsetup.pcs = ['later']; });
  await settle();
  expect(db.docs['game/current'].bsetup.pcs).toEqual(['newer']);
  expect(pcs()).toEqual(['later']);
  db.down = false;
  await vi.advanceTimersByTimeAsync(2500);
  expect(db.docs['game/current']).toMatchObject({ rev: 7, bsetup: { pcs: ['later'] } });
});
