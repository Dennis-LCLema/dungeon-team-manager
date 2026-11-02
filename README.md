# Dungeon Team Manager

![Lumen Rest, the lantern-lit town where every adventure begins](public/backgrounds/overworld-0.webp)

**A companion app for a Pokémon Mystery Dungeon–style tabletop campaign.**
The Dungeon Master runs the world, battles and loot from one screen. Each player follows along on their own phone and acts on their Pokémon's turn.

> *Five hundred years ago, Pokémon fled a war with the humans into the Labyrinth. Thirty years ago, the Great Calamity sealed every gate and split families apart. Now the Explorers' Guild sends its youngest graduates down to open them again.*

---

## Features

**For players**
- 📱 A **Play** screen that shows what's happening right now, and buzzes when it's your turn
- 🎲 **Hit and miss popups** with the roll, the damage and type effectiveness, on every screen at once
- 🎯 **Roll your own dice**: type your d20 and damage roll, and the app adds your bonuses
- 🧬 Character sheets with moves, PP, a 3-branch skill tree, held items, evolution and Mega Trials
- ✨ **Preset abilities** that work in battle (Sturdy, Flash Fire, Prankster…), plus a **homebrew ability** the DM approves

**For the Dungeon Master**
- 🗺️ **9 overworld layers** and a **40-floor Labyrinth**, with a Shadow Gatekeeper every 5 floors
- ⚔️ Turn-based battles with initiative, ambushes, Shadow Pokémon and purification
- 🌫️ **Creative moments**: turn a clever idea (Fire on Water makes a Steam Fog) into a field effect for a few rounds
- 💰 Loot rolls with suggestions for who should get each item, shops, **Charisma haggling** and quests
- 🧑‍🤝‍🧑 A story cast: village guildmasters, a rival team, a medical corps, and a mysterious trickster. Players see characters once they've met them, and a friendship meter changes prices and help
- 🖼️ Painted battle backgrounds for every layer, Labyrinth descent and Red Rift, plus pixel sprites for 1,200+ Pokémon
- 🎵 Scene-based music: drop MP3s in `public/music/` (see the README there)

---

## Play it

| Where | Shared team? | Best for |
|---|---|---|
| **Claude link** (the main game) | ✅ Everyone shares one live team | Game night |
| **GitHub Pages** | ❌ Each device keeps its own team | Trying it out, a solo DM screen, a backup |

On GitHub Pages, move a team between devices with **Admin → Export whole team** and **Import**.

Log in with your name. The default password is your name in lowercase (for example `luis`), until you change it.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app at http://localhost:5173 |
| `npm test` | Runs the rules tests (battles, abilities, haggling, field effects…) |
| `npm run lint` | Checks the code |
| `npm run build` | Builds the site into `dist/` |
| `node scripts/fetch-sprites.mjs` | Re-downloads the pixel sprites from PokéAPI |

## Host it on GitHub Pages

1. Push this folder to the `main` branch of a GitHub repository.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` lints, tests, builds and deploys the site automatically.
   It appears at `https://<your-username>.github.io/<repository-name>/`.

---

## For the DM

- [STORY.md](STORY.md): the world, the cast and Chapter 1, beat by beat ⚠️ *spoilers*
- [LABYRINTH.md](LABYRINTH.md): lore for each of the 8 Labyrinth descents
- [BACKGROUNDS.md](BACKGROUNDS.md): what each battle background shows, and the file names

## How the code is organised

```
src/
  game/        rules engine, battles, world and dungeon, story cast, save and sync (no React)
  components/  shared pieces: avatars, popups, shop, music player
  views/       one file per tab (Team, World, Dungeon, Battle, DM tools…)
public/
  backgrounds/ battle backgrounds (WebP)
  music/       background music slots (MP3)
  dex.json, dexinfo.json, sprites.json   Pokédex data and pixel sprites
```

Built with React, TypeScript and Vite. Every change to the game goes through `update()` in `src/game/store.ts`.

---

## Credits

- Pokémon data and pixel sprites from [PokéAPI](https://pokeapi.co).
- Pokémon and all related names are © Nintendo, Game Freak and The Pokémon Company. This is a free, non-commercial fan project for a private tabletop group, not affiliated with or endorsed by them.
