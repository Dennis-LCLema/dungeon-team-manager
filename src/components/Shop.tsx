import { defOf, giveLine } from '../game/rules';
import { addLog, me, toast, update, useGame } from '../game/store';
import type { LootLine, Shared } from '../game/types';
import { money } from '../lib/util';
import { RarChip } from './common';

/** Buy one stock line. `find` returns the live stock list inside the update. */
export function buy(find: (s: Shared) => LootLine[] | undefined, i: number) {
  update(s => {
    const st = find(s)?.[i];
    if (!st || st.sold) return;
    if ((s.storage.poke || 0) < (st.price || 0)) { toast(`Not enough money. You need ${money(st.price)}.`, 'bad'); return; }
    s.storage.poke -= st.price || 0;
    st.sold = true;
    giveLine(st, 'storage');
    addLog(`${me()?.name} bought ${st.name} for ${money(st.price)}. It went to team storage.`);
  });
}

export function ShopList({ stock, onBuy }: { stock: LootLine[] | undefined; onBuy: (i: number) => void }) {
  const poke = useGame().storage.poke;
  return (
    <>
      {(stock || []).map((s, i) => (
        <div className="list-item" key={s.id}>
          <div className="grow"><b>{s.name}</b> <RarChip r={s.r} />{s.special ? <> <span className="tag good">Rare find</span></> : null}<div className="small muted">{s.desc}</div></div>
          <span className="mono small">{money(s.price)}</span>
          {s.sold ? <span className="tag">Sold</span> : <button className="btn sm primary" disabled={poke < (s.price || 0)} onClick={() => onBuy(i)}>Buy</button>}
        </div>
      ))}
    </>
  );
}

export function SellList() {
  const items = useGame().storage.items;
  const sell = (i: number) => update(s => {
    const it = s.storage.items[i], pr = Math.floor((defOf(it)?.v || 0) / 2);
    if (!it || !pr) { toast("Kecleon won't buy that.", 'bad'); return; }
    it.qty -= 1;
    if (it.qty <= 0) s.storage.items.splice(i, 1);
    s.storage.poke = (s.storage.poke || 0) + pr;
    addLog(`${me()?.name} sold 1 ${it.name} for ${money(pr)}.`);
  });
  if (!items.length) return null;
  return (
    <>
      <h3>Sell from team storage (half price)</h3>
      {items.map((it, i) => {
        const pr = Math.floor((defOf(it)?.v || 0) / 2);
        return pr ? (
          <div className="list-item small" key={it.name}><span className="grow">{it.name} ×{it.qty}</span><button className="btn sm" onClick={() => sell(i)}>Sell 1 for {money(pr)}</button></div>
        ) : null;
      })}
    </>
  );
}
