import { Avatar } from '../components/common';
import { nameOf } from '../game/rules';
import { me } from '../game/store';
import type { Char } from '../game/types';
import { PersonaCard, StatRoll } from './Sheet';

/** What a player sees before the adventure starts: a waiting screen until the DM gives them a Pokémon,
    then that Pokémon's two set-up steps (stat roll, personality quiz). The rest of the app opens once both are done. */
export default function Setup({ c }: { c: Char | null }) {
  if (!c) return (
    <section className="card callout" style={{ textAlign: 'center', padding: '36px 20px' }}>
      <div style={{ fontSize: 44 }} aria-hidden="true">🥚</div>
      <h2 style={{ margin: '8px 0 4px' }}>Welcome, {me()?.name}!</h2>
      <p style={{ margin: 0 }}><span className="spin" /> Waiting for Dennis to choose your Pokémon…</p>
      <p className="small muted" style={{ margin: '10px 0 0' }}>This screen changes by itself as soon as he does.</p>
    </section>
  );
  const step = c.scores ? 2 : 1;
  return (
    <>
      <section className="card">
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
          <Avatar c={c} size={64} />
          <div>
            <h2 style={{ margin: 0 }}>Get {nameOf(c)} ready</h2>
            <div className="small">Step {step} of 2: {step === 1 ? 'roll and place its stats' : 'take the personality quiz'}</div>
            <div className="small muted">{c.scores ? '✔ Stats locked in' : '① Stats'} · {c.persona ? '✔ Quiz done' : '② Personality quiz'}</div>
          </div>
        </div>
      </section>
      {step === 1 ? <StatRoll key={'roll:' + c.id} c={c} /> : <PersonaCard key={'persona:' + c.id} c={c} />}
    </>
  );
}
