import './stubs';
import { parse, stringify } from 'yaml';
import { LiveWindCard } from '../src/live-wind-card';
import type { HassEntity, HomeAssistant, LiveWindCardConfig } from '../src/types';

interface CardElement extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LiveWindCardConfig): void;
}

// Keep the import: it registers the custom element.
void LiveWindCard;

const WEATHER = 'weather.home';
const SPEED = 'sensor.wind_speed';
const GUST = 'sensor.wind_gust';
const DIRECTION = 'sensor.wind_direction';

interface Wind {
  speed: number;
  gust: number;
  dir: number;
  available: boolean;
}

const wind: Wind = { speed: 25, gust: 50, dir: 280, available: true };
let language = 'en';
let dark = false;

// --- Simulated history ------------------------------------------------------------------------

const STEP = 300_000;
const POINTS = 289;

interface Sample {
  t: number;
  s: number;
  g: number;
  d: number;
}

let samples: Sample[] = [];

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** 24 hours of smooth wind ending on the given values. */
function simulate(now: number, w: Wind, seed: number): Sample[] {
  const rnd = random(seed);
  const knots = Array.from({ length: 98 }, () => rnd());
  const noise = (x: number) => {
    const k = x * 96;
    const i = Math.floor(k);
    return knots[i] * (1 - (k - i)) + knots[i + 1] * (k - i);
  };
  const base = Math.max(w.speed * 0.8, 5);
  return Array.from({ length: POINTS }, (_, i) => {
    const x = i / (POINTS - 1);
    const blend = Math.min(1, Math.max(0, (x - 0.93) / 0.07));
    const shape = 1 + 0.4 * Math.sin(x * 9 + 1.2) + 0.2 * Math.sin(x * 21 + 0.4) + (noise(x) - 0.5) * 0.34;
    const s = Math.max(0, base * shape) * (1 - blend) + w.speed * blend;
    const g =
      Math.max(s, s * (1.25 + noise((x * 1.7 + 0.31) % 1) * 0.35) + 2) * (1 - blend) +
      Math.max(w.gust, w.speed) * blend;
    const d =
      (w.dir +
        55 * Math.sin(x * 6.5 + 0.8) +
        18 * Math.sin(x * 17) +
        (noise((x * 2.3 + 0.6) % 1) - 0.5) * 20 +
        720) %
      360;
    return { t: now - (POINTS - 1 - i) * STEP, s, g, d: d * (1 - blend) + w.dir * blend };
  });
}

// --- Simulated Home Assistant -----------------------------------------------------------------

function entity(id: string, state: string, attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    last_updated: new Date().toISOString(),
    last_changed: new Date().toISOString(),
  };
}

function buildStates(): Record<string, HassEntity> {
  const v = (n: number) => (wind.available ? String(Math.round(n * 10) / 10) : 'unavailable');
  return {
    [WEATHER]: entity(
      WEATHER,
      wind.available ? 'partlycloudy' : 'unavailable',
      wind.available
        ? {
            friendly_name: 'Home',
            wind_speed: wind.speed,
            wind_gust_speed: wind.gust,
            wind_bearing: wind.dir,
            wind_speed_unit: 'km/h',
          }
        : {},
    ),
    [SPEED]: entity(SPEED, v(wind.speed), {
      friendly_name: 'Wind speed',
      unit_of_measurement: 'km/h',
      device_class: 'wind_speed',
    }),
    [GUST]: entity(GUST, v(wind.gust), {
      friendly_name: 'Wind gust',
      unit_of_measurement: 'km/h',
      device_class: 'wind_speed',
    }),
    [DIRECTION]: entity(DIRECTION, v(wind.dir), {
      friendly_name: 'Wind direction',
      unit_of_measurement: '°',
    }),
  };
}

/** `history/history_during_period` in its compressed format. */
function callWS<T>(msg: Record<string, unknown>): Promise<T> {
  if (msg.type !== 'history/history_during_period') return Promise.reject(new Error('unsupported'));
  const ids = msg.entity_ids as string[];
  const withAttributes = msg.no_attributes === false;
  const out: Record<string, unknown[]> = {};
  for (const id of ids) {
    out[id] = samples.map((p) => {
      const lu = p.t / 1000;
      if (id === WEATHER) {
        return {
          s: 'partlycloudy',
          lu,
          a: { wind_speed: p.s, wind_gust_speed: p.g, wind_bearing: p.d, wind_speed_unit: 'km/h' },
        };
      }
      const value = id === SPEED ? p.s : id === GUST ? p.g : p.d;
      return withAttributes
        ? { s: String(value), lu, a: { unit_of_measurement: id === DIRECTION ? '°' : 'km/h' } }
        : { s: String(Math.round(value * 10) / 10), lu };
    });
  }
  return new Promise((resolve) => setTimeout(() => resolve(out as T), 250));
}

function hass(): HomeAssistant {
  return {
    states: buildStates(),
    language,
    locale: { language },
    themes: { darkMode: dark },
    config: { unit_system: { wind_speed: 'km/h' } },
    callWS: callWS as HomeAssistant['callWS'],
  };
}

// --- Cards ------------------------------------------------------------------------------------

const EXAMPLES: Record<string, LiveWindCardConfig> = {
  'Weather entity': {
    type: 'custom:live-wind-card',
    weather_entity: WEATHER,
    name: 'Wind',
    subtitle: 'Home',
  },
  'Dedicated sensors': {
    type: 'custom:live-wind-card',
    speed_entity: SPEED,
    gust_entity: GUST,
    direction_entity: DIRECTION,
    history_hours: 3,
  },
  'm/s, one color': {
    type: 'custom:live-wind-card',
    weather_entity: WEATHER,
    unit: 'ms',
    colors: 'accent',
    arrow: 'from',
  },
  Minimal: {
    type: 'custom:live-wind-card',
    weather_entity: WEATHER,
    show_stats: false,
    show_beaufort: false,
    show_history: false,
  },
  'No source': { type: 'custom:live-wind-card' },
};

let base: LiveWindCardConfig = EXAMPLES['Weather entity'];

const CARDS: { host: string; layout?: 'compact' }[] = [
  { host: 'card-wide' },
  { host: 'card-narrow' },
  { host: 'card-compact', layout: 'compact' },
  { host: 'card-compact-narrow', layout: 'compact' },
];

const cards = CARDS.map(({ host, layout }) => {
  const el = document.createElement('live-wind-card') as CardElement;
  document.getElementById(host)!.append(el);
  return { el, layout };
});

function applyConfig(): void {
  for (const { el, layout } of cards) el.setConfig(layout ? { ...base, layout } : base);
  applyHass();
}

function applyHass(): void {
  const h = hass();
  for (const { el } of cards) el.hass = h;
}

// --- Controls ---------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function refreshReadouts(): void {
  ($('in-speed') as HTMLInputElement).value = String(wind.speed);
  ($('in-gust') as HTMLInputElement).value = String(wind.gust);
  ($('in-dir') as HTMLInputElement).value = String(wind.dir);
  $('v-speed').textContent = `${wind.speed} km/h`;
  $('v-gust').textContent = `${wind.gust} km/h`;
  $('v-dir').textContent = `${Math.round(wind.dir)}°`;
}

function setWind(next: Partial<Wind>, regenerate = false): void {
  Object.assign(wind, next);
  wind.gust = Math.max(wind.gust, wind.speed);
  if (regenerate) samples = simulate(Date.now(), wind, Math.floor(wind.speed * 7 + wind.dir));
  else if (samples.length)
    samples[samples.length - 1] = {
      ...samples[samples.length - 1],
      s: wind.speed,
      g: wind.gust,
      d: wind.dir,
    };
  refreshReadouts();
  // A new history is only read when the configuration is set again (the card refreshes it every 5 minutes).
  if (regenerate) applyConfig();
  else applyHass();
}

const PRESETS: { name: string; wind: Partial<Wind> }[] = [
  { name: 'Calm', wind: { speed: 0, gust: 4, dir: 95, available: true } },
  { name: 'Breeze', wind: { speed: 14, gust: 24, dir: 200, available: true } },
  { name: 'Current', wind: { speed: 25, gust: 50, dir: 280, available: true } },
  { name: 'Gale', wind: { speed: 55, gust: 80, dir: 235, available: true } },
  { name: 'Storm', wind: { speed: 92, gust: 128, dir: 40, available: true } },
  { name: 'Unavailable', wind: { available: false } },
];

const presets = $('presets');
for (const preset of PRESETS) {
  const button = document.createElement('button');
  button.className = 'chip' + (preset.name === 'Current' ? ' on' : '');
  button.textContent = preset.name;
  button.onclick = () => {
    presets.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === button));
    setWind(preset.wind, preset.wind.available !== false);
  };
  presets.append(button);
}

for (const [id, key] of [
  ['in-speed', 'speed'],
  ['in-gust', 'gust'],
  ['in-dir', 'dir'],
] as const) {
  $<HTMLInputElement>(id).addEventListener('input', (ev) =>
    setWind({ [key]: Number((ev.target as HTMLInputElement).value), available: true }),
  );
}

$<HTMLInputElement>('in-dark').addEventListener('change', (ev) => {
  dark = (ev.target as HTMLInputElement).checked;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyHass();
});

$<HTMLSelectElement>('in-lang').addEventListener('change', (ev) => {
  language = (ev.target as HTMLSelectElement).value;
  applyHass();
});

let live = 0;
$<HTMLInputElement>('in-live').addEventListener('change', (ev) => {
  window.clearInterval(live);
  if (!(ev.target as HTMLInputElement).checked) return;
  live = window.setInterval(() => {
    if (!wind.available) return;
    const speed = Math.min(130, Math.max(0, Math.round(wind.speed + (Math.random() - 0.5) * 6)));
    const gust = Math.max(speed, Math.round(wind.gust + (Math.random() - 0.45) * 8));
    setWind({ speed, gust, dir: (wind.dir + (Math.random() - 0.5) * 14 + 360) % 360 });
  }, 1600);
});

const yaml = $<HTMLTextAreaElement>('yaml');
const yamlError = $('yaml-error');
const examples = $('examples');

function showYaml(): void {
  yaml.value = stringify(base).trimEnd();
  yamlError.textContent = '';
}

for (const [name, config] of Object.entries(EXAMPLES)) {
  const button = document.createElement('button');
  button.className = 'chip';
  button.textContent = name;
  button.onclick = () => {
    base = config;
    showYaml();
    applyConfig();
  };
  examples.append(button);
}

yaml.addEventListener('input', () => {
  try {
    base = parse(yaml.value) as LiveWindCardConfig;
    for (const { el, layout } of cards) el.setConfig(layout ? { ...base, layout } : base);
    yamlError.textContent = '';
    applyHass();
  } catch (error) {
    yamlError.textContent = (error as Error).message.split('\n')[0];
  }
});

samples = simulate(Date.now(), wind, 7);
refreshReadouts();
showYaml();
applyConfig();
