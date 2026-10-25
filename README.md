# Live Wind Card

A Home Assistant Lovelace card that shows the wind: **speed, gusts, direction and history**. The
design follows iOS app conventions, like [Live Energy Card](https://github.com/Pyozer/ha-live-energy-card):
neutral surfaces, with color reserved for the wind itself. The color follows the Beaufort force.

```
        N
   ╭────────╮    Gusts      From       Max 12 h
 O │   25   │ E  50 km/h    W 280°     33 km/h
   │  km/h  │
   ╰────────╯    Beaufort scale  ●━━━━━━━━━━━
        S        History  3 h · 12 h · 24 h
```

## Features

- **Compass dial** with a pointer on the ring, an arc for the speed (the gusts in a lighter shade),
  and animated **wind streaks** that cross the dial in the direction the wind blows: the stronger
  the wind, the more numerous and faster they are.
- **Beaufort force** in the center, in the header and on a 13-segment scale. The whole card takes
  the color of the current force, from calm grey-blue to violet for a hurricane.
- **Tiles** for the gusts, the direction (letters, degrees and where it blows to) and the maximum
  of the period.
- **History** over 3, 12 or 24 hours, with the gusts, a direction arrow per sample and a cursor
  that follows a finger or the pointer. Read from the recorder; the curve is cut where a sensor
  was unavailable.
- **Full or compact layout.** The card adapts to its width: a dial next to the tiles on a wide
  card, stacked on a phone. The compact layout is a single line with a small curve.
- **One weather entity is enough**: speed, gusts and direction are read from its attributes. Any
  of the three can be replaced by a dedicated entity (a personal weather station, for instance),
  from its state or from an attribute.
- **Units**: km/h, m/s, knots, mph or Beaufort force, following the Home Assistant unit system by
  default. Entities are converted whatever unit they use (km/h, m/s, mph, kn, ft/s, Bft).
- **Direction** read as degrees or compass letters (`WSW`, `OSO`…), shown with `N E S O` or
  `N E S W` letters, with an arrow that shows where the wind blows to or where it comes from.
- `unavailable` / `unknown` entities are reported cleanly: never `NaN`.
- `tap_action`, `hold_action`, `double_tap_action` (more-info of the weather entity by default).
- Automatic light and dark themes, `prefers-reduced-motion` support, animation paused off-screen.
- Full visual editor with entity pickers that only offer wind entities, and a warning for the
  entities to check. English and French translations (following the Home Assistant user's
  language, or set per card).

## Installation

### Manual

1. Copy `dist/live-wind-card.js` to `/config/www/live-wind-card.js` (via the Samba app, File
   editor or SSH).
2. **Settings → Dashboards → ⋮ → Resources → Add resource**:
   - URL: `/local/live-wind-card.js?v=0.1.0`
   - Type: *JavaScript module*
3. Reload the page without cache (Ctrl/Cmd + Shift + R).
4. Add the card: **Edit dashboard → Add card → Live Wind Card**.

For each new version, copy the file again and increment `?v=` to bypass the browser and mobile app
caches.

### HACS (custom repository)

Once the repository is published: **HACS → ⋮ → Custom repositories**, add its URL with the type
*Dashboard*, then install **Live Wind Card**. HACS installs the `live-wind-card.js` attached to
each release.

## Configuration

Everything can be set from the visual editor. In YAML:

```yaml
type: custom:live-wind-card
weather_entity: weather.home
```

### Sources

| Option | Default | Description |
| --- | --- | --- |
| `weather_entity` | | A `weather.*` entity. Speed, gusts and direction come from its `wind_speed`, `wind_gust_speed` and `wind_bearing` attributes. |
| `speed_entity` | | Dedicated wind speed entity. Wins over `weather_entity`. |
| `speed_attribute` | | Read this attribute of `speed_entity` instead of its state. |
| `gust_entity` / `gust_attribute` | | Same, for the gusts. |
| `direction_entity` / `direction_attribute` | | Same, for the direction: degrees (0 to 360) or compass letters. |

A card needs at least `weather_entity` or `speed_entity`. Without gusts, the gust elements are left
out; without a direction, the pointer and the arrows are hidden.

### Display

| Option | Default | Description |
| --- | --- | --- |
| `name` | `Wind` | Title. |
| `subtitle` | | Text under the title, such as a place. |
| `layout` | `full` | `full`, or `compact` (one line). |
| `unit` | `auto` | `auto` (Home Assistant unit system), `kmh`, `ms`, `kn`, `mph` or `bft`. |
| `arrow` | `to` | `to`: the arrow shows where the wind blows to. `from`: where it comes from. |
| `compass_letters` | `auto` | `auto` (follows the language), `NESO` (French, Spanish, Italian, Portuguese) or `NESW`. |
| `colors` | `beaufort` | `beaufort` (color of the force) or `accent` (the theme's primary color). |
| `max_speed` | `100` | Speed (km/h) at which the arc of the dial is full. |
| `history_hours` | `12` | Window shown at first: `3`, `12` or `24`. The reader can switch. |
| `language` | `auto` | `auto`, `en` or `fr`. |

### Elements

All are `true` by default.

| Option | Description |
| --- | --- |
| `show_gust` | The gusts: arc of the dial, tile, chart line. |
| `show_stats` | The tiles: gusts, direction and maximum. |
| `show_beaufort` | The Beaufort scale. |
| `show_history` | The history chart. |
| `show_history_arrows` | The direction arrows under the chart. |
| `show_updated` | "updated 2 min ago" under the title. |
| `animations` | The wind streaks in the dial. |

### Actions

`tap_action`, `hold_action` and `double_tap_action` accept any
[Home Assistant action](https://www.home-assistant.io/dashboards/actions/). A tap opens the
more-info dialog of the weather (or speed) entity by default; use `tap_action: { action: none }`
to turn it off.

### Examples

A personal weather station, in m/s, with one color:

```yaml
type: custom:live-wind-card
name: Garden
speed_entity: sensor.station_wind_speed
gust_entity: sensor.station_wind_gust
direction_entity: sensor.station_wind_direction
unit: ms
colors: accent
```

The weather entity, with the direction of a station:

```yaml
type: custom:live-wind-card
weather_entity: weather.home
direction_entity: sensor.station_wind_direction
```

A compact card for a dashboard header:

```yaml
type: custom:live-wind-card
weather_entity: weather.home
layout: compact
```

Only the dial:

```yaml
type: custom:live-wind-card
weather_entity: weather.home
show_stats: false
show_beaufort: false
show_history: false
```

### Notes

- **History** comes from the recorder (`history/history_during_period`), once for 24 hours and
  every 5 minutes after. An entity excluded from the recorder has no history: the card then shows
  the current wind only. A weather entity's history is read from its attributes, which the recorder
  keeps with each state.
- **Units**: the unit of a sensor is read from its `unit_of_measurement`, that of a weather entity
  from `wind_speed_unit`. A sensor without a known unit is read as km/h.
- **Theming**: the card follows the Home Assistant theme. Its variables can be overridden (for
  instance with `card_mod`): `--lwc-accent`, `--lwc-surface`, `--lwc-text`, `--lwc-muted`,
  `--lwc-north` (the north on the dial).

## Development

```bash
npm install
npm run dev     # demo outside Home Assistant: http://localhost:5173/demo/
npm test        # unit tests
npm run check   # lint, format, coverage, build, bundle size
npm run build   # dist/live-wind-card.js
```

See [AGENTS.md](AGENTS.md) for the architecture and conventions, and
[CONTRIBUTING.md](CONTRIBUTING.md) for the commit rules.

## License

MIT
