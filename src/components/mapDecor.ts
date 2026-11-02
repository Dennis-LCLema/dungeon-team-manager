// Background art for each overworld layer, as SVG markup built only from fixed numbers and colors (no user text).
import { LAYERS } from '../game/data';

function rng(seed: number){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const mapCache: Record<number, string> = {};
export function mapDecor(k: number){
  if(mapCache[k]) return mapCache[k];
  const L = LAYERS[k], R = rng(k * 7919 + 13), P = L.pal, W = 1000, H = 640, r = (a: number, b: number) => a + R() * (b - a);
  let s = '';
  const glowDots = (n: number, col: string, y0: number, y1: number, rad: [number, number]) => { for(let i = 0; i < n; i++) s += `<circle cx="${r(0, W) | 0}" cy="${r(y0, y1) | 0}" r="${r(rad[0], rad[1]).toFixed(1)}" fill="${col}" opacity="${r(.25, .8).toFixed(2)}"/>`; };
  switch(L.motif){
    case 'town':
      s += `<path d="M0 360 Q 250 300 500 350 T 1000 330 V640 H0Z" fill="${P.ground}" opacity=".9"/><path d="M0 420 Q 300 380 600 430 T 1000 410 V640 H0Z" fill="#24382c"/>`;
      for(let i = 0; i < 22; i++){ const x = r(30, 970), y = r(330, 600), w = r(26, 44), h = r(20, 30); s += `<rect x="${x | 0}" y="${y | 0}" width="${w | 0}" height="${h | 0}" fill="#3a2a2a" opacity=".85"/><path d="M${(x - 4) | 0} ${y | 0} L${(x + w / 2) | 0} ${(y - h * .8) | 0} L${(x + w + 4) | 0} ${y | 0}Z" fill="#6b2f3a"/><rect x="${(x + w / 2 - 4) | 0}" y="${(y + 8) | 0}" width="8" height="8" fill="${P.glow}" opacity=".9"/>`; }
      glowDots(40, '#fff6d6', 0, 260, [.6, 1.6]);
      break;
    case 'forest':
      for(let i = 0; i < 14; i++) s += `<path d="M${r(0, W) | 0} 0 C ${r(0, W) | 0} 120, ${r(0, W) | 0} 200, ${r(0, W) | 0} 320" stroke="${P.glow}" stroke-opacity=".12" stroke-width="${r(3, 9) | 0}" fill="none"/>`;
      for(let i = 0; i < 90; i++){ const x = r(-20, W + 20), y = r(250, H + 20), rad = r(18, 46); s += `<circle cx="${x | 0}" cy="${y | 0}" r="${rad | 0}" fill="${['#123a24', '#1a4d2e', '#0f3020', '#21603a'][i % 4]}"/>`; }
      glowDots(70, P.glow, 0, H, [1, 3]);
      break;
    case 'sea':
      for(let i = 0; i < 12; i++){ const y = 260 + i * 32; s += `<path d="M0 ${y} Q 125 ${y - 14} 250 ${y} T 500 ${y} T 750 ${y} T 1000 ${y}" stroke="#7fe7ff" stroke-opacity="${(.08 + i * .02).toFixed(2)}" stroke-width="3" fill="none"/>`; }
      for(let i = 0; i < 16; i++){ const x = r(0, W), y = r(300, 620), h = r(30, 80); s += `<path d="M${x | 0} ${y | 0} l${(h / 3) | 0} ${-h | 0} l${(h / 3) | 0} ${h | 0}Z" fill="#cdefff" opacity=".35"/>`; }
      glowDots(55, '#bff6ff', 0, H, [1.5, 5]);
      break;
    case 'storm':
      for(let i = 0; i < 8; i++) s += `<ellipse cx="${r(0, W) | 0}" cy="${r(20, 180) | 0}" rx="${r(90, 200) | 0}" ry="${r(26, 50) | 0}" fill="#2c3366" opacity=".7"/>`;
      for(let i = 0; i < 4; i++){ let x = r(100, 900), y = 40, d = `M${x | 0} ${y}`; for(let j = 0; j < 6; j++){ x += r(-40, 40); y += r(30, 55); d += ` L${x | 0} ${y | 0}`; } s += `<path d="${d}" stroke="${P.glow}" stroke-width="4" fill="none" opacity=".75" filter="url(#wglow)"/>`; }
      for(let i = 0; i < 9; i++){ const x = r(-50, W), w = r(140, 260); s += `<path d="M${x | 0} ${H} L${(x + w / 2) | 0} ${r(330, 470) | 0} L${(x + w) | 0} ${H}Z" fill="#1c2140"/>`; }
      for(let i = 0; i < 7; i++){ const x = r(40, 900), y = r(250, 500), w = r(90, 170); s += `<path d="M${x | 0} ${y | 0} h${w | 0} l-20 30 h${-(w - 40) | 0}Z" fill="#3a4170" opacity=".9"/>`; }
      break;
    case 'lava':
      s += `<path d="M0 520 C 200 470, 350 600, 520 540 S 850 480, 1000 560 V640 H0Z" fill="#ff5a1f" opacity=".55" filter="url(#wglow)"/>`;
      for(let i = 0; i < 6; i++){ const x = r(-50, W), w = r(160, 300), y = r(300, 420); s += `<path d="M${x | 0} ${H} L${(x + w * .4) | 0} ${y | 0} h${(w * .2) | 0} L${(x + w) | 0} ${H}Z" fill="#1a0b08"/><circle cx="${(x + w / 2) | 0}" cy="${y | 0}" r="14" fill="#ff7a2e" opacity=".7" filter="url(#wglow)"/>`; }
      glowDots(80, '#ffb36b', 0, H, [1, 2.8]);
      break;
    case 'grave':
      for(let i = 0; i < 7; i++) s += `<ellipse cx="${r(0, W) | 0}" cy="${r(300, 600) | 0}" rx="${r(150, 300) | 0}" ry="${r(20, 45) | 0}" fill="#5a3a8a" opacity=".22"/>`;
      for(let i = 0; i < 40; i++){ const x = r(0, W), y = r(330, 620), w = r(14, 26), h = r(22, 40); s += `<rect x="${x | 0}" y="${(y - h) | 0}" width="${w | 0}" height="${h | 0}" rx="${(w / 2) | 0}" fill="#2a1d45"/>`; }
      for(let i = 0; i < 10; i++){ const x = r(0, W); s += `<path d="M${x | 0} ${H} l0 ${-r(120, 220) | 0} m0 40 l${r(-40, 40) | 0} -30 m${r(-20, 20) | 0} 50 l${r(-40, 40) | 0} -20" stroke="#140b25" stroke-width="5" fill="none"/>`; }
      glowDots(26, '#ffd27a', 120, 520, [3, 6]);
      break;
    case 'crystal':
      glowDots(120, '#ffffff', 0, H, [.6, 1.8]);
      for(let i = 0; i < 7; i++){ const x = r(40, 900), y = r(150, 560), w = r(80, 160); s += `<ellipse cx="${x | 0}" cy="${y | 0}" rx="${(w / 2) | 0}" ry="12" fill="#6a4fb0"/><path d="M${(x - w / 2) | 0} ${y | 0} L${x | 0} ${(y + w * .6) | 0} L${(x + w / 2) | 0} ${y | 0}Z" fill="#3d2a73"/>`; }
      for(let i = 0; i < 22; i++){ const x = r(0, W), y = r(200, 620), h = r(30, 90); s += `<path d="M${x | 0} ${y | 0} l${(h / 5) | 0} ${-h | 0} l${(h / 5) | 0} ${h | 0}Z" fill="${i % 2 ? '#ff9ce6' : '#8ff0ff'}" opacity=".45"/>`; }
      break;
    case 'machine':
      for(let i = 0; i < 9; i++){ const x = r(0, W), y = r(160, 560), rad = r(30, 80); s += `<circle cx="${x | 0}" cy="${y | 0}" r="${rad | 0}" fill="none" stroke="#3a524a" stroke-width="${(rad / 4) | 0}" stroke-dasharray="10 8"/><circle cx="${x | 0}" cy="${y | 0}" r="${(rad / 3) | 0}" fill="#22332e"/>`; }
      for(let i = 0; i < 8; i++){ const y = r(250, 600); s += `<rect x="0" y="${y | 0}" width="${W}" height="${r(6, 14) | 0}" fill="#25352f"/>`; }
      for(let i = 0; i < 6; i++) s += `<ellipse cx="${r(0, W) | 0}" cy="${r(400, 620) | 0}" rx="${r(60, 140) | 0}" ry="${r(10, 22) | 0}" fill="#7dffb0" opacity=".3" filter="url(#wglow)"/>`;
      break;
    case 'throne':
      for(let i = 0; i < 5; i++){ const cx = r(100, 900), cy = r(380, 560), rr = r(90, 160); for(let j = 0; j < 6; j++) s += `<path d="M${(cx - rr + j * rr / 3) | 0} ${cy | 0} q ${(rr / 6) | 0} ${-rr | 0} ${(rr / 3) | 0} 0" stroke="#d9c6a8" stroke-opacity=".28" stroke-width="7" fill="none"/>`; }
      { let d = `M0 ${H}`; for(let x = 0; x <= W; x += 50) d += ` L${x} ${(r(440, 520)) | 0} L${x + 25} ${(r(380, 470)) | 0}`; s += `<path d="${d} L${W} ${H}Z" fill="#170a08"/>`; }
      glowDots(60, '#ffb35c', 0, H, [1, 2.6]);
      break;
  }
  return mapCache[k] = s;
}

const urlCache: Record<number, string> = {};
/** The drawn scene for a layer as a CSS background, used until a real background image exists. */
export function sceneUrl(k: number) {
  if (urlCache[k]) return urlCache[k];
  const P = (LAYERS[k] || LAYERS[0]).pal;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky}"/><stop offset=".55" stop-color="${P.mid}"/><stop offset="1" stop-color="${P.ground}"/></linearGradient><filter id="wglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="1000" height="640" fill="url(#s)"/>${mapDecor(LAYERS[k] ? k : 0)}</svg>`;
  return (urlCache[k] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}
