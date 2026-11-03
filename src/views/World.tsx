import { useState } from 'react';
import { Avatar, TypeChip, Types, run } from '../components/common';
import { mapDecor } from '../components/mapDecor';
import { SellList, ShopList, buy } from '../components/Shop';
import { CAST, ITEM_BY_ID, KIND, STARTER_QUESTS, TEAMS, type CastMember, LAB_FLOORS, LAYERS, TCOL, labLvl, layerLvl, ringOf } from '../game/data';
import { rollSurprise, startBattle, startRivalSpar } from '../game/battle';
import { arriveLayer, exploreWild, layerClosed, layerNodes, nodeById, prepRun, rollHavenShop, type WorldNode } from '../game/explore';
import { addItemTo, addLoot, defByName, bondOf, haggleOff, healPrice, longRest, lootTeam, processLevelUps, rollChest } from '../game/rules';
import { G, addLog, isDM, me, setUi, toast, update, useGame } from '../game/store';
import type { Enemy, Fighter } from '../game/types';
import { getPokemonAny } from '../game/dex';
import { T, money, uid } from '../lib/util';

export function EnemyList({ list }: { list: Enemy[] | undefined }) {
  return <>{(list || []).map(e => (
    <div className="list-item" key={e.id}><Avatar c={e} size={30} />
      <span className="grow"><b>{e.name}</b> <span className="small muted">Lv {e.level} · HP {e.hpMax}</span></span>
      <span className="row" style={{ gap: 3 }}><Types x={e} /></span>
    </div>
  ))}</>;
}

function WorldMap({ k, nodes, sel, onSel }: { k: number; nodes: WorldNode[]; sel: string; onSel: (id: string) => void }) {
  const w = useGame().world, L = LAYERS[k], P = L.pal, here = w.at;
  const way = nodes.find(n => n.kind === 'waystone')!, stairs = nodes.find(n => n.kind === 'stairs');
  const curve = (a: WorldNode, b: WorldNode) => {
    const mx = (a.pos[0] + b.pos[0]) / 2, my = (a.pos[1] + b.pos[1]) / 2 - 40;
    return <path key={a.id + b.id} d={`M${a.pos[0]} ${a.pos[1]} Q ${mx} ${my} ${b.pos[0]} ${b.pos[1]}`} stroke={P.glow} strokeOpacity=".35" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" fill="none" />;
  };
  const votes: Record<string, string[]> = {};
  Object.entries(w.votes || {}).forEach(([p, id]) => { (votes[id] ||= []).push(p); });
  return (
    <svg className="wmap" viewBox="0 0 1000 640" role="img" aria-label={`Map of ${L.n}`}>
      <defs>
        <linearGradient id={`wsky${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={P.sky} /><stop offset=".55" stopColor={P.mid} /><stop offset="1" stopColor={P.ground} /></linearGradient>
        <radialGradient id="wvig" cx=".5" cy=".45" r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
        <filter id="wglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="1000" height="640" fill={`url(#wsky${k})`} />
      <g dangerouslySetInnerHTML={{ __html: mapDecor(k) }} />
      <rect width="1000" height="640" fill="url(#wvig)" />
      {nodes.filter(n => n !== way).map(n => curve(way, n))}
      {stairs ? nodes.filter(n => n.kind === 'wild').map(n => curve(n, stairs)) : null}
      {nodes.map(n => {
        const K = KIND[n.kind], ring = n.kind === 'haven' && n.t ? ringOf(n.t) : K.c, cleared = n.kind === 'rift' && w.rifts[n.id], [x, y] = n.pos, v = votes[n.id] || [];
        const pick = () => onSel(n.id);
        return (
          <g key={n.id} className={`wnode ${n.id === here ? 'here' : ''} ${n.id === sel ? 'sel' : ''} k-${n.kind}`} role="button" tabIndex={0}
            aria-label={`${n.n}, ${K.n}${n.id === here ? ', the team is here' : ''}`} onClick={pick}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
            <circle cx={x} cy={y} r="46" fill={ring} opacity=".22" filter="url(#wglow)" />
            <circle cx={x} cy={y} r="32" fill="#0a0f1e" fillOpacity=".86" stroke={cleared ? '#8a8f9c' : ring} strokeWidth={n.id === here ? 6 : 4} />
            <text x={x} y={y + 10} textAnchor="middle" fontSize="28" fill={cleared ? '#8a8f9c' : ring}>{K.g}</text>
            <text className="wlabel" x={x} y={y + 62} textAnchor="middle">{n.n}{cleared ? ' (sealed)' : ''}</text>
            {n.id === here ? <g className="party"><circle cx={x + 30} cy={y - 30} r="15" fill={P.glow} stroke="#0a0f1e" strokeWidth="3" /><text x={x + 30} y={y - 24} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0a0f1e">{lootTeam().length}</text></g> : null}
            {v.length ? <g><rect x={x - 70} y={y - 56} rx="11" width={Math.min(150, 64 + v.length * 18)} height="22" fill="#0a0f1e" stroke={P.glow} /><text x={x - 60} y={y - 40} fontSize="15" fill="#fff">Vote {v.map(p => p[0]).join(' ')}</text></g> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** DM types a player's Charisma roll; the shopkeeper's friendship adds a bonus. One try per shop visit. */
function Haggle({ id, k }: { id: string; k: number }) {
  const s = useGame(), [roll, setRoll] = useState('');
  const keeper = CAST.find(c => c.keeper && c.layer === k), bonus = keeper && s.world.met[keeper.id] ? bondOf(s.world.bond, keeper.id) * 2 : 0;
  const total = Number(roll) + bonus;
  const go = () => update(d => {
    const sh = d.world.shop[id];
    if (!sh || sh.off != null || !roll) return;
    const off = sh.off = haggleOff(total);
    sh.stock.forEach(l => { if (!l.sold) l.price = Math.max(1, Math.round((l.price || 0) * (100 - off) / 100)); });
    addLog(off ? `The team haggled with ${keeper?.name || 'the shopkeeper'} (Charisma ${total}): ${off}% off this visit.` : `${keeper?.name || 'The shopkeeper'} would not budge on prices (Charisma ${total}).`);
  });
  return (
    <div className="row" style={{ gap: 6, margin: '0 0 8px', flexWrap: 'wrap' }}>
      <label className="small">Charisma roll <input type="number" min={1} max={40} value={roll} onChange={e => setRoll(e.target.value)} style={{ width: 70 }} aria-label="Charisma roll total" /></label>
      {bonus ? <span className="small muted">{bonus > 0 ? '+' : ''}{bonus} from {keeper!.name}</span> : null}
      <button className="btn sm" disabled={!roll} onClick={go}>Haggle{roll ? ` (${total}: ${haggleOff(total)}% off)` : ''}</button>
      <span className="small muted">10+ = 10%, 15+ = 20%, 20+ = 30%. One try per visit.</span>
    </div>
  );
}

function AreaPanel({ n, k }: { n: WorldNode; k: number }) {
  const s = useGame(), w = s.world, dm = isDM(), K = KIND[n.kind], lvl = layerLvl(k);
  const head = (
    <>
      <div className="row between">
        <div><div className="eyebrow" style={{ color: n.kind === 'haven' && n.t ? TCOL[n.t] : K.c }}>{K.n}{n.t ? ' · ' + T(n.t) : ''}</div><h2 style={{ margin: '2px 0 0' }}>{n.n}</h2></div>
        {n.t ? <TypeChip t={n.t} /> : null}
      </div>
      <p className="small">{n.d}</p>
    </>
  );
  const areaEv = (fn: (ev: NonNullable<typeof w.area[string]>) => void) => run(() => update(d => { const ev = d.world.area[d.world.at]; if (ev && !ev.done) fn(ev); }));
  let body: React.ReactNode = null;
  if ((n.kind === 'wild' || n.kind === 'rift') && layerClosed(k)) {
    body = <div className="safe">Closed for good. The team cleared the Labyrinth below this layer, so its wild Pokémon and Rifts have moved on. Shops, rest and the Waystone still work.</div>;
  } else if (n.kind === 'haven') {
    const shop = w.shop[n.id];
    body = <>
      <div className="safe">Safe Zone: no battles here. {dm ? '' : 'Dennis can give the team a free long rest.'}</div>
      {dm ? <div className="row" style={{ margin: '8px 0' }}><button className="btn" onClick={() => { update(() => { lootTeam().forEach(longRest); addLog(`The team rested at ${n.n}. HP, PP and assists are restored.`); }); toast('Long rest: everyone is fully healed.'); }}>Long rest here (free)</button></div> : null}
      <h3>Shop · Team money {money(s.storage.poke)}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>New stock every time the team walks in.{shop?.off != null ? <> <b>Haggled: {shop.off}% off this visit.</b></> : null}</p>
      {shop && shop.off == null && dm ? <Haggle id={n.id} k={k} /> : null}
      {shop ? <ShopList stock={shop.stock} onBuy={i => buy(d => d.world.shop[d.world.at]?.stock, i)} />
        : dm ? <button className="btn" onClick={() => update(d => { d.world.shop[n.id] = { stock: rollHavenShop(d.world.layer, n.t) }; })}>Open the shop</button>
        : <p className="small muted">The shop opens when the team arrives.</p>}
      <SellList />
    </>;
  } else if (n.kind === 'wild') {
    const ev = w.area[n.id];
    body = <>
      <p className="small muted" style={{ marginTop: 0 }}>Wild Pokémon around level {lvl + 1}{LAYERS[k].types.length ? ', mostly ' + LAYERS[k].types.map(T).join('/') + ' types' : ''}. <b>High risk, high reward:</b> 1.5× XP and better loot, until the team clears the Labyrinth below this layer.</p>
      {ev ? (
        <div className="event">
          <div className="small muted">Exploration roll: d20 {ev.roll}</div>
          <p style={{ margin: '4px 0 8px' }}><b>{ev.text}</b></p>
          {ev.kind === 'battle' ? <>
            <EnemyList list={ev.enemies} />
            {ev.done ? <p className="small">The area is clear.</p> : dm ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={() => run(() => { update(d => {
                  const e2 = d.world.area[d.world.at];
                  if (!e2 || e2.kind !== 'battle' || e2.done) return;
                  if (d.game.battle && !d.game.battle.result) { toast('Finish the current battle first.', 'bad'); return; }
                  const party = lootTeam(), r = rollSurprise(party, e2.enemies || []);
                  startBattle(party.map(x => x.id), e2.enemies || [], { world: d.world.at }, r.kind, r.text);
                }); setUi({ tab: 'battle' }); })}>Fight</button>
                <button className="btn ghost" onClick={() => areaEv(e2 => { e2.done = true; e2.text += ' The team slipped away.'; })}>Slip away</button>
              </div>
            ) : null}
          </> : null}
          {ev.kind === 'forage' ? <>
            <p className="small">{ev.done ? 'Added to the loot.' : ''}</p>
            {!ev.done && dm ? <button className="btn primary" onClick={() => areaEv(e2 => { e2.done = true; if (e2.item) addLoot([e2.item]); })}>Add to loot</button> : null}
          </> : null}
          {ev.kind === 'merchant' ? <ShopList stock={ev.stock} onBuy={i => buy(d => d.world.area[d.world.at]?.stock, i)} /> : null}
          {ev.kind === 'rescue' ? (ev.done ? <p className="small">The Pokémon is safe. It thanks the team.</p> : <>
            <p className="small">Reward: {ev.xp} XP each and {money(ev.poke)}.</p>
            {dm ? <button className="btn primary" onClick={() => areaEv(e2 => {
              e2.done = true;
              lootTeam().filter(x => x.hpCur > 0).forEach(x => { x.xp = (x.xp || 0) + (e2.xp || 0); });
              G().storage.poke = (G().storage.poke || 0) + (e2.poke || 0);
              addLog(`The team helped a Pokémon in need: +${e2.xp} XP each and ${money(e2.poke)}.`);
              processLevelUps();
            })}>Help it</button> : null}
          </>) : null}
          {ev.kind === 'treasure' ? (ev.done ? <p className="small">The chest is empty.</p> : dm ? (
            <button className="btn primary" onClick={() => { areaEv(e2 => { e2.done = true; addLoot(rollChest(layerLvl(G().world.layer), false)); }); toast('Chest opened. Hand out the loot in DM tools.'); }}>Open the chest</button>
          ) : null) : null}
        </div>
      ) : null}
      {dm ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button className={`btn ${ev ? '' : 'primary'}`} disabled={!!ev && ev.kind === 'battle' && !ev.done}
            onClick={() => run(() => update(d => { const nn = nodeById(d.world.at); if (!nn || nn.kind !== 'wild') return; const e2 = exploreWild(d.world.layer, nn); d.world.area[nn.id] = e2; addLog(`${nn.n}: ${e2.text}`); }))}>
            {ev ? 'Explore again' : 'Explore'}
          </button>
        </div>
      ) : null}
    </>;
  } else if (n.kind === 'rift') {
    const cleared = w.rifts[n.id], rl = Math.min(20, lvl + 3);
    body = cleared ? <div className="safe">Sealed. This Rift reopens the next time the team arrives in this layer.</div> : <>
      <div className="danger"><b>⚠ Red Rift</b>
        <ul className="small">
          <li><b>High risk:</b> 3 floors of level {rl} Pokémon, many of them Shadows, and a Rift Lord at the end.</li>
          <li><b>No escape:</b> the entrance seals. Escape Ropes and Orbs don't work until the Rift Lord falls.</li>
          <li><b>High reward:</b> better item rarity, double money, 1.5× XP, and a Rift treasure when it's sealed.</li>
        </ul>
      </div>
      {dm ? <button className="btn danger-btn" onClick={() => { update(d => { if (d.world.rifts[n.id]) return; prepRun({ kind: 'rift', node: n.id, layer: d.world.layer, name: `${n.n} (Red Rift)`, start: 1, floors: 3, lvl: rl, types: LAYERS[d.world.layer].types }); }); setUi({ tab: 'dungeon' }); }}>Enter the Rift</button> : null}
    </>;
  } else if (n.kind === 'stairs') {
    const a = 5 * k + 1, b = 5 * k + 5, gate = LAYERS[k + 1]?.gate;
    body = <>
      <p className="small" style={{ marginTop: 0 }}>Floors <b>{a}–{b}</b>. Wild Pokémon around level {labLvl(a)} to {labLvl(b)}. {gate ? <>The Gatekeeper, a <b>Shadow {gate}</b>, waits on floor {b}. </> : null}Beyond it lies <b>{LAYERS[k + 1].n}</b>.</p>
      {dm ? <button className="btn primary" onClick={() => { update(() => prepRun({ kind: 'labyrinth', layer: k, to: k + 1, name: 'The Labyrinth', start: a, floors: b, lvl: labLvl(a), types: LAYERS[k + 1].types, gatekeeper: LAYERS[k + 1].gate })); setUi({ tab: 'dungeon' }); }}>Begin the descent</button> : null}
    </>;
  } else if (n.kind === 'waystone') {
    body = <>
      <h3>Teleport to</h3>
      {w.unlocked.slice().sort((a, b) => a - b).map(L => (
        <div className="list-item" key={L}>
          <span className="dot" style={{ background: LAYERS[L].pal.glow }} />
          <span className="grow"><b>{LAYERS[L].n}</b> <span className="small muted">{L ? 'Layer ' + L : 'Surface'}</span></span>
          {L === k ? <span className="tag good">Here</span> : dm ? <button className="btn sm" onClick={() => update(d => {
            if (d.dungeon.state !== 'idle') { toast('Finish or leave the current run first.', 'bad'); return; }
            arriveLayer(L, `The team touched the Waystone and teleported to ${LAYERS[L].n}.`);
          })}>Teleport</button> : null}
        </div>
      ))}
      <p className="small muted">Reach a new layer to add its Waystone.</p>
    </>;
  }
  return <section className="card area">{head}{body}</section>;
}

const BOND = ['Enemies', 'Tense', 'Neutral', 'Friendly', 'Close friends'];

function CastRow({ c, k }: { c: CastMember; k: number }) {
  const s = useGame(), dm = isDM(), met = s.world.met[c.id], bond = bondOf(s.world.bond, c.id);
  let types: string[] = [];
  try { types = getPokemonAny(c.species).types; } catch { /* custom species: no types */ }
  const face = { id: c.id, species: c.species.toLowerCase(), types } as unknown as Fighter;
  const setBond = (v: number) => update(d => { d.world.bond[c.id] = Math.max(-2, Math.min(2, v)); });
  const price = healPrice(k, bond);
  const heal = () => run(() => update(d => {
    if (price == null) return;
    if ((d.storage.poke || 0) < price) { toast(`The team needs ${money(price)} for a field heal.`, 'bad'); return; }
    d.storage.poke -= price;
    lootTeam().forEach(longRest);
    addLog(`The Rescue Corps healed the team${price ? ` for ${money(price)}` : ' for free'}. HP, PP and assists are restored.`);
  }));
  return (
    <div className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Avatar c={face} size={40} />
      <span className="grow" style={{ minWidth: 200 }}>
        <b>{c.name}</b> <span className="small muted">{c.species}{c.level ? ' · Lv ' + c.level : ''} · {c.role}</span>
        <div className="small">{c.desc}</div>
        {dm && c.secret ? <div className="small" style={{ marginTop: 4 }}><b>DM only:</b> {c.secret}</div> : null}
        {met ? <div className="small" style={{ marginTop: 4 }}>Gets along: <b>{BOND[bond + 2]}</b></div> : null}
      </span>
      {dm ? <span className="row" style={{ gap: 4 }}>
        {met ? <>
          <button className="btn sm" aria-label={`Worse with ${c.name}`} disabled={bond <= -2} onClick={() => setBond(bond - 1)}>−</button>
          <button className="btn sm" aria-label={`Better with ${c.name}`} disabled={bond >= 2} onClick={() => setBond(bond + 1)}>+</button>
        </> : null}
        <button className={`btn sm ${met ? 'primary' : ''}`} aria-pressed={!!met}
          onClick={() => update(d => { d.world.met[c.id] = !d.world.met[c.id]; if (d.world.met[c.id]) addLog(`The team met ${c.name}.`); })}>{met ? 'Met' : 'Mark met'}</button>
        {c.id === 'mabel' && met ? <button className="btn sm" disabled={price == null} onClick={heal}>
          {price == null ? 'Refuses to heal' : `Field heal (${price ? money(price) : 'free'})`}</button> : null}
      </span> : null}
    </div>
  );
}

/** Story characters for this layer, plus anyone roaming. Players see only the ones the DM marked as met; secrets are DM-only. */
function CastCard({ k }: { k: number }) {
  const s = useGame(), dm = isDM();
  const list = CAST.filter(c => !c.team && (c.layer == null || c.layer === k) && (dm || s.world.met[c.id]));
  if (!list.length) return null;
  return (
    <section className="card">
      <h2>Characters in {LAYERS[k].n}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{dm ? 'Mark who the team has met, then use − and + as the players get along with them. Players never see the DM notes.' : 'Pokémon the team has met here, and how you get along.'}</p>
      {list.map(c => <CastRow key={c.id} c={c} k={k} />)}
    </section>
  );
}

/** The two teams that follow the players everywhere: rivals and medics. */
function TeamsCard({ k }: { k: number }) {
  const s = useGame(), dm = isDM();
  return (
    <section className="card">
      <h2>Teams</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Two teams from the same graduating class. Everyone knows each other, and how they treat the players depends on how the players treat them.</p>
      {Object.entries(TEAMS).map(([t, v]) => {
        const members = CAST.filter(c => c.team === t), seen = members.filter(c => dm || s.world.met[c.id]);
        return (
          <div key={t}>
            <h3 style={{ marginBottom: 2 }}>{v.n}</h3>
            <p className="small muted" style={{ marginTop: 0 }}>{v.d}</p>
            {dm && t === 'rivals' ? <button className="btn primary" style={{ marginBottom: 8 }} onClick={() => run(() => { update(() => { if (G().game.battle && !G().game.battle!.result) throw new Error('Finish the current battle first.'); startRivalSpar(); }); setUi({ tab: 'battle' }); })}>⚔️ Start the graduation spar</button> : null}
            {seen.length ? seen.map(c => <CastRow key={c.id} c={c} k={k} />) : <p className="small muted">The team has not met them yet.</p>}
          </div>
        );
      })}
    </section>
  );
}

/** Quests from the village guildmasters. The DM posts and completes them; everyone can see them. */
function QuestCard() {
  const s = useGame(), dm = isDM(), w = s.world;
  const [f, setF] = useState({ title: '', giver: '', xp: '30', poke: '100', item: '', qty: '1' });
  const open = w.quests.filter(q => !q.done), done = w.quests.length - open.length;
  const graduate = () => update(d => {
    if (d.world.graduated) return;
    d.world.graduated = true;
    addItemTo(d.storage.items, ITEM_BY_ID.escaperope, 2);
    STARTER_QUESTS.forEach(q => d.world.quests.push({ id: uid(), ...q }));
    addLog('Graduation day! The team received 2 Escape Ropes, and Guildmaster Orrin posted their first quests.');
  });
  const add = () => update(d => {
    if (!f.title.trim()) return;
    if (f.item.trim() && !defByName(f.item)) { toast(`There's no item called "${f.item}". Pick one from the list.`, 'bad'); return; }
    const reward = f.item.trim() ? { item: defByName(f.item)!.n, qty: Math.max(1, Math.min(99, Number(f.qty) || 1)) } : {};
    d.world.quests.push({ id: uid(), title: f.title.trim(), giver: f.giver.trim(), xp: Math.max(0, Number(f.xp) || 0), poke: Math.max(0, Number(f.poke) || 0), ...reward });
    setF({ ...f, title: '', item: '', qty: '1' });
  });
  const complete = (id: string) => run(() => update(d => {
    const q = d.world.quests.find(x => x.id === id);
    if (!q || q.done) return;
    q.done = true;
    lootTeam().filter(x => x.hpCur > 0).forEach(x => { x.xp = (x.xp || 0) + q.xp; });
    d.storage.poke = (d.storage.poke || 0) + q.poke;
    const def = q.item ? defByName(q.item) : null;
    if (def) addItemTo(d.storage.items, def, q.qty || 1);
    addLog(`Quest complete: ${q.title}. +${q.xp} XP each and ${money(q.poke)}${def ? `, plus ${def.n}${(q.qty || 1) > 1 ? ' ×' + q.qty : ''} in team storage` : ''}.`);
    processLevelUps();
  }));
  if (!dm && !w.quests.length) return null;
  return (
    <section className="card">
      <h2>Quests</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Jobs from the village guildmasters. XP goes to every Pokémon still standing; money and item rewards go to the team.</p>
      {dm && !w.graduated ? <button className="btn primary" style={{ marginBottom: 8 }} onClick={graduate}>Graduation day: give 2 Escape Ropes and post Orrin&apos;s first quests</button> : null}
      {open.map(q => (
        <div className="list-item" key={q.id}>
          <span className="grow"><b>{q.title}</b><div className="small muted">{q.giver ? q.giver + ' · ' : ''}{q.xp} XP each · {money(q.poke)}{q.item ? ` · 🎁 ${q.item}${(q.qty || 1) > 1 ? ' ×' + q.qty : ''}` : ''}</div></span>
          {dm ? <>
            <button className="btn sm primary" onClick={() => complete(q.id)}>Complete</button>
            <button className="btn sm ghost" aria-label={`Remove ${q.title}`} onClick={() => update(d => { d.world.quests = d.world.quests.filter(x => x.id !== q.id); })}>✕</button>
          </> : null}
        </div>
      ))}
      {!open.length ? <p className="small muted">No open quests.</p> : null}
      {done ? <p className="small muted">{done} quest{done > 1 ? 's' : ''} completed.</p> : null}
      {dm ? (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <input placeholder="New quest" aria-label="Quest" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={{ flex: '2 1 200px' }} />
          <input placeholder="Given by" aria-label="Given by" list="quest-givers" value={f.giver} onChange={e => setF({ ...f, giver: e.target.value })} style={{ flex: '1 1 120px' }} />
          <datalist id="quest-givers">{CAST.map(c => <option key={c.id} value={c.name} />)}</datalist>
          <label className="small">XP <input type="number" min={0} value={f.xp} onChange={e => setF({ ...f, xp: e.target.value })} style={{ width: 64 }} /></label>
          <label className="small">₽ <input type="number" min={0} value={f.poke} onChange={e => setF({ ...f, poke: e.target.value })} style={{ width: 76 }} /></label>
          <input placeholder="Item reward (optional)" aria-label="Item reward" list="itemList" value={f.item} onChange={e => setF({ ...f, item: e.target.value })} style={{ flex: '1 1 150px' }} />
          {f.item ? <label className="small">× <input type="number" min={1} max={99} aria-label="Item quantity" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} style={{ width: 52 }} /></label> : null}
          <button className="btn sm" disabled={!f.title.trim()} onClick={add}>Post quest</button>
        </div>
      ) : null}
    </section>
  );
}

export default function WorldView() {
  const s = useGame(), w = s.world, k = w.layer, L = LAYERS[k] || LAYERS[0], nodes = layerNodes(k), dm = isDM();
  const [sel, setSel] = useState('');
  const here = nodes.find(n => n.id === w.at) || nodes[0];
  const votes: Record<string, string[]> = {};
  Object.entries(w.votes || {}).forEach(([p, id]) => { (votes[id] ||= []).push(p); });
  const myVote = me() && w.votes[me()!.name];
  const dg = s.dungeon;
  const onSel = (id: string) => { setSel(id); setTimeout(() => document.querySelector('.place.sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0); };
  const travel = (id: string) => update(d => {
    if (d.dungeon.state !== 'idle') { toast('Finish or leave the current run first.', 'bad'); return; }
    if (d.game.battle && !d.game.battle.result) { toast('Finish the battle first.', 'bad'); return; }
    const n = nodeById(id);
    if (!n) return;
    d.world.at = n.id; d.world.votes = {};
    if (n.kind === 'haven') d.world.shop[n.id] = { stock: rollHavenShop(d.world.layer, n.t) };
    if (n.kind === 'wild') delete d.world.area[n.id];
    addLog(`The team traveled to ${n.n}.`);
  });
  const vote = (id: string) => update(d => { const nm = me()!.name; if (d.world.votes[nm] === id) delete d.world.votes[nm]; else d.world.votes[nm] = id; });

  return (
    <>
      {dg.state !== 'idle' ? (
        <section className="card callout row between">
          <span>{dg.state === 'prep' ? 'Getting ready for' : 'The team is in'} <b>{dg.name}</b>{dg.state === 'in' ? `, floor ${dg.floor}` : ''}.</span>
          {dm ? <button className="btn sm primary" onClick={() => setUi({ tab: 'dungeon' })}>Open</button> : null}
        </section>
      ) : null}
      <div className="depth" aria-label="Labyrinth depth">
        <div className="depth-bar">{LAYERS.slice(1).map((Lx, i) => (
          <span key={i} className={`seg ${w.unlocked.includes(i + 1) ? 'open' : ''} ${w.layer === i + 1 ? 'cur' : ''}`} style={{ '--c': Lx.pal.glow } as React.CSSProperties}
            title={`Layer ${i + 1}: ${Lx.n}, after floor ${5 * (i + 1)}`}>{i + 1}</span>
        ))}</div>
        <div className="small muted">Deepest floor reached: <b>{w.deepest || 0}</b> of {LAB_FLOORS}{w.unlocked.length > 1 ? ` · Waystones: ${w.unlocked.length}` : ''}</div>
      </div>
      <section className="card worldcard" style={{ '--lg': L.pal.glow } as React.CSSProperties}>
        <div className="eyebrow" style={{ color: 'var(--lg)' }}>{k ? `Layer ${k} · below floor ${5 * k}` : 'The Surface'}</div>
        <h2 className="wtitle">{L.n}</h2>
        <p className="small wintro">{L.intro}</p>
        <div className="wmapwrap"><WorldMap k={k} nodes={nodes} sel={sel} onSel={onSel} /></div>
      </section>
      <div className="dgrid wgrid">
        <AreaPanel n={here} k={k} />
        <section className="card">
          <h2>Places in {L.n}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>{dm ? 'Players vote on where to go. You make the final call.' : 'Vote on where the team goes next. Dennis makes the final call.'}</p>
          {nodes.map(n => {
            const K = KIND[n.kind], v = votes[n.id] || [], isHere = n.id === here.id;
            return (
              <div className={`list-item place ${n.id === sel ? 'sel' : ''}`} key={n.id}>
                <span className="pglyph" style={{ color: n.kind === 'haven' && n.t ? TCOL[n.t] : K.c }}>{K.g}</span>
                <span className="grow"><b>{n.n}</b> <span className="small muted">{K.n}{n.t ? ' · ' + T(n.t) : ''}{n.kind === 'rift' && w.rifts[n.id] ? ' · sealed' : ''}</span>
                  {v.length ? <div className="small">Votes: {v.join(', ')}</div> : null}</span>
                {isHere ? <span className="tag good">Team is here</span>
                  : dm ? <button className={`btn sm ${v.length ? 'primary' : ''}`} onClick={() => travel(n.id)}>Travel{v.length ? ` (${v.length})` : ''}</button>
                  : <button className={`btn sm ${myVote === n.id ? 'primary' : ''}`} aria-pressed={myVote === n.id} onClick={() => vote(n.id)}>{myVote === n.id ? 'Voted' : 'Vote'}</button>}
              </div>
            );
          })}
        </section>
      </div>
      <QuestCard />
      <TeamsCard k={k} />
      <CastCard k={k} />
    </>
  );
}
