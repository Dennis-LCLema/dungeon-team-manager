/* Sound effects made in the browser (Web Audio), so there are no files to download. On or off per device.
   Browsers stay silent until the first tap on the page; after that these play. */
import { lsGet, lsSet } from './util';

export type Sfx = 'dice' | 'hit' | 'crit' | 'miss' | 'ko' | 'status' | 'heal' | 'turn' | 'start' | 'item' | 'level';

let ctx: AudioContext | null = null;
let on = lsGet('pmd-sfx', true);
export const sfxOn = () => on;
export function setSfx(v: boolean) { on = v; lsSet('pmd-sfx', v); sfx('turn'); }

function tone(t: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx!.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(t: number, dur: number, vol: number, freq: number, slideTo?: number) {
  const n = Math.floor(ctx!.sampleRate * dur), buf = ctx!.createBuffer(1, n, ctx!.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  s.buffer = buf;
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(ctx!.destination);
  s.start(t);
}

export function sfx(kind: Sfx) {
  if (!on) return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.01;
    const notes = (fs: number[], step: number, type: OscillatorType) => fs.forEach((f, i) => tone(t + i * step, f, 0.2, type, 0.11));
    const thump = (vol: number) => { noise(t, 0.18, vol, 1000, 180); tone(t, 160, 0.18, 'sine', vol, 48); };
    switch (kind) {
      case 'dice': [0, 0.09, 0.2, 0.3, 0.43, 0.56].forEach((d, i) => noise(t + d, 0.04, 0.16, 2600 - i * 220)); break;
      case 'hit': thump(0.32); break;
      case 'crit': thump(0.4); notes([880, 1320, 1760], 0.06, 'square'); break;
      case 'miss': noise(t, 0.26, 0.14, 500, 3200); break;
      case 'ko': thump(0.34); tone(t + 0.16, 440, 0.6, 'sawtooth', 0.1, 70); break;
      case 'status': tone(t, 520, 0.14, 'sine', 0.14, 780); tone(t + 0.14, 780, 0.22, 'sine', 0.14, 390); break;
      case 'heal': notes([523, 659, 784, 1047], 0.09, 'triangle'); break;
      case 'turn': notes([784, 1175], 0.12, 'sine'); break;
      case 'start': notes([196, 196, 262, 392], 0.11, 'sawtooth'); break;
      case 'item': notes([659, 784, 1319], 0.1, 'triangle'); break;
      case 'level': notes([523, 659, 784, 1047, 1319], 0.1, 'square'); break;
    }
  } catch { /* no audio on this device */ }
}
