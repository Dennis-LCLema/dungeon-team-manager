import { memo, useState } from 'react';
import { dex } from '../game/dex';
import { CATS, ITEMS, RAR, type ItemDef } from '../game/data';
import { money } from '../lib/util';
import { RarChip } from './common';

/** Searchable list of every item. Pass onGive to show a Give button on each row. */
export function Catalog({ onGive }: { onGive?: (def: ItemDef) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const qq = q.toLowerCase().trim();
  const rows = ITEMS.filter(i => (!qq || (i.n + ' ' + i.d + ' ' + RAR[i.r]).toLowerCase().includes(qq)) && (!cat || i.cat === cat));
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Search items" aria-label="Search items" style={{ flex: 1, minWidth: 160 }} value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ width: 'auto' }} aria-label="Item kind" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All kinds</option>
          {Object.entries(CATS).filter(([k]) => k !== 'tm').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="catlist">
        {rows.map(i => (
          <div className="catrow list-item" key={i.id}>
            <div className="grow">
              <b>{i.n}</b> <RarChip r={i.r} /> <span className="small muted">{CATS[i.cat]} · {i.v ? money(i.v) : 'no sale value'}</span>
              <div className="small muted">{i.d}</div>
            </div>
            {onGive ? <button className="btn sm" onClick={() => onGive(i)}>Give</button> : null}
          </div>
        ))}
        {rows.length ? null : <p className="small muted">No items match.</p>}
      </div>
    </>
  );
}

/** Autocomplete lists for species, move and item inputs. Rendered once. */
export const DataLists = memo(function DataLists() {
  const D = dex();
  return (
    <>
      <datalist id="speciesList">{Object.entries(D.s).map(([id, x]) => <option key={id} value={x.n} />)}</datalist>
      <datalist id="moveList">{Object.entries(D.m).map(([id, m]) => <option key={id} value={m[0]} />)}</datalist>
      <datalist id="itemList">{ITEMS.map(i => <option key={i.id} value={i.n} />)}</datalist>
    </>
  );
});
