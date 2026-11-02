# Dungeon Team Manager

A Pokémon Mystery Dungeon style tabletop companion: team sheets, an overworld, dungeon crawls, battles, loot and XP.
Built with React, TypeScript and Vite.

## Run it locally

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (production build into `dist/`), `npm test` (rules tests), `npm run lint`.

## Put it on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: lint, tests, build, then deploy.
   The site appears at `https://<your-user>.github.io/<repo-name>/`.

## Where the team is saved

- **As a Claude artifact:** everyone who opens the link shares one live team through Claude's shared database.
- **On GitHub Pages:** there is no shared database, so each browser keeps its own team.
  Move a team between devices with **Admin → Export whole team** and **Import**.

## Project layout

```
src/
  game/        rules, battle, dungeon/world, store and sync (no React)
  components/  shared UI pieces and overlays (attack popup, toasts, dialogs)
  views/       one file per tab
public/        dex.json and dexinfo.json (Pokédex data, loaded at start)
```

Game state changes go through `update()` in `src/game/store.ts`, which uses immer so React always gets new objects.
Saved data keeps the same shape as the original single-file app, so old saves and the shared team still load.
