/* Balance guard: simulated graduation spars (both sides picking moves automatically) must stay a real
   contest and end in a reasonable number of rounds. Real players who plan their moves do better than this. */
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { autoTurn, startRivalSpar } from './battle';
import { setDex } from './dex';
import { createChar } from './rules';
import { G, update } from './store';

it('the graduation spar is an even, short fight', { timeout: 120000 }, () => {
  setDex(JSON.parse(readFileSync('public/dex.json', 'utf8')));
  // Fixed dice (a seeded random generator), so the test gives the same answer every run.
  let seed = 12345;
  vi.spyOn(Math, 'random').mockImplementation(() => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
  for (const lvl of [3, 8]) {
    let wins = 0; const rounds: number[] = [], N = 80;
    for (let i = 0; i < N; i++) {
      const team = [['Riolu', 'Juan'], ['Aron', 'Christian'], ['Hawlucha', 'Luis'], ['Litwick', 'Alfred']].map(([s, p]) => createChar(s, '', p, lvl));
      update(s => { s.chars = team; s.game.battle = null; startRivalSpar(); s.game.battle!.phase = 'fight'; });
      for (let t = 0; t < 400 && !G().game.battle!.result; t++) update(() => autoTurn());
      if (G().game.battle!.result === 'win') wins++;
      rounds.push(G().game.battle!.round);
    }
    rounds.sort((a, b) => a - b);
    expect(wins / N, `team win rate at level ${lvl}`).toBeGreaterThan(0.15);
    expect(wins / N, `team win rate at level ${lvl}`).toBeLessThan(0.85);
    expect(rounds[Math.floor(N / 2)], `median rounds at level ${lvl}`).toBeLessThan(20);
  }
  vi.restoreAllMocks();
});
