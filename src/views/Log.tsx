import { useState } from 'react';
import { run } from '../components/common';
import { announce } from '../game/explore';
import { recapLines } from '../game/recap';
import { addLog, ask, isDM, logKind, toast, update, useGame } from '../game/store';
import type { LogEntry } from '../game/types';
import { ago } from '../lib/util';

const LOGS: [NonNullable<LogEntry['kind']>, string, string][] = [
  ['story', '🗺️ Adventure log', 'Who the team met, where they went, quests, level-ups and the decisions they made.'],
  ['battle', '⚔️ Battle log', 'Battles, XP, moves and rolls made outside battle.'],
  ['item', '🎒 Item log', 'Loot, shopping, gifts, storage and items used.'],
];

export default function Log() {
  const e = useGame().log.entries, dm = isDM(), recap = recapLines(e);
  const [note, setNote] = useState('');
  const clear = (kind: string, name: string) => run(async () => {
    if (await ask(`Clear the ${name.replace(/^\S+ /, '').toLowerCase()}?`, 'Clear')) update(s => { s.log.entries = s.log.entries.filter(x => logKind(x) !== kind); });
  });
  const show = () => {
    if (!recap.length) return toast('Nothing big happened last session to recap yet.', 'bad');
    update(() => announce('PREVIOUSLY ON…', recap.map(l => '• ' + l).join('\n'), 'gold'));
    toast('The recap is showing on everyone\'s screen.');
  };
  const addNote = () => { if (!note.trim()) return; update(() => addLog(note.trim(), 'story')); setNote(''); };
  return (
    <>
      <section className="card callout">
        <div className="row between"><h2 style={{ margin: 0 }}>📜 Previously on…</h2>{dm ? <button className="btn sm primary" onClick={show}>Show everyone</button> : null}</div>
        {recap.length ? (
          <ul className="small" style={{ paddingLeft: 18, margin: '8px 0 0' }}>{recap.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : <p className="small muted tip" style={{ margin: '6px 0 0' }}>The highlights of your last session show up here: level-ups, evolutions, quests, bosses and new friends.</p>}
      </section>
      {LOGS.map(([kind, name, hint], i) => {
        const list = e.filter(x => logKind(x) === kind);
        return (
          <details className="card" key={kind} open={i === 0}>
            <summary>{name} ({list.length})</summary>
            <div className="row between" style={{ margin: '0 0 8px' }}>
              <span className="small muted">{hint}</span>
              {dm && list.length ? <button className="btn sm danger" onClick={() => clear(kind, name)}>Clear</button> : null}
            </div>
            {kind === 'story' && dm ? (
              <form className="row" style={{ marginBottom: 8 }} onSubmit={ev => { ev.preventDefault(); addNote(); }}>
                <input style={{ flex: 1 }} value={note} maxLength={300} onChange={ev => setNote(ev.target.value)} placeholder="Write down a decision or a conversation, e.g. The team spared the Pale Blade." aria-label="Add to the adventure log" />
                <button className="btn" type="submit" disabled={!note.trim()}>Add</button>
              </form>
            ) : null}
            <div className="log" style={{ maxHeight: 'none' }}>
              {list.length ? list.map(x => (
                <p key={x.id}><span className="small muted">{ago(x.t)}{x.who ? ' · ' + x.who : ''}</span><br />{x.text}</p>
              )) : <p className="muted small">Nothing yet.</p>}
            </div>
          </details>
        );
      })}
    </>
  );
}
