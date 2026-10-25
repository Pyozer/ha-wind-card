# AGENTS.md

Context and guidelines for AI agents (and humans) working on this repository.
User documentation lives in [README.md](README.md), commit rules in [CONTRIBUTING.md](CONTRIBUTING.md).

## Project

**Live Wind Card** is a Lovelace custom card for Home Assistant. It shows the wind: speed, gusts,
direction (a compass dial with animated streaks), a Beaufort scale and a history chart. It is the
sibling of [Live Energy Card](https://github.com/Pyozer/ha-live-energy-card), with the same
conventions, tooling and iOS-like design.

- Strict TypeScript + [Lit 3](https://lit.dev), bundled by Vite into **a single ES module**:
  `dist/live-wind-card.js`. This is the file Home Assistant loads.
- Element `custom:live-wind-card` and visual editor `live-wind-card-editor` (built on `ha-form`).
- Runtime dependencies are limited to `lit` and `@mdi/js`. Do not add more without a real need:
  everything ends up in the bundle loaded by every HA client. `npm run size` enforces a gzip budget
  on it.
- **Everything is written in English**: documentation, code comments, test names and commits.
  Only the UI is translated (English and French, see `src/localize/`).
- The design was validated on a standalone mockup before the card was written (`design/index.html`,
  simulated data). It is kept as the visual reference; the demo (`demo/`) runs the real card.

## Commands

```bash
npm install
npm run dev           # demo outside Home Assistant: http://localhost:5173/demo/
npm test              # unit tests (Vitest)
npm run coverage      # tests + coverage thresholds (report in coverage/index.html)
npm run lint          # ESLint
npm run format        # Prettier (src, demo, test, scripts)
npm run build         # type check + dist/live-wind-card.js
npm run size          # bundle size against its budget (scripts/check-size.mjs)
npm run check         # lint + format:check + coverage + build + size: run before every commit
```

## Architecture

Rendering is a chain of pure functions followed by a thin Lit element:

```
hass + config ─► reading.ts ─► view.ts ─┐
                  history.ts ─► chart.ts ┼─► live-wind-card.ts (Lit render) ─► streaks.ts (canvas)
                  config.ts (settings) ──┘
```

| File | Role |
| --- | --- |
| `src/types.ts` | Configuration types (`LiveWindCardConfig`) and minimal HA types. |
| `src/config.ts` | `DEFAULTS`, `validateConfig` (coercion, readable errors), `resolveSettings` (defaults applied, `auto` resolved), watched entities. |
| `src/wind.ts` | Wind maths, no DOM: Beaufort scale and colors, compass (16 points, `O`/`W`, bearing parsing, shortest-path rotation), speed units and conversion, number and age formatting, dial arc, axis maximum. |
| `src/reading.ts` | What to read (`resolveSources`: a dedicated entity wins over the weather entity) and how (`readWind`: km/h and degrees whatever the unit or the spelling). |
| `src/history.ts` | Recorder history: `fetchHistory` (`history/history_during_period`, compressed states), `buildSeries` (5-minute grid, last state at or before each time), windows (3 to 72 h), `historyRefreshMs`, peaks, `withLive` (ends the curve on the current reading). |
| `src/chart.ts` | Geometry of the history chart as data: monotone curve, runs cut at missing data, gradient stops, axis, direction arrows, time labels, `indexAt`; `sparkPaths` for the compact layout. |
| `src/streaks.ts` | The wind streaks: pure simulation (`stepParticle`, `particleCount`…) and `StreakCanvas`, which draws it on its own animation frames. |
| `src/view.ts` | `buildView`: the reading and the settings as the values the card shows (texts, colors, arcs, angles). |
| `src/entities.ts` | Entity kinds for the editor's pickers, and `guessConfig` (the stub config when adding the card). |
| `src/actions.ts` | `tap_action`, `hold_action`, `double_tap_action` (`hass-action` event). |
| `src/live-wind-card.ts` | Lit element: Lovelace lifecycle, history refresh, rendering (dial, tiles, scale, chart, compact), registration. |
| `src/styles.ts` | Styles (`--lwc-*` variables, light / dark). |
| `src/editor/editor.ts` | Visual editor element: `ha-form` plus the entity warnings; emits `config-changed`. |
| `src/editor/schema.ts` | `ha-form` schema, field labels and help. |
| `src/editor/form.ts` | Config ↔ form data. Only writes values that differ from the defaults. |
| `src/editor/validation.ts` | Entity checks shown by the editor (missing entity, missing attribute, no value). |
| `src/localize/` | `en.ts` is the reference; `fr.ts` is typed against it (a missing key fails to compile). `resolveLanguage` picks the card `language` option, then the HA user language. |
| `demo/` | Demo page: simulated `hass` (states and history), sliders, presets, YAML editor. Stubs for `ha-card` and `ha-icon`. |
| `design/` | The standalone design mockup (vanilla JS, simulated data). |
| `test/` | Vitest tests, running in Node (no DOM). |

Design rules:

- **Logic lives in pure modules.** Reading, units, history, chart geometry and the view never
  touch the DOM, which is what makes them testable. Keep `live-wind-card.ts` and the canvas part of
  `streaks.ts` thin.
- **Speeds are km/h and bearings degrees (where the wind comes from) everywhere inside.**
  Conversion happens at the edges: reading an entity (`speedFromRaw`) and displaying a value
  (`formatSpeed`).
- **One weather entity is enough, dedicated entities win.** `resolveSources` is the only place
  that knows the `wind_*` attributes.
- **Animation bypasses Lit.** `StreakCanvas` draws on a canvas on its own `requestAnimationFrame`
  loop, paused off-screen. Lit only re-renders when a watched entity changes (`shouldUpdate`).
- **The dial turns the short way.** The pointer keeps a continuous angle (`nextRotation`), so going
  from 350° to 10° does not spin it round.
- **Lit without decorators**: `static properties` + `declare` fields, with
  `useDefineForClassFields: false`. Do not initialize these fields at declaration.
- **Clean, iOS-like design**: neutral surfaces, color reserved for the wind (the Beaufort force), no
  neon effects. Colors go through the `--lwc-*` CSS variables so themes can override them.
- **Backward-compatible configuration**: a renamed or removed option must still be accepted, or
  produce an explicit error in `validateConfig`.

## Testing

Every change or new feature must be **testable and tested**:

- Add or extend tests in `test/` (`*.test.ts`), one file per module: `wind`, `reading`, `history`,
  `chart`, `streaks`, `config`, `entities`, `view`, `localize`, `editor`, `release-notes`. Create a
  new file when a new module appears.
- Design for testing: extract logic into an exported pure function instead of leaving it in the
  component.
- A bug fix starts with a test that reproduces the bug.
- Coverage has floors (`vite.config.ts`): a global one, and a higher one for the pure modules. Raise
  them when coverage improves; never lower them to make a change pass. The DOM code
  (`live-wind-card.ts`, `StreakCanvas`, `editor.ts`) is not unit tested, which is one more reason to
  keep it thin.
- Key invariants have tests: no `NaN` in the paths whatever the data, a speed that is always
  converted to km/h, the history cut where data is missing, every field and option labelled in
  every language.
- For visual changes, check the demo (`npm run dev`). If a case cannot be reproduced there, add a
  preset or an example to `demo/main.ts`.
- The editor's logic (schema, config ↔ form conversion, issues) is tested in `editor.test.ts`.
  Its rendering can only be checked inside Home Assistant: say so when you change it.

## Documentation

Every code change comes with the matching documentation update, in the same commit or series:

- `README.md`: options (tables), YAML examples, user-visible behavior.
- `AGENTS.md`: architecture, commands, conventions, known pitfalls.
- `src/localize/en.ts` and `fr.ts`: every new label, in both languages. To add a language, create
  `src/localize/xx.ts` typed against `en`, register it in `LANGUAGES` and `LANGUAGE_NAMES`
  (`localize.ts`), and list it in the README.
- `demo/main.ts`: a way to try the change outside Home Assistant.

## Versioning and release

- The version comes from `package.json` (injected through `__VERSION__` and logged in the console
  as `LIVE-WIND-CARD x.y.z`). Bump it on every delivery (SemVer).
- Manual install: copy `dist/live-wind-card.js` to `/config/www/` and change the `?v=` parameter of
  the Lovelace resource to bust the cache.
- `dist/` is not versioned.
- Release: bump `package.json`, commit `chore: release x.y.z`, then push a `vx.y.z` tag. The
  `Release` workflow checks that the tag matches `package.json`, runs `npm run check` and publishes
  a GitHub release with `live-wind-card.js` attached (what HACS installs). The release notes are
  built from the Conventional Commits since the previous tag (`scripts/release-notes.mjs`).
- The repository is local for now: add the GitHub remote before the first release, and the
  `hacs.json` / README URLs with it.

## Continuous integration

- `.github/workflows/ci.yml` runs `npm run check` on every push to `main` and every pull request,
  and keeps the coverage report and the bundle as artifacts.
- `.github/workflows/release.yml`: see above.
- Dependabot opens monthly update PRs for npm (dev dependencies grouped) and the GitHub actions.
- The Node version is pinned in `.nvmrc`, shared by CI and local development.

## Commits

Conventional Commits, in English, concise, no `Co-authored-by`. Details in
[CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run check` before committing.

## Known pitfalls

- **Weather entity history needs the attributes.** `history_during_period` is asked with
  `no_attributes: false, minimal_response: false` as soon as one value is read from an attribute;
  otherwise the cheaper `minimal_response` is used, and the unit comes from the current state of
  the entity (`liveUnits`).
- **Recorder states are compressed**: `s`, `a`, `lu` (seconds since the epoch, as a float).
  `toTimeline` also accepts the long keys.
- **CSS variables in SVG**: `stroke="var(--x)"` as an attribute does not work, `style="stroke:
  var(--x)"` does. Dynamic colors go through `style`. A canvas cannot read a CSS variable at all:
  the card resolves it with `getComputedStyle` first (`_cssColor`).
- **`ha-form` groups**: an `expandable` with `flatten: true` keeps its fields at the top level of
  the data. The `attribute` selector finds its entity through `context: { filter_entity }`.
- **The `select` selector deals in strings**: the history windows (`3`… `72`) are converted back to
  numbers in `fromFormData`, and `history_windows` is only written when it differs from the default.
- **The window shown first must be one that can be picked**: `pickWindow` takes the closest of
  `history_windows` (the shorter on a tie), whatever `history_hours` says. The history is read over
  the longest window offered, and the switch is hidden when only one is.
- **Non-breaking spaces in `Intl` output** (`5 min` in French): match with `\s`, not a plain space.
- **Hidden elements keep their grid cell.** An option that hides a tile must change the number of
  columns (`--tiles`), otherwise an empty cell is left.
- **Gusts are never below the speed**: `readWind` and `buildSeries` both lift them, a sensor
  update order can otherwise show a gust under the average.
- **`unit: auto` follows the entity, not the unit system.** A metric Home Assistant reports `m/s` as its
  wind speed unit, whatever the unit of the entities: the card reads the unit of the speed entity
  first (`displayUnitOf`), and only falls back on the unit system when it has none it can display.
