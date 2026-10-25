import { DEFAULT_HISTORY_WINDOWS, DEFAULTS, sortedWindows } from '../config';
import type { LiveWindCardConfig } from '../types';

/**
 * Configuration ↔ form data. The form always shows a value; the configuration only keeps the values
 * that differ from the defaults, so the YAML of a card stays short and follows future defaults.
 */

/** Options of the form with a default, shown as such. */
const DEFAULT_KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

/** Options without a default: written when filled in, dropped when emptied. */
const FREE_KEYS = [
  'name',
  'subtitle',
  'weather_entity',
  'speed_entity',
  'speed_attribute',
  'gust_entity',
  'gust_attribute',
  'direction_entity',
  'direction_attribute',
  'tap_action',
  'hold_action',
  'double_tap_action',
] as const;

const FORM_KEYS = new Set<string>([...DEFAULT_KEYS, ...FREE_KEYS, 'history_windows']);

/** The `select` of the history window deals in strings. */
const NUMERIC_SELECTS = new Set<string>(['history_hours']);

export function toFormData(config: LiveWindCardConfig): Record<string, unknown> {
  const data: Record<string, unknown> = { ...config };
  for (const key of DEFAULT_KEYS) data[key] ??= DEFAULTS[key];
  for (const key of NUMERIC_SELECTS) data[key] = String(data[key]);
  // The windows to offer, as the strings the multiple `select` deals in.
  data.history_windows = sortedWindows(config.history_windows).map(String);
  return data;
}

/** The configuration after an edit of the form; what the form does not know is kept from `previous`. */
export function fromFormData(
  data: Record<string, unknown>,
  previous: LiveWindCardConfig,
): LiveWindCardConfig {
  const out: Record<string, unknown> = { type: previous.type };
  // An option the form does not know (a newer version, `card_mod`…) must survive an edit.
  for (const [key, value] of Object.entries(previous))
    if (!FORM_KEYS.has(key) && key !== 'type') out[key] = value;

  for (const key of DEFAULT_KEYS) {
    const raw = data[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = NUMERIC_SELECTS.has(key) ? Number(raw) : raw;
    if (value !== DEFAULTS[key]) out[key] = value;
  }
  // Written only when it differs from the default windows; emptying the list brings the default back.
  const windows = Array.isArray(data.history_windows) ? sortedWindows(data.history_windows.map(Number)) : [];
  if (windows.length && windows.join() !== DEFAULT_HISTORY_WINDOWS.join()) out.history_windows = windows;
  for (const key of FREE_KEYS) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out as unknown as LiveWindCardConfig;
}
