import { useState } from 'react';
import { Avatar, HpBar, Types, run } from '../components/common';
import { createChar, createManual, equippedOf, MAX_LEVEL, maxHP, nameOf, xpNeed } from '../game/rules';
import { addLog, isDM, owns, players, setUi, toast, update, useGame } from '../game/store';
import { T, money } from '../lib/util';

export function TeamBanners() {
  const s = useGame(), dg = s.dungeon, b = s.game.battle, n = s.loot.lines.length, dm = isDM();
  const go = (tab: string) => setUi({ tab: dm ? tab : 'play' });
  return (
    <>
      {dg.state === 'prep' ? (
        <section className="card callout row between"><span><b>{dg.name}</b>: Dennis called the team. Lock in your 4 moves.</span>
          <button className="btn sm primary" onClick={() => go('dungeon')}>Go lock moves</button></section>
      ) : null}
      {dg.state === 'in' ? (
        <section className="card callout row between"><span>Exploring <b>{dg.name}</b>, floor {dg.floor} of {dg.floors}.</span>
          <button className="btn sm primary" onClick={() => go('dungeon')}>Open map</button></section>
      ) : null}
      {b && !b.result ? (
        <section className="card callout row between"><span>A battle is on, round {b.round}.</span>
          <button className="btn sm primary" onClick={() => go('battle')}>Go to battle</button></section>
      ) : null}
      {n ? (
        <section className="card row between">
          <span>Loot waiting: {s.loot.lines.map(l => (l.kind === 'money' ? money(l.money) : l.name)).join(', ')}.</span>
          {dm ? <button className="btn sm" onClick={() => setUi({ tab: 'dm' })}>Hand it out</button> : <span className="small muted">Dennis is handing it out.</span>}
        </section>
      ) : null}
    </>
  );
}

function AddForm({ open }: { open: boolean }) {
  const [species, setSpecies] = useState('');
  const [nick, setNick] = useState('');
  const [player, setPlayer] = useState('');
  const [level, setLevel] = useState(1);
  const [shiny, setShiny] = useState(false);
  const lvl = Math.max(1, Math.min(MAX_LEVEL, level || 1));
  const done = (id: string, name: string) => { setUi({ activeId: id, tab: 'sheet' }); setSpecies(''); setNick(''); setShiny(false); toast(`${name} joined the team!`); };
  const add = () => run(() => {
    if (!species.trim()) return toast('Type a species name first.', 'bad');
    const c = createChar(species, nick.trim(), player, lvl);
    if (shiny) c.shiny = true;
    update(s => { s.chars.push(c); addLog(`${nameOf(c)} joined the team${player ? ' with ' + player : ''}.`); });
    done(c.id, nameOf(c));
  });
  const addCustom = () => {
    const c = createManual(species, nick.trim(), player, lvl);
    if (shiny) c.shiny = true;
    update(s => { s.chars.push(c); });
    done(c.id, nameOf(c));
  };
  return (
    <details className="card" open={open}>
      <summary>Add a Pokémon</summary>
      <div className="grid2 stack">
        <label>Species<input list="speciesList" placeholder="e.g. Riolu" autoComplete="off" value={species} onChange={e => setSpecies(e.target.value)} /></label>
        <label>Nickname<input placeholder="optional" value={nick} onChange={e => setNick(e.target.value)} /></label>
        <label>Player
          <select value={player} onChange={e => setPlayer(e.target.value)}>
            <option value="">No player (DM's)</option>
            {players().map(u => <option key={u.name}>{u.name}</option>)}
          </select>
        </label>
        <label>Starting level (1–20)<input type="number" min={1} max={20} value={level} onChange={e => setLevel(+e.target.value)} /></label>
      </div>
      <label className="row" style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}><input type="checkbox" checked={shiny} onChange={e => setShiny(e.target.checked)} /> ✨ Shiny (stays shiny when it evolves or Mega Evolves)</label>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={add}>Add to team</button>
        <button className="btn" onClick={addCustom}>Custom / homebrew Pokémon</button>
      </div>
      <p className="small muted tip" style={{ margin: '8px 0 0' }}>Types, stats, moves and evolutions come from the built-in Pokédex (Gen 1–9).</p>
    </details>
  );
}

export default function Party() {
  const s = useGame(), dm = isDM();
  return (
    <>
      <TeamBanners />
      {s.chars.length ? (
        <div className="roster">
          {s.chars.map(c => {
            const eq = equippedOf(c), lim = eq.filter(m => m.ppMax != null);
            const pp = lim.reduce((a, m) => a + m.ppCur, 0), ppMax = lim.reduce((a, m) => a + (m.ppMax || 0), 0);
            return (
              <button key={c.id} className={`card rcard ${owns(c) ? 'mine' : ''}`} style={{ font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%' }}
                onClick={() => { setUi({ activeId: c.id, tab: 'sheet' }); window.scrollTo(0, 0); }}>
                <Avatar c={c} size={56} />
                <div className="info">
                  <div className="row between"><span className="name">{nameOf(c)}</span><span className="small mono">Lv {c.level}</span></div>
                  <div className="small muted">{c.nickname ? T(c.species) + ' · ' : ''}{c.player || 'No player'}{owns(c) ? ' · You' : ''}</div>
                  <div className="row" style={{ gap: 4, margin: '4px 0' }}><Types x={c} /></div>
                  <HpBar cur={c.hpCur} max={maxHP(c)} />
                  <div className="small muted" style={{ marginTop: 4 }}>
                    HP {c.hpCur}/{maxHP(c)} · XP {c.xp || 0}/{xpNeed(c.level)} · {eq.length}/4 moves · PP {pp}/{ppMax}{c.held ? ' · holds ' + c.held.name : ''}{c.inDungeon ? ' · 🔒 locked' : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : <div className="empty-state">No Pokémon on the team yet.{dm ? ' Add the first one below.' : ' Dennis will add them.'}</div>}
      {dm ? <AddForm open={!s.chars.length} /> : null}
    </>
  );
}
