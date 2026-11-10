import { useEffect, useState } from 'react';
import { Avatar, HpBar, TypeChip, Types, run } from '../components/common';
import { CAST, FIELD_KINDS, FIELD_PRESETS, STATUS, SURPRISE, TCOL } from '../game/data';
import { autoTurn, bGet, buildRivals, setStatus, startRivalSpar, blog, buildEnemy, checkEnd, controls, handleKO, isOut, nextTurn, resolveMove, rollSurprise, setInitRoll, sideOf, startBattle, toHit } from '../game/battle';
import { sceneUrl } from '../components/mapDecor';
import { M, MAX_LEVEL, applyItem, clampHP, critOn, effectiveness, equippedOf, fmtMega, hpMaxOf, maxHP, megaForms, nameOf, prof, usableBag } from '../game/rules';
import { G, addLog, announce, ask, isDM, owns, setUi, toast, update, useGame } from '../game/store';
import type { Battle, Char, Enemy, FieldFx, Fighter, Move, OrderEntry, Shared, Status } from '../game/types';
import { T, fmt, roll, slug, uid } from '../lib/util';

/** Run a turn action for whoever is acting now, inside update(). */
function onTurn(fn: (b: Battle, cur: OrderEntry, actor: Fighter, s: Shared) => void) {
  run(() => update(s => {
    const b = s.game.battle;
    if (!b || b.result) return;
    if (b.phase === 'intro') { toast('Wait for the DM to begin the battle.', 'bad'); return; }
    const cur = b.order[b.turn];
    if (!controls(cur)) { toast("It isn't your turn.", 'bad'); return; }
    const actor = bGet(cur);
    if (actor) fn(b, cur, actor, s);
  }));
}

/** One-tap rival fights: the full graduation spar, or any of the Razorwind rivals. */
function RivalBattle() {
  const s = useGame(), rivals = CAST.filter(c => c.team === 'rivals');
  const [pick, setPick] = useState<string[]>(rivals.map(r => r.id));
  const go = (spar: boolean) => run(() => update(d => {
    if (!d.chars.length) throw new Error('Add the team first.');
    if (spar) { startRivalSpar(); return; }
    if (!pick.length) throw new Error('Pick at least one rival.');
    const party = d.chars.filter(c => c.player).length ? d.chars.filter(c => c.player) : d.chars;
    startBattle(party.map(c => c.id), buildRivals(pick), null, 'normal', 'Team Razorwind wants a rematch!');
    addLog(`A rival battle against ${rivals.filter(r => pick.includes(r.id)).map(r => r.name).join(', ')} begins!`);
  }));
  return (
    <section className="card callout">
      <h2>⚔️ Rival battle</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Team Razorwind fights at your players' levels, as strong as the Pokémon they chose, and they plan their moves. {s.world.sparDone ? '' : 'Start with the graduation spar.'}</p>
      {!s.world.sparDone ? <button className="btn primary" onClick={() => go(true)}>Start the graduation spar</button> : <>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          {rivals.map(r => (
            <label key={r.id} className="tp" style={{ color: 'var(--ink)', fontSize: 14 }}>
              <input type="checkbox" checked={pick.includes(r.id)} onChange={ev => setPick(ev.target.checked ? [...pick, r.id] : pick.filter(x => x !== r.id))} /> {r.name} <span className="small muted">({r.species})</span>
            </label>
          ))}
        </div>
        <button className="btn primary" onClick={() => go(false)}>Start rival battle</button>
      </>}
    </section>
  );
}

function Setup() {
  const s = useGame(), bs = s.game.bsetup;
  const [e, setE] = useState({ species: '', level: 1, side: 'enemy' as 'enemy' | 'npc', shadow: true });
  const [surprise, setSurprise] = useState('normal');
  const add = () => run(() => {
    if (!e.species.trim()) return toast('Type a species.', 'bad');
    update(d => { d.game.bsetup.enemies.push(buildEnemy(e.species, Math.max(1, Math.min(MAX_LEVEL, e.level || 1)), e.shadow, e.side)); });
  });
  const start = () => update(d => {
    const pcs = d.game.bsetup.pcs.map(id => d.chars.find(x => x.id === id)).filter(Boolean) as Char[];
    if (!pcs.length) { toast('Pick at least one team member.', 'bad'); return; }
    if (!d.game.bsetup.enemies.some(x => x.side !== 'npc')) { toast('Add at least one enemy.', 'bad'); return; }
    let sk = surprise, why = '';
    if (sk === 'roll') { const r = rollSurprise(pcs, d.game.bsetup.enemies.filter(x => x.side !== 'npc')); sk = r.kind; why = r.text; }
    startBattle(pcs.map(x => x.id), d.game.bsetup.enemies, null, sk, why);
  });
  return (
    <>
      <RivalBattle />
      <section className="card">
        <h2>1. Who's fighting?</h2>
        {s.chars.length ? s.chars.map(c => (
          <label key={c.id} className="list-item" style={{ flexDirection: 'row', color: 'var(--ink)', fontSize: 15 }}>
            <input type="checkbox" checked={bs.pcs.includes(c.id)} onChange={ev => update(d => {
              const p = d.game.bsetup;
              p.pcs = ev.target.checked ? [...new Set([...p.pcs, c.id])] : p.pcs.filter(x => x !== c.id);
            })} />
            <Avatar c={c} size={32} />
            <span className="grow">{nameOf(c)} <span className="small muted">{c.player || 'DM'} · Lv {c.level} · HP {c.hpCur}/{maxHP(c)}</span></span>
          </label>
        )) : <p className="muted small">Add Pokémon on the Team tab first.</p>}
      </section>
      <section className="card">
        <h2>2. Add enemies and NPCs</h2>
        <div className="grid2 stack">
          <label>Species<input list="speciesList" placeholder="e.g. Houndour" autoComplete="off" value={e.species} onChange={ev => setE({ ...e, species: ev.target.value })} /></label>
          <label>Level<input type="number" min={1} max={20} value={e.level} onChange={ev => setE({ ...e, level: +ev.target.value })} /></label>
          <label>Side<select value={e.side} onChange={ev => setE({ ...e, side: ev.target.value as 'enemy' | 'npc' })}><option value="enemy">Enemy</option><option value="npc">Ally NPC (fights with the team)</option></select></label>
          <label className="row" style={{ flexDirection: 'row', fontSize: 14, color: 'var(--ink)', alignSelf: 'end' }}>
            <input type="checkbox" checked={e.shadow} onChange={ev => setE({ ...e, shadow: ev.target.checked })} /> Shadow Pokémon (enemies only)
          </label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={add}>Add</button>
        {bs.enemies.map((x, i) => (
          <div className="list-item" key={x.id}><Avatar c={x} size={32} />
            <span className="grow">{x.name} <span className="small muted">{x.side === 'npc' ? 'Ally NPC' : 'Enemy'} · Lv {x.level} · HP {x.hpMax}</span> <Types x={x} /></span>
            <button className="btn sm ghost danger" aria-label="Remove" onClick={() => update(d => { d.game.bsetup.enemies.splice(i, 1); })}>✕</button>
          </div>
        ))}
      </section>
      <section className="card"><h2>3. How does it start?</h2>
        <select aria-label="How the battle starts" value={surprise} onChange={ev => setSurprise(ev.target.value)}>
          <option value="normal">Normal</option><option value="roll">Roll for surprise (awareness vs stealth)</option>
          <option value="ambush">Ambush: the team is caught off guard</option><option value="jump">The team gets the jump on the foes</option>
        </select>
      </section>
      <button className="btn primary" style={{ width: '100%', padding: 12 }} onClick={start}>Roll initiative &amp; start</button>
      <p className="small muted" style={{ textAlign: 'center' }}>You move enemies and NPCs. Each player acts on their own Pokémon's turn from their device.</p>
    </>
  );
}

const ord = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/** One fighter's initiative dice: they tumble through random faces, then land on the real roll and show the total. */
function InitRoll({ o, delay }: { o: OrderEntry; delay: number }) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [face, setFace] = useState<number[] | null>(still ? null : [roll(20), roll(20)]);
  const [wait] = useState(delay); // keep the first delay, so a re-sorted list doesn't re-roll everyone
  useEffect(() => {
    if (still) return;
    const t0 = Date.now(), id = setInterval(() => {
      const done = Date.now() - t0 >= wait + 900;
      setFace(done ? null : [roll(20), roll(20)]);
      if (done) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, [o.r1, o.r2, wait, still]);
  const dice = (face || [o.r1, o.r2]).slice(0, o.r2 != null ? 2 : 1);
  return (
    <span className="mono small initroll">
      {dice.map((n, i) => <span key={i} className={`die ${face ? 'rolling' : 'landed'}`}>{n ?? '?'}</span>)}
      {face ? null : <span>{o.mod != null ? fmt(o.mod) : ''} = <b>{o.init}</b></span>}
    </span>
  );
}

function Intro({ b }: { b: Battle }) {
  const dm = isDM();
  const mine = b.order.map((o, i) => [o, i] as const).filter(([o]) => o.ref === 'pc' && owns(bGet(o) as Char));
  return (
    <div className="card callout intro anim">
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <svg className="d20" width="44" height="44" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2 7.5 9.5h9zM3 7l4.5 2.5L3 17M21 7l-4.5 2.5L21 17M7.5 9.5 12 22l4.5-12.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        <div><h2 style={{ margin: 0 }}>Roll for initiative!</h2><div className="small muted">Higher rolls act first.</div></div>
      </div>
      {b.surprise !== 'normal' ? (
        <div className={`surprise s-${b.surprise}`}><b>{SURPRISE[b.surprise].n}</b> {SURPRISE[b.surprise].d}{b.why ? <div className="small" style={{ marginTop: 4 }}>{b.why}</div> : null}</div>
      ) : b.why ? <p className="small muted">{b.why} No one was caught off guard.</p> : null}
      {mine.length ? <p className="mypos">{mine.map(([o, i]) => <span key={o.id}><b>{nameOf(bGet(o)!)}</b> goes <b>{ord(i + 1)}</b> of {b.order.length}<br /></span>)}</p> : null}
      <ol className="initlist">
        {b.order.map((o, i) => {
          const x = bGet(o);
          if (!x) return null;
          return (
            <li key={o.id} className={`${sideOf(o) === 'enemy' ? 'foe' : ''} ${o.ref === 'pc' && owns(x as Char) ? 'me' : ''}`} style={{ '--d': i * 0.18 + 's' } as React.CSSProperties}>
              <span className="ipos">{i + 1}</span><Avatar c={x} size={30} />
              <span className="grow"><b>{nameOf(x)}</b> <span className="small muted">{sideOf(o) === 'enemy' ? 'Foe' : 'Team'}</span></span>
              <InitRoll o={o} delay={i * 180} />
              {dm ? (
                <input type="number" min={1} max={20} className="initedit" key={o.r1} defaultValue={o.r1} title="Type the d20 they rolled with their own dice" aria-label={`d20 that ${nameOf(x)} rolled`}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onBlur={e => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 20 && v !== o.r1) update(() => setInitRoll(o.id, v)); else e.target.value = String(o.r1); }} />
              ) : null}
            </li>
          );
        })}
      </ol>
      {dm ? (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => update(d => {
            const bb = d.game.battle;
            if (!bb || bb.phase !== 'intro') return;
            bb.phase = 'fight';
            blog('The battle begins!');
            if (isOut(bGet(bb.order[bb.turn]))) nextTurn();
          })}>Begin battle</button>
          <span className="small muted">Someone re-rolled with their own dice? Type their d20 in the box next to their name.</span>
        </div>
      ) : <p className="small muted" style={{ margin: '10px 0 0' }}>Plan your moves. Dennis will start the fight.</p>}
    </div>
  );
}

function TurnPanel({ b }: { b: Battle }) {
  const dm = isDM(), cur = b.order[b.turn], actor = bGet(cur)!, mySide = sideOf(cur);
  const foes = b.order.filter(o => sideOf(o) !== mySide && !isOut(bGet(o)));
  const allies = b.order.filter(o => sideOf(o) === mySide && !isOut(bGet(o)));
  const tgtList = [...foes, ...allies];
  const [pick, setPick] = useState('');
  const [itemSel, setItemSel] = useState(0);
  const [assistSel, setAssistSel] = useState(0);
  const [own, setOwn] = useState(false);
  const [ownMove, setOwnMove] = useState<number | null>(null);
  const [ownD20, setOwnD20] = useState('');
  const [ownDmg, setOwnDmg] = useState('');
  const tgtId = tgtList.some(o => o.id === pick) ? pick : tgtList[0]?.id;
  const tgtO = b.order.find(o => o.id === tgtId), tgt = tgtO ? bGet(tgtO) : null, tgtFoe = !!tgtO && sideOf(tgtO) !== mySide;
  const isPc = cur.ref === 'pc', hero = isPc ? (actor as Char) : null;
  const moves: Move[] = isPc ? equippedOf(hero!) : actor.moves;
  const shadowFoes = foes.map(o => bGet(o) as Enemy).filter(x => x?.shadow);
  const readyAssists = hero ? hero.assists.map((a, i) => [a, i] as const).filter(([a]) => !a.used) : [];
  const downed = mySide === 'team' ? b.order.filter(o => o.ref === 'pc' && (bGet(o)?.hpCur || 0) <= 0).map(o => bGet(o) as Char) : [];
  const bag = hero ? usableBag(hero) : [];
  const canMega = !!hero && hero.megaReady && hero.megaOn == null && !b.megaUsed?.[hero.id] && megaForms(hero).length > 0;
  const effTag = (m: Move) => {
    if (!tgt || !tgtFoe || m.cls === 'status' || !m.dice) return null;
    const e = effectiveness(m.type, tgt);
    return e === 0 ? <span className="eff none">No effect</span> : e > 1 ? <span className="eff up">Super effective</span> : e < 1 ? <span className="eff down">Not very effective</span> : null;
  };
  const target = (s: Shared) => { const o = s.game.battle!.order.find(x => x.id === tgtId); return o ? bGet(o) : null; };

  // Only the DM can type in dice a player rolled by hand, so hits and crits can't be made up.
  const fire = (i: number, typed?: { d20: number; dmg?: number }) => onTurn((_bb, c0, a) => {
    const manual = isDM() ? typed : undefined;
    const mv = (c0.ref === 'pc' ? equippedOf(a as Char) : a.moves)[i], t = target(G());
    if (!mv) return;
    if (!t) { toast('No target.', 'bad'); return; }
    resolveMove(a, mv, t, manual);
    checkEnd();
    nextTurn();
  });
  const pickMove = (i: number) => {
    if (own && moves[i]?.dice && moves[i].cls !== 'status') { setOwnMove(i); setOwnD20(''); setOwnDmg(''); return; }
    fire(i);
  };
  // Preview of a player's own d20: same math the engine uses.
  const om = ownMove != null ? moves[ownMove] : null, d20 = Math.round(+ownD20);
  const ownCheck = om && tgt && d20 >= 1 && d20 <= 20 ? (() => {
    const { bonus, def, defName } = toHit(actor, om, tgt), crit = d20 >= critOn(actor);
    return { bonus, def, defName, crit, total: d20 + bonus, hit: d20 !== 1 && (crit || d20 + bonus >= def) };
  })() : null;
  const applyOwn = () => {
    if (ownMove == null || !ownCheck) return toast('Type the d20 they rolled (1 to 20).', 'bad');
    const dmg = Math.round(+ownDmg);
    if (ownCheck.hit && !(ownDmg !== '' && dmg >= 0)) return toast('Type their damage roll.', 'bad');
    fire(ownMove, { d20, dmg: ownCheck.hit ? dmg : undefined });
  };
  const purify = () => onTurn((bb, _c, a) => {
    const t = target(G()) as Enemy | null;
    if (!t || t.kind !== 'enemy' || !t.shadow) { toast('Target a Shadow Pokémon to purify.', 'bad'); return; }
    const boost = bb.boost?.[a.id] || 0;
    if (boost) delete bb.boost[a.id];
    const r = boost ? Math.max(roll(20), roll(20)) : roll(20), bonus = prof(a.level) + M(a, 'heart'), tot = r + bonus;
    if (tot >= 12) {
      const amt = 20 + Math.max(0, M(a, 'heart')) * 5 + boost;
      t.heartGauge = Math.max(0, t.heartGauge - amt);
      blog(`${nameOf(a)} reaches out to ${t.name} (${r}${fmt(bonus)} = ${tot} vs 12). Heart Gauge −${amt} → ${t.heartGauge}.${t.heartGauge <= 30 ? ' Its heart is ready to open. Knock it out to purify it!' : ''}`);
    } else blog(`${nameOf(a)} tries to reach ${t.name} (${tot} vs 12), but its heart stays shut.`);
    nextTurn();
  });
  const doItem = () => onTurn((_bb, _c, a) => {
    const r = applyItem(a as Char, bag[itemSel]?.[1] ?? -1, target(G()) || a, true);
    if (!r) return;
    if (!r.ok) { toast(r.msg, 'bad'); return; }
    blog(r.msg);
    checkEnd();
    nextTurn();
  });
  const rally = (id: string) => onTurn((_bb, _c, a, s) => {
    const x = s.chars.find(y => y.id === id);
    if (!x || x.hpCur > 0) return;
    x.hpCur = Math.min(maxHP(x), Math.max(1, roll(8) + M(a, 'heart')));
    blog(`${nameOf(a)} helps ${nameOf(x)} back up! ${nameOf(x)} is back with ${x.hpCur} HP.`);
    nextTurn();
  });
  const assist = () => onTurn((_bb, _c, a) => {
    const a2 = (a as Char).assists[readyAssists[assistSel]?.[1] ?? -1];
    if (a2) { a2.used = true; blog(`${nameOf(a)} calls in ${a2.name}, who uses ${a2.move}! (DM resolves the effect)`); }
  });
  const mega = () => onTurn((bb, _c, a) => {
    const x = a as Char;
    if (!x.megaReady || x.megaOn != null || bb.megaUsed?.[x.id] || !megaForms(x).length) { toast("This Pokémon can't Mega Evolve right now.", 'bad'); return; }
    const f = megaForms(x)[x.megaForm || 0], before = nameOf(x);
    x.megaOn = x.megaForm || 0;
    bb.megaUsed = bb.megaUsed || {};
    bb.megaUsed[x.id] = true;
    blog(`${before} is reacting to its ${f[4] || 'Mega Stone'}! ${before} Mega Evolved into ${fmtMega(f[0])}!`);
    addLog(`${before} Mega Evolved!`);
    announce({ kind: 'mega', char: x.id, name: before, to: fmtMega(f[0]), species: x.species, form: slug(f[0]), types: f[1], shiny: x.shiny });
    toast(`${before} Mega Evolved! Now pick a move.`);
  });

  return (
    <div className="card callout turn">
      <div className="row between"><h2 style={{ margin: 0 }}>{isPc && owns(hero) ? 'Your turn: ' : ''}{nameOf(actor)}</h2><span className="small muted">Round {b.round}</span></div>
      <label style={{ margin: '10px 0' }}>1. Pick a target
        <select value={tgtId} onChange={e => setPick(e.target.value)}>
          {tgtList.map(o => { const x = bGet(o)!; return <option key={o.id} value={o.id}>{sideOf(o) === mySide ? 'Ally: ' : ''}{nameOf(x)} ({x.hpCur}/{hpMaxOf(x)} HP)</option>; })}
        </select>
      </label>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="small muted" style={{ fontWeight: 600 }}>2. Pick a move</span>
        {isPc && dm ? (
          <label className="row" style={{ flexDirection: 'row', fontSize: 13, color: 'var(--ink)' }}>
            <input type="checkbox" checked={own} onChange={e => { setOwn(e.target.checked); setOwnMove(null); }} /> Type in the player's own dice
          </label>
        ) : null}
      </div>
      {own && om ? (
        <div className="loot" style={{ marginBottom: 10 }}>
          <b>{T(om.name)}</b> on <b>{tgt ? nameOf(tgt) : '?'}</b>
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <label style={{ width: 130 }}>Their d20 roll<input type="number" min={1} max={20} autoFocus value={ownD20} onChange={e => setOwnD20(e.target.value)} /></label>
            {ownCheck?.hit ? <label style={{ flex: 1, minWidth: 160 }}>Their damage roll ({om.dice}{ownCheck.crit ? ', roll it twice for the crit' : ''})<input type="number" min={0} value={ownDmg} onChange={e => setOwnDmg(e.target.value)} /></label> : null}
          </div>
          {ownCheck ? (
            <p className="small" style={{ margin: '8px 0' }}>
              {d20}{fmt(ownCheck.bonus)} = <b>{ownCheck.total}</b> vs {ownCheck.defName} {ownCheck.def}: <b>{ownCheck.hit ? (ownCheck.crit ? 'Critical hit!' : 'Hit!') : 'Miss.'}</b>
              {ownCheck.hit ? ' The app adds their usual damage bonuses and type effectiveness.' : ''}
            </p>
          ) : <p className="small muted" style={{ margin: '8px 0' }}>The app adds their attack bonus and checks it against the target.</p>}
          <div className="row">
            <button className="btn primary" onClick={applyOwn} disabled={!ownCheck}>{ownCheck && !ownCheck.hit ? 'Confirm miss' : 'Apply'}</button>
            <button className="btn ghost" onClick={() => setOwnMove(null)}>Pick another move</button>
          </div>
        </div>
      ) : null}
      <div className="movegrid">
        {moves.length ? moves.map((m, i) => {
          const out = m.ppMax != null && m.ppCur <= 0;
          return (
            <button key={m.name} className="mv" style={{ '--tc': TCOL[m.type] || '#888' } as React.CSSProperties} disabled={out} onClick={() => pickMove(i)}>
              <span className="mv-n">{T(m.name)}</span>
              <span className="mv-m"><TypeChip t={m.type} /><span className="mono">{m.dice || 'status'}</span><span className="mono">{m.ppMax == null ? '∞' : `${m.ppCur}/${m.ppMax} PP`}</span></span>
              {out ? <span className="eff none">Out of PP</span> : effTag(m)}
            </button>
          );
        }) : <p className="small muted">No moves equipped.</p>}
      </div>
      {bag.length || (mySide === 'team' && shadowFoes.length) || downed.length || readyAssists.length || canMega || (!isPc && dm) ? <>
        <div className="small muted" style={{ margin: '12px 0 6px', fontWeight: 600 }}>Or do something else</div>
        <div className="row">
          {bag.length ? (
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <select style={{ width: 'auto', maxWidth: '60vw' }} aria-label="Item" value={itemSel} onChange={e => setItemSel(+e.target.value)}>
                {bag.map(([it], i) => <option key={it.name} value={i}>{it.name} ×{it.qty}</option>)}
              </select>
              <button className="btn" onClick={doItem}>Use item</button>
            </span>
          ) : null}
          {mySide === 'team' && shadowFoes.length ? <button className="btn" onClick={purify}>💜 Purify (Heart check)</button> : null}
          {downed.map(x => <button key={x.id} className="btn" onClick={() => rally(x.id)}>Help up {nameOf(x)}</button>)}
          {readyAssists.length ? (
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <select style={{ width: 'auto', maxWidth: '60vw' }} aria-label="Assist" value={assistSel} onChange={e => setAssistSel(+e.target.value)}>
                {readyAssists.map(([a], i) => <option key={i} value={i}>{a.name}: {a.move}</option>)}
              </select>
              <button className="btn" onClick={assist}>Call assist</button>
            </span>
          ) : null}
          {canMega ? <button className="btn gold" onClick={mega}>Mega Evolve into {megaForms(hero)[hero!.megaForm || 0][0].replace(/-Mega.*/, '')}!</button> : null}
          {!isPc && dm ? <button className="btn gold" onClick={() => run(() => update(autoTurn))}>Auto turn</button> : null}
        </div>
      </> : null}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn ghost" onClick={() => onTurn(() => nextTurn())}>Skip turn</button></div>
    </div>
  );
}

const fxText = (f: FieldFx) => `${f.side === 'team' ? 'Team' : 'Foes'}: ${FIELD_KINDS[f.kind]}${f.kind === 'hit' || f.kind === 'dmg' ? ' ' + fmt(f.amt) : ''}`;

/** Creative moments: the DM turns a clever idea into a field effect the engine applies to every attack. Everyone sees them. */
function FieldCard({ b }: { b: Battle }) {
  const dm = isDM(), fx = b.fx || [];
  const [side, setSide] = useState<'team' | 'enemy'>('team');
  const [f, setF] = useState({ name: '', kind: 'adv', amt: 2, rounds: 2 });
  if (b.result || (!dm && !fx.length)) return null;
  const add = (x: { name: string; kind: FieldFx['kind']; amt: number; rounds: number; note?: string }) => update(d => {
    const bb = d.game.battle;
    if (!bb || !x.name.trim()) return;
    const e: FieldFx = { ...x, name: x.name.trim(), amt: Math.max(0, Math.min(10, x.amt || 0)), rounds: Math.max(1, Math.min(10, x.rounds || 1)), id: uid(), side };
    (bb.fx ||= []).push(e);
    blog(`Creative moment! ${e.name}${x.note ? ': ' + x.note : ''} (${fxText(e)}, ${e.rounds} round${e.rounds > 1 ? 's' : ''}).`);
    addLog(`Creative moment in battle: ${e.name}.`);
  });
  return (
    <section className="card">
      <h2 style={{ margin: 0 }}>Field effects</h2>
      {fx.length ? fx.map(e => (
        <div className="list-item" key={e.id}>
          <span className="grow"><b>{e.name}</b> <span className="small muted">{fxText(e)} · {e.rounds} round{e.rounds > 1 ? 's' : ''} left</span>{e.note ? <div className="small">{e.note}</div> : null}</span>
          {dm ? <button className="btn sm ghost" aria-label={`End ${e.name}`} onClick={() => update(d => { const bb = d.game.battle; if (bb?.fx) bb.fx = bb.fx.filter(x => x.id !== e.id); })}>✕</button> : null}
        </div>
      )) : <p className="small muted" style={{ margin: '4px 0 0' }}>A player did something clever, like Fire on Water for a steam fog? Turn it into a field effect.</p>}
      {dm ? <details style={{ marginTop: 8 }}>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Add a creative moment</summary>
        <div className="row" role="group" aria-label="Who it helps" style={{ margin: '8px 0', gap: 6 }}>
          <span className="small">Helps:</span>
          <button className={`btn sm ${side === 'team' ? 'primary' : ''}`} aria-pressed={side === 'team'} onClick={() => setSide('team')}>The team</button>
          <button className={`btn sm ${side === 'enemy' ? 'primary' : ''}`} aria-pressed={side === 'enemy'} onClick={() => setSide('enemy')}>The foes</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {FIELD_PRESETS.map(p => <button key={p.name} className="btn sm" title={`${p.note} ${FIELD_KINDS[p.kind]}${p.amt ? ' +' + p.amt : ''}, ${p.rounds} round(s)`} onClick={() => add({ ...p })}>{p.name}</button>)}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '2 1 160px' }}>Name it<input placeholder="e.g. Mud Slide" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label style={{ flex: '2 1 200px' }}>Effect<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(FIELD_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.kind === 'hit' || f.kind === 'dmg' ? <label style={{ width: 70 }}>Amount<input type="number" min={1} max={10} value={f.amt} onChange={e => setF({ ...f, amt: +e.target.value })} /></label> : null}
          <label style={{ width: 70 }}>Rounds<input type="number" min={1} max={10} value={f.rounds} onChange={e => setF({ ...f, rounds: +e.target.value })} /></label>
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => { add({ name: f.name, kind: f.kind as FieldFx['kind'], amt: f.amt, rounds: f.rounds }); setF({ ...f, name: '' }); }}>Add</button>
        </div>
      </details> : null}
    </section>
  );
}

function Combatant({ b, o, k }: { b: Battle; o: OrderEntry; k: number }) {
  const dm = isDM(), x = bGet(o);
  if (!x) return null;
  const e = x.kind === 'enemy' ? x : null;
  const status = e?.outReason || (x.hpCur <= 0 ? 'Fainted' : '');
  const label = o.ref === 'pc' ? (x as Char).player || 'DM' : e?.side === 'npc' ? 'Ally NPC' : e?.boss ? 'Boss' : e?.minion ? 'Minion' : 'Enemy';
  const acting = k === b.turn && !b.result;
  const hit = b.last && b.last.hit && b.last.target === nameOf(x);
  const hp = (d: number) => update(s => {
    const bb = s.game.battle!, xx = bGet(bb.order[k]);
    if (!xx) return;
    xx.hpCur = Math.max(0, Math.min(hpMaxOf(xx), xx.hpCur + d));
    if (xx.kind === 'enemy' && xx.hpCur > 0 && xx.outReason === 'Fainted') xx.outReason = '';
    if (xx.hpCur <= 0 && !(xx.kind === 'enemy' && xx.outReason)) handleKO(xx, null);
    checkEnd();
  });
  return (
    <div key={hit ? b.last!.id : 'c'} className={`combatant ${acting ? 'cur' : ''} ${isOut(x) ? 'out' : ''} ${sideOf(o) === 'enemy' ? 'foe' : ''} ${hit ? 'flash' : ''}`}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
          <Avatar c={x} size={34} />
          <span style={{ minWidth: 0 }}><b>{nameOf(x)}</b>{acting ? <> <span className="tag good">Acting</span></> : null} <span className="small muted">{label} · Lv {x.level}</span></span>
        </span>
        <span className="row" style={{ gap: 3 }}><Types x={x} /></span>
      </div>
      <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}><HpBar cur={x.hpCur} max={hpMaxOf(x)} /></div>
        <span className="small mono" style={{ minWidth: 64, textAlign: 'right' }}>{x.hpCur}/{hpMaxOf(x)}</span>
        {dm ? <>
          <button className="btn sm" aria-label={`5 damage to ${nameOf(x)}`} onClick={() => hp(-5)}>−5</button>
          <button className="btn sm" aria-label={`Heal ${nameOf(x)} 5`} onClick={() => hp(5)}>+5</button>
        </> : null}
      </div>
      {e?.shadow && !e.outReason ? (
        <div className="row small" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
          <span className="muted" style={{ minWidth: 70 }}>Heart {e.heartGauge}</span><div style={{ flex: 1 }} className="bar heart"><i style={{ width: e.heartGauge + '%' }} /></div>
        </div>
      ) : null}
      {status ? <div className="small" style={{ marginTop: 4, fontWeight: 700 }}>{status}</div> : null}
      {!isOut(x) && (x.status || (dm && !b.result)) ? (
        <div className="row small" style={{ marginTop: 6, gap: 6 }}>
          {x.status ? <span className="tag" title={STATUS[x.status].d}>{STATUS[x.status].g} {STATUS[x.status].n}</span> : null}
          {dm && !b.result ? (
            <select aria-label={`Status for ${nameOf(x)}`} style={{ width: 'auto' }} value={x.status || ''} onChange={ev => {
              const st = (ev.target.value || null) as Status | null;
              run(() => update(s => { const xx = bGet(s.game.battle!.order[k]); if (!xx) return; const msg = setStatus(xx, st); blog(msg); toast(msg, xx.status === st ? undefined : 'bad'); }));
            }}>
              <option value="">No status</option>
              {Object.entries(STATUS).map(([key, v]) => <option key={key} value={key}>{v.g} {v.n}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Battle scene: the background slot, both sides' sprites, and a lunge/shake for the latest move. */
function Stage({ b }: { b: Battle }) {
  const last = b.last;
  const fig = (o: OrderEntry, k: number) => {
    const x = bGet(o);
    if (!x) return null;
    const n = nameOf(x), foe = sideOf(o) === 'enemy';
    const anim = last && !last.status ? (last.actor === n ? (foe ? 'lunge-l' : 'lunge-r') : last.target === n && last.dmg ? 'shake' : '') : '';
    return (
      <div key={o.id + (anim ? last!.id : '')} className={`fig ${anim} ${isOut(x) ? 'down' : ''} ${k === b.turn && !b.result ? 'turn' : ''}`}>
        <Avatar c={x} size={60} />
        <span>{x.status ? STATUS[x.status].g + ' ' : ''}{n}</span>
        <HpBar cur={x.hpCur} max={hpMaxOf(x)} />
      </div>
    );
  };
  const idx = b.order.map((o, k) => [o, k] as const);
  return (
    <div className="stage" aria-hidden="true"
      style={{ backgroundImage: `url(backgrounds/${b.bg || 'battle'}.webp), url(backgrounds/battle.webp), ${sceneUrl(b.scene ?? 0)}` }}>
      <div className="side team">{idx.filter(([o]) => sideOf(o) === 'team').map(([o, k]) => fig(o, k))}</div>
      <div className="side foes">{idx.filter(([o]) => sideOf(o) === 'enemy').map(([o, k]) => fig(o, k))}</div>
    </div>
  );
}

export default function BattleView() {
  const s = useGame(), b = s.game.battle, dm = isDM();
  if (!b) {
    return dm ? <Setup /> : (
      <section className="card"><h2>Battle</h2><p className="small muted" style={{ margin: 0 }}>No battle right now. When Dennis starts one, it shows up here and you'll act on your Pokémon's turn.</p></section>
    );
  }
  const cur = b.order[b.turn], actor = bGet(cur);
  const end = () => run(async () => {
    if (!b.result && !(await ask('End this battle?', 'End battle'))) return;
    const room = G().game.battle?.room;
    update(d => {
      d.chars.forEach(x => { if (x.megaOn != null) { x.megaOn = null; clampHP(x); } });
      d.game.battle = null;
      d.game.bsetup.enemies = [];
    });
    if (room) setUi({ tab: dm ? (room.world ? 'world' : 'dungeon') : 'play' });
  });
  let panel: React.ReactNode;
  if (b.phase === 'intro') panel = <Intro b={b} />;
  else if (b.result) {
    panel = (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>{b.result === 'win' ? '🏆 Victory!' : '💫 The team fainted…'}</h2>
        {b.xp?.length ? <>
          <div className="row" style={{ justifyContent: 'center', margin: '8px 0' }}>
            {b.xp.map(z => <span key={z.id} className={`tag ${z.g ? 'good' : ''}`}>{z.n} {z.g ? `+${z.g} XP${z.fin ? ' ★' : ''}` : 'fainted, no XP'}</span>)}
          </div>
          {b.xp.some(z => z.fin) ? <p className="small muted" style={{ margin: 0 }}>★ Finishing blow: +15% XP</p> : null}
        </> : null}
        <p className="muted small">HP and PP changes are saved to each sheet.{b.result === 'win' && s.loot.lines.length ? ' Loot was rolled for the defeated Pokémon.' : ''}{dm ? '' : ' Dennis will take the team onward.'}</p>
        {dm ? (
          <div className="row" style={{ justifyContent: 'center' }}>
            {b.result === 'win' && s.loot.lines.length ? <button className="btn gold" onClick={() => setUi({ tab: 'dm' })}>Hand out loot</button> : null}
            <button className="btn primary" onClick={end}>{b.room ? (b.room.world ? 'Back to the overworld' : 'Back to the dungeon') : 'End battle'}</button>
          </div>
        ) : null}
      </div>
    );
  } else if (isOut(actor)) {
    panel = (
      <div className="card"><b>{actor ? nameOf(actor) : '?'}</b> can't act.
        {controls(cur) || dm ? <div style={{ marginTop: 8 }}><button className="btn primary" onClick={() => update(() => nextTurn())}>Next turn</button></div> : null}
      </div>
    );
  } else if (!controls(cur)) {
    panel = (
      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>{nameOf(actor!)}'s turn</h2><span className="small muted">Round {b.round}</span></div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>{cur.ref === 'pc' ? `Waiting for ${(actor as Char).player || 'the DM'} to pick a move.` : 'Dennis is moving this Pokémon.'}</p>
      </div>
    );
  } else panel = <TurnPanel key={b.round + ':' + b.turn} b={b} />;

  const idx = b.order.map((o, k) => [o, k] as const);
  const upNext = b.result ? [] : idx.slice(b.turn + 1).concat(idx.slice(0, b.turn)).filter(([o]) => !isOut(bGet(o))).slice(0, 3).map(([o]) => nameOf(bGet(o)!));
  const logShown = b.log.slice(0, dm ? 8 : 3);
  return (
    <>
      <Stage b={b} />
      <FieldCard b={b} />
      {panel}
      {/* The stage already shows everyone's HP, so players start with these folded to save scrolling. */}
      <details className="card" open={dm}>
        <summary>Foes{upNext.length ? <span className="small muted" style={{ fontWeight: 400 }}> · Up next: {upNext.join(', ')}</span> : null}</summary>
        {idx.filter(([o]) => sideOf(o) === 'enemy').map(([o, k]) => <Combatant key={o.id} b={b} o={o} k={k} />)}
      </details>
      <details className="card" open={dm}><summary>Team</summary>{idx.filter(([o]) => sideOf(o) === 'team').map(([o, k]) => <Combatant key={o.id} b={b} o={o} k={k} />)}</details>
      <section className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Battle log</h2>{dm ? <button className="btn sm danger" onClick={end}>End battle</button> : null}</div>
        <div className="log" style={{ marginTop: 8 }}>{logShown.map((l, i) => <p key={i}>{l}</p>)}</div>
        {b.log.length > logShown.length ? (
          <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 700, marginTop: 6 }}>Show all {b.log.length} lines</summary>
            <div className="log">{b.log.slice(logShown.length).map((l, i) => <p key={i}>{l}</p>)}</div></details>
        ) : null}
      </section>
    </>
  );
}
