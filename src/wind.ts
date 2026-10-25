import type { ColorMode, CompassLetters, SpeedUnit } from './types';

/**
 * Wind maths: Beaufort scale, compass, speed units. Pure, no DOM. Speeds are in km/h and
 * directions in degrees (the direction the wind comes **from**, 0 = north, clockwise) everywhere
 * inside the card; conversion happens at the edges (reading an entity, displaying a value).
 */

// --- Beaufort -----------------------------------------------------------------------------------

/** Upper bounds (km/h, exclusive) of the forces 0 to 11. Force 12 has no upper bound. */
export const BEAUFORT_LIMITS = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118] as const;

/** Lower bound (km/h) of each force, 0 to 12. */
export const BEAUFORT_LOWER = [0, ...BEAUFORT_LIMITS] as const;

/** One color per force, from calm (grey-blue) to hurricane (violet). */
export const BEAUFORT_COLORS = [
  '#9aa7b8',
  '#5ac8fa',
  '#32d2c8',
  '#30d59a',
  '#34c759',
  '#a4cc3a',
  '#ffcc00',
  '#ff9f0a',
  '#ff7a1a',
  '#ff3b30',
  '#d6205a',
  '#af52de',
  '#8a3ffc',
] as const;

export const MAX_FORCE = 12;

/** Beaufort force (0 to 12) of a speed in km/h. */
export function beaufortForce(kmh: number): number {
  const index = BEAUFORT_LIMITS.findIndex((limit) => kmh < limit);
  return index === -1 ? MAX_FORCE : index;
}

/** A speed (km/h) in the middle of a force, to turn a Beaufort reading back into km/h. */
export function beaufortToKmh(force: number): number {
  const f = Math.min(MAX_FORCE, Math.max(0, Math.round(force)));
  if (f === 0) return 0;
  if (f === MAX_FORCE) return BEAUFORT_LOWER[MAX_FORCE];
  return (BEAUFORT_LOWER[f] + BEAUFORT_LOWER[f + 1]) / 2;
}

/**
 * Color of a speed: the color of its force, or the accent color. `accent` is a CSS color, which can
 * be a variable (the card) or a plain value (the SVG gradient of the chart).
 */
export function windColor(kmh: number, mode: ColorMode, accent: string): string {
  return mode === 'accent' ? accent : BEAUFORT_COLORS[beaufortForce(kmh)];
}

// --- Compass ------------------------------------------------------------------------------------

/** The 16 points of the compass, in English letters, clockwise from the north. */
export const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export const POINT_COUNT = COMPASS_POINTS.length;

/** Degrees normalized to [0, 360). */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Index (0 to 15) of the compass point nearest to a bearing. */
export function pointIndex(deg: number): number {
  return Math.round(normalizeDegrees(deg) / 22.5) % POINT_COUNT;
}

/** Letters of a point: `W` becomes `O` (Ouest) with the `NESO` letters. */
export function pointLetters(index: number, letters: CompassLetters): string {
  const point = COMPASS_POINTS[((index % POINT_COUNT) + POINT_COUNT) % POINT_COUNT];
  return letters === 'NESO' ? point.replaceAll('W', 'O') : point;
}

/** The four cardinal letters in dial order: north, east, south, west. */
export function cardinalLetters(letters: CompassLetters): [string, string, string, string] {
  return letters === 'NESO' ? ['N', 'E', 'S', 'O'] : ['N', 'E', 'S', 'W'];
}

/** The bearing opposite to another: where the wind blows to, given where it comes from. */
export function oppositeBearing(deg: number): number {
  return normalizeDegrees(deg + 180);
}

/**
 * A bearing from what an entity holds: degrees (`280`, `"280.5"`) or compass letters (`WSW`,
 * `OSO`, in any case). `null` when it is neither (`unknown`, `variable`…).
 */
export function parseBearing(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? normalizeDegrees(raw) : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return null;
  const num = Number(text);
  if (Number.isFinite(num)) return normalizeDegrees(num);
  const letters = text.toUpperCase().replaceAll('O', 'W');
  const index = (COMPASS_POINTS as readonly string[]).indexOf(letters);
  return index === -1 ? null : index * 22.5;
}

/**
 * The rotation to apply so that a dial turns by the shortest way: `previous` is the angle already
 * applied (it may be beyond 360), `target` the bearing to reach. Without this, going from 350° to
 * 10° would spin the needle all the way round.
 */
export function nextRotation(previous: number, target: number): number {
  const delta = ((((target - previous) % 360) + 540) % 360) - 180;
  return previous + delta;
}

// --- Speed units --------------------------------------------------------------------------------

interface UnitInfo {
  label: string;
  /** Value in this unit for 1 km/h. */
  perKmh: number;
  decimals: number;
}

export const SPEED_UNITS: Record<Exclude<SpeedUnit, 'bft'>, UnitInfo> = {
  kmh: { label: 'km/h', perKmh: 1, decimals: 0 },
  ms: { label: 'm/s', perKmh: 1 / 3.6, decimals: 1 },
  kn: { label: 'kn', perKmh: 1 / 1.852, decimals: 0 },
  mph: { label: 'mph', perKmh: 1 / 1.609344, decimals: 0 },
};

/** Speed units as Home Assistant spells them, with the factor to km/h. */
const HA_UNITS: Record<string, number> = {
  'km/h': 1,
  kmh: 1,
  kph: 1,
  'km/hr': 1,
  'm/s': 3.6,
  mps: 3.6,
  mph: 1.609344,
  'mi/h': 1.609344,
  kn: 1.852,
  kt: 1.852,
  kts: 1.852,
  knot: 1.852,
  knots: 1.852,
  nds: 1.852,
  'ft/s': 1.09728,
  fps: 1.09728,
};

/** Factor to km/h of a unit written by an entity; `undefined` for a unit we do not know. */
export function kmhPerUnit(unit: string | undefined): number | undefined {
  if (!unit) return undefined;
  return HA_UNITS[unit.trim().toLowerCase()];
}

/**
 * The display unit that matches a unit written by Home Assistant (`km/h`, `m/s`, `Bft`…), or
 * `undefined` when none does (`ft/s`, an unknown unit).
 */
export function displayUnitOf(unit: string | undefined): SpeedUnit | undefined {
  const name = unit?.trim().toLowerCase();
  if (name === 'bft' || name === 'beaufort') return 'bft';
  const factor = kmhPerUnit(unit);
  if (factor === 1) return 'kmh';
  if (factor === 3.6) return 'ms';
  if (factor === 1.609344) return 'mph';
  if (factor === 1.852) return 'kn';
  return undefined;
}

/** The speed unit of the Home Assistant unit system, km/h when it does not say. */
export function systemUnit(wind: string | undefined): SpeedUnit {
  return displayUnitOf(wind) ?? 'kmh';
}

export function unitLabel(unit: SpeedUnit): string {
  return unit === 'bft' ? 'Bft' : SPEED_UNITS[unit].label;
}

export function unitDecimals(unit: SpeedUnit): number {
  return unit === 'bft' ? 0 : SPEED_UNITS[unit].decimals;
}

/** A speed in km/h expressed in a display unit (the Beaufort force for `bft`). */
export function convertSpeed(kmh: number, unit: SpeedUnit): number {
  return unit === 'bft' ? beaufortForce(kmh) : kmh * SPEED_UNITS[unit].perKmh;
}

// --- Formatting ---------------------------------------------------------------------------------

/** A number with a fixed count of decimals, in the language of the card. */
export function formatNumber(value: number, decimals: number, language: string): string {
  const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  try {
    return new Intl.NumberFormat(language, options).format(value);
  } catch {
    // An unknown language tag: fall back to the default locale rather than failing to render.
    return value.toFixed(decimals);
  }
}

/** A speed (km/h) as text in a display unit, without the unit. */
export function formatSpeed(kmh: number, unit: SpeedUnit, language: string): string {
  return formatNumber(convertSpeed(kmh, unit), unitDecimals(unit), language);
}

/**
 * Formatter of the times of the chart for a window of `hours`: the time within a day, with the
 * weekday as well beyond, where the same time comes back every day.
 */
export function clockFormat(hours: number, language: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (hours > 24) options.weekday = 'short';
  try {
    return new Intl.DateTimeFormat(language, options);
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

/** How long ago something happened, like "2 min ago", from an age in milliseconds. */
export function formatAge(ageMs: number, language: string): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    seconds < 45
      ? [0, 'second']
      : seconds < 45 * 60
        ? [Math.max(1, Math.round(seconds / 60)), 'minute']
        : seconds < 36 * 3600
          ? [Math.round(seconds / 3600), 'hour']
          : [Math.round(seconds / 86400), 'day'];
  try {
    return new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' }).format(-value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}

// --- Dial ---------------------------------------------------------------------------------------

/**
 * Share (0 to 1) of the arc of the dial filled by a speed. The scale is not linear (power 0.62) so
 * that breezes stay visible next to storms.
 */
export function arcFraction(kmh: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, Math.pow(Math.max(kmh, 0) / max, 0.62)));
}

/** `nice` axis maximum above a peak, with a step suited to the magnitude. */
export function niceMax(peak: number): number {
  const step = peak > 90 ? 40 : peak > 50 ? 20 : peak > 25 ? 10 : 5;
  return Math.max(step, Math.ceil(peak / step) * step);
}
