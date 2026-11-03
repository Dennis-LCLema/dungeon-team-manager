import { useState } from 'react';
import { run } from '../components/common';
import { FIREBASE_CONFIG, gameCode, inviteLink } from '../game/firebase';
import { InviteButton } from './Login';
import { nameOf, parseBackup } from '../game/rules';
import { G, ask, blankShared, checkPw, exportFile, hashPw, isDM, me, remote, setUi, toast, update, useGame } from '../game/store';
import { uid } from '../lib/util';

async function importJSON(text: string) {
  const r = parseBackup(text);
  if (r.kind === 'error') return toast('Import failed: ' + r.msg, 'bad');
  if (r.kind === 'char') {
    const c = { ...r.char, id: uid(), createdAt: Date.now() };
    update(s => { s.chars.push(c); });
    return toast(`${nameOf(c)} joined the team.`);
  }
  const full = !!r.state.world;
  if (!(await ask(full ? 'Replace the whole game (team, world, quests, log and logins) with this backup?' : 'Replace the team and storage with this older backup? World progress stays as it is.', 'Replace'))) return;
  update(s => { Object.assign(s, r.state); });
  toast(full ? 'Game restored.' : 'Team restored.');
}

const HOUSE_RULES = [
  'Levels 1–20. Every D&D level equals 5 Pokémon game levels (Mudkip evolves at 16 → level 4).',
  'Ability scores = 6 + base stat ÷ 12 (max 20 before bonuses).',
  'Hero HP at level 1 = hit die + Defense modifier + base HP ÷ 5 + 10. Each level after adds an average hit die roll + Defense modifier + 1.',
  'Difficulty (DM tools) scales enemy HP and damage. Monster House Pokémon are minions with half HP.',
  "A fainted hero can be helped up by an ally's turn, and wakes up with 1 HP after the team wins.",
  'Physical moves use Attack vs Guard. Special moves use Sp. Atk vs Sp. Guard.',
  'Move power → dice: ≤40 1d8, ≤60 2d6, ≤80 2d8, ≤100 3d8, ≤120 4d8, higher 5d8.',
  'Weak, high-PP moves are at-will. Others get 1–6 PP per long rest.',
  'Super effective = double damage, not very effective = half, immune = none.',
  'XP: Exp. Share is always on. Everyone still standing when the team wins gets XP for every defeated foe. The finishing blow earns 15% more. Fainted Pokémon get no XP for that battle.',
  'Level cap: 4 at the start, +2 for each Gatekeeper beaten (20 after floor 40). XP above the cap is held until the cap rises.',
  'Blessing: the first time the team beats a Gatekeeper, every Pokémon gains +1 level and +1 bonus skill point.',
  'Each level needs 250 × your level in XP, so a level takes about two Labyrinth floors. Red Rift and Gatekeeper foes give 1.5× XP. Shadow foes give 1.5×, bosses 3×, minions half, and purified foes 20% more.',
  'Battles open with an initiative roll. Ambushes (Monster Houses, Summon Traps, or losing the awareness roll) give the team disadvantage on initiative and foes advantage in round 1. Winning the awareness roll flips it.',
  'Mega Evolution: at level 10 a final-form Pokémon with a Mega can propose its own Mega Trial. When the DM marks it passed, it can Mega Evolve once per battle.',
  'Each Pokémon can hold one item. Shops buy items at half value. For D&D prices, 1 gp = ₽ 100.',
  'Defeated enemies roll d100 for loot. The DM tools tab explains the tables.',
  'Shadow moves deal 1.5× damage to all non-Shadow Pokémon. Defeat a Shadow with its Heart Gauge at 30 or lower to purify it.',
  'Every attack in battle shows a pop-up on everyone\'s screen with the roll, hit or miss, and the damage.',
];

export default function Account() {
  const s = useGame(), u = me()!, dm = isDM();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newUser, setNewUser] = useState('');
  const [paste, setPaste] = useState('');

  const changePw = () => run(async () => {
    if (!(await checkPw(u, oldPw))) return toast('Your current password is wrong.', 'bad');
    if (newPw.length < 4) return toast('Use at least 4 characters for the new password.', 'bad');
    const hash = await hashPw(u.name, newPw);
    update(st => { const x = st.users.list.find(y => y.name === u.name); if (x) x.hash = hash; });
    setOldPw(''); setNewPw('');
    toast('Password changed.');
  });
  const resetPw = (name: string) => run(async () => {
    if (!(await ask(`Reset ${name}'s password to their name in lowercase?`, 'Reset'))) return;
    update(st => { const x = st.users.list.find(y => y.name === name); if (x) delete x.hash; });
    toast(`${name}'s password is now "${name.toLowerCase()}".`);
  });
  const delUser = (name: string) => run(async () => {
    if (!(await ask(`Remove ${name} from the login list? Their Pokémon stay on the team.`, 'Remove'))) return;
    update(st => { const i = st.users.list.findIndex(y => y.name === name && y.role !== 'dm'); if (i >= 0) st.users.list.splice(i, 1); });
  });
  const addUser = () => {
    const n = newUser.trim();
    if (!n) return toast("Type the player's name.", 'bad');
    if (G().users.list.some(x => x.name.toLowerCase() === n.toLowerCase())) return toast('That name is already on the list.', 'bad');
    update(st => { st.users.list.push({ name: n, role: 'player' }); });
    setNewUser('');
    toast(`${n} added. Their password is "${n.toLowerCase()}".`);
  };
  const resetAll = () => run(async () => {
    if (!(await ask('Delete every character, battle and stored item for everyone?', 'Delete everything'))) return;
    update(st => { const keep = st.users; Object.assign(st, blankShared(), { users: keep }); });
    setUi({ activeId: null, tab: 'account' });
  });

  return (
    <>
      <section className="card">
        <h2>{u.name}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>{dm ? 'Dungeon Master. You control enemies, NPCs, levels and evolutions.' : 'Player. You control your own Pokémon.'}</p>
        <form className="grid2 stack" onSubmit={e => { e.preventDefault(); changePw(); }}>
          <label>Current password<input type="password" autoComplete="current-password" value={oldPw} onChange={e => setOldPw(e.target.value)} /></label>
          <label>New password<input type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} /></label>
          <div className="row">
            <button className="btn primary" type="submit">Change my password</button>
            <button className="btn" type="button" onClick={() => setUi({ meName: null, tab: 'party' })}>Log out</button>
          </div>
        </form>
      </section>
      {dm ? (
        <>
          {FIREBASE_CONFIG && !window.claude?.use && gameCode() ? (
            <section className="card callout">
              <h2>Invite players</h2>
              <p className="small" style={{ marginTop: 0 }}>Send this link. Tapping it joins game <b className="mono">{gameCode()}</b> with no code to type.</p>
              <p className="small mono" style={{ wordBreak: 'break-all' }}>{inviteLink()}</p>
              <InviteButton big />
            </section>
          ) : null}
          <section className="card">
            <h2>People</h2>
            {s.users.list.map(x => (
              <div className="list-item" key={x.name}>
                <span className="avatar" style={{ width: 32, height: 32, fontSize: 14, background: x.role === 'dm' ? 'var(--gold)' : 'var(--accent)' }}>{x.name[0]}</span>
                <span className="grow"><b>{x.name}</b> <span className="small muted">{x.role === 'dm' ? 'DM' : 'Player'} · {x.hash ? 'custom password' : 'default password'}</span></span>
                {x.hash ? <button className="btn sm" onClick={() => resetPw(x.name)}>Reset password</button> : null}
                {x.role !== 'dm' ? <button className="btn sm ghost danger" onClick={() => delUser(x.name)} aria-label={`Remove ${x.name}`}>✕</button> : null}
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="New player's name" style={{ flex: 1 }} value={newUser} onChange={e => setNewUser(e.target.value)} />
              <button className="btn" onClick={addUser}>Add player</button>
            </div>
            <p className="small muted">A reset or new player's password is their name in lowercase until they change it.</p>
          </section>
          <section className="card">
            <h2>Backup</h2>
            <p className="small muted" style={{ marginTop: 0 }}>{remote.live ? 'Everyone who opens this page shares one team.' : 'This team is saved in this browser only.'} Export a backup now and then.</p>
            <div className="row">
              <button className="btn primary" onClick={() => run(() => exportFile(`dungeon-team-backup-${new Date().toISOString().slice(0, 10)}.json`, { kind: 'pmd-team', version: 3, state: { ...s, game: { battle: null, bsetup: s.game.bsetup } } }))}>Export whole game</button>
            </div>
            <h3>Import</h3>
            <label>From a file
              <input type="file" accept=".json,application/json" onChange={e => {
                const f = e.target.files?.[0];
                if (f) f.text().then(importJSON, () => toast('Could not read that file.', 'bad'));
                e.target.value = '';
              }} />
            </label>
            <label style={{ marginTop: 10 }}>Or paste the text<textarea placeholder="Paste a character or team backup here" value={paste} onChange={e => setPaste(e.target.value)} /></label>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => (paste.trim() ? run(() => importJSON(paste)) : toast('Paste a character or backup first.', 'bad'))}>Import pasted text</button>
            </div>
            <p className="small muted">A whole-game backup replaces the team, world, quests, log and logins. A single Pokémon is added to the team.</p>
          </section>
          <section className="card">
            <h2>House rules used by this app</h2>
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{HOUSE_RULES.map(r => <li key={r}>{r}</li>)}</ul>
          </section>
          <section className="card"><h2>Reset</h2><button className="btn danger" onClick={resetAll}>Delete all characters and battles</button></section>
        </>
      ) : null}
    </>
  );
}
