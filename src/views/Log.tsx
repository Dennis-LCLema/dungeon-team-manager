import { run } from '../components/common';
import { announce } from '../game/explore';
import { recapLines } from '../game/recap';
import { ask, isDM, toast, update, useGame } from '../game/store';
import { ago } from '../lib/util';

export default function Log() {
  const e = useGame().log.entries, dm = isDM(), recap = recapLines(e);
  const clear = () => run(async () => { if (await ask('Clear the whole adventure log?', 'Clear log')) update(s => { s.log.entries = []; }); });
  const show = () => {
    if (!recap.length) return toast('Nothing big happened last session to recap yet.', 'bad');
    update(() => announce('PREVIOUSLY ON…', recap.map(l => '• ' + l).join('\n'), 'gold'));
    toast('The recap is showing on everyone\'s screen.');
  };
  return (
    <>
      <section className="card callout">
        <div className="row between"><h2 style={{ margin: 0 }}>📜 Previously on…</h2>{dm ? <button className="btn sm primary" onClick={show}>Show everyone</button> : null}</div>
        {recap.length ? (
          <ul className="small" style={{ paddingLeft: 18, margin: '8px 0 0' }}>{recap.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : <p className="small muted" style={{ margin: '6px 0 0' }}>The highlights of your last session show up here: level-ups, evolutions, quests, bosses and new friends.</p>}
      </section>
      <section className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Adventure log</h2>{dm && e.length ? <button className="btn sm danger" onClick={clear}>Clear</button> : null}</div>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>Moves used outside battle, items, level ups, evolutions and dungeon events.</p>
        <div className="log" style={{ maxHeight: 'none' }}>
          {e.length ? e.map(x => (
            <p key={x.id}><span className="small muted">{ago(x.t)}{x.who ? ' · ' + x.who : ''}</span><br />{x.text}</p>
          )) : <p className="muted small">Nothing yet.</p>}
        </div>
      </section>
    </>
  );
}
