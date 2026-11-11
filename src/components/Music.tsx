import { useEffect, useRef, useState } from 'react';
import { musicFor } from '../game/music';
import { useGame } from '../game/store';
import { lsGet, lsSet } from '../lib/util';
import { setSfx, sfxOn } from '../lib/sfx';

/** Background music for this device only. Browsers block sound until the first tap, so playback starts then. */
export function MusicPlayer() {
  const want = musicFor(useGame()), key = want.join('|');
  const [pref, setPref] = useState(() => lsGet('pmd-music', { on: true, vol: 0.4 }));
  const audio = useRef<HTMLAudioElement | null>(null);
  const [fx, setFx] = useState(sfxOn);

  useEffect(() => { lsSet('pmd-music', pref); if (audio.current) audio.current.volume = pref.vol; }, [pref]);

  useEffect(() => {
    if (!pref.on) { audio.current?.pause(); return; }
    const a = audio.current ||= new Audio();
    a.loop = true;
    a.volume = pref.vol;
    const names = key.split('|');
    let i = 0, gone = false;
    const tryNext = () => {
      if (gone) return;
      if (i >= names.length) return; // no file for this scene: stay silent
      a.src = `music/${names[i++]}.mp3`;
      a.play().catch(() => { /* blocked until the first tap; the listener below retries */ });
    };
    const resume = () => { if (a.paused && a.src) a.play().catch(() => {}); };
    a.addEventListener('error', tryNext);
    window.addEventListener('pointerdown', resume);
    tryNext();
    return () => { gone = true; a.removeEventListener('error', tryNext); window.removeEventListener('pointerdown', resume); };
  }, [key, pref.on]); // eslint-disable-line react-hooks/exhaustive-deps -- volume changes are applied above without restarting the track

  useEffect(() => () => audio.current?.pause(), []);

  return (
    <span className="row music" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <button className="btn sm ghost" aria-pressed={fx} aria-label={fx ? 'Mute sound effects' : 'Turn on sound effects'}
        title={fx ? 'Sound effects are on' : 'Sound effects are off'} onClick={() => { setSfx(!fx); setFx(!fx); }}>{fx ? '🔔' : '🔕'}</button>
      <button className="btn sm ghost" aria-pressed={pref.on} aria-label={pref.on ? 'Mute music' : 'Play music'}
        title={pref.on ? `Music: ${want[0]}` : 'Music is off'}
        onClick={() => setPref(p => ({ ...p, on: !p.on }))}>{pref.on ? '🔊' : '🔇'}</button>
      {pref.on ? <input type="range" min={0} max={1} step={0.05} value={pref.vol} aria-label="Music volume" style={{ width: 70 }}
        onChange={e => setPref(p => ({ ...p, vol: +e.target.value }))} /> : null}
    </span>
  );
}
