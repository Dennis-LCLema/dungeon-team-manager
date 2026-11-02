import { nodeById } from './explore';
import type { Shared } from './types';

/**
 * Music files to try for the current scene, most specific first (public/music/<name>.mp3).
 * A layer-specific track like "overworld-3" falls back to "overworld" when that file doesn't exist.
 */
export function musicFor(s: Shared): string[] {
  const b = s.game.battle, dg = s.dungeon, layer = s.world.layer;
  if (b && !b.result) return b.enemies.some(e => e.boss || e.gatekeeper) ? ['boss', 'battle'] : ['battle'];
  if (dg.state === 'in') {
    if (dg.kind === 'labyrinth') return [`labyrinth-${dg.to}`, 'labyrinth'];
    if (dg.kind === 'rift') return [`rift-${layer}`, 'rift', 'labyrinth'];
    return ['dungeon', 'labyrinth'];
  }
  const kind = nodeById(s.world.at)?.kind;
  return kind === 'wild' || kind === 'rift' ? [`overworld-${layer}`, 'overworld'] : [`town-${layer}`, 'town'];
}
