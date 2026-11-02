import { run } from '../components/common';
import { ask, isDM, update, useGame } from '../game/store';
import { ago } from '../lib/util';

export default function Log() {
  const e = useGame().log.entries;
  const clear = () => run(async () => { if (await ask('Clear the whole adventure log?', 'Clear log')) update(s => { s.log.entries = []; }); });
  return (
    <section className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>Adventure log</h2>{isDM() && e.length ? <button className="btn sm danger" onClick={clear}>Clear</button> : null}</div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>Moves used outside battle, items, level ups, evolutions and dungeon events.</p>
      <div className="log" style={{ maxHeight: 'none' }}>
        {e.length ? e.map(x => (
          <p key={x.id}><span className="small muted">{ago(x.t)}{x.who ? ' · ' + x.who : ''}</span><br />{x.text}</p>
        )) : <p className="muted small">Nothing yet.</p>}
      </div>
    </section>
  );
}
