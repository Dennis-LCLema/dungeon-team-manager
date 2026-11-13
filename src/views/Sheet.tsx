import { useEffect, useState } from 'react';
import { Avatar, HpBar, InCharacter, RarChip, TypeChip, Types, XpBlock, run } from '../components/common';
import { ABILITY_FX, ABILITY_RULES, CHART, DEMEANORS, MASTERY, NATURES, QUIZ, STATS, STATUS, STORY_Q, TREE_FX, TYPES } from '../game/data';
import { dex, dexInfo, evoLine, getMove, loadInfo } from '../game/dex';
import {
  AC, M, MAX_LEVEL, MEGA_LEVEL, SAC, addItemTo, applyItem, appLvl, canMegaInfo, changeLevel, clampHP, customMove, defByName, defOf, diceFor, equippedOf,
  evolve, fmtMega, gameLvl, heldFx, hitDie, longRest, looseDef, mastery, matchups, maxHP, megaBase, megaForms, megaOf, nameOf, pointsOf, prof,
  score, shortRestHeal, takeOne, toTableMove, typesOf, rollMoveOutside,
  slotOf, weaponHit, abilityFxText, realDice, forgetMove, learnMove, lockScores, natureText, quizResult, rollScores,
} from '../game/rules';
import { activeChar, addLog, ask, canEdit, exportFile, isDM, me, players, setUi, toast, update, useGame } from '../game/store';
import type { AbilityFx, Branch, Char, Move, MoveClass, Shared, StatKey } from '../game/types';
import { T, setPath, slug, toID, fmt, readImage, roll } from '../lib/util';

const DM_FIELD = /^(shiny|player|evoChoice|evoLevel|bonus\.|heart|types\.|awakenedType|base\.|abilitiesText|nickname|tree\..*\.(label|name|desc)$)/;

/** Change the active character inside update(), with the same permission rules as the original app. */
function withChar(id: string, fn: (c: Char, s: Shared) => void) {
  run(() => update(s => {
    const c = s.chars.find(x => x.id === id);
    if (!c) return;
    if (!canEdit(c)) { toast(`Only ${c.player || 'the DM'} and the DM can change this Pokémon.`, 'bad'); return; }
    fn(c, s);
  }));
}
function setField(id: string, f: string, raw: string | boolean, num?: boolean) {
  if (DM_FIELD.test(f) && !isDM()) return toast('Only the DM can change that.', 'bad');
  withChar(id, c => {
    let v: unknown = raw;
    if (num) v = raw === '' ? null : Number(raw);
    if (f === 'abilitiesText') { c.abilities = String(v).split(',').map(x => slug(x)).filter(Boolean); return; }
    if (f === 'evoLevel' && v != null) v = Math.max(1, Math.min(MAX_LEVEL, v as number));
    if (f.startsWith('bonus.') && v == null) v = 0;
    setPath(c, f, v);
    if (f.startsWith('types')) c.types = c.types.filter(Boolean);
    clampHP(c);
  });
}
/** Text box that saves when you leave it, so typing is never interrupted by sync. */
function Field({ id, f, value, area, rows, ...rest }: { id: string; f: string; value: string; area?: boolean; rows?: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  const save = (v: string) => { if (v !== value) setField(id, f, v); };
  return area
    ? <textarea key={id + value} defaultValue={value} onBlur={e => save(e.target.value)} placeholder={rest.placeholder} rows={rows} />
    : <input key={id + value} defaultValue={value} onBlur={e => save(e.target.value)} {...rest} />;
}

function TypeCard({ c }: { c: Char }) {
  const ts = typesOf(c), mu = matchups(ts);
  const grp = (test: (m: number) => boolean, label: string, note: boolean) => {
    const xs = Object.entries(mu).filter(([, m]) => test(m)).sort((a, b) => b[1] - a[1]);
    return xs.length ? (
      <div className="mu"><div className="small muted">{label}</div>
        <div className="row" style={{ gap: 4 }}>{xs.map(([t, m]) => <span key={t}><TypeChip t={t} />{note && (m === 4 || m === 0.25) ? <span className="mono small">{m === 4 ? '×4' : '×¼'}</span> : null}</span>)}</div>
      </div>
    ) : null;
  };
  const strong = [...new Set(ts.flatMap(t => Object.entries(CHART[t] || {}).filter(([, v]) => v === 2).map(([k]) => k)))];
  return (
    <div className="typebox">
      <p className="small" style={{ margin: '0 0 8px' }}>{nameOf(c)} is a <b>{ts.map(T).join('/')}</b> type. Moves of its own type{ts.length > 1 ? 's' : ''} get <b>STAB</b> (+{prof(c.level)} damage right now).</p>
      {grp(m => m >= 2, 'Takes double damage from', true)}
      {grp(m => m > 0 && m < 1, 'Takes half damage from', true)}
      {grp(m => m === 0, 'Takes no damage from', false)}
      {strong.length ? <div className="mu"><div className="small muted">Its {ts.map(T).join('/')} moves hit hard against</div><div className="row" style={{ gap: 4 }}>{strong.map(t => <TypeChip key={t} t={t} />)}</div></div> : null}
    </div>
  );
}

function DexCard({ c }: { c: Char }) {
  const [, setTick] = useState(0);
  useEffect(() => { if (!dexInfo()) loadInfo().then(() => setTick(t => t + 1)); }, []);
  const INFO = dexInfo(), id = toID(c.species), sp = dex().s[id], inf = INFO?.s[id];
  const statNames: [StatKey, string][] = [['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed']];
  const base = megaBase(c) || c.base, total = statNames.reduce((s, [k]) => s + (base[k] || 0), 0);
  const line = sp ? evoLine(id) : [];
  const megas = sp ? line.flatMap(st => (dex().mg?.[st.id] || []).map(m => m[0])) : [];
  return (
    <details className="card dex">
      <summary>Pokédex</summary>
      {inf ? <><div className="dexhead"><b>{inf[0] || ''}</b>{inf[2] ? ` · ${inf[2]} m` : ''}{inf[3] ? ` · ${inf[3]} kg` : ''}</div>{inf[1] ? <p className="dexentry">{inf[1]}</p> : null}</>
        : <p className="small muted">{sp ? 'Loading the Pokédex entry…' : 'Custom Pokémon. The DM writes its entry in Notes.'}</p>}
      <h3>Typing</h3><TypeCard c={c} />
      <h3>Abilities</h3>
      {c.abilities.length ? c.abilities.map(a => { const hit = INFO?.aId[toID(a)]; return (
        <div className="list-item small" key={a}><span className="grow"><b>{hit ? hit[0] : T(a)}</b>{hit?.[1] ? <> <span className="muted">{hit[1]}</span></> : null}</span></div>
      ); }) : <p className="small muted">None listed.</p>}
      <h3>Base stats <span className="mono" style={{ textTransform: 'none' }}>{total}</span>{megaOf(c) ? <> <span className="tag good">Mega</span></> : null}</h3>
      <div className="statbars">{statNames.map(([k, l]) => (
        <div className="sb" key={k}><span className="small">{l}</span><span className="mono small">{base[k] || 0}</span><div className="bar"><i style={{ width: Math.min(100, (base[k] || 0) / 1.8) + '%' }} /></div></div>
      ))}</div>
      {line.length > 1 || megas.length ? <>
        <h3>Evolution line</h3>
        <div className="evoline">
          {line.map(st => <span key={st.id} className={`evostep ${st.id === id ? 'on' : ''}`}>{st.depth ? <span className="small muted">{st.how || 'evolves'} → </span> : null}<b>{st.n}</b></span>)}
          {megas.map(m => <span key={m} className="evostep mega"><span className="small muted">Mega Trial at level {MEGA_LEVEL} → </span><b>{fmtMega(m)}</b></span>)}
        </div>
      </> : null}
    </details>
  );
}

function MegaCard({ c }: { c: Char }) {
  const dm = isDM(), edit = canEdit(c);
  const [trial, setTrial] = useState(c.mega?.trial || '');
  const [form, setForm] = useState(c.megaForm || 0);
  const info = canMegaInfo(c);
  if (!info) return null;
  const { forms, lineMega } = info;
  let body: React.ReactNode;
  if (!forms.length) body = <p className="small" style={{ margin: 0 }}>Evolve into <b>{lineMega.map(st => st.n).join(' or ')}</b> first. Its Mega Trial opens at level {MEGA_LEVEL}.</p>;
  else if (c.megaReady) body = <p className="small" style={{ margin: 0 }}><b>Mega Evolution unlocked.</b> On your turn in battle, tap Mega Evolve once per battle. It lasts until the battle ends and you still get your move that turn.</p>;
  else if (c.level < MEGA_LEVEL) body = <><p className="small" style={{ margin: 0 }}>Reach level {MEGA_LEVEL} to unlock your Mega Trial. (Level {c.level} now.)</p><div className="bar" style={{ marginTop: 6 }}><i style={{ width: Math.round((c.level / MEGA_LEVEL) * 100) + '%' }} /></div></>;
  else if (!c.mega || c.mega.state === 'draft') {
    const submit = () => {
      if (trial.trim().length < 10) return toast('Describe your trial in a sentence or two.', 'bad');
      withChar(c.id, x => { x.mega = { state: 'pending', trial: trial.trim(), by: me()?.name }; x.megaForm = form; addLog(`${nameOf(x)}'s Mega Trial was proposed: "${trial.trim()}"`); });
      toast('Trial sent to Dennis.');
    };
    body = <>
      <p className="small" style={{ margin: '0 0 8px' }}><b>Your Mega Trial is open!</b> Create your own trial: a challenge {nameOf(c)} must pass to earn its Mega Stone. For example, "Beat a Shadow boss without fainting" or "Protect a lost Pokémon through a whole dungeon." Dennis approves it.</p>
      {forms.length > 1 ? <label style={{ marginBottom: 6 }}>Mega form<select value={form} onChange={e => setForm(+e.target.value)}>{forms.map((f, i) => <option key={f[0]} value={i}>{fmtMega(f[0])}</option>)}</select></label> : null}
      <textarea placeholder="Describe your trial…" disabled={!edit} value={trial} onChange={e => setTrial(e.target.value)} />
      {edit ? <div className="row" style={{ marginTop: 8 }}><button className="btn primary" onClick={submit}>Send trial to Dennis</button></div> : null}
    </>;
  } else body = <>
    <p className="small" style={{ margin: '0 0 6px' }}><b>{c.mega.state === 'pending' ? 'Waiting for Dennis to approve' : 'Trial in progress'}:</b> "{c.mega.trial}"</p>
    {dm ? <MegaDmButtons c={c} /> : null}
  </>;
  const f = forms[c.megaForm || 0];
  return (
    <details className="card mega" open={c.mega?.state === 'pending' || c.mega?.state === 'active'}>
      <summary>Mega Evolution</summary>
      {body}
      {f ? <div className="megaprev small">{fmtMega(f[0])}: {f[1].map(t => <TypeChip key={t} t={t} />)} · Ability <b>{f[3]}</b> · Base stats {f[2].reduce((a, b) => a + b, 0)} ({['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'].map((l, i) => `${l} ${f[2][i]}`).join(', ')})</div> : null}
    </details>
  );
}
export function MegaDmButtons({ c, sm }: { c: Char; sm?: boolean }) {
  const set = (a: 'accept' | 'return' | 'pass') => run(() => update(s => {
    const x = s.chars.find(y => y.id === c.id);
    if (!x?.mega) return;
    if (a === 'accept') { x.mega.state = 'active'; addLog(`Dennis accepted ${nameOf(x)}'s Mega Trial. The trial begins!`); }
    if (a === 'return') { x.mega.state = 'draft'; addLog(`Dennis asked for changes to ${nameOf(x)}'s Mega Trial.`); }
    if (a === 'pass') {
      x.mega.state = 'passed'; x.megaReady = true;
      const f = megaForms(x)[x.megaForm || 0];
      addLog(`${nameOf(x)} passed its Mega Trial and earned the ${f?.[4] || 'Mega Stone'}! It can now Mega Evolve once per battle.`);
      toast('Mega Evolution unlocked!');
    }
  }));
  const k = sm ? 'btn sm' : 'btn';
  return (
    <div className="row">
      {c.mega?.state === 'pending' ? <>
        <button className={k + ' primary'} onClick={() => set('accept')}>Accept trial</button>
        <button className={k} onClick={() => set('return')}>Ask for changes</button>
      </> : <button className={k + ' gold'} onClick={() => set('pass')}>Trial passed: unlock Mega</button>}
    </div>
  );
}

/** Homebrew ability approval buttons for the DM (sheet and DM tools). */
export function HomebrewDmButtons({ c, sm }: { c: Char; sm?: boolean }) {
  const set = (state: 'approved' | 'draft') => run(() => update(s => {
    const x = s.chars.find(y => y.id === c.id);
    if (!x?.homebrew) return;
    x.homebrew.state = state;
    addLog(state === 'approved' ? `Dennis approved ${nameOf(x)}'s homebrew ability, ${x.homebrew.name}. It replaces its preset ability.` : `Dennis asked for changes to ${nameOf(x)}'s homebrew ability.`);
  }));
  const k = sm ? 'btn sm' : 'btn';
  return c.homebrew?.state === 'pending' ? (
    <div className="row"><button className={k + ' primary'} onClick={() => set('approved')}>Approve</button><button className={k} onClick={() => set('draft')}>Ask for changes</button></div>
  ) : c.homebrew?.state === 'approved' ? <button className={k} onClick={() => set('draft')}>Turn off homebrew</button> : null;
}

function AbilityCard({ c }: { c: Char }) {
  const dm = isDM(), edit = canEdit(c), cur = c.ability || c.abilities[0] || '', hb = c.homebrew, on = hb?.state === 'approved';
  const [name, setName] = useState(hb?.name || '');
  const [desc, setDesc] = useState(hb?.desc || '');
  const [kind, setKind] = useState<AbilityFx['kind'] | ''>(hb ? hb.fx?.kind || '' : 'status');
  const [st, setSt] = useState<NonNullable<AbilityFx['status']>>(hb?.fx?.status || 'burn');
  const dexText = (a: string) => dexInfo()?.aId[toID(a)]?.[1];
  const send = () => {
    if (!name.trim() || desc.trim().length < 10) return toast('Give the ability a name and describe what it does.', 'bad');
    const fx: AbilityFx | undefined = kind ? { kind, ...(kind === 'status' ? { status: st } : {}) } : undefined;
    withChar(c.id, x => { x.homebrew = { name: name.trim(), desc: desc.trim(), state: 'pending', ...(fx ? { fx } : {}) }; addLog(`${nameOf(x)} proposed a homebrew ability: ${name.trim()}.`); });
    toast('Sent to Dennis for approval.');
  };
  return (
    <details className="card" open={hb?.state === 'pending'}>
      <summary>Ability: {on ? hb!.name : T(cur)}</summary>
      {on ? <div className="banner"><b>{hb!.name}</b> (homebrew, approved): {hb!.desc} <span className="muted">{abilityFxText(hb!.fx)} Tap “Use” on your turn in battle.</span></div> : null}
      <label>Preset ability{on ? ' (replaced by the homebrew one)' : ''}
        <select value={cur} disabled={!edit || c.inDungeon || on} onChange={e => withChar(c.id, x => { x.ability = e.target.value; addLog(`${nameOf(x)} now uses ${T(e.target.value)}.`); })}>
          {c.abilities.map(a => <option key={a} value={a}>{T(a)}</option>)}
        </select>
      </label>
      <p className="small" style={{ margin: '8px 0 0' }}>{ABILITY_RULES[cur] || dexText(cur) || 'The DM decides how it works in battle.'}{ABILITY_RULES[cur] ? <> <span className="muted">Applied automatically in battle.</span></> : null}</p>
      {c.inDungeon ? <p className="small muted" style={{ margin: '4px 0 0' }}>Locked during the dungeon run, like moves.</p> : null}
      <h3>Homebrew ability</h3>
      {hb?.state === 'pending' ? <>
        <p className="small" style={{ margin: '0 0 6px' }}><b>Waiting for Dennis:</b> {hb.name}: {hb.desc} <span className="muted">{abilityFxText(hb.fx)}</span></p>
        {dm ? <HomebrewDmButtons c={c} /> : null}
      </> : on ? (dm ? <HomebrewDmButtons c={c} /> : null) : <>
        <p className="small muted tip" style={{ marginTop: 0 }}>Invent your own ability. Pick what it does in battle and the app resolves it when you tap it on your turn (once per battle). Once Dennis approves it, it replaces the preset one.</p>
        <div className="grid2 stack">
          <label>Name<input value={name} disabled={!edit} onChange={e => setName(e.target.value)} placeholder="e.g. Wax Shield" /></label>
          <label>What it does<input value={desc} disabled={!edit} onChange={e => setDesc(e.target.value)} placeholder="e.g. Once per battle, halve the damage of one hit." /></label>
        </div>
        <div className="grid2 stack" style={{ marginTop: 8 }}>
          <label>What it does in battle
            <select value={kind} disabled={!edit} onChange={e => setKind(e.target.value as AbilityFx['kind'] | '')}>
              {Object.entries(ABILITY_FX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="">Something else: advantage on your next attack</option>
            </select>
          </label>
          {kind === 'status' ? (
            <label>Which status
              <select value={st} disabled={!edit} onChange={e => setSt(e.target.value as NonNullable<AbilityFx['status']>)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.g} {v.n}: {v.d}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {edit ? <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={send}>Send to Dennis</button></div> : null}
      </>}
    </details>
  );
}

/** D&D-style ability checks: d20 + the stat's modifier, posted to the shared log so the DM sees every roll. */
function AbilityChecks({ c }: { c: Char }) {
  const dm = isDM(), rules = useGame().rules, real = realDice(c), key = String(c.player || '').toLowerCase(), mine = me()?.name.toLowerCase() === key;
  const [typed, setTyped] = useState('');
  const checks: [StatKey | 'heart', string][] = [['atk', 'STR'], ['spe', 'DEX'], ['def', 'CON'], ['spa', 'INT'], ['spd', 'WIS'], ['heart', 'CHA']];
  const check = (k: StatKey | 'heart', label: string) => {
    // The DM can always type a d20 that was rolled at the table instead of letting the app roll.
    const own = dm && typed !== '', t = Math.round(+typed);
    if (own && !(t >= 1 && t <= 20)) return toast('Type the d20 they rolled (1 to 20).', 'bad');
    const d = own ? t : roll(20), m = M(c, k), total = d + m;
    const msg = `${nameOf(c)} rolled a ${label} check: ${d}${fmt(m)} = ${total}${d === 20 ? ' (natural 20!)' : d === 1 ? ' (natural 1)' : ''}${own ? ' (real dice)' : ''}.`;
    update(() => addLog(msg, 'roll'));
    toast(`🎲 ${label} check: ${total}`);
    setTyped('');
  };
  return (
    <>
      <div className="row" style={{ marginTop: 10, gap: 6 }} role="group" aria-label="Ability checks">
        <span className="small muted">🎲 Check:</span>
        {checks.map(([k, label]) => <button key={k} className="btn sm" title={`d20 ${fmt(M(c, k))}`} disabled={real && !dm} onClick={() => check(k, label)}>{label} <span className="mono small muted">{fmt(M(c, k))}</span></button>)}
        {dm ? <input type="number" min={1} max={20} value={typed} onChange={e => setTyped(e.target.value)} placeholder="real d20" aria-label="The d20 they rolled, if they used real dice" style={{ width: 96 }} /> : null}
      </div>
      {c.player && (mine || dm) ? (
        <label className="row small" style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={real} disabled={!!rules.ownDice} onChange={e => { const on = e.target.checked; update(d => { (d.rules.dice ||= {})[key] = on; }); }} />
          {mine ? "I roll my own dice (I tell Dennis each roll)" : `${c.player} rolls real dice`}{rules.ownDice ? ' · on for everyone' : ''}
        </label>
      ) : null}
      {real && !dm ? <p className="small" style={{ margin: '4px 0 0' }}>🎲 Roll a real d20, add the number on the button, and tell Dennis. He types it in.</p> : null}
    </>
  );
}

function MoveCard({ c, mv, slot }: { c: Char; mv: Move; slot: boolean }) {
  const key: StatKey = mv.cls === 'physical' ? 'atk' : 'spa';
  const stab = typesOf(c).includes(mv.type), dmgMod = M(c, key) + (stab ? prof(c.level) : 0);
  const line = mv.cls !== 'status' && mv.dice
    ? `${fmt(prof(c.level) + M(c, key) + weaponHit(c, mv))} to hit · ${mv.dice}${dmgMod ? fmt(dmgMod) : ''} dmg${stab ? ' · STAB' : ''}`
    : `Status · Save DC ${8 + prof(c.level) + M(c, 'spa')}`;
  const locked = c.inDungeon, name = mv.name;
  const onMove = (fn: (m: Move, x: Char) => void) => withChar(c.id, x => { const m = x.moves.find(y => y.name === name); if (m) fn(m, x); });
  const forget = () => run(async () => {
    if (locked || !(await ask(`Forget ${T(name)}?`, 'Forget'))) return;
    withChar(c.id, x => forgetMove(x, name));
  });
  return (
    <div className="move">
      <div className="mt">
        <span className="mn">{T(mv.name)}</span><TypeChip t={mv.type} /><span className="small muted">{mv.cls}</span><span style={{ flex: 1 }} />
        {slot ? <button className="btn sm ghost" disabled={locked} onClick={() => withChar(c.id, x => { if (!x.inDungeon) x.equipped = x.equipped.filter(n => n !== name); })}>Unequip</button> : <>
          <button className="btn sm" disabled={locked || c.equipped.length >= 4} onClick={() => withChar(c.id, x => { if (!x.inDungeon && x.equipped.length < 4) x.equipped.push(name); })}>Equip</button>
          <button className="btn sm ghost danger" disabled={locked} onClick={forget}>Forget</button>
        </>}
      </div>
      <div className="small mono" style={{ margin: '4px 0' }}>{line}</div>
      {slot ? (mv.ppMax == null ? (
        <div className="row" style={{ gap: 6 }}><span className="small muted">At-will</span><button className="btn sm primary" onClick={() => onMove((m, x) => rollMoveOutside(x, m))}>Use</button></div>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <div className="pips">{Array.from({ length: mv.ppMax }, (_, i) => <span key={i} className={`pip ${i < mv.ppCur ? '' : 'off'}`} />)}</div>
          <span className="small mono"><b>{mv.ppCur}</b>/{mv.ppMax} PP</span>
          <button className="btn sm primary" disabled={mv.ppCur <= 0} onClick={() => onMove((m, x) => rollMoveOutside(x, m))}>Use</button>
          <button className="btn sm ghost" disabled={mv.ppCur <= 0} aria-label="Remove 1 PP" onClick={() => onMove(m => { if (m.ppCur > 0) m.ppCur--; })}>−1</button>
          <button className="btn sm ghost" disabled={mv.ppCur >= mv.ppMax} aria-label="Add 1 PP" onClick={() => onMove(m => { if (m.ppCur < (m.ppMax || 0)) m.ppCur++; })}>+1</button>
        </div>
      )) : <div className="small muted">{mv.ppMax == null ? 'At-will' : mv.ppMax + ' PP per long rest'}</div>}
      {mv.desc ? <div className="small muted" style={{ marginTop: 4 }}>{mv.desc}</div> : null}
    </div>
  );
}

/** One line about a move from the Pokédex: type, class, damage dice and what it does. */
function MoveInfo({ name }: { name: string }) {
  let m: ReturnType<typeof getMove> | null = null;
  try { m = getMove(name); } catch { /* a custom move: nothing to show */ }
  return m ? <span className="small muted" title={m.desc}><TypeChip t={m.type} /> {m.cls}{m.cls === 'status' ? '' : ' · ' + diceFor(m.power, m.cls)}</span> : null;
}

function Moves({ c }: { c: Char }) {
  const dm = isDM(), eq = equippedOf(c), pool = c.moves.filter(m => !c.equipped.includes(m.name));
  const learnable = c.levelMoves.filter(m => m.level <= gameLvl(c.level) && !c.moves.some(x => x.name === m.name));
  const all = c.levelMoves.slice().sort((a, b) => a.level - b.level), wish = c.wish || [], edit = canEdit(c);
  const [mvName, setMvName] = useState('');
  const [wishName, setWishName] = useState('');
  const toggleWish = (n: string) => withChar(c.id, x => {
    const w = x.wish || [], k = slug(n);
    x.wish = w.includes(k) ? w.filter(y => y !== k) : [...w, k];
  });
  const addWish = () => run(() => {
    if (!wishName.trim()) return toast('Type a move name first.', 'bad');
    const k = getMove(wishName).name; // checks the spelling
    if (wish.includes(k)) return toast('Already on the wishlist.', 'bad');
    if (c.moves.some(m => m.name === k)) return toast(`${nameOf(c)} already knows ${T(k)}.`, 'bad');
    toggleWish(k);
    setWishName('');
  });
  const star = (n: string) => (edit ? (
    <button className="btn sm ghost" aria-pressed={wish.includes(n)} aria-label={`${wish.includes(n) ? 'Remove' : 'Add'} ${T(n)} ${wish.includes(n) ? 'from' : 'to'} the wishlist`} onClick={() => toggleWish(n)}>{wish.includes(n) ? '★' : '☆'}</button>
  ) : wish.includes(n) ? <span aria-label="On the wishlist">★</span> : null);
  const [cm, setCm] = useState({ name: '', type: 'normal', cls: 'physical' as MoveClass, dice: '2d6', pp: '', desc: '' });
  const learn = (n: string) => run(() => {
    if (!n.trim()) return toast('Type a move name first.', 'bad');
    if (c.moves.some(m => m.name === slug(n))) return toast('Already known.', 'bad');
    const mv = toTableMove(getMove(n));
    withChar(c.id, x => { if (learnMove(x, mv)) addLog(`${nameOf(x)} learned ${T(mv.name)}.`); });
    toast(`Learned ${T(mv.name)}!`);
    setMvName('');
  });
  const addCustom = () => {
    if (!cm.name.trim()) return toast('Give the move a name.', 'bad');
    const mv = customMove(cm.name, cm.type, cm.cls, cm.dice || '2d6', cm.pp ? Math.max(1, Math.min(10, Math.round(+cm.pp) || 1)) : null, cm.desc);
    if (c.moves.some(m => m.name === mv.name)) return toast(`${nameOf(c)} already knows a move called ${T(mv.name)}.`, 'bad');
    withChar(c.id, x => { learnMove(x, mv); });
    setCm({ ...cm, name: '', desc: '' });
  };
  return (
    <details className="card" open>
      <summary>Moves ({eq.length}/4 equipped)</summary>
      <p className="small muted tip" style={{ marginTop: 0 }}>Tap Use to roll a move outside battle. It spends PP and posts the roll to the team Log.</p>
      {eq.map(m => <MoveCard key={m.name} c={c} mv={m} slot />)}
      {Array.from({ length: Math.max(0, 4 - eq.length) }, (_, i) => <div key={i} className="move empty small">Empty slot</div>)}
      <h3>Move pool</h3>
      {pool.length ? pool.map(m => <MoveCard key={m.name} c={c} mv={m} slot={false} />) : <p className="small muted">All known moves are equipped.</p>}
      {learnable.length ? <><h3>Ready to learn</h3>{learnable.map(m => (
        <div className="list-item" key={m.name}><span className="grow">{T(m.name)} <span className="small muted">Lv {appLvl(m.level)}</span></span><button className="btn sm" onClick={() => learn(m.name)}>Learn</button></div>
      ))}</> : null}
      {all.length ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Every move {T(c.species)} learns ({all.length})</summary>
          <p className="small muted tip" style={{ margin: '6px 0' }}>Tap ☆ to put a move on the wishlist.</p>
          {all.map(m => {
            const has = c.moves.some(x => x.name === m.name), ok = m.level <= gameLvl(c.level);
            return (
              <div className="list-item small" key={m.name + m.level}>
                <span className="muted mono" style={{ minWidth: 44 }}>Lv {appLvl(m.level)}</span>
                <span className="grow"><b>{T(m.name)}</b> <MoveInfo name={m.name} /></span>
                {has ? <span className="tag good">Known</span> : ok ? <span className="tag">Ready</span> : null}
                {has ? null : star(m.name)}
              </div>
            );
          })}
        </details>
      ) : null}
      <h3>Wishlist{wish.length ? ` (${wish.length})` : ''}</h3>
      {wish.length ? wish.map(n => (
        <div className="list-item small" key={n}>
          <span className="grow"><b>{T(n)}</b> <MoveInfo name={n} />
            {c.levelMoves.some(m => m.name === n) ? <span className="muted"> · Lv {appLvl(c.levelMoves.find(m => m.name === n)!.level)}</span> : <span className="muted"> · TM or tutor</span>}</span>
          {dm && !c.moves.some(m => m.name === n) ? <button className="btn sm" onClick={() => { learn(n); toggleWish(n); }}>Teach</button> : null}
          {edit ? <button className="btn sm ghost danger" aria-label={`Remove ${T(n)} from the wishlist`} onClick={() => toggleWish(n)}>✕</button> : null}
        </div>
      )) : <p className="small muted">{edit ? 'Moves you hope to learn go here, so the DM can see them.' : 'Nothing on the wishlist yet.'}</p>}
      {edit ? (
        <form className="row" onSubmit={e => { e.preventDefault(); addWish(); }}>
          <input list="moveList" autoComplete="off" placeholder="Wish for any move, e.g. Surf" aria-label="Move to add to the wishlist" style={{ flex: 1 }} value={wishName} onChange={e => setWishName(e.target.value)} />
          <button className="btn" type="submit">Add to wishlist</button>
        </form>
      ) : null}
      {dm ? <>
        <h3>Teach any move</h3>
        <div className="row"><input list="moveList" autoComplete="off" placeholder="e.g. Flamethrower (TM, tutor, egg move)" style={{ flex: 1 }} value={mvName} onChange={e => setMvName(e.target.value)} />
          <button className="btn" onClick={() => learn(mvName)}>Look up</button></div>
        <details style={{ marginTop: 10 }}><summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Custom homebrew move</summary>
          <div className="grid2" style={{ marginTop: 8 }}>
            <label>Name<input value={cm.name} onChange={e => setCm({ ...cm, name: e.target.value })} /></label>
            <label>Type<select value={cm.type} onChange={e => setCm({ ...cm, type: e.target.value })}>{[...TYPES, 'shadow'].map(t => <option key={t}>{t}</option>)}</select></label>
            <label>Class<select value={cm.cls} onChange={e => setCm({ ...cm, cls: e.target.value as MoveClass })}><option>physical</option><option>special</option><option>status</option></select></label>
            <label>Damage dice<input value={cm.dice} onChange={e => setCm({ ...cm, dice: e.target.value })} /></label>
            <label>PP per rest (blank = at-will)<input type="number" min={1} value={cm.pp} onChange={e => setCm({ ...cm, pp: e.target.value })} /></label>
            <label>Effect<input value={cm.desc} onChange={e => setCm({ ...cm, desc: e.target.value })} /></label>
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={addCustom}>Add custom move</button>
        </details>
      </> : null}
    </details>
  );
}

function Bag({ c, others }: { c: Char; others: Char[] }) {
  const [give, setGive] = useState({ item: 0, to: '' });
  const [found, setFound] = useState({ name: '', qty: 1, note: '' });
  const use = (i: number) => withChar(c.id, x => {
    const r = applyItem(x, i, null, false);
    if (!r) return;
    if (!r.ok) { toast(r.msg, 'bad'); return; }
    addLog(r.msg, 'item'); toast(r.msg);
  });
  /** Put a held item, weapon or armor in its slot; whatever was there goes back in the bag. */
  const hold = (i: number) => withChar(c.id, x => {
    const it = x.items[i], def = defOf(it), slot = slotOf(def);
    if (!it || !def || !slot) return;
    const was = x[slot];
    if (was) addItemTo(x.items, defOf(was) || { n: was.name, id: '', fx: {} }, 1);
    takeOne(x.items, it.name);
    x[slot] = { itemId: def.id, name: def.n };
    clampHP(x);
    addLog(slot === 'held' ? `${nameOf(x)} is now holding ${def.n}.` : `${nameOf(x)} equipped ${def.n}.`);
  });
  const unhold = (slot: 'held' | 'weapon' | 'armor') => withChar(c.id, x => {
    const was = x[slot];
    if (!was) return;
    addItemTo(x.items, defOf(was) || { n: was.name, id: '', fx: {} }, 1);
    addLog(`${nameOf(x)} took off its ${was.name}.`);
    x[slot] = null;
    clampHP(x);
  });
  const store = (i: number) => withChar(c.id, (x, s) => {
    const it = x.items[i];
    if (!it) return;
    addItemTo(s.storage.items, looseDef(it), 1, it.note);
    takeOne(x.items, it.name);
    addLog(`${nameOf(x)} stored 1 ${it.name}.`);
  });
  const drop = (i: number) => run(async () => {
    const it = c.items[i];
    if (!it || !(await ask(`Throw away 1 ${it.name}?`, 'Throw away'))) return;
    withChar(c.id, x => takeOne(x.items, it.name));
  });
  const giveTo = () => {
    const it = c.items[give.item], toId = give.to || others[0]?.id;
    if (!it || !toId) return toast('Pick an item and a teammate.', 'bad');
    withChar(c.id, (x, s) => {
      const to = s.chars.find(y => y.id === toId);
      if (!to) return;
      addItemTo(to.items, looseDef(it), 1, it.note);
      takeOne(x.items, it.name);
      addLog(`${nameOf(x)} gave 1 ${it.name} to ${nameOf(to)}.`);
    });
  };
  const add = () => {
    if (!found.name.trim()) return toast('Type an item name.', 'bad');
    const q = Math.max(1, found.qty || 1), def = defByName(found.name) || { n: found.name.trim(), id: '', fx: {} };
    withChar(c.id, x => { addItemTo(x.items, def, q, found.note); addLog(`${nameOf(x)} put ${q} ${def.n} in the bag.`); });
    setFound({ name: '', qty: 1, note: '' });
  };
  return (
    <details className="card" open>
      <summary>Bag ({c.items.reduce((s, i) => s + i.qty, 0)})</summary>
      {([['held', 'Held item', 'Hold one item from the bag, like a Power Band or Charcoal.'], ['weapon', '⚔️ Weapon', 'Equip a weapon, like Iron Claws or a Mystic Staff.'], ['armor', '🛡️ Armor', 'Equip armor, like a Shell Plate or Leaf Cloak.']] as const).map(([slot, label, empty]) => {
        const it = c[slot];
        return (
          <div className="held" key={slot}><span className="small muted">{label}</span>
            {it ? (
              <div className="row between" style={{ marginTop: 2, flexWrap: 'nowrap' }}>
                <span style={{ minWidth: 0 }}><b>{it.name}</b> <span className="small muted">{defOf(it)?.d || ''}</span></span>
                <button className="btn sm" onClick={() => unhold(slot)}>Take off</button>
              </div>
            ) : <div className="small muted">Nothing. {empty}</div>}
          </div>
        );
      })}
      {c.items.length ? c.items.map((it, i) => {
        const d0 = defOf(it), slot = slotOf(d0);
        return (
          <div className="list-item" key={it.name}>
            <div className="grow"><b>{it.name}</b> {d0 ? <RarChip r={d0.r} /> : null} <span className="mono small">×{it.qty}</span><div className="small muted">{it.note || d0?.d || ''}</div></div>
            {slot ? <button className="btn sm" onClick={() => hold(i)}>{slot === 'held' ? 'Hold' : 'Equip'}</button> : <button className="btn sm primary" onClick={() => use(i)}>Use</button>}
            <button className="btn sm ghost" onClick={() => store(i)}>Store</button>
            <button className="btn sm ghost danger" onClick={() => drop(i)} aria-label="Throw away one">✕</button>
          </div>
        );
      }) : <p className="small muted">Bag is empty. Take items from team Storage.</p>}
      {c.items.length && others.length ? (
        <div className="row" style={{ marginTop: 8 }}>
          <select style={{ flex: 1, minWidth: 120 }} aria-label="Item to give" value={give.item} onChange={e => setGive({ ...give, item: +e.target.value })}>
            {c.items.map((it, i) => <option key={it.name} value={i}>{it.name}</option>)}
          </select>
          <select style={{ flex: 1, minWidth: 120 }} aria-label="Teammate" value={give.to || others[0]?.id} onChange={e => setGive({ ...give, to: e.target.value })}>
            {others.map(x => <option key={x.id} value={x.id}>{nameOf(x)}</option>)}
          </select>
          <button className="btn" onClick={giveTo}>Give to teammate</button>
        </div>
      ) : null}
      <h3>Found something?</h3>
      <div className="grid3" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <input list="itemList" placeholder="Item name" value={found.name} onChange={e => setFound({ ...found, name: e.target.value })} />
        <input type="number" min={1} aria-label="Quantity" value={found.qty} onChange={e => setFound({ ...found, qty: +e.target.value })} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Notes (optional)" style={{ flex: 1 }} value={found.note} onChange={e => setFound({ ...found, note: e.target.value })} />
        <button className="btn" onClick={add}>Add to bag</button>
      </div>
    </details>
  );
}

/** One-time stat roll: six scores were rolled when the Pokémon was made. Its player places them, then they lock for good. */
function StatRoll({ c }: { c: Char }) {
  const dm = isDM();
  const [at, setAt] = useState<Record<string, string>>({});
  if (c.scores) return null;
  const rolls = c.rolled;
  if (!rolls) return dm ? (
    <section className="card callout row between">
      <span><b>🎲 Stat roll</b> <span className="small muted">This Pokémon was made before stat rolls. Roll six scores for its player to place.</span></span>
      <button className="btn primary" onClick={() => withChar(c.id, x => { x.rolled = rollScores(); addLog(`Dennis rolled stats for ${nameOf(x)}: ${x.rolled.join(', ')}.`); })}>Roll stats</button>
    </section>
  ) : null;
  const used = Object.values(at).filter(Boolean), slots: [string, string][] = [...STATS.map(([k, l, d]) => [k, `${l} (${d})`] as [string, string]), ['heart', 'Heart (CHA)']];
  const lock = () => run(async () => {
    if (!(await ask(`Lock in these stats for ${nameOf(c)}? They can't be changed afterwards.`, 'Lock in'))) return;
    update(s => { const x = s.chars.find(y => y.id === c.id); if (x && canEdit(x)) lockScores(x, Object.fromEntries(Object.entries(at).map(([k, v]) => [k, +v]))); });
    toast('Stats locked in.');
  });
  return (
    <section className="card callout">
      <h2 style={{ marginTop: 0 }}>🎲 Your stat rolls</h2>
      <p className="small" style={{ margin: '0 0 8px' }}>The dice rolled these six scores. Put one in each stat, highest where you want to be strongest. This is a one-time choice.</p>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {rolls.map((n, i) => <span key={i} className={`tag ${used.includes(String(i)) ? '' : 'good'}`} style={{ fontSize: 15 }}>{n}</span>)}
      </div>
      <div className="grid3">
        {slots.map(([k, label]) => (
          <label key={k}>{label}
            <select value={at[k] || ''} onChange={e => setAt({ ...at, [k]: e.target.value })}>
              <option value="">Choose…</option>
              {rolls.map((n, i) => (at[k] === String(i) || !used.includes(String(i)) ? <option key={i} value={i}>{n} ({fmt(Math.floor((n - 10) / 2))})</option> : null))}
            </select>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={used.length < 6} onClick={lock}>Lock in my stats</button>
        <button className="btn ghost" disabled={!used.length} onClick={() => setAt({})}>Start over</button>
      </div>
    </section>
  );
}

/** Approve a personality, or send its player back to the quiz (sheet and DM tools). */
export function PersonaDmButtons({ c }: { c: Char }) {
  const set = (ok: boolean) => run(() => update(s => {
    const x = s.chars.find(y => y.id === c.id);
    if (!x?.persona || !isDM()) return;
    if (ok) { x.persona.ok = true; addLog(`Dennis approved ${nameOf(x)}'s personality: ${DEMEANORS[x.persona.demeanor]?.n}, ${natureText(x.persona.nature)}.`); }
    else { delete x.persona; addLog(`Dennis asked ${nameOf(x)}'s player to redo the personality quiz.`); }
    clampHP(x);
  }));
  return <div className="row" style={{ gap: 6 }}><button className="btn sm primary" onClick={() => set(true)}>Approve</button><button className="btn sm" onClick={() => set(false)}>Ask to redo</button></div>;
}

/** Personality: an 8-question quiz gives a nature (a small stat boost) and a demeanor to roleplay. The DM approves the result. */
function PersonaCard({ c }: { c: Char }) {
  const dm = isDM(), p = c.persona;
  const [ans, setAns] = useState<number[] | null>(null);
  const [pick, setPick] = useState({ nature: 'hardy', demeanor: 'steady' });
  const [story, setStory] = useState(['', '', '']);
  if (p?.ok) return (
    <section className="card">
      <InCharacter c={c} />
      {dm ? <button className="btn sm ghost" onClick={() => withChar(c.id, x => { delete x.persona; clampHP(x); })}>Redo the quiz</button> : null}
    </section>
  );
  if (p) return (
    <section className="card callout">
      <h2 style={{ marginTop: 0 }}>Personality</h2>
      <p className="small" style={{ margin: '0 0 4px' }}><b>Waiting for Dennis:</b> {DEMEANORS[p.demeanor]?.n} {DEMEANORS[p.demeanor]?.g}, {natureText(p.nature)}</p>
      <p className="small muted" style={{ margin: '0 0 8px' }}>{DEMEANORS[p.demeanor]?.rule}</p>
      {dm ? <PersonaDmButtons c={c} /> : null}
    </section>
  );
  if (!ans) return (
    <section className="card callout row between">
      <span><b>🎭 Who is {nameOf(c)}?</b> <span className="small muted">{QUIZ.length} quick questions give your Pokémon a nature (a small stat boost) and a demeanor to play.</span></span>
      <button className="btn primary" onClick={() => setAns([])}>Take the quiz</button>
    </section>
  );
  const q = QUIZ[ans.length];
  if (q) return (
    <section className="card callout">
      <div className="small muted">Question {ans.length + 1} of {QUIZ.length}</div>
      <h2 style={{ margin: '4px 0 10px' }}>{q.q}</h2>
      <div className="quiz">
        {q.a.map((o, i) => <button key={i} className="btn" onClick={() => { const next = [...ans, i]; setAns(next); if (next.length === QUIZ.length) setPick(quizResult(next)); }}>{o.t}</button>)}
      </div>
      {ans.length ? <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAns(ans.slice(0, -1))}>← Back</button> : null}
    </section>
  );
  const d = DEMEANORS[pick.demeanor];
  const send = () => {
    withChar(c.id, x => {
      x.persona = { ...pick };
      const lines = STORY_Q.map((sq, i) => (story[i].trim() ? `${sq} ${story[i].trim()}` : '')).filter(Boolean);
      if (lines.length) x.notes = [x.notes, 'Backstory', ...lines].filter(Boolean).join('\n');
      addLog(`${nameOf(x)} finished the personality quiz.`);
    });
    toast('Sent to Dennis for approval.');
  };
  return (
    <section className="card callout">
      <h2 style={{ marginTop: 0 }}>{nameOf(c)} is {d.n} {d.g}</h2>
      <p className="small" style={{ margin: '0 0 8px' }}>{d.rule}</p>
      <div className="grid2 stack">
        <label>Demeanor
          <select value={pick.demeanor} onChange={e => setPick({ ...pick, demeanor: e.target.value })}>{Object.entries(DEMEANORS).map(([k, v]) => <option key={k} value={k}>{v.g} {v.n}</option>)}</select>
        </label>
        <label>Nature
          <select value={pick.nature} onChange={e => setPick({ ...pick, nature: e.target.value })}>{Object.keys(NATURES).map(n => <option key={n} value={n}>{natureText(n)}</option>)}</select>
        </label>
      </div>
      <p className="small muted tip" style={{ margin: '6px 0' }}>The quiz picked these. Change them if they don't feel right. Dennis approves the result.</p>
      <h3>Backstory (optional, saved to your Notes)</h3>
      {STORY_Q.map((sq, i) => <label key={i} style={{ marginBottom: 6 }}>{sq}<input value={story[i]} maxLength={200} onChange={e => setStory(story.map((v, j) => (j === i ? e.target.value : v)))} /></label>)}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={send}>Send to Dennis</button>
        <button className="btn ghost" onClick={() => setAns([])}>Retake the quiz</button>
      </div>
    </section>
  );
}

/** Approve or reject a player's own skill-tree entry (sheet and DM tools). */
export function TreePropButtons({ c, b, i }: { c: Char; b: Branch; i: number }) {
  const set = (ok: boolean) => run(() => update(s => {
    const x = s.chars.find(y => y.id === c.id), nd = x?.tree[b].nodes[i];
    if (!x || !nd?.prop || !isDM()) return;
    if (ok) {
      nd.name = nd.prop.name; nd.desc = nd.prop.desc;
      if (nd.prop.fx) nd.fx = nd.prop.fx; else delete nd.fx;
      addLog(`Dennis approved ${nameOf(x)}'s skill tree entry, ${nd.name}.`);
    } else addLog(`Dennis turned down ${nameOf(x)}'s skill tree entry, ${nd.prop.name}.`);
    delete nd.prop;
    clampHP(x);
  }));
  return <div className="row" style={{ gap: 6, marginTop: 4 }}><button className="btn sm primary" onClick={() => set(true)}>Approve</button><button className="btn sm" onClick={() => set(false)}>Reject</button></div>;
}

/** One skill-tree entry's text and bonus. The DM's changes apply at once; a player's go to the DM for approval. */
function NodeForm({ c, b, i }: { c: Char; b: Branch; i: number }) {
  const dm = isDM(), n = c.tree[b].nodes[i], src = dm ? n : n.prop || n;
  const [name, setName] = useState(src.name);
  const [desc, setDesc] = useState(src.desc);
  const [fx, setFx] = useState(src.fx || '');
  const same = name === src.name && desc === src.desc && fx === (src.fx || '') && (dm || !!n.prop);
  const save = () => {
    if (!name.trim() || !desc.trim()) return toast('Give the entry a name and say what it does.', 'bad');
    const v = { name: name.trim(), desc: desc.trim(), ...(fx ? { fx } : {}) };
    withChar(c.id, x => {
      const nd = x.tree[b].nodes[i];
      if (isDM()) { nd.name = v.name; nd.desc = v.desc; if (fx) nd.fx = fx; else delete nd.fx; delete nd.prop; clampHP(x); }
      else { nd.prop = v; addLog(`${nameOf(x)} wrote a skill tree entry for Dennis to approve: ${v.name}.`); }
    });
    toast(dm ? 'Saved.' : 'Sent to Dennis for approval.');
  };
  return (
    <div className="node">
      <input value={name} aria-label="Skill name" maxLength={40} onChange={e => setName(e.target.value)} />
      <textarea rows={2} value={desc} aria-label="What it does" maxLength={200} onChange={e => setDesc(e.target.value)} />
      <select value={fx} aria-label="Bonus the app applies" onChange={e => setFx(e.target.value)}>
        <option value="">No automatic bonus</option>
        {Object.entries(TREE_FX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <button className="btn sm" style={{ marginTop: 4 }} disabled={same} onClick={save}>{dm ? 'Save' : n.prop ? (same ? 'Waiting for Dennis' : 'Send again') : 'Send to Dennis'}</button>
    </div>
  );
}

function SkillTree({ c }: { c: Char }) {
  const dm = isDM(), edit = canEdit(c), avail = pointsOf(c);
  const [editing, setEditing] = useState(false);
  const tap = (b: Branch, i: number) => withChar(c.id, x => {
    const nodes = x.tree[b].nodes, n = nodes[i];
    if (n.on) {
      if (nodes[i + 1]?.on) { toast('Refund the lower skills first.', 'bad'); return; }
      n.on = false;
      clampHP(x);
    } else {
      if (i > 0 && !nodes[i - 1].on) { toast('Unlock the skill above first.', 'bad'); return; }
      if (pointsOf(x) <= 0) { toast('No skill points left. Level up or earn a Blessing to get more.', 'bad'); return; }
      n.on = true;
      addLog(`${nameOf(x)} unlocked ${n.name}.`);
    }
  });
  return (
    <details className="card">
      <summary>Skill tree · {avail ? `✨ ${avail} point${avail === 1 ? '' : 's'} to spend` : 'no points left'}</summary>
      <div className="row between small muted" style={{ marginBottom: 8 }}>
        <span>{editing && !dm ? 'Rewrite any entry and pick a bonus for the app to apply. Dennis approves each one before it counts.' : '1 point per level, +1 per Blessing. Unlock top to bottom. Tap the last one to refund it.'}</span>
        {edit ? <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : dm ? 'Edit entries' : '✏️ Write my own entries'}</button> : null}
      </div>
      <div className="tree">
        {(['ability', 'special', 'physical'] as const).map(b => (
          <div className="branch" key={b}>
            <h4>{editing && dm ? <Field id={c.id} f={`tree.${b}.label`} value={c.tree[b].label} aria-label="Branch name" /> : c.tree[b].label}</h4>
            {b === 'ability' && c.homebrew?.state === 'approved' ? <p className="small" style={{ margin: '0 0 6px' }}>✨ <b>{c.homebrew.name}</b>: {abilityFxText(c.homebrew.fx)}</p> : null}
            {c.tree[b].nodes.map((n, i) => (
              <div key={i}>
                {editing ? <NodeForm key={n.name + n.desc + (n.fx || '') + (n.prop?.name || '')} c={c} b={b} i={i} /> : (
                  <button className={`node ${n.on ? 'on' : ''}`} aria-pressed={n.on} onClick={() => tap(b, i)}>
                    <b>{n.on ? '✔ ' : ''}{n.name}</b><span>{n.desc}</span>
                    {n.fx ? <span className="nodefx">{TREE_FX[n.fx]} · applied automatically</span> : null}
                  </button>
                )}
                {n.prop ? (
                  <div className="small" style={{ margin: '-2px 0 8px' }}>
                    ⏳ <b>Waiting for Dennis:</b> {n.prop.name}: {n.prop.desc}{n.prop.fx ? ` (${TREE_FX[n.prop.fx]})` : ''}
                    {dm ? <TreePropButtons c={c} b={b} i={i} /> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function Assists({ c }: { c: Char }) {
  const dm = isDM();
  const [a, setA] = useState({ name: '', move: '' });
  return (
    <details className="card">
      <summary>Assists (purified friends)</summary>
      <p className="small muted tip" style={{ marginTop: 0 }}>Purified Shadow Pokémon can be called in once per long rest for one move.</p>
      {c.assists.length ? c.assists.map((x, i) => (
        <div className="list-item" key={i}>
          <div className="grow"><b>{x.name}</b> <span className="small muted">{x.move}</span>{x.note ? <div className="small muted">{x.note}</div> : null}</div>
          <button className={`btn sm ${x.used ? '' : 'primary'}`} onClick={() => withChar(c.id, y => { y.assists[i].used = !y.assists[i].used; })}>{x.used ? 'Used' : 'Ready'}</button>
          {dm ? <button className="btn sm ghost danger" aria-label="Remove assist" onClick={() => withChar(c.id, y => { y.assists.splice(i, 1); })}>✕</button> : null}
        </div>
      )) : <p className="small muted">No assists yet.</p>}
      {dm ? <>
        <div className="grid2" style={{ marginTop: 8 }}>
          <input placeholder="Pokémon" value={a.name} onChange={e => setA({ ...a, name: e.target.value })} />
          <input placeholder="Assist move" value={a.move} onChange={e => setA({ ...a, move: e.target.value })} />
        </div>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => {
          if (!a.name.trim()) return toast('Name the assist Pokémon.', 'bad');
          withChar(c.id, y => { y.assists.push({ name: a.name.trim(), move: a.move.trim(), note: '', used: false }); });
          setA({ name: '', move: '' });
        }}>Add assist</button>
      </> : null}
    </details>
  );
}

function SpeciesData({ c }: { c: Char }) {
  const rank = mastery(c.level);
  const [newForm, setNewForm] = useState('');
  const sel = (f: string, val: string, opts: string[], none?: boolean, disabled?: boolean) => (
    <select value={val} disabled={disabled} onChange={e => setField(c.id, f, e.target.value)}>
      {none ? <option value="">none</option> : null}{opts.map(t => <option key={t}>{t}</option>)}
    </select>
  );
  return (
    <details className="card">
      <summary>Species data (DM)</summary>
      <div className="grid2">
        <label>Type 1{sel('types.0', c.types[0] || '', TYPES)}</label>
        <label>Type 2{sel('types.1', c.types[1] || '', TYPES, true)}</label>
        <label>Awakened type {rank < 3 ? '(Mastery 3)' : ''}{sel('awakenedType', c.awakenedType || '', TYPES, true, rank < 3)}</label>
        <label className="row" style={{ flexDirection: 'row', alignItems: 'center', fontSize: 14, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!c.shiny} onChange={e => setField(c.id, 'shiny', e.target.checked)} /> Shiny
        </label>
        <label>Abilities<Field id={c.id} f="abilitiesText" value={c.abilities.map(T).join(', ')} /></label>
      </div>
      <h3>Base stats</h3>
      <div className="grid3">{(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatKey[]).map(k => (
        <label key={k}>{k.toUpperCase()}<input type="number" min={1} key={c.id + k + c.base[k]} defaultValue={c.base[k]} onBlur={e => { if (+e.target.value !== c.base[k]) setField(c.id, 'base.' + k, e.target.value, true); }} /></label>
      ))}</div>
      <h3>Change species</h3>
      <div className="row">
        <input list="speciesList" placeholder="species to evolve or change into" style={{ flex: 1 }} value={newForm} onChange={e => setNewForm(e.target.value)} />
        <button className="btn" onClick={() => { if (!newForm.trim()) return toast('Type a species first.', 'bad'); withChar(c.id, x => evolve(x, newForm)); setNewForm(''); }}>Evolve into</button>
      </div>
      <p className="small muted tip">Use this for item, friendship or story evolutions, or regional forms.</p>
    </details>
  );
}

const JUMPS = ['Moves', 'Bag', 'Ability', 'Skill tree', 'Stats', 'Pokédex', 'Mega Evolution', 'Assists', 'Notes'];
/** One tap opens a section of the sheet and scrolls to it. Stays under the header while the page scrolls. */
function JumpBar() {
  // The bar sticks right under the app header, whatever height that is on this screen.
  useEffect(() => {
    const h = document.querySelector<HTMLElement>('header.top');
    if (!h) return;
    const set = () => document.documentElement.style.setProperty('--hdr', h.offsetHeight + 'px');
    const ro = new ResizeObserver(set);
    ro.observe(h);
    set();
    return () => ro.disconnect();
  }, []);
  const go = (label: string) => {
    const d = [...document.querySelectorAll<HTMLDetailsElement>('main details.card')].find(x => x.querySelector('summary')?.textContent?.startsWith(label));
    if (!d) return toast(`This Pokémon has no ${label} section.`, 'bad');
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <nav className="jump" aria-label="Jump to a section">{JUMPS.map(l => <button key={l} className="btn sm" onClick={() => go(l)}>{l}</button>)}</nav>;
}

export default function Sheet() {
  const s = useGame(), c = activeChar();
  const [hpAmt, setHpAmt] = useState('');
  if (!c) return null;
  const max = maxHP(c), rank = mastery(c.level), edit = canEdit(c), dm = isDM(), avail = pointsOf(c);
  const targets = c.evo.targets || [];
  const friendEvo = targets.some(t => /friendship/i.test(t.how)), friend = Math.min(3, c.friend || 0);
  const hp = (sign: number) => { const n = Math.abs(+hpAmt || 0); if (!n) return; withChar(c.id, x => { x.hpCur += n * sign; clampHP(x); }); setHpAmt(''); };
  const del = () => run(async () => {
    if (!(await ask(`Delete ${nameOf(c)}? This can't be undone.`, 'Delete'))) return;
    update(st => { st.chars = st.chars.filter(x => x.id !== c.id); st.game.bsetup.pcs = st.game.bsetup.pcs.filter(id => id !== c.id); });
    setUi({ activeId: null, tab: 'party' });
  });

  return (
    <>
      {edit ? null : <div className="banner">You're looking at {nameOf(c)}. Only {c.player || 'the DM'} and the DM can change this sheet.</div>}
      <JumpBar />
      {c.inDungeon ? <div className="banner">🔒 Moves are locked for {s.dungeon.name || 'the dungeon'}. You can still use them and track PP.</div> : null}
      <fieldset className="plain" disabled={!edit}>
        <section className="card">
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <Avatar c={c} size={84} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="name" style={{ fontSize: 22 }}>{nameOf(c)}</div>
              <div className="small muted">{c.shiny ? <><b className="shinytxt">✨ Shiny</b> · </> : null}{T(c.species)}{c.history.length ? ' · was ' + c.history.map(h => h.from).join(', ') : ''}</div>
              <div className="row" style={{ gap: 4, marginTop: 4 }}><Types x={c} /></div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <label className="btn sm filebtn">{c.img ? 'Change picture' : 'Add picture'}
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) readImage(f).then(url => { withChar(c.id, x => { x.img = url; }); toast('Picture updated.'); }, err => toast(err.message, 'bad'));
                    e.target.value = '';
                  }} />
                </label>
                {c.img ? <button className="btn sm ghost" onClick={() => withChar(c.id, x => { x.img = ''; })}>Remove</button> : null}
              </div>
            </div>
          </div>
          <fieldset className="plain" disabled={!dm}>
            <div className="grid2 stack" style={{ marginTop: 12 }}>
              <label>Nickname<Field id={c.id} f="nickname" value={c.nickname} /></label>
              <label>Player
                <select value={players().find(u => u.name.toLowerCase() === String(c.player).toLowerCase())?.name || ''} onChange={e => setField(c.id, 'player', e.target.value)}>
                  <option value="">No player (DM's)</option>{players().map(u => <option key={u.name}>{u.name}</option>)}
                </select>
              </label>
            </div>
            <div className="row between" style={{ marginTop: 12 }}>
              <div className="row">
                {dm ? <button className="btn sm" aria-label="Level down" onClick={() => withChar(c.id, x => changeLevel(x, -1))}>−</button> : null}
                <span className="name">Level {c.level}</span><span className="small muted">(game level {gameLvl(c.level)})</span>
              </div>
              {dm ? <button className="btn gold" disabled={c.level >= MAX_LEVEL} onClick={() => withChar(c.id, x => changeLevel(x, 1))}>Level up ▲</button> : null}
            </div>
          </fieldset>
          <XpBlock c={c} />
          {targets.length ? (
            <fieldset className="plain" disabled={!dm}>
              <div className="grid2 stack" style={{ marginTop: 10 }}>
                <label>Evolves into
                  <select value={c.evoChoice} onChange={e => setField(c.id, 'evoChoice', e.target.value)}>
                    {targets.map(t => <option key={t.name} value={t.name}>{T(t.name)}{t.how ? ` (${t.how})` : ''}</option>)}
                  </select>
                </label>
                <label>Auto-evolve at level (blank = DM decides)
                  <input type="number" min={1} max={20} key={c.id + String(c.evoLevel)} defaultValue={c.evoLevel ?? ''} onBlur={e => { if (e.target.value !== String(c.evoLevel ?? '')) setField(c.id, 'evoLevel', e.target.value, true); }} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {dm ? <button className="btn" onClick={() => withChar(c.id, x => { if (x.evoChoice) evolve(x, x.evoChoice); })}>Evolve now</button> : null}
                <span className="small muted">{c.evoLevel ? `${nameOf(c)} evolves at level ${c.evoLevel}.` : 'Evolves when the DM says so.'}</span>
              </div>
            </fieldset>
          ) : <p className="small muted" style={{ margin: '10px 0 0' }}>{c.custom ? 'Custom Pokémon: the DM can change its species in Species data.' : 'Final form. No further evolutions.'}</p>}
          {friendEvo ? (
            <p className="small" style={{ margin: '8px 0 0' }}><b>Friendship:</b> {friend}/3 long rests holding a Soothe Bell.
              {friend >= 3 ? ' Ready! The DM can tap Evolve now.' : heldFx(c).friend ? '' : <> <span className="muted">Hold a Soothe Bell to build it.</span></>}</p>
          ) : null}
        </section>

        <StatRoll key={'roll:' + c.id} c={c} />
        <PersonaCard key={'persona:' + c.id + (c.persona ? (c.persona.ok ? 'ok' : 'wait') : '')} c={c} />

        <section className="card">
          <div className="row between"><h2 style={{ margin: 0 }}>HP <span className="mono">{c.hpCur} / {max}</span></h2><span className="small muted">Hit die d{hitDie(c)}</span></div>
          <div style={{ margin: '8px 0' }}><HpBar cur={c.hpCur} max={max} /></div>
          <div className="row">
            <input type="number" min={0} placeholder="Amount" aria-label="HP amount" style={{ width: 100 }} value={hpAmt} onChange={e => setHpAmt(e.target.value)} />
            <button className="btn" onClick={() => hp(-1)}>Damage</button>
            <button className="btn" onClick={() => hp(1)}>Heal</button>
            <span style={{ flex: 1 }} />
            {/* Only the DM decides when the team rests. */}
            {dm ? <>
              <button className="btn sm" onClick={() => { const h = shortRestHeal(c); withChar(c.id, x => { x.hpCur += h; clampHP(x); }); toast(`Short rest: healed ${h} HP.`); }}>Short rest</button>
              <button className="btn sm primary" onClick={() => { withChar(c.id, x => { longRest(x); addLog(`${nameOf(x)} took a long rest.`); }); toast('Long rest: HP, PP and assists restored.'); }}>Long rest</button>
            </> : null}
          </div>
          {canEdit(c) ? <AbilityChecks c={c} /> : null}
          <div className="grid3" style={{ marginTop: 12 }}>
            <div className="stat"><b>{AC(c)}</b><small>Guard (vs physical)</small></div>
            <div className="stat"><b>{SAC(c)}</b><small>Sp. Guard (vs special)</small></div>
            <div className="stat"><b>{fmt(M(c, 'spe'))}</b><small>Initiative</small></div>
            <div className="stat"><b>{fmt(prof(c.level))}</b><small>Proficiency</small></div>
            <div className="stat"><b>{rank}</b><small>Type Mastery</small></div>
            <div className="stat"><b>{avail}</b><small>Skill points</small></div>
          </div>
          <p className="small" style={{ margin: '10px 0 0' }}><b>Mastery {rank}:</b> {MASTERY[rank]}{rank < 4 ? <> <span className="muted">Next rank at level {[5, 10, 15][rank - 1]}.</span></> : null}</p>
        </section>

        <Moves c={c} />
        <Bag c={c} others={s.chars.filter(x => x.id !== c.id)} />
        <AbilityCard key={'ability:' + c.id + (c.homebrew?.state || '')} c={c} />
        <SkillTree c={c} />
        <DexCard c={c} />
        <MegaCard key={'mega:' + c.id + (c.mega?.state || '')} c={c} />

        <details className="card" open={dm}>
          <summary>Stats</summary>
          <fieldset className="plain" disabled={!dm}>
            <div className="grid3">
              {STATS.map(([k, l, d]) => (
                <div className="stat" key={k}><small>{l} ({d})</small><b>{score(c, k)}</b><small>{fmt(M(c, k))}</small>
                  {dm ? <input type="number" aria-label={`${l} bonus`} key={c.id + k + (c.bonus[k] || 0)} defaultValue={c.bonus[k] || 0} onBlur={e => { if (+e.target.value !== (c.bonus[k] || 0)) setField(c.id, 'bonus.' + k, e.target.value, true); }} /> : null}
                </div>
              ))}
              <div className="stat"><small>Heart (CHA)</small><b>{score(c, 'heart')}</b><small>{fmt(M(c, 'heart'))}</small>
                {dm ? <input type="number" aria-label="Heart score" key={c.id + 'heart' + c.heart} defaultValue={c.heart || 10} onBlur={e => { if (+e.target.value !== c.heart) setField(c.id, 'heart', e.target.value, true); }} /> : null}
              </div>
            </div>
          </fieldset>
          <p className="small muted tip" style={{ margin: '8px 0 0' }}>{c.scores ? 'Scores were rolled and locked in.' : "Scores come from the Pokémon's base stats until its rolled stats are locked in."}{c.persona?.ok ? ' The modifiers include its nature.' : ''}{dm ? ' The box under each is a bonus for feats or items.' : ''} Heart is used to purify Shadow Pokémon.</p>
        </details>

        <Assists c={c} />
        {dm ? <SpeciesData c={c} /> : null}

        <details className="card">
          <summary>Notes</summary>
          <Field id={c.id} f="notes" value={c.notes} area placeholder="Backstory, bonds, quest notes…" />
        </details>
      </fieldset>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => run(() => exportFile(slug(nameOf(c)) + '.json', { kind: 'pmd-character', char: c }))}>Export this character</button>
        {dm ? <button className="btn danger" onClick={del}>Delete</button> : null}
      </div>
    </>
  );
}

