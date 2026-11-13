import { MusicPlayer } from './components/Music';
import { useEffect, useRef, useState } from 'react';
import { AttackPopup, Announce, EventOverlay, Modal, Toasts } from './components/Overlays';
import { BT, bGet, myTurnChar } from './game/battle';
import { DataLists } from './components/Catalog';
import { loadDex } from './game/dex';
import { loadSpriteIds } from './game/pokeapi';
import { migrateChars, nameOf, needsMigration } from './game/rules';
import { G, activeChar, canUndo, charById, getUi, isDM, me, owns, remote, saveBackup, setUi, toast, undo, update, useGame, useUi } from './game/store';
import { initSync } from './game/sync';
import { lsGet, lsSet } from './lib/util';
import { sfx } from './lib/sfx';
import Account from './views/Account';
import BattleView from './views/Battle';
import DM from './views/DM';
import DungeonView from './views/Dungeon';
import Log from './views/Log';
import Login from './views/Login';
import Party from './views/Party';
import Play from './views/Play';
import Sheet from './views/Sheet';
import Storage from './views/Storage';
import WorldView from './views/World';

/** Help text is hidden until someone asks for it, so screens stay short. Remembered on this device. */
function toggleTips() {
  const on = document.body.classList.toggle('tips');
  lsSet('pmd-tips', on);
  toast(on ? 'Tips are on: help text shows on every screen.' : 'Tips are off.');
}
function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  lsSet('pmd-theme', r.dataset.theme);
}

function useBattleNotices() {
  const s = useGame(), ui = useUi();
  const seen = useRef<{ battle?: string | null; prep?: string | null; turn?: string; hit?: string; events?: Set<string> }>({});
  const b = s.game.battle, dm = isDM(), signedIn = !!me();

  // Players jump to the Play tab when a battle starts or the DM calls the team.
  useEffect(() => {
    if (!signedIn || dm) return;
    const live = b && !b.result ? b.id : null;
    if (live && live !== seen.current.battle) {
      setUi({ tab: 'play' });
      toast(b!.surprise === 'ambush' ? 'Ambush! A battle started.' : 'A battle started!');
      sfx('start');
      try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
    }
    seen.current.battle = live;
    const pk = s.dungeon.state === 'prep' ? 'prep:' + s.dungeon.name : null;
    if (pk && pk !== seen.current.prep) { setUi({ tab: 'play' }); toast(`Dennis called the team to ${s.dungeon.name}!`); }
    seen.current.prep = pk;
  }, [b, s.dungeon, dm, signedIn]);

  // "It's your turn" nudge and tab title.
  const mt = signedIn ? myTurnChar() : null;
  const key = mt && b ? b.round + ':' + b.turn : '';
  useEffect(() => {
    if (key && key !== seen.current.turn && mt) {
      toast(`It's ${nameOf(mt)}'s turn!`);
      sfx('turn');
      try { navigator.vibrate?.(150); } catch { /* not supported */ }
    }
    seen.current.turn = key;
    document.title = (key ? '▶ Your turn · ' : '') + 'Dungeon Team Manager';
  }, [key, mt]);

  // Hit/miss popup for every new move result, on every screen. Skip the one already there when the page loads.
  const last = b?.last;
  useEffect(() => {
    if (seen.current.hit === undefined) { seen.current.hit = last?.id || ''; return; }
    if (last && last.id !== seen.current.hit) setUi({ popup: last });
    seen.current.hit = last?.id || '';
  }, [last]);

  // Level-ups go to the Pokémon's owner (the DM gets a short note); evolutions and Mega Evolutions go to everyone.
  // Skips what was already there when the page loaded, and anything more than 5 minutes old.
  const events = s.game.events;
  useEffect(() => {
    const list = events || [], old = seen.current.events;
    seen.current.events = new Set(list.map(e => e.id));
    if (!old || !signedIn) return;
    const fresh = list.filter(e => !old.has(e.id) && Date.now() - e.t < 5 * 60e3);
    const show = fresh.filter(e => e.kind !== 'level' || owns(charById(e.char)));
    if (dm) fresh.filter(e => !show.includes(e)).forEach(e => toast(`${e.name} reached level ${e.level}!`));
    if (!show.length) return;
    setUi({ events: [...getUi().events, ...show] });
    try { navigator.vibrate?.([80, 40, 160]); } catch { /* not supported */ }
  }, [events, dm, signedIn]);

  return ui;
}

const TAB_VIEWS: Record<string, () => React.ReactNode> = {
  world: () => <WorldView />, play: () => <Play />, sheet: () => <Sheet />, dungeon: () => <DungeonView />, battle: () => <BattleView />,
  storage: () => <Storage />, log: () => <Log />, dm: () => <DM />, account: () => <Account />, party: () => <Party />,
};

function Shell() {
  const s = useGame(), ui = useBattleNotices(), u = me(), dm = isDM();
  const act = activeChar(), b = s.game.battle;

  useEffect(() => { if (needsMigration(s.chars)) update(migrateChars); }, [s.chars]);
  // The DM's device keeps a copy of the game, at most every 10 minutes, so no mistake or wipe is final.
  const lastBackup = useRef(0);
  useEffect(() => { if (dm && s.chars.length && Date.now() - lastBackup.current > 10 * 60e3) { lastBackup.current = Date.now(); saveBackup(s); } }, [dm, s]);

  let tab = ui.tab;
  if (tab === 'sheet' && !act) tab = dm ? 'party' : 'play';
  if (tab === 'dm' && !dm) tab = 'play';
  if (!dm && ['dungeon', 'battle'].includes(tab)) tab = 'play';
  if (dm && tab === 'play') tab = 'party';
  if (!u) return <Login />;

  const nl = s.loot.lines.length, myCount = s.chars.filter(owns).length, mine = myCount > 0;
  const tabs: [string, string][] = dm
    ? [['party', 'Team'], ...(act ? [['sheet', nameOf(act)] as [string, string]] : []), ['world', 'World'], ['dungeon', 'Dungeon'],
       ['battle', 'Battle' + (b && !b.result ? ' •' : '')], ['storage', 'Storage'], ['log', 'Log'], ['dm', 'DM tools' + (nl ? ` (${nl})` : '')], ['account', 'Admin']]
    : [['play', 'Play' + (myTurnChar() ? ' •' : '')], ...(mine ? [['mine', 'My Pokémon' + (myCount > 1 ? ` (${myCount})` : '')] as [string, string]] : []),
       ...(act && !owns(act) ? [['sheet', nameOf(act)] as [string, string]] : []), ['world', 'World'], ['party', 'Team'], ['storage', 'Storage'], ['log', 'Log']];
  const isOn = (k: string) => tab === k || (k === 'mine' && tab === 'sheet' && owns(act));
  const go = (k: string) => {
    if (k === 'mine') {
      // A player with several Pokémon: each tap moves on to the next one.
      const all = G().chars.filter(owns), at = getUi().tab === 'sheet' ? all.findIndex(c => c.id === getUi().activeId) : -1, m0 = all[(at + 1) % (all.length || 1)];
      setUi(m0 ? { activeId: m0.id, tab: 'sheet' } : { tab: 'play' });
    }
    else setUi({ tab: k });
    window.scrollTo(0, 0);
  };
  return (
    <>
      <nav className="tabs gutter" aria-label="Sections">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab ${isOn(k) ? 'on' : ''}`} aria-current={isOn(k) ? 'page' : undefined} onClick={() => go(k)}>{l}</button>
        ))}
      </nav>
      <main className="gutter"><TurnBanner tab={tab} go={go} />{(TAB_VIEWS[tab] || TAB_VIEWS.party)()}</main>
      <DataLists />
    </>
  );
}

function TurnBanner({ tab, go }: { tab: string; go: (k: string) => void }) {
  const b = BT();
  if (!b || b.result || b.phase === 'intro' || tab === 'play' || tab === 'battle') return null;
  const mt = myTurnChar();
  if (mt) {
    return (
      <section className="card callout row between" role="status">
        <b>It's {nameOf(mt)}'s turn!</b><button className="btn sm primary" onClick={() => go(isDM() ? 'battle' : 'play')}>Go to battle</button>
      </section>
    );
  }
  if (isDM()) {
    const cur = b.order[b.turn], x = bGet(cur);
    if (cur.ref !== 'pc' && x) {
      return (
        <section className="card callout row between">
          <span>Enemy turn: <b>{nameOf(x)}</b></span><button className="btn sm primary" onClick={() => go('battle')}>Go to battle</button>
        </section>
      );
    }
  }
  return null;
}

export default function App() {
  const [dexState, setDexState] = useState<'loading' | 'ready' | string>('loading');
  useUi();
  useGame();
  const who = me();

  useEffect(() => {
    loadDex().then(() => setDexState('ready'), (e: Error) => setDexState(e.message));
    // Sprites are 1 MB+: show the app first and let them pop in when they arrive.
    void loadSpriteIds().then(() => setUi({}));
    void initSync();
    document.body.classList.toggle('tips', lsGet('pmd-tips', false));
  }, []);

  return (
    <>
      <header className="top">
        <div className="topin gutter">
          <div className="logo">Dungeon <span>Team</span> Manager</div>
          <span className={`sync ${remote.live && !remote.readOnly ? 'live' : ''}`}>
            {remote.live ? (remote.readOnly ? 'Shared · view only' : 'Shared team') : 'This device'}
          </span>
          {who ? <MusicPlayer /> : null}
          {who?.role === 'dm' ? <button className="btn sm ghost" disabled={!canUndo()} onClick={undo} title="Undo your last change" aria-label="Undo your last change">↩ Undo</button> : null}
          {who ? (
            <button className="btn sm ghost" onClick={() => setUi({ tab: 'account' })}>{who.name}{who.role === 'dm' ? ' · DM' : ''}</button>
          ) : null}
          <button className="btn sm ghost" onClick={toggleTips} aria-label="Show or hide help text" title="Show or hide help text">?</button>
          <button className="btn sm ghost" onClick={toggleTheme} aria-label="Switch light or dark theme">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
          </button>
        </div>
      </header>
      {dexState === 'ready' ? <Shell /> : (
        <main className="gutter"><div className="loading">
          {dexState === 'loading' ? <><span className="spin" /> Loading the Pokédex…</> : <><p>{dexState}</p><button className="btn" onClick={() => location.reload()}>Reload</button></>}
        </div></main>
      )}
      <Toasts />
      <Modal />
      <EventOverlay />
      <Announce />
      <AttackPopup />
    </>
  );
}
