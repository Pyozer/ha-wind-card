import { resolveSources, sourceEntities } from './reading';
import type {
  ArrowMode,
  ColorMode,
  CompassLetters,
  HistoryHours,
  Layout,
  LiveWindCardConfig,
  SpeedUnit,
} from './types';
import { displayUnitOf, systemUnit } from './wind';

/** Default value of every option of the card. */
export const DEFAULTS = {
  unit: 'auto',
  arrow: 'to',
  compass_letters: 'auto',
  colors: 'beaufort',
  max_speed: 100,
  layout: 'full',
  history_hours: 12,
  show_gust: true,
  show_stats: true,
  show_beaufort: true,
  show_history: true,
  show_history_arrows: true,
  show_updated: true,
  animations: true,
  language: 'auto',
} as const;

export const UNITS: readonly ('auto' | SpeedUnit)[] = ['auto', 'kmh', 'ms', 'kn', 'mph', 'bft'];
export const ARROWS: readonly ArrowMode[] = ['to', 'from'];
export const COMPASS_OPTIONS: readonly ('auto' | CompassLetters)[] = ['auto', 'NESO', 'NESW'];
export const COLOR_MODES: readonly ColorMode[] = ['beaufort', 'accent'];
export const LAYOUTS: readonly Layout[] = ['full', 'compact'];
/** Every duration the history can show. */
export const HISTORY_WINDOWS: readonly HistoryHours[] = [3, 6, 12, 24, 48, 72];
/** The windows offered when none are chosen. */
export const DEFAULT_HISTORY_WINDOWS: readonly HistoryHours[] = [3, 12, 24];

const ENUMS: Record<string, readonly (string | number)[]> = {
  unit: UNITS,
  arrow: ARROWS,
  compass_letters: COMPASS_OPTIONS,
  colors: COLOR_MODES,
  layout: LAYOUTS,
  history_hours: HISTORY_WINDOWS,
};

const BOOLEANS = [
  'show_gust',
  'show_stats',
  'show_beaufort',
  'show_history',
  'show_history_arrows',
  'show_updated',
  'animations',
] as const;

/**
 * Checks a configuration and coerces what can be (`"100"` for `max_speed`), with readable errors
 * for the rest. An unknown option is kept as is: it may belong to a newer version of the card.
 * A card without any entity is valid: it asks for one, so it can be added before being set up.
 */
export function validateConfig(input: unknown): LiveWindCardConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid configuration: an object is expected.');
  }
  const config = { ...(input as Record<string, unknown>) };

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (config[key] === undefined || config[key] === null) continue;
    // `history_hours` may come as a string from a form or from YAML written by hand.
    const value = typeof allowed[0] === 'number' ? Number(config[key]) : config[key];
    if (!allowed.includes(value as string | number)) {
      throw new Error(
        `Invalid "${key}": ${JSON.stringify(config[key])}. Expected one of: ${allowed.join(', ')}.`,
      );
    }
    config[key] = value;
  }

  if (config.max_speed !== undefined && config.max_speed !== null) {
    const max = Number(config.max_speed);
    if (!Number.isFinite(max) || max < 10) {
      throw new Error(
        `Invalid "max_speed": ${JSON.stringify(config.max_speed)}. Expected a speed in km/h, 10 or more.`,
      );
    }
    config.max_speed = max;
  }

  if (config.history_windows !== undefined && config.history_windows !== null) {
    const raw = config.history_windows;
    const hours = Array.isArray(raw) ? raw.map(Number) : [];
    if (hours.length === 0 || hours.some((h) => !HISTORY_WINDOWS.includes(h as HistoryHours))) {
      throw new Error(
        `Invalid "history_windows": ${JSON.stringify(raw)}. Expected a list made of: ${HISTORY_WINDOWS.join(', ')}.`,
      );
    }
    config.history_windows = hours;
  }

  for (const key of BOOLEANS) {
    if (config[key] === undefined || config[key] === null) continue;
    if (typeof config[key] !== 'boolean') {
      throw new Error(`Invalid "${key}": ${JSON.stringify(config[key])}. Expected true or false.`);
    }
  }

  for (const key of [
    'weather_entity',
    'speed_entity',
    'gust_entity',
    'direction_entity',
    'speed_attribute',
    'gust_attribute',
    'direction_attribute',
  ]) {
    if (config[key] !== undefined && typeof config[key] !== 'string') {
      throw new Error(`Invalid "${key}": ${JSON.stringify(config[key])}. Expected a string.`);
    }
  }

  return config as unknown as LiveWindCardConfig;
}

/** Entities whose changes should redraw the card. */
export function watchedEntities(config: LiveWindCardConfig): string[] {
  return sourceEntities(resolveSources(config));
}

/** The options as the card uses them: defaults applied, `auto` resolved. */
export interface Settings {
  unit: SpeedUnit;
  arrow: ArrowMode;
  letters: CompassLetters;
  colors: ColorMode;
  maxSpeed: number;
  layout: Layout;
  /** Windows the reader can switch between, shortest first. */
  historyWindows: HistoryHours[];
  /** Window shown at first: always one of `historyWindows`. */
  historyHours: HistoryHours;
  showGust: boolean;
  showStats: boolean;
  showBeaufort: boolean;
  showHistory: boolean;
  showHistoryArrows: boolean;
  showUpdated: boolean;
  animations: boolean;
}

/** Languages that write the west `O` (Ouest, Oeste, Ovest). */
const WEST_IS_O = new Set(['fr', 'es', 'it', 'pt']);

/** The windows of a configuration, without duplicates and shortest first; the default ones when none. */
export function sortedWindows(windows: readonly number[] | undefined): HistoryHours[] {
  const chosen = HISTORY_WINDOWS.filter((h) => windows?.includes(h));
  return chosen.length ? chosen : [...DEFAULT_HISTORY_WINDOWS];
}

/** The window to show first: the wanted one, or the closest one that is selectable (the shorter on a tie). */
export function pickWindow(windows: readonly HistoryHours[], wanted: number): HistoryHours {
  if ((windows as readonly number[]).includes(wanted)) return wanted as HistoryHours;
  return windows.reduce((best, h) => (Math.abs(h - wanted) < Math.abs(best - wanted) ? h : best), windows[0]);
}

/** Units `auto` can follow, as Home Assistant spells them. */
export interface KnownUnits {
  /** Unit of the speed entity: the first choice. */
  entity?: string;
  /** Unit of the Home Assistant unit system (`hass.config.unit_system.wind_speed`): the fallback. */
  system?: string;
}

/**
 * @param language language of the card, already resolved
 * @param units what `auto` follows: the unit of the speed entity, then the unit system
 */
export function resolveSettings(
  config: LiveWindCardConfig,
  language: string,
  units: KnownUnits = {},
): Settings {
  const windows = sortedWindows(config.history_windows);
  const unit = config.unit ?? DEFAULTS.unit;
  const letters = config.compass_letters ?? DEFAULTS.compass_letters;
  return {
    unit: unit === 'auto' ? (displayUnitOf(units.entity) ?? systemUnit(units.system)) : unit,
    arrow: config.arrow ?? DEFAULTS.arrow,
    letters:
      letters === 'auto' ? (WEST_IS_O.has(language.split('-')[0].toLowerCase()) ? 'NESO' : 'NESW') : letters,
    colors: config.colors ?? DEFAULTS.colors,
    maxSpeed: config.max_speed ?? DEFAULTS.max_speed,
    layout: config.layout ?? DEFAULTS.layout,
    historyWindows: windows,
    historyHours: pickWindow(windows, config.history_hours ?? DEFAULTS.history_hours),
    showGust: config.show_gust ?? DEFAULTS.show_gust,
    showStats: config.show_stats ?? DEFAULTS.show_stats,
    showBeaufort: config.show_beaufort ?? DEFAULTS.show_beaufort,
    showHistory: config.show_history ?? DEFAULTS.show_history,
    showHistoryArrows: config.show_history_arrows ?? DEFAULTS.show_history_arrows,
    showUpdated: config.show_updated ?? DEFAULTS.show_updated,
    animations: config.animations ?? DEFAULTS.animations,
  };
}
