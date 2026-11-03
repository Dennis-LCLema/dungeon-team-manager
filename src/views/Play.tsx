import { Avatar, HpBar, TypeChip, Types, XpBlock } from '../components/common';
import { LAYERS, TCOL } from '../game/data';
import { bGet, myTurnChar } from '../game/battle';
import { nodeById } from '../game/explore';
import { equippedOf, maxHP, nameOf } from '../game/rules';
import { owns, setUi, useGame } from '../game/store';
import type { Char } from '../game/types';
import { T } from '../lib/util';
import BattleView from './Battle';
import DungeonView, { LockPanel } from './Dungeon';

function useNow() {
  const s = useGame(), b = s.game.battle, dg = s.dungeon, mine = s.chars.filter(owns);
  if (b && !b.result && b.phase === 'intro') return { kind: 'go', title: b.surprise === 'ambush' ? 'Ambush! Roll for initiative' : 'Battle! Roll for initiative', sub: 'See where your Pokémon is in the turn order and plan your move.' };
  if (b && !b.result) {
    const mt = myTurnChar(), cur = bGet(b.order[b.turn]);
    if (mt) return { kind: 'go', title: `It's your turn! ${nameOf(mt)} is up.`, sub: 'Pick a target, then tap a move.' };
    return { kind: 'wait', title: `Battle, round ${b.round}`, sub: cur ? `${nameOf(cur)} is acting. Your turn comes when it is highlighted.` : '' };
  }
  if (b?.result) return { kind: b.result === 'win' ? 'go' : 'wait', title: b.result === 'win' ? 'Victory!' : 'The team fainted…', sub: b.result === 'win' ? 'Dennis is handing out the loot.' : 'Dennis will decide what happens next.' };
  if (dg.state === 'prep') {
    const left = mine.filter(c => !c.inDungeon);
    return { kind: left.length ? 'go' : 'wait', title: `Get ready for ${dg.name}`, sub: left.length ? 'Check your 4 moves, then tap Lock moves.' : 'You are locked in. Waiting for the rest of the team.' };
  }
  if (dg.state === 'in') return { kind: 'wait', title: `Exploring ${dg.name}`, sub: `Floor ${dg.floor} of ${dg.floors}. Dennis moves the team. Watch the map below.` };
  const w = s.world, here = nodeById(w.at);
  return { kind: 'idle', title: LAYERS[w.layer].n, sub: `${w.layer ? 'Layer ' + w.layer : 'The Surface'} · The team is at ${here ? here.n : 'the Waystone'}. Vote below on where to go next.` };
}

function MyCard({ c }: { c: Char }) {
  const eq = equippedOf(c);
  return (
    <section className="card">
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <Avatar c={c} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row between"><span className="name">{nameOf(c)}</span><span className="mono small">Lv {c.level}</span></div>
          <div className="row" style={{ gap: 4, margin: '4px 0' }}><Types x={c} /></div>
          <HpBar cur={c.hpCur} max={maxHP(c)} />
          <div className="small mono" style={{ marginTop: 4 }}>HP {c.hpCur}/{maxHP(c)}</div>
          <XpBlock c={c} />
        </div>
      </div>
      <h3>Moves</h3>
      <div className="movegrid">
        {eq.length ? eq.map(m => (
          <div key={m.name} className="mv static" style={{ '--tc': TCOL[m.type] || '#888' } as React.CSSProperties}>
            <span className="mv-n">{T(m.name)}</span>
            <span className="mv-m"><TypeChip t={m.type} /><span className="mono">{m.ppMax == null ? 'At-will' : `${m.ppCur}/${m.ppMax} PP`}</span></span>
          </div>
        )) : <p className="small muted">No moves equipped.</p>}
      </div>
      {c.held ? <p className="small" style={{ margin: '10px 0 0' }}>Holding <b>{c.held.name}</b></p> : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => { setUi({ activeId: c.id, tab: 'sheet' }); window.scrollTo(0, 0); }}>Open my sheet</button>
        <span className="small muted">{c.items.reduce((s, i) => s + i.qty, 0)} items in the bag</span>
      </div>
    </section>
  );
}

export default function Play() {
  const s = useGame(), b = s.game.battle, dg = s.dungeon, mine = s.chars.filter(owns), now = useNow();
  let body: React.ReactNode;
  if (b) body = <><BattleView />{b.result && dg.state === 'in' ? <DungeonView /> : null}</>;
  else if (dg.state === 'prep') body = <><LockPanel dg={dg} />{mine.map(c => <MyCard key={c.id} c={c} />)}</>;
  else if (dg.state === 'in') body = <DungeonView />;
  else body = <>
    <section className="card row between">
      <span>📍 The team is at <b>{nodeById(s.world.at)?.n || 'the Waystone'}</b>, {LAYERS[s.world.layer].n}.</span>
      <button className="btn sm primary" onClick={() => setUi({ tab: 'world' })}>Vote where to go</button>
    </section>
    {mine.length ? mine.map(c => <MyCard key={c.id} c={c} />) : <section className="card"><p className="small muted" style={{ margin: 0 }}>Dennis hasn't given you a Pokémon yet.</p></section>}
  </>;
  return (
    <>
      <section className={`card now now-${now.kind}`} role="status" aria-live="polite">
        <div className="now-t">{now.title}</div>
        {now.sub ? <div className="small" style={{ marginTop: 4 }}>{now.sub}</div> : null}
      </section>
      {body}
    </>
  );
}
