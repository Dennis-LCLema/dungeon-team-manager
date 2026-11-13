import { useState } from 'react';
import { Catalog } from '../components/Catalog';
import { Avatar, HpBar, RarChip, run } from '../components/common';
import { DEMEANORS, DIFF, ITEMS, TREE_FX } from '../game/data';
import { abilityFxText, natureText, addItemTo, addLoot, avgLevel, defByName, diff, giveLine, longRest, maxHP, nameOf, processLevelUps, rollChest, rollDrop, shortRestHeal } from '../game/rules';
import { addLog, ask, me, toast, update, useGame } from '../game/store';
import type { LootLine } from '../game/types';
import { clampN, money, rollExpr } from '../lib/util';
import { HomebrewDmButtons, MegaDmButtons, PersonaDmButtons, TreePropButtons } from './Sheet';

function Recipients({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const chars = useGame().chars;
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
      <option value="storage">Team storage</option>
      {chars.map(c => <option key={c.id} value={c.id}>{nameOf(c)}{c.player ? ` (${c.player})` : ''}</option>)}
    </select>
  );
}

function LootCard() {
  const s = useGame(), lines = s.loot.lines;
  const [picks, setPicks] = useState<Record<string, string>>({});
  const to = (l: LootLine) => picks[l.id] || l.to;
  const recipName = (id: string) => { const c = s.chars.find(x => x.id === id); return c ? nameOf(c) : 'Team storage'; };
  const giveOne = (l: LootLine) => update(d => { const x = d.loot.lines.find(y => y.id === l.id); if (!x) return; giveLine(x, to(l)); d.loot.lines = d.loot.lines.filter(y => y.id !== l.id); });
  const giveAll = () => { update(d => { d.loot.lines.forEach(l => giveLine(l, to(l))); d.loot.lines = []; }); toast('All loot handed out.'); };
  const discardAll = () => run(async () => { if (await ask('Throw away all the waiting loot?', 'Discard all')) update(d => { d.loot.lines = []; }); });
  return (
    <section className={`card ${lines.length ? 'callout' : ''}`}>
      <div className="row between"><h2 style={{ margin: 0 }}>Loot to hand out</h2>
        {lines.length ? <div className="row"><button className="btn sm primary" onClick={giveAll}>Give all as picked</button><button className="btn sm ghost danger" onClick={discardAll}>Discard all</button></div> : null}
      </div>
      {lines.length ? lines.map(l => (
        <div className="loot" key={l.id}>
          <div><b>{l.kind === 'money' ? money(l.money) : l.name}</b> {l.kind === 'item' ? <RarChip r={l.r} /> : null}<div className="small muted">From {l.src}{l.roll ? ' · ' + l.roll : ''}</div></div>
          {l.kind === 'item' ? <div className="small" style={{ margin: '4px 0' }}>{l.desc}</div> : null}
          <div className="small sug">Suggested: <b>{recipName(l.to)}</b>. {l.why}.</div>
          <div className="row" style={{ marginTop: 8 }}>
            {l.kind === 'item' ? <Recipients label="Give to" value={to(l)} onChange={v => setPicks({ ...picks, [l.id]: v })} /> : <span className="small muted" style={{ flex: 1 }}>Adds to the team bank</span>}
            <button className="btn sm primary" onClick={() => giveOne(l)}>Give</button>
            <button className="btn sm ghost" aria-label="Discard" onClick={() => update(d => { d.loot.lines = d.loot.lines.filter(x => x.id !== l.id); })}>✕</button>
          </div>
        </div>
      )) : <p className="small muted" style={{ margin: 0 }}>Nothing waiting. Win a battle or open a chest and the app rolls loot here, with a pick for who should get each item.</p>}
    </section>
  );
}

export default function DM() {
  const s = useGame();
  const [lr, setLr] = useState({ lvl: avgLevel(), src: 'wild', n: 1 });
  const [xp, setXp] = useState({ amt: '', to: 'team' });
  const [gift, setGift] = useState({ item: '', qty: 1, to: 'storage', money: '' });
  const [dice, setDice] = useState({ expr: '', post: false, rolls: [] as string[] });
  const [catTo, setCatTo] = useState('storage');
  const trials = s.chars.filter(x => x.mega && (x.mega.state === 'pending' || x.mega.state === 'active'));
  const homebrews = s.chars.filter(x => x.homebrew?.state === 'pending');
  const entries = s.chars.flatMap(x => (['ability', 'special', 'physical'] as const).flatMap(b => (x.tree?.[b]?.nodes || []).map((n, i) => ({ x, b, i, n })).filter(e => e.n.prop)));

  const rollLoot = () => update(() => {
    const lvl = clampN(lr.lvl || 1, 1, 20), n = clampN(lr.n || 1, 1, 6), lines: LootLine[] = [];
    for (let i = 0; i < n; i++) {
      if (lr.src === 'chest') lines.push(...rollChest(lvl, false));
      else lines.push(...rollDrop({ name: lr.src === 'boss' ? 'Boss' : lr.src === 'shadow' ? 'Shadow Pokémon' : 'Wild Pokémon', level: lvl, shadow: lr.src !== 'wild' }, { boss: lr.src === 'boss' }));
    }
    if (!lines.length) toast('The roll came up empty. Nothing dropped.');
    addLoot(lines);
  });
  const giveXp = () => {
    const amt = Math.round(+xp.amt || 0);
    if (amt <= 0) return toast('Type an XP amount.', 'bad');
    update(d => {
      const list = xp.to === 'team' ? d.chars.filter(x => x.player && !x.reserve && x.hpCur > 0) : d.chars.filter(x => x.id === xp.to);
      if (!list.length) { toast('Nobody to give XP to.', 'bad'); return; }
      list.forEach(x => { x.xp = (x.xp || 0) + amt; });
      addLog(`${me()?.name} gave ${amt} XP to ${xp.to === 'team' ? 'the team' : nameOf(list[0])}.`);
      processLevelUps();
    });
    setXp({ ...xp, amt: '' });
  };
  const giveItem = () => {
    if (!gift.item.trim()) return toast('Type an item name.', 'bad');
    const q = clampN(gift.qty || 1, 1, 99), def = defByName(gift.item) || { n: gift.item.trim(), id: '', fx: {} };
    update(d => {
      const c2 = d.chars.find(x => x.id === gift.to);
      addItemTo(c2 ? c2.items : d.storage.items, def, q);
      addLog(`${me()?.name} gave ${q} ${def.n} to ${c2 ? nameOf(c2) : 'team storage'}.`);
    });
    toast(`Gave ${q} ${def.n}.`);
    setGift({ ...gift, item: '' });
  };
  const giveMoney = () => {
    const a = Math.round(+gift.money || 0);
    if (!a) return toast('Type an amount.', 'bad');
    update(d => { d.storage.poke = Math.max(0, (d.storage.poke || 0) + a); addLog(a > 0 ? `${money(a)} added to the team bank.` : `${money(-a)} taken from the team bank.`); });
    setGift({ ...gift, money: '' });
  };
  const rollDice = (e: string) => {
    const r = rollExpr(e);
    if (!r) return toast('Use a roll like 2d6+3 or d20.', 'bad');
    setDice(d => ({ ...d, rolls: [r, ...d.rolls].slice(0, 8) }));
    if (dice.post) update(() => addLog(`${me()?.name} rolled ${r}`));
  };

  return (
    <>
      <LootCard />
      {trials.length ? (
        <section className="card callout"><h2>Mega Trials</h2>
          {trials.map(x => (
            <div className="loot" key={x.id}>
              <b>{nameOf(x)}</b> <span className="small muted">{x.player} · {x.mega!.state === 'pending' ? 'waiting for approval' : 'in progress'}</span>
              <p className="small" style={{ margin: '6px 0' }}>"{x.mega!.trial}"</p>
              <MegaDmButtons c={x} sm />
            </div>
          ))}
        </section>
      ) : null}

      {s.chars.some(x => x.persona && !x.persona.ok) ? (
        <section className="card callout"><h2>Personalities</h2>
          {s.chars.filter(x => x.persona && !x.persona.ok).map(x => (
            <div className="loot" key={x.id}>
              <b>{nameOf(x)}</b> <span className="small muted">{x.player}</span>
              <p className="small" style={{ margin: '6px 0' }}><b>{DEMEANORS[x.persona!.demeanor]?.n}:</b> {DEMEANORS[x.persona!.demeanor]?.rule} <span className="muted">{natureText(x.persona!.nature)}</span></p>
              <PersonaDmButtons c={x} />
            </div>
          ))}
        </section>
      ) : null}

      {entries.length ? (
        <section className="card callout"><h2>Skill tree entries</h2>
          {entries.map(e => (
            <div className="loot" key={e.x.id + e.b + e.i}>
              <b>{nameOf(e.x)}</b> <span className="small muted">{e.x.player} · replaces “{e.n.name}”</span>
              <p className="small" style={{ margin: '6px 0' }}><b>{e.n.prop!.name}:</b> {e.n.prop!.desc} <span className="muted">{e.n.prop!.fx ? `${TREE_FX[e.n.prop!.fx]}, applied automatically.` : 'No automatic bonus.'}</span></p>
              <TreePropButtons c={e.x} b={e.b} i={e.i} />
            </div>
          ))}
        </section>
      ) : null}

      {homebrews.length ? (
        <section className="card callout"><h2>Homebrew abilities</h2>
          {homebrews.map(x => (
            <div className="loot" key={x.id}>
              <b>{nameOf(x)}</b> <span className="small muted">{x.player}</span>
              <p className="small" style={{ margin: '6px 0' }}><b>{x.homebrew!.name}:</b> {x.homebrew!.desc} <span className="muted">{abilityFxText(x.homebrew!.fx)}</span></p>
              <HomebrewDmButtons c={x} sm />
            </div>
          ))}
        </section>
      ) : null}

      <section className="card"><h2>Difficulty</h2>
        <div className="row" role="group" aria-label="Difficulty">
          {Object.entries(DIFF).map(([k, v]) => {
            const on = (s.rules.difficulty || 'normal') === k;
            return <button key={k} className={`btn sm ${on ? 'primary' : ''}`} aria-pressed={on} onClick={() => update(d => { d.rules.difficulty = k; addLog(`Difficulty set to ${v.n}.`); })}>{v.n}</button>;
          })}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>{diff().d} Damage changes right away. HP changes apply to newly rolled enemies.</p>
      </section>

      <section className="card"><h2>Roll loot</h2>
        <div className="grid3">
          <label>Level<input type="number" min={1} max={20} value={lr.lvl} onChange={e => setLr({ ...lr, lvl: +e.target.value })} /></label>
          <label>Source<select value={lr.src} onChange={e => setLr({ ...lr, src: e.target.value })}><option value="wild">Wild Pokémon</option><option value="shadow">Shadow Pokémon</option><option value="chest">Treasure chest</option><option value="boss">Boss</option></select></label>
          <label>How many<input type="number" min={1} max={6} value={lr.n} onChange={e => setLr({ ...lr, n: +e.target.value })} /></label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={rollLoot}>Roll loot</button>
        <details style={{ marginTop: 12 }}><summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>How loot is rolled</summary>
          <ul className="small" style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            <li>Each defeated enemy rolls d100: 1–30 nothing, 31–55 Poké, 56+ an item. Shadow +10, purified +10, boss +30.</li>
            <li>Item rarity rolls another d100 by level: levels 1–4 mostly Common, 5–10 more Uncommon, 11–16 Rare shows up, 17–20 Very rare and Legendary.</li>
            <li>Shadow Pokémon also have a 50% chance to drop a Shadow Shard. About 1 in 8 Uncommon or Rare drops is a TM.</li>
            <li>Chests always give an item and coins, with a 15% chance of a locked Treasure Box.</li>
            <li>Money is Poké (₽). For D&amp;D prices, 1 gp = ₽ 100, 1 sp = ₽ 10, 1 cp = ₽ 1. Shops buy at half value.</li>
          </ul>
        </details>
      </section>

      <section className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Team status</h2>
          <div className="row">
            <button className="btn sm" onClick={() => update(d => { d.chars.forEach(x => { x.hpCur = Math.min(maxHP(x), x.hpCur + shortRestHeal(x)); }); addLog('The team took a short rest.'); })}>Short rest all</button>
            <button className="btn sm primary" onClick={() => update(d => { d.chars.forEach(longRest); addLog('The team took a long rest. HP, PP and assists are restored.'); })}>Long rest all</button>
          </div>
        </div>
        {s.chars.length ? s.chars.map(c => (
          <div className="list-item" key={c.id}>
            <Avatar c={c} size={32} />
            <span className="grow"><b>{nameOf(c)}</b> <span className="small muted">{c.player || 'DM'} · Lv {c.level}{c.held ? ' · holds ' + c.held.name : ''}</span>
              <div style={{ marginTop: 4 }}><HpBar cur={c.hpCur} max={maxHP(c)} /></div></span>
            <span className="mono small">{c.hpCur}/{maxHP(c)}</span>
            {[-5, 5].map(dd => <button key={dd} className="btn sm" onClick={() => update(d => { const x = d.chars.find(y => y.id === c.id); if (x) x.hpCur = clampN(x.hpCur + dd, 0, maxHP(x)); })}>{dd > 0 ? '+5' : '−5'}</button>)}
          </div>
        )) : <p className="small muted">No Pokémon yet.</p>}
      </section>

      <section className="card"><h2>Give XP</h2>
        <div className="row">
          <input type="number" min={1} placeholder="e.g. 50" style={{ width: 110 }} aria-label="XP amount" value={xp.amt} onChange={e => setXp({ ...xp, amt: e.target.value })} />
          <select style={{ flex: 1, minWidth: 150 }} aria-label="Give XP to" value={xp.to} onChange={e => setXp({ ...xp, to: e.target.value })}>
            <option value="team">Whole team (not fainted)</option>
            {s.chars.map(c => <option key={c.id} value={c.id}>{nameOf(c)}{c.player ? ` (${c.player})` : ''}</option>)}
          </select>
          <button className="btn primary" onClick={giveXp}>Give XP</button>
        </div>
        <p className="small muted tip" style={{ marginBottom: 0 }}>For story moments, puzzles and good roleplay. Level ups and evolutions happen on their own.</p>
      </section>

      <section className="card"><h2>Give an item or money</h2>
        <div className="grid3" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <input list="itemList" placeholder="Item name (or TM + move name)" value={gift.item} onChange={e => setGift({ ...gift, item: e.target.value })} />
          <input type="number" min={1} aria-label="Quantity" value={gift.qty} onChange={e => setGift({ ...gift, qty: +e.target.value })} />
        </div>
        <div className="row" style={{ marginTop: 8 }}><Recipients label="Give to" value={gift.to} onChange={v => setGift({ ...gift, to: v })} /><button className="btn primary" onClick={giveItem}>Give item</button></div>
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ flex: 1 }}>Poké to the team bank (negative to take)<input type="number" placeholder="e.g. 250" value={gift.money} onChange={e => setGift({ ...gift, money: e.target.value })} /></label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={giveMoney}>Add ₽</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Team bank: <b className="mono">{money(s.storage.poke)}</b></p>
      </section>

      <section className="card"><h2>Dice</h2>
        <div className="dicebar">{['d20', 'd20 adv', 'd20 dis', 'd4', 'd6', 'd8', 'd10', 'd12', 'd100'].map(x => <button key={x} className="btn sm" onClick={() => rollDice(x)}>{x}</button>)}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="e.g. 2d6+3" aria-label="Dice roll" style={{ flex: 1 }} value={dice.expr} onChange={e => setDice({ ...dice, expr: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') rollDice(dice.expr); }} />
          <button className="btn" onClick={() => rollDice(dice.expr)}>Roll</button>
          <label className="row" style={{ flexDirection: 'row', fontSize: 13, color: 'var(--ink)' }}><input type="checkbox" checked={dice.post} onChange={e => setDice({ ...dice, post: e.target.checked })} /> Show players</label>
        </div>
        {dice.rolls.length ? <div className="log" style={{ marginTop: 8 }}>{dice.rolls.map((r, i) => <p key={i} className="mono">{r}</p>)}</div>
          : <p className="small muted tip" style={{ marginBottom: 0 }}>Rolls stay on your screen unless you tick Show players.</p>}
      </section>

      <section className="card"><h2>Item catalog</h2>
        <p className="small muted tip" style={{ marginTop: 0 }}>{ITEMS.length} Pokémon and D&amp;D-style items, plus TMs for any damaging move. Give sends one to:</p>
        <div className="row" style={{ marginBottom: 8 }}><Recipients label="Catalog gives to" value={catTo} onChange={setCatTo} /></div>
        <Catalog onGive={def => {
          update(d => {
            const c2 = d.chars.find(x => x.id === catTo);
            addItemTo(c2 ? c2.items : d.storage.items, def, 1);
            addLog(`${me()?.name} gave ${def.n} to ${c2 ? nameOf(c2) : 'team storage'}.`);
          });
          toast(`Gave ${def.n} to ${s.chars.find(x => x.id === catTo) ? nameOf(s.chars.find(x => x.id === catTo)!) : 'team storage'}.`);
        }} />
      </section>
    </>
  );
}
