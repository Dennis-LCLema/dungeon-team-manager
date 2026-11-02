import { useState } from 'react';
import { Catalog } from '../components/Catalog';
import { Avatar, RarChip, run } from '../components/common';
import { ITEMS } from '../game/data';
import { addItemTo, defOf, looseDef, nameOf } from '../game/rules';
import { addLog, canEdit, isDM, me, toast, update, useGame } from '../game/store';
import { money } from '../lib/util';

export default function Storage() {
  const s = useGame(), dm = isDM(), st = s.storage;
  const mine = s.chars.filter(canEdit);
  const [toId, setToId] = useState('');
  const target = mine.find(c => c.id === toId) || mine[0];
  const bags = mine.filter(c => c.items.length);

  const take = (i: number) => update(d => {
    const to = d.chars.find(x => x.id === target?.id), it = d.storage.items[i];
    if (!to || !canEdit(to)) return toast('Pick one of your Pokémon to receive it.', 'bad');
    if (!it) return;
    addItemTo(to.items, looseDef(it), 1, it.note);
    it.qty -= 1;
    if (it.qty <= 0) d.storage.items.splice(i, 1);
    addLog(`${nameOf(to)} took 1 ${it.name} from storage.`);
  });
  const sell = (i: number) => update(d => {
    const it = d.storage.items[i], pr = Math.floor((defOf(it)?.v || 0) / 2);
    if (!it || !pr) return toast("Kecleon won't buy that.", 'bad');
    it.qty -= 1;
    if (it.qty <= 0) d.storage.items.splice(i, 1);
    d.storage.poke = (d.storage.poke || 0) + pr;
    addLog(`${me()?.name} sold 1 ${it.name} for ${money(pr)}.`);
  });
  const dropOne = (i: number) => update(d => { const it = d.storage.items[i]; if (!it) return; it.qty -= 1; if (it.qty <= 0) d.storage.items.splice(i, 1); });
  const store = (cid: string, i: number) => run(() => update(d => {
    const owner = d.chars.find(x => x.id === cid);
    if (!owner || !canEdit(owner)) return toast('You can only store items from your own bag.', 'bad');
    const it = owner.items[i];
    if (!it) return;
    addItemTo(d.storage.items, looseDef(it), 1, it.note);
    it.qty -= 1;
    if (it.qty <= 0) owner.items.splice(i, 1);
    addLog(`${nameOf(owner)} stored 1 ${it.name}.`);
  }));

  return (
    <>
      <section className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Team storage</h2><span className="mono" style={{ fontWeight: 700 }}>{money(st.poke)}</span></div>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>Shared by the whole team. Take items into a bag before a dungeon.</p>
        {mine.length ? (
          <label style={{ marginBottom: 8 }}>Take items into
            <select value={target?.id} onChange={e => setToId(e.target.value)}>
              {mine.map(c => <option key={c.id} value={c.id}>{nameOf(c)}'s bag</option>)}
            </select>
          </label>
        ) : null}
        {st.items.length ? st.items.map((it, i) => {
          const d0 = defOf(it);
          return (
            <div className="list-item" key={it.name}>
              <div className="grow"><b>{it.name}</b> {d0 ? <RarChip r={d0.r} /> : null} <span className="mono small">×{it.qty}</span>
                <div className="small muted">{it.note || d0?.d || ''}</div></div>
              {mine.length ? <button className="btn sm primary" onClick={() => take(i)}>Take 1</button> : null}
              {dm && d0?.v ? <button className="btn sm" onClick={() => sell(i)}>Sell {money(Math.floor(d0.v / 2))}</button> : null}
              {dm ? <button className="btn sm ghost" onClick={() => dropOne(i)} aria-label="Remove one">−</button> : null}
            </div>
          );
        }) : <p className="small muted">Storage is empty.</p>}
      </section>
      {bags.length ? (
        <section className="card"><h2>Put items back</h2>
          {bags.map(c => c.items.map((it, i) => (
            <div className="list-item" key={c.id + it.name}>
              <Avatar c={c} size={28} />
              <span className="grow">{it.name} <span className="mono small">×{it.qty}</span> <span className="small muted">· {nameOf(c)}</span></span>
              <button className="btn sm" onClick={() => store(c.id, i)}>Store 1</button>
            </div>
          )))}
        </section>
      ) : null}
      <details className="card"><summary>Item guide ({ITEMS.length})</summary><Catalog /></details>
    </>
  );
}
