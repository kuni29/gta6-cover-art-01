# Neon Coast Cover Studio — GTA VI Cover Art Maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/kuni29/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/kuni29/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

A make.fun bounty entry for [gta6-cover-art-01](https://make.fun/bounty/gta6-cover-art-01).

An offline cover-art studio in the browser: compose a neon-coast game cover from layered panels, grade it, and export a print-ready PNG — no network, no build step.

## What's inside

- `app/` — the studio itself (vanilla JS + canvas): 4 panel layouts, per-pixel gradient-map color grades (Vice Sunset, Neon Nights, Golden Hour, Dusk Mono), film grain and vignette, caption typesetting with bundled OFL fonts (Anton for the title, Pacifico for the subtitle).
- One-click PNG export at 1080×1080, 1080×1350 and 1920×1080.
- `main.ts` — builds the entry dossier from the app and screenshots.
- `screenshots/` — four renders of the studio and its output.

## Run it

Open `app/index.html` in a browser, or serve the folder with `serve.ts`. Run `node main.ts` to rebuild the dossier.
