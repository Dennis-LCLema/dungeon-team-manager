import { useEffect, useState } from 'react';
import { Avatar, HpBar, TypeChip, Types, run } from '../components/common';
import { Die, stillMotion } from '../components/Dice';
import { sfx } from '../lib/sfx';
import { CAST, FIELD_KINDS, FIELD_PRESETS, STATUS, SURPRISE, TCOL } from '../game/data';
import { STAGE_NAME, STUNTS, abilityInfo, callAssist, resolveStunt, struggle, triggerAbility, autoTurn, bGet, buildRivals, setStatus, startRivalSpar, blog, buildEnemy, checkEnd, controls, handleKO, isOut, nextTurn, resolveMove, rollSurprise, setInitRoll, sideOf, startBattle, toHit } from '../game/battle';
import { sceneUrl } from '../components/mapDecor';
import { M, MAX_LEVEL, abilityFxText, lootTeam, applyItem, clampHP, critOn, effectiveness, equippedOf, fmtMega, hpMaxOf, maxHP, megaForms, nameOf, prof, usableBag } from '../game/rules';
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
    const party = lootTeam();
    startBattle(party.map(c => c.id), buildRivals(pick), null, 'normal', 'Team Razorwind wants a rematch!');
    addLog(`A rival battle against ${rivals.filter(r => pick.includes(r.id)).map(r => r.name).join(', ')} begins!`);
  }));
  return (
    <section className="card callout">
      <h2>⚔️ Rival battle</h2>
      <p className="small muted tip" style={{ marginTop: 0 }}>Team Razorwind fights at your players' levels, as strong as the Pokémon they chose, and they plan their moves. {s.world.sparDone ? '' : 'Start with the graduation spar.'}</p>
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
    const pcs = d.game.bsetup.pcs.map(id => d.chars.find(x => x.id === id)).filter(x => x && !x.reserve) as Char[];
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
        {s.chars.length ? s.chars.filter(c => !c.reserve).map(c => (
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
      <p className="small muted tip" style={{ textAlign: 'center' }}>You move enemies and NPCs. Each player acts on their own Pokémon's turn from their device.</p>
    </>
  );
}

const ord = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/** One fighter's initiative dice: they tumble through random faces, then land on the real roll and show the total. */
function InitRoll({ o, delay }: { o: OrderEntry; delay: number }) {
  const [wait] = useState(delay); // keep the first delay, so a re-sorted list doesn't re-roll everyone
  const [rolling, setRolling] = useState(() => !stillMotion());
  useEffect(() => {
    const t = setTimeout(() => setRolling(false), wait + 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <span className="mono small initroll">
      <Die value={o.r1} rolling={rolling} size={36} />
      {o.r2 != null ? <Die value={o.r2} rolling={rolling} size={36} /> : null}
      {rolling ? null : <span>{o.mod != null ? fmt(o.mod) : ''} = <b>{o.init}</b></span>}
    </span>
  );
}

function Intro({ b }: { b: Battle }) {
  const dm = isDM();
  const mine = b.order.map((o, i) => [o, i] as const).filter(([o]) => o.ref === 'pc' && owns(bGet(o) as Char));
  useEffect(() => { sfx('dice'); }, []);
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
              <InitRoll key={`${o.r1}:${o.r2}`} o={o} delay={i * 180} />
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
  const rules = useGame().rules, realDice = !!rules.ownDice;
  const [ownMove, setOwnMove] = useState<number | null>(null);
  const [ownD20, setOwnD20] = useState('');
  const [ownDmg, setOwnDmg] = useState('');
  const want = b.ask && ownMove == null ? b.ask.target : pick; // a player waiting on real dice already chose the target
  const tgtId = tgtList.some(o => o.id === want) ? want : tgtList[0]?.id;
  const tgtO = b.order.find(o => o.id === tgtId), tgt = tgtO ? bGet(tgtO) : null, tgtFoe = !!tgtO && sideOf(tgtO) !== mySide;
  const isPc = cur.ref === 'pc', hero = isPc ? (actor as Char) : null;
  // Real dice for this turn: the DM set it for everyone, or this hero's player chose it. Chosen before the roll, never after.
  const diceKey = String(hero?.player || '').toLowerCase(), own = isPc && (realDice || !!rules.dice?.[diceKey]);
  const moves: Move[] = isPc ? equippedOf(hero!) : actor.moves;
  const shadowFoes = foes.map(o => bGet(o) as Enemy).filter(x => x?.shadow);
  const readyAssists = hero ? hero.assists.map((a, i) => [a, i] as const).filter(([a]) => !a.used) : [];
  const downed = mySide === 'team' ? b.order.filter(o => o.ref === 'pc' && (bGet(o)?.hpCur || 0) <= 0).map(o => bGet(o) as Char) : [];
  const bag = hero ? usableBag(hero) : [];
  const abil = hero ? abilityInfo(hero) : null;
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
    // Out of PP (the button is off, but two taps or a stale screen can still get here): keep the turn.
    if (!resolveMove(a, mv, t, manual)) { toast(`${T(mv.name)} is out of PP. Pick another move.`, 'bad'); return; }
    checkEnd();
    nextTurn();
  });
  const noPunch = isPc && !moves.some(m => m.dice && m.cls !== 'status' && (m.ppMax == null || m.ppCur > 0));
  const doStruggle = () => onTurn((_bb, _c, a) => {
    const t = target(G());
    if (!t) { toast('No target.', 'bad'); return; }
    resolveMove(a, struggle(), t);
    checkEnd();
    nextTurn();
  });
  const pickMove = (i: number) => {
    if (own && moves[i]?.dice && moves[i].cls !== 'status') {
      // Real dice: the DM types the numbers. A player's pick waits on every screen until the DM does.
      if (dm) { setOwnMove(i); setOwnD20(''); setOwnDmg(''); }
      else onTurn((bb, _c, a) => { bb.ask = { move: i, target: tgtId || '' }; blog(`${nameOf(a)} picks ${T(moves[i].name)} and rolls real dice.`); });
      return;
    }
    fire(i);
  };
  // Preview of a player's own d20: same math the engine uses.
  const omIdx = ownMove ?? (dm && b.ask ? b.ask.move : null), om = omIdx != null ? moves[omIdx] : null, d20 = Math.round(+ownD20);
  const dropAsk = () => { setOwnMove(null); if (b.ask) update(d => { delete d.game.battle?.ask; }); };
  const ownCheck = om && tgt && d20 >= 1 && d20 <= 20 ? (() => {
    const { bonus, def, defName } = toHit(actor, om, tgt), crit = d20 >= critOn(actor);
    return { bonus, def, defName, crit, total: d20 + bonus, hit: d20 !== 1 && (crit || d20 + bonus >= def) };
  })() : null;
  const applyOwn = () => {
    if (omIdx == null || !ownCheck) return toast('Type the d20 they rolled (1 to 20).', 'bad');
    const dmg = Math.round(+ownDmg);
    if (ownCheck.hit && !(ownDmg !== '' && dmg >= 0)) return toast('Type their damage roll.', 'bad');
    fire(omIdx, { d20, dmg: ownCheck.hit ? dmg : undefined });
  };
  const purify = (typed?: number) => onTurn((bb, _c, a) => {
    const t = target(G()) as Enemy | null;
    if (!t || t.kind !== 'enemy' || !t.shadow) { toast('Target a Shadow Pokémon to purify.', 'bad'); return; }
    const boost = bb.boost?.[a.id] || 0;
    t.purifier = a.id;
    if (boost) delete bb.boost[a.id];
    const real = isDM() && typed != null;
    const r = real ? typed! : boost ? Math.max(roll(20), roll(20)) : roll(20), bonus = prof(a.level) + M(a, 'heart'), tot = r + bonus;
    if (tot >= 12) {
      const amt = 20 + Math.max(0, M(a, 'heart')) * 5 + boost;
      t.heartGauge = Math.max(0, t.heartGauge - amt);
      blog(`${nameOf(a)} reaches out to ${t.name} (${r}${fmt(bonus)} = ${tot} vs 12${real ? ', real dice' : ''}). Heart Gauge −${amt} → ${t.heartGauge}.${t.heartGauge <= 30 ? ' Its heart is ready to open. Knock it out to purify it!' : ''}`);
    } else blog(`${nameOf(a)} tries to reach ${t.name} (${tot} vs 12), but its heart stays shut.`);
    nextTurn();
  });
  // Purify with real dice goes through the same wait-for-the-DM step as an attack (move -1).
  const askPurify = () => {
    if (!tgt || tgt.kind !== 'enemy' || !tgt.shadow) return toast('Target a Shadow Pokémon to purify.', 'bad');
    if (!own) return purify();
    if (dm) { setOwnMove(-1); setOwnD20(''); }
    else onTurn((bb, _c, a) => { bb.ask = { move: -1, target: tgtId || '' }; blog(`${nameOf(a)} reaches out to ${nameOf(tgt)} and rolls real dice.`); });
  };
  const heartBonus = prof(actor.level) + M(actor, 'heart');
  // Stunts: the player says what they do, the DM says how hard it is, then the dice decide.
  const [stuntOpen, setStuntOpen] = useState(false);
  const [stuntText, setStuntText] = useState('');
  const [stuntStat, setStuntStat] = useState('spe');
  const [stuntD20, setStuntD20] = useState('');
  const stunted = !!b.flags?.[actor.id]?.stunted;
  const askStunt = () => {
    if (stuntText.trim().length < 3) return toast('Say what your Pokémon does.', 'bad');
    onTurn((bb, _c, a) => { bb.stunt = { id: a.id, text: stuntText.trim(), stat: stuntStat }; blog(`${nameOf(a)} wants to try a stunt: “${stuntText.trim()}”`); });
    setStuntOpen(false); setStuntText('');
  };
  const ruleStunt = (level: string) => run(() => {
    const t = Math.round(+stuntD20), real = stuntD20 !== '';
    if (real && !(t >= 1 && t <= 20)) return toast('Type the d20 they rolled (1 to 20).', 'bad');
    if (own && !real) return toast(`${hero?.player || 'This player'} rolls real dice. Type their d20 first.`, 'bad');
    update(() => resolveStunt(level, real ? t : undefined));
    setStuntD20('');
  });
  const STATS6: [string, string][] = [['atk', 'STR'], ['spe', 'DEX'], ['def', 'CON'], ['spa', 'INT'], ['spd', 'WIS'], ['heart', 'CHA']];
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
  const assist = () => onTurn((_bb, _c, a) => callAssist(a as Char, readyAssists[assistSel]?.[1] ?? -1, target(G())));
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

  const ability = () => onTurn((_bb, _c, a) => triggerAbility(a, target(G())));

  return (
    <div className="card callout turn">
      <div className="row between"><h2 style={{ margin: 0 }}>{isPc && owns(hero) ? 'Your turn: ' : ''}{nameOf(actor)}</h2><span className="small muted">Round {b.round}</span></div>
      {b.stunt ? (
        <div className="banner">
          <b>🤸 Stunt:</b> “{b.stunt.text}” <span className="small muted">{STATS6.find(x => x[0] === b.stunt!.stat)?.[1]} check {fmt(M(actor, b.stunt.stat as 'atk'))}</span>
          {dm ? (
            <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {Object.entries(STUNTS).map(([k, v]) => <button key={k} className="btn sm primary" title={`Works: ${v.win} on the next attack. Fails: disadvantage.`} onClick={() => ruleStunt(k)}>{v.n} ({v.dc})</button>)}
              <input type="number" min={1} max={20} value={stuntD20} onChange={e => setStuntD20(e.target.value)} placeholder={own ? 'their d20' : 'real d20'} aria-label="The d20 they rolled, if they used real dice" style={{ width: 96 }} />
              <button className="btn sm ghost" onClick={() => update(d => { if (d.game.battle) { blog('Dennis says no to the stunt.'); delete d.game.battle.stunt; } })}>Not this time</button>
            </div>
          ) : <div className="small" style={{ marginTop: 4 }}>{own ? 'Roll your real d20 and tell Dennis. He decides how hard it is.' : 'Waiting for Dennis to say how hard it is.'}</div>}
        </div>
      ) : null}
      <label style={{ margin: '10px 0' }}>1. Pick a target
        <select value={tgtId} onChange={e => setPick(e.target.value)}>
          {tgtList.map(o => { const x = bGet(o)!; return <option key={o.id} value={o.id}>{sideOf(o) === mySide ? 'Ally: ' : ''}{nameOf(x)} ({x.hpCur}/{hpMaxOf(x)} HP)</option>; })}
        </select>
      </label>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="small muted" style={{ fontWeight: 600 }}>2. Pick a move</span>
        {isPc && dm ? (
          <label className="row" style={{ flexDirection: 'row', fontSize: 13, color: 'var(--ink)' }}>
            <input type="checkbox" checked={realDice} onChange={e => { const on = e.target.checked; setOwnMove(null); update(d => { d.rules.ownDice = on; if (d.game.battle) delete d.game.battle.ask; }); }} /> Everyone rolls real dice (I type them in)
            {own && !realDice ? <span className="tag good">{hero!.player} chose real dice</span> : null}
          </label>
        ) : isPc && owns(hero) ? (
          <label className="row" style={{ flexDirection: 'row', fontSize: 13, color: 'var(--ink)' }} title="Choose before you pick a move. Once the app has rolled, that roll stands.">
            <input type="checkbox" checked={own} disabled={realDice || !!b.ask} onChange={e => { const on = e.target.checked; update(d => { (d.rules.dice ||= {})[diceKey] = on; }); }} /> I'll roll my own dice
          </label>
        ) : null}
      </div>
      {b.ask && !dm ? (
        <div className="banner">
          <b>🎲 Roll your real dice!</b> {b.ask.move === -1
            ? <>A d20 for your Heart check{tgt ? <> on <b>{nameOf(tgt)}</b></> : null}, then tell Dennis the number.</>
            : <>A d20 for <b>{T(moves[b.ask.move]?.name || 'your move')}</b>{tgt ? <> on <b>{nameOf(tgt)}</b></> : null}, then tell Dennis the number. If it hits, roll {moves[b.ask.move]?.dice} for damage too.</>}
          <div className="small muted" style={{ marginTop: 4 }}>The choice is locked in once you roll. Picked the wrong thing? Ask Dennis to cancel it.</div>
        </div>
      ) : null}
      {own && omIdx === -1 && dm ? (
        <div className="loot" style={{ marginBottom: 10 }}>
          <b>Purify</b> on <b>{tgt ? nameOf(tgt) : '?'}</b>
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <label style={{ width: 220 }}>Their d20 for the Heart check{b.boost?.[actor.id] ? ' (roll twice, keep the higher)' : ''}<input type="number" min={1} max={20} autoFocus value={ownD20} onChange={e => setOwnD20(e.target.value)} /></label>
          </div>
          {d20 >= 1 && d20 <= 20 ? <p className="small" style={{ margin: '8px 0' }}>{d20}{fmt(heartBonus)} = <b>{d20 + heartBonus}</b> vs 12: <b>{d20 + heartBonus >= 12 ? 'It works!' : 'Its heart stays shut.'}</b></p> : null}
          <div className="row">
            <button className="btn primary" disabled={!(d20 >= 1 && d20 <= 20)} onClick={() => purify(d20)}>Apply</button>
            <button className="btn ghost" onClick={dropAsk}>Cancel</button>
          </div>
        </div>
      ) : null}
      {own && om && dm ? (
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
          ) : <p className="small muted tip" style={{ margin: '8px 0' }}>The app adds their attack bonus and checks it against the target.</p>}
          <div className="row">
            <button className="btn primary" onClick={applyOwn} disabled={!ownCheck}>{ownCheck && !ownCheck.hit ? 'Confirm miss' : 'Apply'}</button>
            <button className="btn ghost" onClick={dropAsk}>Pick another move</button>
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
      {noPunch ? <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={doStruggle}>Struggle (1d8)</button><span className="small muted">No damaging move has PP left.</span></div> : null}
      {bag.length || (mySide === 'team' && shadowFoes.length) || downed.length || readyAssists.length || canMega || abil || isPc || (!isPc && dm) ? <>
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
          {isPc ? <button className="btn" disabled={stunted || !!b.stunt} title="A backflip strike, a swing off a vine, anything you can think of. One per turn; it doesn't use your turn." onClick={() => setStuntOpen(!stuntOpen)}>🤸 {stunted ? 'Stunt done' : 'Try a stunt'}</button> : null}
          {mySide === 'team' && shadowFoes.length ? <button className="btn" onClick={askPurify}>💜 Purify (Heart check)</button> : null}
          {downed.map(x => <button key={x.id} className="btn" onClick={() => rally(x.id)}>Help up {nameOf(x)}</button>)}
          {readyAssists.length ? (
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <select style={{ width: 'auto', maxWidth: '60vw' }} aria-label="Assist" value={assistSel} onChange={e => setAssistSel(+e.target.value)}>
                {readyAssists.map(([a], i) => <option key={i} value={i}>{a.name}: {a.move}</option>)}
              </select>
              <button className="btn" onClick={assist}>Call assist</button>
            </span>
          ) : null}
          {abil ? <button className="btn gold" disabled={abil.used} title={abilityFxText(abil.fx)} onClick={ability}>✨ {abil.used ? `${abil.name} used` : `Use ${abil.name}${abil.left > 1 ? ` (${abil.left} left)` : ''}`}</button> : null}
          {canMega ? <button className="btn gold" onClick={mega}>Mega Evolve into {megaForms(hero)[hero!.megaForm || 0][0].replace(/-Mega.*/, '')}!</button> : null}
          {!isPc && dm ? <button className="btn gold" onClick={() => run(() => update(autoTurn))}>Auto turn</button> : null}
        </div>
      </> : null}
      {stuntOpen && !b.stunt && !stunted ? (
        <form className="loot" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); askStunt(); }}>
          <label>What does {nameOf(actor)} do?<input autoFocus value={stuntText} maxLength={140} onChange={e => setStuntText(e.target.value)} placeholder="e.g. Backflip off the wall and strike from above" /></label>
          <div className="row" style={{ marginTop: 8, gap: 6, alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 180px' }}>Using<select value={stuntStat} onChange={e => setStuntStat(e.target.value)}>
              {STATS6.map(([k, l]) => <option key={k} value={k}>{l} ({({ atk: 'strength', spe: 'speed and agility', def: 'toughness', spa: 'cleverness', spd: 'focus', heart: 'charm' } as Record<string, string>)[k]}) {fmt(M(actor, k as 'atk'))}</option>)}
            </select></label>
            <button className="btn primary" type="submit">Ask Dennis</button>
          </div>
          <p className="small muted tip" style={{ margin: '6px 0 0' }}>Dennis says how hard it is. Pull it off and your next attack gets advantage, plus bonus damage for harder stunts. Fail and it has disadvantage.</p>
        </form>
      ) : null}
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
      )) : <p className="small muted tip" style={{ margin: '4px 0 0' }}>A player did something clever, like Fire on Water for a steam fog? Turn it into a field effect.</p>}
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
  const stg = Object.entries(b.stage?.[x.id] || {}).filter(([, v]) => v);
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
      {e?.shadow && !e.outReason ? (
        <div className="small" style={{ marginTop: 4 }}>
          {e.heartGauge <= 30 ? <><b>💜 Heart is open.</b> Knock it out now to purify it. It joins whoever lands the final blow as an Assist.</>
            : <><b>💜 To purify:</b> use Purify on your turn until Heart is 30 or less, then knock it out. Knocked out sooner, it flees.</>}
        </div>
      ) : null}
      {status ? <div className="small" style={{ marginTop: 4, fontWeight: 700 }}>{status}</div> : null}
      {!isOut(x) && (x.status || stg.length || (dm && !b.result)) ? (
        <div className="row small" style={{ marginTop: 6, gap: 6 }}>
          {x.status ? <span className="tag" title={STATUS[x.status].d}>{STATUS[x.status].g} {STATUS[x.status].n}</span> : null}
          {stg.map(([key, v]) => <span key={key} className={`eff ${v > 0 ? 'up' : 'down'}`}>{STAGE_NAME[key]} {fmt(v)}</span>)}
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
  const last = b.last, attack = !!last && !last.status, phys = last?.cls === 'physical', landed = attack && !!last!.hit && !!last!.dmg, tc = { '--tc': (last && TCOL[last.moveType]) || '#fff' } as React.CSSProperties;
  const fig = (o: OrderEntry, k: number) => {
    const x = bGet(o);
    if (!x) return null;
    const n = nameOf(x), foe = sideOf(o) === 'enemy';
    const isActor = last?.actor === n, isTarget = !!last && last.target.split(', ').includes(n);
    // The attacker lunges; the target shakes, dodges or glows; a number floats up over it.
    const anim = !last ? '' : isActor && attack ? (foe ? 'lunge-l' : 'lunge-r')
      : isTarget ? (!attack ? 'buff' : !last.hit ? 'dodge' : last.dmg ? 'shake' : '') : isActor ? 'buff' : '';
    const float = !last || !isTarget ? '' : last.heal ? `+${last.heal}`
      : !attack ? '' : last.hit ? (last.dmg ? `−${last.dmg}` : 'No effect') : last.d20 == null ? 'Blocked' : 'Miss';
    return (
      <div key={o.id + (anim || float ? last!.id : '')} style={tc} className={`fig ${anim} ${isOut(x) ? 'down' : ''} ${isTarget && attack && last!.ko ? 'ko' : ''} ${k === b.turn && !b.result ? 'turn' : ''}`}>
        {float ? <i className={`float ${last!.heal ? 'heal' : !last!.hit ? 'miss' : last!.crit ? 'crit' : 'dmg'}`}>{float}</i> : null}
        {isTarget && landed ? <><i className="burst" /><i className="ring" />{phys ? <i className="slash" /> : null}</> : null}
        <Avatar c={x} size={60} />
        <span>{x.status ? STATUS[x.status].g + ' ' : ''}{n}</span>
        <HpBar cur={x.hpCur} max={hpMaxOf(x)} />
      </div>
    );
  };
  const idx = b.order.map((o, k) => [o, k] as const);
  // The side that takes a hit shakes; harder for a crit or a knockout.
  const quake = (from: string) => (landed && last!.actorSide === from ? last!.id : ''), big = landed && (!!last!.crit || !!last!.ko);
  return (
    <div className="stage" aria-hidden="true"
      style={{ backgroundImage: `url(backgrounds/${b.bg || 'battle'}.webp), url(backgrounds/battle.webp), ${sceneUrl(b.scene ?? 0)}` }}>
      <div key={'team' + quake('enemy')} className={`side team ${quake('enemy') ? 'quake' : ''} ${big ? 'big' : ''}`}>{idx.filter(([o]) => sideOf(o) === 'team').map(([o, k]) => fig(o, k))}</div>
      <div key={'foes' + quake('team')} className={`side foes ${quake('team') ? 'quake' : ''} ${big ? 'big' : ''}`}>{idx.filter(([o]) => sideOf(o) === 'enemy').map(([o, k]) => fig(o, k))}</div>
      {/* Special moves fly across with a trail; physical moves land as a slash on the target instead. */}
      {attack && last!.d20 != null && !phys ? ['', 't1', 't2'].map(t => <i key={last!.id + t} style={tc} className={`zap ${t} ${last!.actorSide === 'team' ? 'to-r' : 'to-l'}`} />) : null}
      {attack && last!.hit && last!.crit ? <i key={'crit' + last!.id} className="critflash" /> : null}
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
      {/* The hit/miss card shows here, under the scene, so it never covers the animation. */}
      <div id="hitslot" />
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
