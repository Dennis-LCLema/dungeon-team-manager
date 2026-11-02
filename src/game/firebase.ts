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
  location.reload();
}
/** Game codes are the only lock on a game, so they must be long enough to be hard to guess. */
export const validCode = (c: string) => /^[a-z0-9-]{8,40}$/.test(c.trim().toLowerCase());

type Snap = { exists: boolean; data: () => any };
export async function firebaseDb(code: string) {
  const [{ initializeApp }, fs, auth] = await Promise.all([import('firebase/app'), import('firebase/firestore'), import('firebase/auth')]);
  const app = initializeApp(FIREBASE_CONFIG!);
  await auth.signInAnonymously(auth.getAuth(app));
  const store = fs.getFirestore(app), root = `games/${code}`;
  const wrap = (ref: ReturnType<typeof fs.doc>) => ({
    onSnapshot: (cb: (s: Snap) => void, err: (e: unknown) => void) => fs.onSnapshot(ref, s => cb({ exists: s.exists(), data: () => s.data() }), err),
    set: (d: object) => fs.setDoc(ref, d),
    delete: () => fs.deleteDoc(ref),
  });
  return {
    doc: (path: string) => wrap(fs.doc(store, `${root}/${path}`)),
    collection: (name: string) => ({
      onSnapshot: (cb: (s: { docs: Snap[] }) => void, err: (e: unknown) => void) =>
        fs.onSnapshot(fs.collection(store, `${root}/${name}`), s => cb({ docs: s.docs.map(d => ({ exists: true, data: () => d.data() })) }), err),
      doc: (id: string) => wrap(fs.doc(store, `${root}/${name}/${id}`)),
    }),
  };
}
