import { useState } from 'react';
import { Avatar, HpBar, TypeChip, run } from '../components/common';
import { SellList, ShopList, buy } from '../components/Shop';
import { LAYERS, ROOM, SAVE_LABEL, TRAPS, TYPES, labLvl } from '../game/data';
import { rollSurprise, startBattle } from '../game/battle';
import { announce, ek, enterRoom, finishRun, floorAnnounce, genFloor, leaveDungeon, mapNb, nextFloor, partyChars, rollEncounter } from '../game/explore';
import { M, addLoot, avgLevel, equippedOf, maxHP, nameOf, rollChest, shortRestHeal } from '../game/rules';
import { G, addLog, ask, canEdit, isDM, me, setUi, toast, update, useGame } from '../game/store';
import type { Dungeon, FloorMap, TrapResult } from '../game/types';
import { T, clampN, fmt, money, roll, rollDice } from '../lib/util';
import { EnemyList } from './World';

export function LockPanel({ dg }: { dg: Dungeon }) {
  const s = useGame(), party = s.chars.filter(c => c.player && !c.reserve);
  const locked = party.filter(c => c.inDungeon).length, all = party.length > 0 && locked === party.length;
  const lock = (id: string, on: boolean) => run(async () => {
    const x = G().chars.find(y => y.id === id);
    if (!x || !canEdit(x)) return toast('You can only lock your own Pokémon.', 'bad');
    if (on) {
      const n = equippedOf(x).length;
      if (n < 4 && !(await ask(`${nameOf(x)} only has ${n} of 4 moves equipped. Lock in anyway?`, 'Lock in'))) return;
    }
    update(d => {
      const xx = d.chars.find(y => y.id === id);
      if (!xx) return;
      if (on) { xx.inDungeon = true; addLog(`${nameOf(xx)} locked in: ${equippedOf(xx).map(m => T(m.name)).join(', ') || 'no moves'}.`); }
      else if (d.dungeon.state === 'prep') xx.inDungeon = false;
    });
  });
  const enter = () => update(d => {
    if (!d.chars.filter(x => x.player && !x.reserve).every(x => x.inDungeon)) { toast('Not everyone has locked in yet.', 'bad'); return; }
    const g = d.dungeon;
    g.state = 'in'; g.floor = g.start || 1; g.cleared = false;
    if (g.kind === 'labyrinth') g.lvl = labLvl(g.floor);
    g.map = genFloor(g);
    addLog(`The team entered ${g.name}!`);
    if (g.kind === 'rift') announce('RED RIFT · ENTRANCE SEALED', `${g.name} closes behind the team. The only way out is through the Rift Lord.`, 'red');
    else floorAnnounce(g);
  });
  return (
    <section className="card callout">
      <div className="row between"><h2 style={{ margin: 0 }}>Getting ready: {dg.name}</h2><span className="small mono">{locked}/{party.length} locked</span></div>
      <p className="small muted" style={{ margin: '4px 0 6px' }}>
        {dg.floors} floor{(dg.floors || 1) > 1 ? 's' : ''}, wild Pokémon around level {dg.lvl}{dg.types?.length ? ', mostly ' + dg.types.map(T).join('/') + ' types' : ''}. Check your moves on your sheet, then lock them. They stay locked until the team leaves.
      </p>
      {party.length ? party.map(c => (
        <div className="list-item" key={c.id}>
          <Avatar c={c} size={34} />
          <span className="grow"><b>{nameOf(c)}</b> <span className="small muted">{c.player} · {equippedOf(c).map(m => T(m.name)).join(', ') || 'no moves'}</span></span>
          {c.inDungeon ? <span className="tag good">Locked</span> : <span className="tag">Not locked</span>}
          {canEdit(c) ? (c.inDungeon ? <button className="btn sm" onClick={() => lock(c.id, false)}>Change</button> : <button className="btn sm primary" onClick={() => lock(c.id, true)}>Lock moves</button>) : null}
        </div>
      )) : <p className="small muted">No Pokémon have a player yet.</p>}
      {isDM() ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!all} onClick={enter}>Enter the dungeon</button>
          <button className="btn ghost" onClick={() => update(() => leaveDungeon('Dungeon prep was called off.'))}>Call it off</button>
          {all ? null : <span className="small muted">Waiting for everyone to lock in.</span>}
        </div>
      ) : null}
    </section>
  );
}

function FloorGrid({ m }: { m: FloorMap }) {
  const s = useGame(), cols = m.w * 2 - 1, rows = m.h * 2 - 1, here = m.pos, adj = new Set(mapNb(m, here));
  const known = (k: string) => { const c = m.cells[k]; return !!c && !!(c.v || m.rev || mapNb(m, k).some(n => m.cells[n]?.v)); };
  const tmpl = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? '14px' : 'var(--room)')).join(' ');
  const battling = !!s.game.battle && !s.game.battle.result;
  const move = (k: string) => run(() => update(d => {
    if (d.game.battle && !d.game.battle.result) { toast('Finish the battle first.', 'bad'); return; }
    const mm = d.dungeon.map;
    if (mm && mapNb(mm, mm.pos).includes(k)) enterRoom(k);
  }));
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const key = r + ':' + col;
    if (r % 2 === 0 && col % 2 === 0) {
      const k = col / 2 + ',' + r / 2, c = m.cells[k];
      if (!c || !known(k)) { out.push(<span className="mc" key={key} />); continue; }
      const show = c.v || m.rev || (c.t === 'trap' && m.trapsSeen) || ((c.t === 'stairs' || c.t === 'boss') && m.stairsSeen);
      const can = isDM() && adj.has(k) && !battling;
      const label = (show ? ROOM[c.t].n : 'Unexplored room') + (k === here ? ', the team is here' : '');
      out.push(
        <button key={key} className={`mc room ${c.v ? 'vis' : 'fog'} ${show ? 't-' + c.t : ''} ${c.done ? 'done' : ''} ${k === here ? 'here' : ''}`}
          disabled={!can} title={label} aria-label={label} onClick={() => move(k)}>
          {k === here ? <i className="team" /> : null}<span>{show ? ROOM[c.t].g : '?'}</span>
        </button>,
      );
    } else if (r % 2 === 0 || col % 2 === 0) {
      let a: string, b: string, dir: string;
      if (r % 2 === 0) { a = (col - 1) / 2 + ',' + r / 2; b = (col + 1) / 2 + ',' + r / 2; dir = 'h'; }
      else { a = col / 2 + ',' + (r - 1) / 2; b = col / 2 + ',' + (r + 1) / 2; dir = 'v'; }
      const on = m.edges[ek(a, b)] && known(a) && known(b) && (m.cells[a].v || m.cells[b].v || m.rev);
      out.push(<span key={key} className={`mc ${on ? 'cor ' + dir : ''}`} />);
    } else out.push(<span className="mc" key={key} />);
  }
  return <div className="map" style={{ gridTemplateColumns: tmpl(cols), gridTemplateRows: tmpl(rows) }}>{out}</div>;
}

function RoomPanel({ dg }: { dg: Dungeon }) {
  const s = useGame(), m = dg.map!, c = m.cells[m.pos], dm = isDM(), ev = c.ev || {}, b = s.game.battle;
  const fightHere = !!b && b.room?.pos === m.pos && b.room?.floor === dg.floor;
  const cell = (fn: (cl: typeof c, g: Dungeon) => void) => run(() => update(d => { const g = d.dungeon, cl = g.map?.cells[g.map.pos]; if (cl) fn(cl, g); }));
  const fight = () => run(() => { update(d => {
    const g = d.dungeon, cl = g.map!.cells[g.map!.pos];
    if (!cl.ev?.enemies || cl.done) return;
    if (d.game.battle && !d.game.battle.result) { toast('Finish the current battle first.', 'bad'); return; }
    let sk = 'normal', why = '';
    if (cl.t === 'house' || cl.ev.ambush) { sk = 'ambush'; why = cl.t === 'house' ? 'It was a Monster House!' : 'The trap called them right on top of the team.'; }
    else if (cl.t !== 'boss') { const r = rollSurprise(partyChars(), cl.ev.enemies); sk = r.kind; why = r.text; }
    startBattle(partyChars().map(x => x.id), cl.ev.enemies, { pos: g.map!.pos, floor: g.floor, boss: cl.t === 'boss' }, sk, why);
  }); setUi({ tab: 'battle' }); });
  const trap = () => cell((cl, g) => {
    if (cl.done || !cl.ev) return;
    const tr = TRAPS[cl.ev.trap || 0], pos = g.map!.pos;
    if (tr.special === 'summon') {
      cl.t = 'enemy';
      cl.ev = { enemies: rollEncounter(g, 'enemy'), ambush: true };
      addLog('A Summon Trap called wild Pokémon into the room!');
      return;
    }
    const res: TrapResult[] = [];
    if (tr.save) partyChars().forEach(x => {
      const r = roll(20), mm = M(x, tr.save!), tot = r + mm, ok = tot >= (tr.dc || 10);
      let dmg = 0;
      if (tr.dmg) { dmg = rollDice(tr.dmg); if (ok) dmg = tr.half ? Math.floor(dmg / 2) : 0; x.hpCur = Math.max(0, x.hpCur - dmg); }
      res.push({ n: nameOf(x), r, m: mm, tot, ok, dmg });
    });
    cl.ev.results = res;
    cl.done = true;
    addLog(`${tr.n}! ` + (res.length ? res.map(z => `${z.n} ${z.ok ? 'saved' : 'failed'}${z.dmg ? ' (−' + z.dmg + ' HP)' : ''}`).join(', ') + '.' : tr.d));
    if (tr.special === 'warp') { const ks = Object.keys(g.map!.cells).filter(k => k !== pos); enterRoom(ks[roll(ks.length) - 1]); addLog('The team was warped to another room!'); }
    if (tr.special === 'pitfall' && (g.floor || 1) < (g.floors || 1)) nextFloor();
  });
  let body: React.ReactNode = null, act: React.ReactNode = null;
  switch (c.t) {
    case 'start': body = <p>The team stands at the entrance of floor {dg.floor}.{dm ? ' Tap a glowing room next to you to move.' : ''}</p>; break;
    case 'empty': body = <p>{ev.flavor || 'Nothing here.'}</p>; break;
    case 'enemy': case 'house': case 'boss':
      if (c.done) body = <p>{c.t === 'boss' ? 'The boss is defeated!' : 'This room is clear.'}</p>;
      else {
        body = <><p>{c.t === 'house' ? "It's a Monster House! Pokémon pour in from every side." : c.t === 'boss' ? 'A powerful Shadow Pokémon guards the way out.' : 'Wild Pokémon block the way.'}</p><EnemyList list={ev.enemies} /></>;
        if (fightHere && !b!.result) act = <button className="btn primary" onClick={() => setUi({ tab: dm ? 'battle' : 'play' })}>Battle in progress</button>;
        else if (dm) act = <>
          <button className="btn primary" onClick={fight}>Fight</button>
          {c.t !== 'boss' ? <button className="btn ghost" onClick={() => cell(cl => { cl.done = true; addLog('The team sneaked past the wild Pokémon.'); })}>Sneak past (no loot)</button> : null}
        </>;
      }
      break;
    case 'treasure':
      body = <p>{c.done ? 'The chest is empty.' : 'A treasure chest sits in the corner.'}</p>;
      if (!c.done && dm) act = <button className="btn primary" onClick={() => { cell((cl, g) => { if (cl.done) return; cl.done = true; addLoot(rollChest((g.lvl || 1) + Math.floor(((g.floor || 1) - 1) / 2), false)); }); toast('Chest opened. Hand out the loot in DM tools.'); }}>Open the chest</button>;
      break;
    case 'trap': {
      const tr = TRAPS[ev.trap || 0];
      body = <>
        <p><b>{tr.n}.</b> {tr.d}{tr.save ? <> <span className="mono">{SAVE_LABEL[tr.save]} DC {tr.dc}</span></> : null}</p>
        {ev.results?.map((z, i) => (
          <div className="list-item small" key={i}><span className="grow">{z.n}</span><span className="mono">{z.r}{fmt(z.m)} = {z.tot}</span>
            <span className={`tag ${z.ok ? 'good' : ''}`}>{z.ok ? 'Saved' : 'Failed'}</span>{z.dmg ? <span className="mono">−{z.dmg} HP</span> : null}</div>
        ))}
      </>;
      if (!c.done && dm) act = <button className="btn primary" onClick={trap}>{tr.save ? 'Roll saves for the team' : 'Spring the trap'}</button>;
      break;
    }
    case 'rest':
      body = <p>{c.done ? 'The spring has gone still.' : 'A Wonder Spring bubbles here. Its water soothes tired Pokémon.'}</p>;
      if (!c.done && dm) act = <button className="btn primary" onClick={() => cell(cl => { if (cl.done) return; cl.done = true; partyChars().forEach(x => { x.hpCur = Math.min(maxHP(x), x.hpCur + shortRestHeal(x)); }); addLog('The team rested at a Wonder Spring and recovered some HP.'); })}>Rest here (short rest for everyone)</button>;
      break;
    case 'shop':
      body = <>
        <p>Kecleon waves from behind the counter. Team money: <b className="mono">{money(s.storage.poke)}</b></p>
        <ShopList stock={ev.stock} onBuy={i => buy(d => d.dungeon.map?.cells[d.dungeon.map.pos]?.ev?.stock, i)} />
        <SellList />
      </>;
      break;
    case 'stairs':
      body = <p>Stairs lead down to floor {(dg.floor || 1) + 1}.</p>;
      if (dm) act = <button className="btn primary" onClick={() => update(nextFloor)}>Go down the stairs</button>;
      break;
  }
  if (dg.cleared) act = dm ? (
    <button className="btn gold" onClick={() => update(d => {
      const g = d.dungeon;
      finishRun(g);
      leaveDungeon(g.kind ? `The team cleared ${g.name}!` : `The team returned to town after clearing ${g.name}!`);
    })}>{dg.kind === 'labyrinth' ? `Step out into ${LAYERS[dg.to ?? -1]?.n || 'the next layer'}` : dg.kind === 'rift' ? 'Seal the Rift and claim the treasure' : 'Return to town'}</button>
  ) : null;
  return (
    <section className="card room-panel">
      <div className="row between"><h2 style={{ margin: 0 }}>{ROOM[c.t].n}</h2><span className="small muted">Floor {dg.floor}</span></div>
      {body}
      {act ? <div className="row" style={{ marginTop: 10 }}>{act}</div> : null}
    </section>
  );
}

function PlanForm() {
  const [f, setF] = useState({ name: '', floors: 3, lvl: avgLevel(), extra: '', types: [] as string[] });
  const prep = () => {
    const g: Dungeon = { state: 'prep', name: f.name.trim() || 'Mystery Dungeon', floors: clampN(f.floors || 3, 1, 10), lvl: clampN(f.lvl || avgLevel(), 1, 20), types: f.types, extra: f.extra, floor: 0, map: null, cleared: false };
    update(d => { d.dungeon = g; d.chars.forEach(x => { x.inDungeon = false; }); addLog(`${me()?.name} called the team to ${g.name}. Lock in your moves!`); });
  };
  return (
    <>
      <section className="card"><h2>Plan a dungeon</h2>
        <div className="grid2 stack">
          <label>Name<input placeholder="e.g. Shadow Woods" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Floors (1–10)<input type="number" min={1} max={10} value={f.floors} onChange={e => setF({ ...f, floors: +e.target.value })} /></label>
          <label>Wild Pokémon level<input type="number" min={1} max={20} value={f.lvl} onChange={e => setF({ ...f, lvl: +e.target.value })} /></label>
          <label>Only these species (optional)<input placeholder="e.g. Houndour, Poochyena, Zubat" value={f.extra} onChange={e => setF({ ...f, extra: e.target.value })} /></label>
        </div>
        <h3>Wild Pokémon types</h3>
        <div className="typepick">{TYPES.map(t => (
          <label className="tp" key={t}>
            <input type="checkbox" checked={f.types.includes(t)} onChange={e => setF({ ...f, types: e.target.checked ? [...f.types, t] : f.types.filter(x => x !== t) })} /><TypeChip t={t} />
          </label>
        ))}</div>
        <p className="small muted tip">Leave every type unticked for any type. Species you list override the types.</p>
        <button className="btn primary" onClick={prep}>Call the team to lock moves</button>
      </section>
      <section className="card"><h2>How a run works</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Each floor is a random 5×5 map of rooms. The team starts at S and you tap the next room to move.</li>
          <li>Rooms can hold wild or Shadow Pokémon, Monster Houses, treasure chests, traps, Wonder Springs, a Kecleon Shop and the stairs.</li>
          <li>The last floor has a boss instead of stairs. Beat it to clear the dungeon.</li>
          <li>Battles start with one tap. When the team wins, the app rolls loot and suggests who should get each item.</li>
          <li>Shadow Pokémon get more common the deeper you go.</li>
        </ul>
      </section>
    </>
  );
}

export default function DungeonView() {
  const s = useGame(), dg = s.dungeon, dm = isDM();
  if (dg.state === 'idle') {
    return dm ? <PlanForm /> : (
      <section className="card"><h2>Dungeon</h2><p className="small muted" style={{ margin: 0 }}>No dungeon right now. When Dennis calls the team, you'll lock in your moves here and watch the map fill in as you explore.</p></section>
    );
  }
  if (dg.state === 'prep') return <LockPanel dg={dg} />;
  if (!dg.map) return <section className="card"><p>The dungeon map is missing. {dm ? <button className="btn" onClick={() => update(() => leaveDungeon(`The team left ${dg.name}.`))}>Leave dungeon</button> : null}</p></section>;
  const party = partyChars();
  const leave = () => run(async () => {
    if (!(await ask(`Leave ${dg.name} now? Moves unlock and this map is lost.`, 'Leave dungeon'))) return;
    update(() => leaveDungeon(`The team left ${dg.name}. Moves are unlocked.`));
  });
  const faint = () => run(async () => {
    if (!(await ask('Send the fainted team back to town? They lose half the team money, like in Mystery Dungeon.', 'Back to town'))) return;
    update(d => {
      const lost = Math.floor((d.storage.poke || 0) / 2), nm = d.dungeon.name;
      d.storage.poke -= lost;
      d.chars.forEach(x => { if (x.inDungeon && x.hpCur <= 0) x.hpCur = 1; });
      d.game.battle = null;
      d.world.at = d.world.layer + ':waystone';
      leaveDungeon(`The team fainted in ${nm} and was carried back to the ${LAYERS[d.world.layer].n} Waystone. ${money(lost)} was lost.`);
    });
  });
  return (
    <>
      <section className="card callout">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>{dg.name}</h2>
            <div className="small muted">
              {dg.kind === 'labyrinth' ? `Labyrinth floor ${dg.floor} · Gatekeeper on floor ${dg.floors}` : dg.kind === 'rift' ? `Red Rift depth ${dg.floor} of ${dg.floors} · No escape` : `Floor ${dg.floor} of ${dg.floors}`}
              {' '}· Wild level {dg.lvl}{dg.types?.length ? ' · ' + dg.types.map(T).join('/') : ''} · Team money {money(s.storage.poke)}
            </div>
          </div>
          {dm ? (
            <div className="row">
              <button className="btn sm" onClick={leave}>{dg.kind === 'rift' && !dg.cleared ? 'Force the Rift open (DM)' : 'Leave dungeon'}</button>
              <button className="btn sm ghost danger" onClick={faint}>Team fainted</button>
            </div>
          ) : null}
        </div>
        {dg.cleared ? <div className="banner" style={{ margin: '10px 0 0' }}>Dungeon cleared! Hand out the boss loot, then return to town.</div> : null}
      </section>
      <div className="dgrid">
        <section className="card">
          <div className="mapwrap"><FloorGrid m={dg.map} /></div>
          <div className="legend small muted">
            {['start', 'enemy', 'house', 'treasure', 'trap', 'rest', 'shop', 'stairs', 'boss'].map(t => <span key={t}><b className={`t-${t}`}>{ROOM[t].g}</b> {ROOM[t].n}</span>)}
            <span><b>?</b> Unexplored</span>
          </div>
        </section>
        <div>
          <RoomPanel dg={dg} />
          <section className="card"><h2>Team</h2>
            {party.map(c => (
              <div className="list-item" key={c.id}><Avatar c={c} size={30} />
                <span className="grow"><b>{nameOf(c)}</b><div style={{ marginTop: 4 }}><HpBar cur={c.hpCur} max={maxHP(c)} /></div></span>
                <span className="mono small">{c.hpCur}/{maxHP(c)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
