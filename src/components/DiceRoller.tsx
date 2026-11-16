import { useEffect, useRef, useState } from 'react';
import { addLog, me, setUi, update, useGame, useUi } from '../game/store';
import { sfx } from '../lib/sfx';
import { ago, roll } from '../lib/util';
import { Die, stillMotion } from './Dice';

const DICE = [4, 6, 8, 10, 12, 20, 100];
const THROW_MS = 1100;

/** A dice bag in the corner of every screen. The die is thrown across the screen and lands on its number; each roll goes
    to the shared roll log, so the DM sees it the moment it lands. */
export function DiceRoller() {
  const log = useGame().log.entries, signedIn = !!useUi().meName;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [last, setLast] = useState<{ id: number; total: number; sides: number; text: string } | null>(null);
  const [phase, setPhase] = useState<'' | 'roll' | 'land'>('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!signedIn) return null;
  const rolls = log.filter(e => e.kind === 'roll').slice(0, 6);
  const go = (sides: number) => {
    const r = Array.from({ length: count }, () => roll(sides)), total = r.reduce((a, n) => a + n, 0);
    const nat = sides === 20 && count === 1 ? (total === 20 ? ' (natural 20!)' : total === 1 ? ' (natural 1)' : '') : '';
    const text = `${count}d${sides}: ${count > 1 ? r.join(' + ') + ' = ' : ''}${total}${nat}`;
    const fly = stillMotion() ? 0 : THROW_MS;
    sfx('dice');
    setLast({ id: (last?.id || 0) + 1, total, sides, text });
    setPhase(fly ? 'roll' : 'land');
    timers.current.forEach(clearTimeout);
    // The roll is announced when the die lands, not while it is still in the air.
    timers.current = [
      setTimeout(() => { setPhase('land'); update(() => addLog(`${me()?.name || 'Someone'} rolled ${text}.`, 'roll')); }, fly),
      setTimeout(() => setPhase(''), fly + 2200),
    ];
  };
  return (
    <>
      {last && phase ? (
        <div className="dicetray" role="status" aria-live="polite" onClick={() => setPhase('')}>
          <Die key={last.id} value={last.total} sides={last.sides} rolling={phase === 'roll'} size={120} ms={THROW_MS} from={['-42vw', '36vh']}
            tone={phase === 'land' && last.sides === 20 && count === 1 ? (last.total === 20 ? 'crit' : last.total === 1 ? 'bad' : '') : ''} />
          {phase === 'land' ? <b className="dicetray-t">{last.text}</b> : null}
        </div>
      ) : null}
      <div className="dicebag">
        {open ? (
          <div className="dicepanel card" role="dialog" aria-label="Dice roller">
            <div className="row between"><b>Roll dice</b><button className="btn sm ghost" aria-label="Close the dice roller" onClick={() => setOpen(false)}>✕</button></div>
            <div className="row" style={{ gap: 6, margin: '8px 0', flexWrap: 'nowrap' }}>
              <span className="small muted">How many</span>
              <button className="btn sm" aria-label="One fewer die" disabled={count <= 1} onClick={() => setCount(count - 1)}>−</button>
              <b className="mono" style={{ minWidth: 16, textAlign: 'center' }}>{count}</b>
              <button className="btn sm" aria-label="One more die" disabled={count >= 10} onClick={() => setCount(count + 1)}>+</button>
            </div>
            <div className="dicegrid">
              {DICE.map(d => <button key={d} className="btn" disabled={phase === 'roll'} onClick={() => go(d)}>d{d}</button>)}
            </div>
            {last && phase !== 'roll' ? <div className="diceresult mono small">Last roll: {last.text}</div> : null}
            <div className="small muted" style={{ margin: '8px 0 4px' }}>Everyone sees these. Dennis gets an alert.</div>
            {rolls.map(e => <div key={e.id} className="small" style={{ padding: '2px 0' }}>{e.text} <span className="muted">· {ago(e.t)}</span></div>)}
            <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => { setUi({ tab: 'log' }); setOpen(false); }}>Full roll log</button>
          </div>
        ) : null}
        <button className="dicefab" aria-label={open ? 'Close the dice roller' : 'Open the dice roller'} aria-expanded={open} onClick={() => setOpen(!open)}>🎲</button>
      </div>
    </>
  );
}
