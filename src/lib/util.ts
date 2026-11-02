export const T = (s: unknown) => String(s || '').split(/[-\s]/).map(w => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const roll = (n: number) => 1 + Math.floor(Math.random() * n);
export const slug = (s: unknown) => String(s).trim().toLowerCase().replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[.'’:]/g, '').replace(/\s+/g, '-');
export const fmt = (n: number) => (n >= 0 ? '+' : '') + n;
export const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const toID = (x: unknown) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const money = (n: number | undefined) => '₽ ' + Math.round(n || 0).toLocaleString();

export function rollDice(expr: string | undefined, crit?: boolean): number {
  const m = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(String(expr || '').trim());
  if (!m) return 0;
  const n = +m[1] * (crit ? 2 : 1);
  let s = 0;
  for (let i = 0; i < n; i++) s += roll(+m[2]);
  if (m[3]) s += (m[3] === '+' ? 1 : -1) * +m[4];
  return s;
}

export function setPath(obj: any, path: string, val: unknown) {
  const p = path.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) {
    if (o[p[i]] == null) o[p[i]] = {};
    o = o[p[i]];
  }
  o[p[p.length - 1]] = val;
}

export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(t).toLocaleDateString();
}

export function lsGet<V>(k: string, d: V): V {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
}
export function lsSet(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

export function rollExpr(e0: string) {
  const e = String(e0 || '').trim().toLowerCase();
  if (e === 'd20 adv' || e === 'd20 dis') {
    const a = roll(20), b = roll(20), t = e.endsWith('adv') ? Math.max(a, b) : Math.min(a, b);
    return `${e}: [${a}, ${b}] → ${t}`;
  }
  const m = /^(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(e);
  if (!m) return null;
  const n = Math.min(50, +(m[1] || 1)), s = +m[2], dice = Array.from({ length: n }, () => roll(s));
  const mod = m[3] ? (m[3] === '+' ? 1 : -1) * +m[4] : 0, tot = dice.reduce((a, b) => a + b, 0) + mod;
  return `${n}d${s}${mod ? fmt(mod) : ''}: [${dice.join(', ')}]${mod ? ' ' + fmt(mod) : ''} = ${tot}`;
}

export function readImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Could not read that file.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("That file isn't a picture this browser can open."));
      img.onload = () => {
        const S = 192, cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const ctx = cv.getContext('2d')!, sc = Math.min(S / img.width, S / img.height);
        const w = img.width * sc, h = img.height * sc;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        let url = cv.toDataURL('image/webp', 0.85);
        if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/png');
        res(url);
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
