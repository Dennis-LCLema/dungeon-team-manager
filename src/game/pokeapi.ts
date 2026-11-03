import { slug } from '../lib/util';

/** Pixel sprites from PokéAPI (https://pokeapi.co), bundled with the app by scripts/fetch-sprites.mjs
    so they work offline and on Claude pages, which block images from other sites. */
let local: { names: Record<string, number>; img: Record<string, string>; shiny?: Record<string, string> } | null = null;

/** Load the bundled sprites. Never throws: without them, avatars use the drawn sprites or a letter. */
export async function loadSpriteIds() {
  try { local = await (await fetch('sprites.json')).json(); } catch { /* not bundled or offline */ }
}

export function spriteUrl(species: string, shiny?: boolean) {
  // Shinies without a bundled shiny sprite use the normal one (the avatar still shows a ✨ badge).
  const id = local?.names[slug(species)];
  return id ? (shiny && local?.shiny?.[id]) || local?.img[id] || null : null;
}
