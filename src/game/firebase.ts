/* Shared team outside Claude (for example on GitHub Pages), through Google Firebase.
   It gives sync.ts the same doc/collection calls the Claude database has, so the sync logic stays the same.
   Every game lives under games/<game code>/ in Firestore. */
import { lsGet, lsSet } from '../lib/util';
import { LS_KEY } from './store';

/** Paste the web app config from the Firebase console here. Null keeps the app device-only. These values are public, not secrets. */
export const FIREBASE_CONFIG: Record<string, string> | null = {
  apiKey: 'AIzaSyB_Xpax3mPBYV6UbGK06tV5SyQf9AjqDCI',
  authDomain: 'labyrinth-crew.firebaseapp.com',
  projectId: 'labyrinth-crew',
  storageBucket: 'labyrinth-crew.firebasestorage.app',
  messagingSenderId: '68525399220',
  appId: '1:68525399220:web:94ed20c52fd55c31374be1',
};

const CODE_KEY = 'pmd-game-code';
export const gameCode = (): string => lsGet(CODE_KEY, '');
/** Join another game: forget this device's copy of the old team first, so it can't be pushed into the new one. */
export function setGameCode(code: string) {
  lsSet(CODE_KEY, code.trim().toLowerCase());
  try { localStorage.removeItem(LS_KEY); } catch { /* storage blocked */ }
  location.replace(location.pathname); // reload without any ?game= in the address
}

/** The link that joins this game in one tap. */
export const inviteLink = (code = gameCode()) => `${location.origin}${location.pathname}?game=${encodeURIComponent(code)}`;

/** Opened from an invite link? Join that game (reloads) or just tidy the address. Runs once at start-up. */
export function joinFromLink() {
  const code = new URLSearchParams(location.search).get('game')?.trim().toLowerCase();
  if (!code || !FIREBASE_CONFIG || window.claude?.use) return;
  if (validCode(code) && code !== gameCode()) { setGameCode(code); return; }
  history.replaceState(null, '', location.pathname);
}
/** Game codes are the only lock on a game, so they must be long enough to be hard to guess. */
export const validCode = (c: string) => /^[a-z0-9-]{8,40}$/.test(c.trim().toLowerCase());

type Snap = { exists: boolean; data: () => any };
export async function firebaseDb(code: string) {
  const [{ initializeApp }, fs, auth] = await Promise.all([import('firebase/app'), import('firebase/firestore'), import('firebase/auth')]);
  const app = initializeApp(FIREBASE_CONFIG!);
  await auth.signInAnonymously(auth.getAuth(app));
  // Keep a copy on the device: reopening is instant, and changes made during a Wi-Fi drop sync when it returns.
  let store: ReturnType<typeof fs.getFirestore>;
  try { store = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { store = fs.getFirestore(app); /* private browsing: no device cache */ }
  const root = `games/${code}`;
  // A phone that was locked can sit on a dead connection for a long time. Reconnect as soon as the app is back on screen.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (Date.now() - hiddenAt > 15000) void fs.disableNetwork(store).then(() => fs.enableNetwork(store));
  });
  const wrap = (ref: ReturnType<typeof fs.doc>) => ({
    onSnapshot: (cb: (s: Snap) => void, err: (e: unknown) => void) => fs.onSnapshot(ref, s => cb({ exists: s.exists(), data: () => s.data() }), err),
    set: (d: object) => fs.setDoc(ref, d),
    delete: () => fs.deleteDoc(ref),
  });
  return {
    doc: (path: string) => wrap(fs.doc(store, `${root}/${path}`)),
    /** All-or-nothing write. Nothing is written unless the guard document is still at the given revision;
        if it moved on, the newer document comes back instead of null. Fails (rather than queueing) with no connection. */
    commit: (writes: { path: string; body: object | null }[], guard: { path: string; rev: number }) => fs.runTransaction(store, async tx => {
      const cur = (await tx.get(fs.doc(store, `${root}/${guard.path}`))).data();
      if ((cur?.rev || 0) !== guard.rev) return cur || {};
      writes.forEach(w => { const ref = fs.doc(store, `${root}/${w.path}`); if (w.body) tx.set(ref, w.body); else tx.delete(ref); });
      return null;
    }),
    collection: (name: string) => ({
      onSnapshot: (cb: (s: { docs: Snap[] }) => void, err: (e: unknown) => void) =>
        fs.onSnapshot(fs.collection(store, `${root}/${name}`), s => cb({ docs: s.docs.map(d => ({ exists: true, data: () => d.data() })) }), err),
      doc: (id: string) => wrap(fs.doc(store, `${root}/${name}/${id}`)),
    }),
  };
}
