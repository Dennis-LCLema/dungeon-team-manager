import { useState, type ReactNode } from 'react';
import { LIGHT_TYPES, RAR, TCOL } from '../game/data';
import { MAX_LEVEL, levelCap, megaOf, nameOf, typesOf, xpNeed } from '../game/rules';
import { toast } from '../game/store';
import type { Char, Fighter } from '../game/types';
import { spriteUrl } from '../game/pokeapi';
import { Sprite, hasSprite } from './sprites';

/** Run a click handler and show any error as a toast instead of crashing. */
export function run(fn: () => unknown) {
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'bad');
  try {
    const r = fn();
    if (r instanceof Promise) r.catch(fail);
  } catch (e) { fail(e); }
}

export const TypeChip = ({ t }: { t: string }) => (
  <span className="chip" style={{ background: TCOL[t] || '#888', color: LIGHT_TYPES.includes(t) ? '#1b1b1b' : '#fff' }}>{t}</span>
);
export const Types = ({ x }: { x: Fighter }) => <>{typesOf(x).map(t => <TypeChip key={t} t={t} />)}</>;
export const RarChip = ({ r }: { r?: string }) => (r ? <span className={`rar r-${r}`}>{RAR[r]}</span> : null);

export function Avatar({ c, size = 48 }: { c: Fighter; size?: number }) {
  const t = typesOf(c), a = TCOL[t[0]] || '#888', b = TCOL[t[1] || t[0]] || a;
  const sh = c.shiny ? <span className="shiny-dot" title="Shiny" aria-label="Shiny">✨</span> : null;
  const [broken, setBroken] = useState('');
  // A Mega Evolved Pokémon shows its Mega form's sprite, when the app has one.
  const mega = c.megaOn != null ? spriteUrl(megaOf(c)?.[0] || '', c.shiny) : null, own = mega ? '' : c.img;
  const api = own ? null : mega || spriteUrl(c.species, c.shiny), px = api && broken !== api ? api : null;
  if (own || px || hasSprite(c.species)) {
    return (
      <div className="avatar-w">{sh}
        <div className={`avatar pic ${c.megaOn != null ? 'is-mega' : ''}`} style={{ width: size, height: size, background: `linear-gradient(135deg,${a}40,${b}40)` }}>
          {own ? <img src={own} alt="" />
            : px ? <img className="px" src={px} alt="" onError={() => setBroken(px)} />
            : <Sprite species={c.species} size={Math.round(size * 0.86)} />}
        </div>
      </div>
    );
  }
  return (
    <div className="avatar-w">{sh}
      <div className={`avatar ${c.shiny ? 'is-shiny' : ''} ${c.megaOn != null ? 'is-mega' : ''}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `linear-gradient(135deg,${a},${b})` }}>
        {(nameOf(c)[0] || '?').toUpperCase()}
      </div>
    </div>
  );
}

export function HpBar({ cur, max }: { cur: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return (
    <div className={`bar ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}`} role="progressbar" aria-label="HP" aria-valuemin={0} aria-valuemax={max} aria-valuenow={cur}>
      <i style={{ width: pct + '%' }} />
    </div>
  );
}

export function XpBlock({ c }: { c: Char }) {
  const need = xpNeed(c.level), xp = Math.min(c.xp || 0, need), max = c.level >= MAX_LEVEL, cap = levelCap(), capped = !max && c.level >= cap;
  return (
    <div className="xpwrap">
      <div className="row between small"><b>XP</b><span className="mono">{max ? 'Max level' : `${xp} / ${need}`}</span></div>
      <div className={`bar xp ${capped ? 'capped' : ''}`} role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={need} aria-valuenow={xp}>
        <i style={{ width: (max ? 100 : Math.round((xp / need) * 100)) + '%' }} />
      </div>
      <div className="small muted">
        {max ? '' : capped ? `Level cap ${cap} reached. Beat the next Gatekeeper for a Blessing that raises it.` : `${need - xp} XP to level ${c.level + 1} · Level cap ${cap}`}
        {c.blessings ? ` · ${c.blessings} Blessing${c.blessings > 1 ? 's' : ''}` : ''}
      </div>
    </div>
  );
}

export const Card = ({ className = '', children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) => (
  <section className={`card ${className}`} {...rest}>{children}</section>
);

export function Callout({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <section className="card callout row between">{children}{action}</section>;
}
