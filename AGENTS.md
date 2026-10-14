# AGENTS.md

## Scope (hard rules)

- Only read and edit files inside this repo folder (`Geouttag/`). Never create or
  modify anything outside it — including the Origo at a location referenced by vite.config.mjs and package.json
- Node may not be on the PATH. If so then ask where it is, then use `npm.cmd`
  from that installation's directory, or prefix npx with the full node path.
- `npm run build` writes to `build/` (inside the repo) and is the safe default.
  Dev/watch variants (`npm start`, `watch-js`, `watch-sass` and dev-mode `vite build`)
  write to the external Origo plugins folder — agents must not run those; leave them
  to the user.

## What this is

Geouttag — an Origo (v2.9) plugin that lets the user draw an export area (rectangle,
square or polygon) and export selected products and map layers via FME Flow, or via
an ArcGIS ImageServer for raster products (with ArcGIS OAuth session handling).
Origo is an external dependency, so this builds as a browser-global IIFE named
`Geouttag` (see `vite.config.mjs`), loaded in an html page next to `origo.min.js`
together with `geouttag.css` and `resources/svg/material-icons.svg`.

## Layout

- `geouttag.js` — build entry, re-exports the plugin
- `src/geouttag.js` — the whole component: Origo UI composition (`onAdd`), state,
  draw interactions (OpenLayers via `Origo.ol`), FME Flow request construction
  (`sendData`), area limits, whole-exportable handling, ArcGIS auth UI
- `src/drawhandler.js` — draw interaction event handling
- `src/loadresources.js` — fetches and injects the SVG sprite sheet at runtime
  (fetched from `plugins/geouttag/material-icons.svg`, not bundled)
- `src/styles.js` — exported map styles for the sketch layer
- `src/utils/imageserver.js` — ArcGIS ImageServer export path (OAuth token handling)
- `src/loc/sv_SE.json`, `src/loc/en_US.json` — all user-facing strings
- `scss/geouttag.scss` — plugin styles (built with `sass-embedded`)
- `resources/svg/` — icons referenced by id (`#geouttag_*`)

## Conventions

- All user-facing strings live in `src/loc/sv_SE.json` and `src/loc/en_US.json`
  under a shared `geouttag` parent key. Never hardcode strings inline. They are
  registered with Origo's Localization control at startup
  (`localizationControl.addPluginToLocale('sv-SE' | 'en-US', ...)`) and always
  fetched via `getString(key)`, which uses the control's string lookup
  (`targetParentKey: 'geouttag'`) and falls back to the bundled `sv_SE.json`
  if the control is unavailable. Add new strings to both locale files.
- UI is composed with Origo's component API (`Origo.ui.Element`, `Origo.ui.Button`, …
  with `tagName`/`cls`/`components`/`attributes`) in `onAdd`, not raw DOM where
  avoidable. Keep icon/button/select patterns consistent with existing code in
  `src/geouttag.js`.
- Origo is the external; `viewer` and `map` come from the `onAdd(evt)` callback.
- Config surface (`products`, `layersConf`, `coordSyses`, `maxArea`, `wholeExportable`,
  `imageServer`, `FMEWorkspace`, `filetypes`) is documented in the README — keep the
  README in sync when changing config options.

## References

- Origo framework: https://github.com/origo-map/origo
- Origo component system (Element, Button, etc.):
  https://github.com/origo-map/origo/tree/master/src/ui
- Origo styling conventions: https://github.com/origo-map/origo/tree/master/scss
- Plugin template / barebone example:
  https://github.com/origo-map/barebone-plugin
- Origo documentation (incl. `add-locales` for plugin localization):
  https://origo-map.github.io/origo-documentation/latest/

## Tooling notes

- Lint with eslint (flat config, airbnb-extended rules in `eslint.config.mjs`).
- The FME Flow token is injected at build time from `VITE_FME_FLOW_TOKEN`
  in the environment (see `.env.example`); never hardcode tokens.
