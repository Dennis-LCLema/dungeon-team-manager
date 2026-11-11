import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { spriteUrl } from '../game/pokeapi';
import { charById, getUi, setUi, toast, useGame, useUi } from '../game/store';
import type { Fighter } from '../game/types';
import { Avatar, TypeChip, run } from './common';
import { Die, stillMotion } from './Dice';
import { sfx } from '../lib/sfx';

export function Toasts() {
  const { toasts } = useUi();
  return (
    <div className="toastbox" role="status" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.msg}</div>)}
    </div>
  );
}

export function Modal() {
  const { modal } = useUi();
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { okRef.current?.focus(); }, [modal]);
  if (!modal) return null;
  if (modal.kind === 'ask') {
    const done = (v: boolean) => { setUi({ modal: null }); modal.resolve(v); };
    return (
      <div className="overlay" onKeyDown={e => { if (e.key === 'Escape') done(false); }}>
        <div className="evobox" role="dialog" aria-modal="true">
          <p style={{ fontSize: 16, margin: '0 0 18px' }}>{modal.msg}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => done(false)}>Cancel</button>
            <button className="btn primary" ref={okRef} onClick={() => done(true)}>{modal.ok}</button>
          </div>
        </div>
      </div>
    );
  }
  const copy = () => run(async () => {
    try { await navigator.clipboard.writeText(modal.text); toast('Copied.'); } catch { toast('Select the text and copy it with your device.'); }
  });
  return (
    <div className="overlay">
      <div className="evobox" role="dialog" aria-modal="true" style={{ maxWidth: 520, textAlign: 'left' }}>
        <h2>{modal.name}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Copy this text and keep it somewhere safe. Paste it into Admin &gt; Import to load it again.</p>
        <textarea readOnly value={modal.text} style={{ minHeight: 200, fontFamily: 'var(--f-mono)', fontSize: 12 }} onFocus={e => e.target.select()} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" onClick={() => setUi({ modal: null })}>Close</button>
          <button className="btn primary" ref={okRef} onClick={copy}>Copy</button>
        </div>
      </div>
    </div>
  );
}

/** Level-ups (on the owner's device), evolutions and Mega Evolutions (on everyone's), one at a time. */
export function EventOverlay() {
  const e = useUi().events[0], id = e?.id, kind = e?.kind;
  useGame();
  useEffect(() => { if (id) sfx(kind === 'item' ? 'item' : 'level'); }, [id, kind]);
  if (!e) return null;
  const close = () => setUi({ events: getUi().events.slice(1) });
  const who = e.name || e.from, live = charById(e.char);
  const face = e.kind === 'level' && live ? live
    : { id: e.char, species: (e.form && spriteUrl(e.form) ? e.form : e.species) || '', types: e.types || [], shiny: e.shiny, megaOn: e.kind === 'mega' ? 0 : null } as Fighter;
  return (
    <div className="overlay" key={e.id} onClick={ev => { if (ev.target === ev.currentTarget) close(); }}>
      <div className="evobox" role="dialog" aria-modal="true">
        <div className="small muted">{e.kind === 'item' ? 'New item!' : e.kind === 'level' ? 'Level up!' : e.kind === 'mega' ? `${who} is reacting to its Mega Stone!` : `What? ${who} is evolving!`}</div>
        {e.kind === 'item' ? <div className="evoface giftface" aria-hidden="true">🎁</div>
          : <div className="evoface"><Avatar c={face} size={120} />{e.kind === 'level' ? <b className="lvlbadge">Lv {e.level}</b> : null}</div>}
        <h2>{e.kind === 'item' ? e.name : e.kind === 'level' ? `${who} reached level ${e.level}!` : e.kind === 'mega' ? `${who} Mega Evolved into ${e.to}!` : `${who} evolved into ${e.to}!`}</h2>
        {e.kind === 'item' ? null : e.kind === 'level'
          ? <ul className="small" style={{ textAlign: 'left', margin: '0 0 14px', paddingLeft: 20 }}>{(e.notes || []).map(n => <li key={n}>{n}</li>)}</ul>
          : <div className="row" style={{ justifyContent: 'center', gap: 4, marginBottom: 14 }}>{(e.types || []).map(t => <TypeChip key={t} t={t} />)}</div>}
        <button className="btn primary" autoFocus onClick={close}>{e.kind === 'item' ? 'Got it' : 'Awesome'}</button>
      </div>
    </div>
  );
}

export function Announce() {
  const s = useGame(), ui = useUi(), a = s.world.announce;
  if (!a || a.id === ui.seenAnn || !ui.meName) return null;
  const ok = () => setUi({ seenAnn: a.id });
  return (
    <div className="overlay sysbg" onClick={ok}>
      <div className={`sysbox tone-${a.tone}`} role="dialog" aria-modal="true" aria-labelledby="sysT" onClick={e => e.stopPropagation()}>
        <div className="sys-top">[ SYSTEM ]</div>
        <div className="sys-title" id="sysT">{a.title}</div>
        <div className="sys-sub">{a.sub}</div>
        <button className="btn primary" autoFocus onClick={ok}>Continue</button>
      </div>
    </div>
  );
}

/** Big hit/miss card shown on every screen after a battle move resolves. */
export function AttackPopup() {
  const { popup: p } = useUi();
  const [landedId, setLandedId] = useState('');
  // The app's own d20 tumbles for a moment before the result shows. Dice typed in by the DM were rolled on the table already.
  const tumble = !!p && !p.status && p.d20 != null && !p.manual && !stillMotion();
  useEffect(() => {
    if (!p) return;
    const wait = tumble ? 750 : 0;
    if (tumble) sfx('dice');
    const show = setTimeout(() => {
      setLandedId(p.id);
      sfx(p.heal ? 'heal' : p.status ? 'status' : !p.hit ? 'miss' : p.ko ? 'ko' : p.crit ? 'crit' : 'hit');
    }, wait);
    const hide = setTimeout(() => setUi({ popup: null }), wait + (p.ko || p.crit ? 4500 : 3500));
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [p, tumble]);
  if (!p) return null;
  const rolling = tumble && landedId !== p.id;
  const kind = p.status ? 'status' : !p.hit ? 'miss' : p.eff === 0 ? 'immune' : p.crit ? 'crit' : 'hit';
  const head = rolling ? 'Rolling…' : p.ability ? 'ABILITY!' : !p.status && !p.hit && p.d20 == null ? 'BLOCKED!'
    : { status: 'STATUS MOVE', miss: p.fumble ? 'MISS! (natural 1)' : 'MISS!', immune: 'NO EFFECT', crit: 'CRITICAL HIT!', hit: 'HIT!' }[kind];
  // On the battle screen the card sits in the page under the scene; on any other tab it floats at the bottom.
  const slot = document.getElementById('hitslot');
  const card = (
    <div className={`hitpop-wrap ${slot ? 'inline' : ''}`} role="status" aria-live="assertive">
      <button className={`hitpop ${rolling ? 'rolling' : kind} ${p.actorSide}`} onClick={() => setUi({ popup: null })} aria-label={`${head} Tap to close`}>
        <div className="hp-who"><b>{p.actor}</b> used <b>{p.move}</b> <TypeChip t={p.moveType} /> on <b>{p.target}</b></div>
        {p.d20 != null && !p.status ? <div className="hp-die"><Die value={p.d20} rolling={rolling} size={68} tone={rolling ? '' : p.crit && p.hit ? 'crit' : p.hit ? '' : 'bad'} /></div> : null}
        <div className="hp-head">{head}</div>
        {rolling ? null : <>
          {p.hit && !p.status && p.dmg ? <div className="hp-dmg mono">−{p.dmg} HP</div> : null}
          {p.status ? <div className="hp-line">{p.save || `Save DC ${p.dc}.`}</div> : p.d20 != null ? (
            <div className="hp-line mono">
              d20 {p.d20}{(p.bonus || 0) >= 0 ? '+' : ''}{p.bonus} = {p.total} vs {p.defName} {p.def}{p.adv ? ' · advantage' : p.dis ? ' · disadvantage' : ''}{p.manual ? ' · real dice' : ''}
            </div>
          ) : null}
          {p.hit && p.eff != null && p.eff !== 1 && p.eff !== 0 ? <div className="hp-line"><b>{p.eff > 1 ? "It's super effective!" : "It's not very effective."}</b></div> : null}
          {p.fx ? <div className="hp-line">Field: {p.fx}</div> : null}
          {p.extra ? <div className="hp-line">{p.extra}</div> : null}
          {p.hit && p.hpMax ? <div className="hp-line">{p.ko ? <b>{p.target} is down!</b> : <>{p.target}: {p.hpLeft}/{p.hpMax} HP left</>}</div> : null}
        </>}
      </button>
    </div>
  );
  return slot ? createPortal(card, slot) : card;
}
