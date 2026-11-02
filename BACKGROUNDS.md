# Battle backgrounds

Drop WebP files into `public/backgrounds/`. Until a file exists, the battle shows a drawn scene in that layer's colours.

- **Size:** wide, about 1600 × 640 px. Keep each under ~300 KB (WebP or compressed PNG).
- **Composition:** the team's sprites stand on the left third, the foes on the right third. Keep the middle and the bottom fifth fairly plain so the figures and HP bars stay readable.
- **Mood:** everything is underground. Even "sky" layers are inside the Labyrinth, lit by glowing things, not the sun.

| File | Where it shows |
|---|---|
| `overworld-N.webp` | Wild-area fights in layer N (training and overworld battles) |
| `labyrinth-N.webp` | The Labyrinth floors leading **down to** layer N (`labyrinth-1` = floors 1–5, the gate into Verdant Hollow) |
| `rift-N.webp` | Red Rift fights in layer N |
| `dungeon.webp` | Dungeons you plan yourself in the Dungeon tab |
| `battle.webp` | Fallback for anything else |

Colours below are the layer's palette already used in the app, so the stage matches the map.

## Layer 0 · Lumen Rest (`overworld-0`)
- **Palette:** night sky `#1c2a52`, lantern-purple haze `#7a4f7d`, mossy ground `#2f4a3a`, warm lantern glow `#ffcf73`.
- **Overworld (Training Meadow):** gentle green hills just outside a lantern-lit town. Paper lanterns on poles, guild banners, a dirt path. Cozy and safe-looking, with the dark mouth of the Labyrinth stairs in the far background.
- **Labyrinth 1 (floors 1–5, `labyrinth-1`):** the first descent. Rough stone stairs and tunnels, roots poking through the ceiling, a faint green glow from below hinting at Verdant Hollow. Mostly grey stone with the first glowing moss.

## Layer 1 · Verdant Hollow (`overworld-1`, `labyrinth-2`, `rift-1`)
- **Palette:** deep green `#0f2a22`, canopy `#1f5a3a`, forest floor `#183d22`, spore glow `#9cff8a`.
- **Overworld:** a drowned forest under a false sky of glowing roots. Huge trunks, spores drifting like snow, glowing moss in a ravine. Something huge breathing in the canopy (a hint of a giant silhouette above).
- **Rift (Rotheart Burrow / The Thornmaw):** a sick, pulsing root system in purple-black Shadow light, or a briar maze with thorns that have grown shut. Add red-purple Shadow veins.
- **Labyrinth 2 (floors 6–10):** tunnels where the forest roots give way to wet stone and the first frost. Blue-white light from below.

## Layer 2 · Tidecaller Grotto (`overworld-2`, `labyrinth-3`, `rift-2`)
- **Palette:** abyss `#06203a`, sea `#0d4a6e`, tide pools `#0a2f4a`, jellyfish glow `#7fe7ff`.
- **Overworld:** an underground sea lit by drifting jellyfish. Knee-deep shallows, ice spikes jutting from the water like a jaw, frost on the tide pools. Cold cyan light.
- **Rift (The Drowned Bell / Frozen Maw):** a sunken temple with a giant bell, or a cave of black ice. Shadow purple reflections in the water.
- **Labyrinth 3 (floors 11–15):** sea caves climbing into cliffs. Wind, flickers of lightning from above.

## Layer 3 · Stormspire Highlands (`overworld-3`, `labyrinth-4`, `rift-3`)
- **Palette:** storm sky `#141a33`, cloud `#3a3f6e`, rock `#262b45`, lightning `#ffe45c`.
- **Overworld:** floating cliffs riding an endless storm. Rope bridges between floating rocks, lightning striking every few seconds, sparks on the ground of the plateau. Wind-blown grass.
- **Rift (Eye of the Storm / Shattered Spire):** an eerily calm centre with still air and a dark wall of storm all around, or a broken tower crackling with lightning that never grounds.
- **Labyrinth 4 (floors 16–20):** descending from windy cliffs into warm, red-lit rock. Heat shimmer begins.

## Layer 4 · Emberdeep Caldera (`overworld-4`, `labyrinth-5`, `rift-4`)
- **Palette:** black-glass ceiling `#2a0c08`, lava `#6e1d0e`, scorched ground `#2b130d`, ember glow `#ff8a3d`.
- **Overworld:** a sea of slow lava under a ceiling of black glass. Grey ash falling like snow, tunnels where lava runs like veins through the rock. Shadows that move against the light.
- **Rift (The Forge Below / Sandglass Pit):** an ancient smithy still burning with giant anvils, or a sinking sand pit with a strange, frozen-in-time feel.
- **Labyrinth 5 (floors 21–25):** the heat fades into cold purple twilight. Lanterns begin to appear, floating, with no one holding them.

## Layer 5 · Duskwood Necropolis (`overworld-5`, `labyrinth-6`, `rift-5`)
- **Palette:** twilight `#120a24`, violet fog `#3a1f5a`, grave soil `#1a1030`, lantern glow `#c79bff`.
- **Overworld:** a city of graves under endless twilight. Floating lanterns, flowers that only bloom over graves, an empty street with every door slightly open. Gothic, quiet, purple.
- **Rift (Crypt of a Thousand Eyes / Black Market Below):** a crypt where every wall has eyes, or a hidden underground market lit by candles and shady stalls.
- **Labyrinth 6 (floors 26–30):** grave tunnels turning to crystal. Walls start to reflect things that aren't there.

## Layer 6 · Mirage Sanctum (`overworld-6`, `labyrinth-7`, `rift-6`)
- **Palette:** dream sky `#1a0f3a`, crystal `#5a3a8e`, glass ground `#2a1d52`, pink glow `#ff9ce6`.
- **Overworld:** crystal islands drifting in a sky that shows memories. Fields of rainbow glass, a beach where the waves look like sleep (soft, blurry, pastel). Faint ghostly images in the sky.
- **Rift (Mirror of Regrets / Fey Hollow):** a hall of mirrors with reflections that don't match, or a fairy court of glowing flowers and thorns.
- **Labyrinth 7 (floors 31–35):** crystal gives way to rusted metal, pipes and dripping green toxic water.

## Layer 7 · Ironroot Foundry (`overworld-7`, `labyrinth-8`, `rift-7`)
- **Palette:** soot `#0d1614`, old steel `#2a3a35`, floor `#141f1c`, toxic glow `#7dffb0`.
- **Overworld:** a dead civilisation's machine city. Giant gears grinding overhead, canals of glowing green water, engines that never stopped running. Industrial, rusty, green-lit.
- **Rift (The Engine Heart / Plague Vault):** the glowing core that powers the city, or a sealed lab with a broken seal.
- **Labyrinth 8 (floors 36–40):** machine tunnels giving way to enormous bones in the walls. Warm orange light from far below.

## Layer 8 · Primordial Throne (`overworld-8`, `rift-8`)
- **Palette:** deep red-black `#1a0c0c`, bone and ember `#4a1f1a`, floor `#24110e`, warm glow `#ffb35c`.
- **Overworld:** the bottom of everything. Fossil titans sleeping in the walls, ribcages as tall as towers, dragons nesting in the bones of the world, a crater where the first star fell.
- **Rift (The First Egg):** a chamber older than the Labyrinth. A huge cracked egg of pure Shadow pulsing at its heart, purple-black light, cracks glowing. This is where the Calamity began and where the story ends.

## `dungeon.webp` and `battle.webp`
- **dungeon.png:** a generic Mystery Dungeon corridor: stone walls, a torch or two, a dark doorway. Neutral colours so it fits any dungeon you plan yourself.
- **battle.png:** the safest fallback, for example the Lumen Rest training grounds at dusk.
