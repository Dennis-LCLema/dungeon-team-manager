import { useRef, useState } from 'react';
import { run } from '../components/common';
import { FIREBASE_CONFIG, gameCode, setGameCode, validCode } from '../game/firebase';
import { G, checkPw, owns, setUi, toast, useGame } from '../game/store';

export default function Login() {
  const s = useGame();
  const [pick, setPick] = useState('');
  const [pw, setPw] = useState('');
  const pwRef = useRef<HTMLInputElement>(null);

  const login = () => run(async () => {
    const u = G().users.list.find(x => x.name === pick);
    if (!u) return toast('Pick your name first.', 'bad');
    if (!(await checkPw(u, pw))) return toast("That password doesn't match. Try again, or ask Dennis to reset it.", 'bad');
    setUi({ meName: u.name });
    const mine = G().chars.find(owns);
    setUi(u.role !== 'dm' ? { tab: 'play', ...(mine ? { activeId: mine.id } : {}) } : { tab: 'party' });
    toast(`Welcome, ${u.name}!`);
  });

  return (
    <main className="gutter">
      {FIREBASE_CONFIG && !window.claude?.use ? <GameCode /> : null}
      <section className="card login">
        <h2>Who's playing?</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Pick your name, then type your password.</p>
        <div className="who">
          {s.users.list.map(u => (
            <button key={u.name} type="button" className={`whotile ${pick === u.name ? 'on' : ''}`} aria-pressed={pick === u.name}
              onClick={() => { setPick(u.name); setTimeout(() => pwRef.current?.focus(), 0); }}>
              <span className="avatar" style={{ width: 44, height: 44, fontSize: 18, background: u.role === 'dm' ? 'var(--gold)' : 'var(--accent)' }}>{u.name[0]}</span>
              <b>{u.name}</b><small>{u.role === 'dm' ? 'Dungeon Master' : 'Player'}</small>
            </button>
          ))}
        </div>
        <form className="row" style={{ marginTop: 14, alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); login(); }}>
          <label style={{ flex: 1 }}>Password{pick ? ' for ' + pick : ''}
            <input ref={pwRef} type="password" autoComplete="current-password" disabled={!pick} value={pw} onChange={e => setPw(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={!pick}>Log in</button>
        </form>
        <p className="small muted" style={{ marginBottom: 0 }}>Forgot it? Ask Dennis to reset your password.</p>
      </section>
    </main>
  );
}

/** Outside Claude, a shared game code puts every device on the same team. */
function GameCode() {
  const cur = gameCode(), [code, setCode] = useState(cur), [open, setOpen] = useState(!cur);
  const join = () => {
    if (!validCode(code)) return toast('Use 8 to 40 letters, numbers or dashes, like labyrinth-crew-42.', 'bad');
    setGameCode(code);
  };
  if (!open) return (
    <section className="card login row between">
      <span>Game: <b className="mono">{cur}</b></span>
      <button className="btn sm ghost" onClick={() => setOpen(true)}>Change</button>
    </section>
  );
  return (
    <section className="card login">
      <h2>Join your game</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Type the game code from your DM. Everyone with the same code shares one team. {cur ? '' : 'Without a code, the team stays on this device only.'}</p>
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); join(); }}>
        <label style={{ flex: 1 }}>Game code<input value={code} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="e.g. labyrinth-crew-42" onChange={e => setCode(e.target.value)} /></label>
        <button className="btn primary" type="submit">Join</button>
        {cur ? <button className="btn ghost" type="button" onClick={() => { setCode(cur); setOpen(false); }}>Cancel</button> : null}
      </form>
    </section>
  );
}
