import { useEffect, useState } from 'react';
import { roll } from '../lib/util';

/** Outline of each die as seen from above. The d20 also gets its inner facet lines. */
const SHAPES: Record<number, string> = {
  4: '50,6 95,88 5,88', 6: '14,14 86,14 86,86 14,86', 8: '50,4 93,50 50,96 7,50', 10: '50,4 93,42 50,96 7,42',
  12: '50,4 79,14 96,40 96,64 79,88 50,97 21,88 4,64 4,40 21,14', 20: '50,3 91,26 91,74 50,97 9,74 9,26', 100: '50,4 93,42 50,96 7,42',
};

/** A die thrown onto the screen: it flies in from `from`, bounces while its faces flicker, and comes to rest on `value`.
    `ms` is how long the throw takes and `delay` how long it waits first, matching how long the caller keeps `rolling` true. */
export function Die({ value, rolling, size = 40, tone = '', sides = 20, ms = 900, delay = 0, from }:
  { value: number | null | undefined; rolling: boolean; size?: number; tone?: string; sides?: number; ms?: number; delay?: number; from?: [string, string] }) {
  const [face, setFace] = useState(() => roll(sides));
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace(roll(sides)), 80);
    return () => clearInterval(id);
  }, [rolling, sides]);
  const vars = { width: size, height: size, fontSize: Math.round(size * (sides === 100 ? 0.28 : 0.36)), '--ms': ms + 'ms', '--dl': delay + 'ms', ...(from ? { '--fx': from[0], '--fy': from[1] } : {}) } as React.CSSProperties;
  return (
    <span className={`die20 ${rolling ? 'rolling' : 'landed'} ${tone}`} style={vars}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points={SHAPES[sides] || SHAPES[20]} />
        {sides === 20 ? <path d="M50 22 78 68H22ZM50 22V3M50 22 9 26M50 22 91 26M22 68 9 26M22 68 9 74M22 68 50 97M78 68 91 26M78 68 91 74M78 68 50 97" /> : null}
      </svg>
      <b>{rolling ? face : value ?? '?'}</b>
    </span>
  );
}

export const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
