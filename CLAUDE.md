# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CraterWeather is a **zero-backend static web app** that shows windsurf/kite/foil spots on a map of Finland with live wind forecasts. It is deployed as-is to GitHub Pages (<https://naapurinpojat.github.io/CraterWeather>). All logic runs in the browser; there is no build step and no API server of our own — weather comes directly from the met.no (Yr.no) public API, called client-side.

Much of the code and all UI strings are in **Finnish**. Match that when editing.

## Commands

```bash
bun install        # install dev deps (only @types/bun + typescript)
bun run dev        # serve the current directory on http://localhost:3000
```

`server.ts` is a ~20-line Bun static file server used **only for local development** — it is not part of the deployed artifact. There are no tests, no linter, and no build/bundle step. Do not add a bundler expecting it to be required; the deployed site loads `index.html` and its assets directly.

Note: the Dockerfile/devcontainer reference port 5173 but the server actually listens on 3000.

## Pre-commit

`.pre-commit-config.yaml` enforces **prettier** formatting and **Conventional Commits** (commit messages must be prefixed `feat:`, `fix:`, etc.). Run `pre-commit install` once so these run on commit/push.

## Architecture

Three layers, loaded in a deliberate order from `index.html`:

1. **`index.html` inline `<script>`** — the core. Initializes the Leaflet map, defines the global `window.surfApp = { map, refreshSpots }`, fetches `spots.geojson`, and renders markers/popups. Each spot marker fetches its own forecast from met.no on render. It owns the scoring (`surfabilityScore`/`scoreColor`), the score-badge map marker (`createScoreIcon`), the popup compass (`buildWindCompass`), and the 48-hour forecast table (`buildForecastTable`).
2. **`surfseeker.js`** (loaded `defer`, **not** a module — it depends on the global `window.surfApp`) — adds the floating control panel (sport selector, quick-view jumps). On sport change it publishes the active thresholds to `window.SURF_THRESHOLDS` and calls `refreshSpots()`, which re-scores every spot. It waits via a `ready()` poll until `window.surfApp` exists, so load order matters: `surfApp` must be set in the inline script before `surfseeker.js` runs.
3. **`surfseeker.css`** — styles for the panel (map/popup styles are inline in `index.html`).

### Data model — `spots.geojson`

Single GeoJSON FeatureCollection that drives everything. Two kinds of features:

- **Point** features = surf spots. Key properties:
  - `name`, `notes`
  - `best_wind_dir`: array of `[start, end]` **or** `[start1, end1, start2, end2]` (two acceptable wind sectors). Degrees, "from" direction.
  - `information`: relative path to a `places/<slug>.md` markdown file, lazy-loaded into the popup's second tab.
- **Polygon / MultiPolygon** features = no-surf / hazard areas (e.g. "Matalikko" = shallows), drawn in red.

To add a spot: define geometry in geojson.io, append the feature to `spots.geojson`, and add the matching `places/<slug>.md` (free-form Finnish description shown in the popup).

### Wind logic & surfability score (where the quality rules live)

- `SPORT_THRESHOLDS` in `surfseeker.js` defines per-sport "good" and "very good" wind-speed bands (windsurf / kitesurf / kitefoil / wingfoil). The active sport is persisted in `localStorage` (keys prefixed `surfseeker_`) and exposed to the scorer via `window.SURF_THRESHOLDS` (with a windsurf fallback `DEFAULT_THRESHOLDS` in `index.html` for the first render).
- `surfabilityScore(wind, gust, dir, bestDirs, thr)` in `index.html` returns 0–100 = **direction × speed × gust**: graded direction match (1.0 in `best_wind_dir`, linear falloff over 45°), a speed curve peaking near the "very good" threshold, and a gustiness penalty (gap between gust and wind). `scoreColor()` maps the score to the gray/amber/lime/green scale used everywhere.
- **Map markers show the *best* score across the whole forecast** (`createScoreIcon`), so the map answers "is good weather coming here?" at a glance. The popup shows that best score + when, plus the current score, the optimal-direction compass, and a per-hour score column in the table.
- When changing scoring, edit `surfabilityScore`/`scoreColor` in `index.html`; the table, compass, marker, and info badge all consume them, so they stay consistent automatically.

### Map projection

The map uses Finland's national CRS **EPSG:3067** (TM35FIN) via Proj4Leaflet, with MML (Maanmittauslaitos) base tiles. Coordinates in `spots.geojson` are plain WGS84 lon/lat; Leaflet handles the projection. The basemap is dimmed with a `filter: brightness(...)` on `.leaflet-tile-pane` only, so markers/popups/controls stay full-brightness.

External libraries (Leaflet, axios, marked, proj4, proj4leaflet) are loaded from CDNs in `index.html` — there is no local dependency on them.

## PWA / installability

The site is an installable Progressive Web App (Android home-screen / iOS Add to Home Screen):

- `manifest.webmanifest` — app metadata + icons, `display: standalone`.
- `sw.js` — service worker registered at the end of `index.html`. Caches the app shell **cache-first**, but **never caches `api.met.no`** so forecasts stay live. Bump `CACHE` (`"crater-v1"`) whenever cached assets change, or clients keep stale files.
- `icons/icon-192.png` + `icon-512.png` — the icons the manifest and `index.html` actually use.
- **All PWA paths must stay relative (`./`).** The deployed site is a GitHub Pages _project_ site under `/CraterWeather/`; absolute `/…` paths resolve to the user-site root and break the manifest/SW/icons.
- Service workers only run over HTTPS (GitHub Pages) or `localhost` — not over `file://`.

Gotcha — duplicate icon sets: the repo root also has favicon-generator output (`site.webmanifest`, `android-chrome-*.png`, `apple-touch-icon.png`, `favicon*.png`/`.ico`). These are **not** what the app loads — `index.html` points to `./manifest.webmanifest` and `./icons/`. Edit those, not the root `site.webmanifest`.

## MCP server (`mcp/`)

A local stdio MCP server exposing the surfability logic as tools (`list_spots`, `spot_conditions`, `rank_spots`, `spot_forecast`). `mcp/logic.ts` is **ported from the browser scoring** in `index.html`/`surfseeker.js` — if you change `surfabilityScore`/`SPORT_THRESHOLDS` in one place, update the other to keep them in sync. It loads spots from the published `spots.geojson` (`CRATER_SPOTS_URL`) and calls met.no with a required `User-Agent` (`MET_USER_AGENT`; met.no 403s without one). Run with `bun run mcp`; `.mcp.json` auto-registers it for Claude Code. Adds runtime deps `@modelcontextprotocol/sdk` + `zod` (the only non-dev dependencies in the project). See `mcp/README.md`.
