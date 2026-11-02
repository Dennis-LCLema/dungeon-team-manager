import { useEffect, useRef } from 'react';
import { TCOL } from '../game/data';
import { setUi, toast, useGame, useUi } from '../game/store';
import { TypeChip, run } from './common';

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

export function EvoOverlay() {
  const { evo } = useUi();
  if (!evo) return null;
  const a = TCOL[evo.types[0]] || '#888', b = TCOL[evo.types[1] || evo.types[0]] || a;
  const close = () => setUi({ evo: null });
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="evobox" role="dialog" aria-modal="true">
        <div className="small muted">What? {evo.name || evo.from} is evolving!</div>
        <div className="evoorb" style={{ background: `linear-gradient(135deg,${a},${b})` }}>
          {evo.img ? <img src={evo.img} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : evo.to[0]}
        </div>
        <h2>{evo.name || evo.from} evolved into {evo.to}!</h2>
        <div className="row" style={{ justifyContent: 'center', gap: 4, marginBottom: 14 }}>{evo.types.map(t => <TypeChip key={t} t={t} />)}</div>
        <button className="btn primary" autoFocus onClick={close}>Awesome</button>
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
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => setUi({ popup: null }), p.ko || p.crit ? 4500 : 3500);
    return () => clearTimeout(t);
  }, [p]);
  if (!p) return null;
  const kind = p.status ? 'status' : !p.hit ? 'miss' : p.eff === 0 ? 'immune' : p.crit ? 'crit' : 'hit';
  const head = { status: 'STATUS MOVE', miss: p.fumble ? 'MISS! (natural 1)' : 'MISS!', immune: 'NO EFFECT', crit: 'CRITICAL HIT!', hit: 'HIT!' }[kind];
  return (
    <div className="hitpop-wrap" role="status" aria-live="assertive">
      <button className={`hitpop ${kind} ${p.actorSide}`} onClick={() => setUi({ popup: null })} aria-label={`${head} Tap to close`}>
        <div className="hp-who"><b>{p.actor}</b> used <b>{p.move}</b> <TypeChip t={p.moveType} /> on <b>{p.target}</b></div>
        <div className="hp-head">{head}</div>
        {p.hit && !p.status && p.dmg ? <div className="hp-dmg mono">−{p.dmg} HP</div> : null}
        {p.status ? <div className="hp-line">Save DC {p.dc}. The DM resolves the effect.</div> : (
          <div className="hp-line mono">
            d20 {p.d20}{(p.bonus || 0) >= 0 ? '+' : ''}{p.bonus} = {p.total} vs {p.defName} {p.def}{p.adv ? ' · advantage' : p.dis ? ' · disadvantage' : ''}
          </div>
        )}
        {p.hit && p.eff != null && p.eff !== 1 && p.eff !== 0 ? <div className="hp-line"><b>{p.eff > 1 ? "It's super effective!" : "It's not very effective."}</b></div> : null}
        {p.fx ? <div className="hp-line">Field: {p.fx}</div> : null}
        {p.extra ? <div className="hp-line">{p.extra}</div> : null}
        {p.hit && p.hpMax ? <div className="hp-line">{p.ko ? <b>{p.target} is down!</b> : <>{p.target}: {p.hpLeft}/{p.hpMax} HP left</>}</div> : null}
      </button>
    </div>
  );
}
