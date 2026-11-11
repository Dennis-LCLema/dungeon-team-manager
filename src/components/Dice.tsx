import { useEffect, useState } from 'react';
import { roll } from '../lib/util';

/** A d20 that tumbles through random faces while `rolling`, then lands on `value`. */
export function Die({ value, rolling, size = 40, tone = '' }: { value: number | null | undefined; rolling: boolean; size?: number; tone?: string }) {
  const [face, setFace] = useState(() => roll(20));
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace(roll(20)), 80);
    return () => clearInterval(id);
  }, [rolling]);
  return (
    <span className={`die20 ${rolling ? 'rolling' : 'landed'} ${tone}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,3 91,26 91,74 50,97 9,74 9,26" />
        <path d="M50 22 78 68H22ZM50 22V3M50 22 9 26M50 22 91 26M22 68 9 26M22 68 9 74M22 68 50 97M78 68 91 26M78 68 91 74M78 68 50 97" />
      </svg>
      <b>{rolling ? face : value ?? '?'}</b>
    </span>
  );
}

export const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
