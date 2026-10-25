import type { HassEntity, HomeAssistant } from './types';
import {
  rawValue,
  sourceEntities,
  speedFromRaw,
  speedUnitOf,
  usesAttributes,
  type SourceRef,
  type WindReading,
  type WindSources,
} from './reading';
import { parseBearing } from './wind';

/**
 * History of the wind: fetched once for 24 hours from the recorder, resampled on a regular grid
 * (every 5 minutes), then cut into the 3, 12 or 24 hour windows the reader switches between.
 */

export const STEP_MS = 5 * 60_000;
export const MAX_HOURS = 24;
export const POINTS_PER_HOUR = 60 / 5;
export const HISTORY_REFRESH_MS = 5 * 60_000;

/** A sample of the wind: `null` where an entity had nothing (unavailable, not recorded yet). */
export interface WindPoint {
  /** ms since the epoch. */
  t: number;
  /** km/h */
  s: number | null;
  /** km/h */
  g: number | null;
  /** Degrees the wind comes from. */
  d: number | null;
}

/** A state of `history/history_during_period`, with its short keys (or the long ones). */
export interface HistoryState {
  s?: string;
  a?: Record<string, unknown>;
  lu?: number | string;
  state?: string;
  attributes?: Record<string, unknown>;
  last_updated?: number | string;
}

export type HistoryResult = Record<string, HistoryState[]>;

interface TimelineEntry {
  t: number;
  state: string;
  attributes?: Record<string, unknown>;
}

/** A time from the recorder: seconds since the epoch (a float), or an ISO date. */
function toMs(raw: number | string | undefined): number {
  if (typeof raw === 'number') return raw * 1000;
  if (typeof raw === 'string') return Date.parse(raw);
  return NaN;
}

/** The states of an entity as a list sorted by time, without the entries that have no time. */
export function toTimeline(states: HistoryState[] | undefined): TimelineEntry[] {
  return (states ?? [])
    .map((e) => ({
      t: toMs(e.lu ?? e.last_updated),
      state: String(e.s ?? e.state ?? ''),
      attributes: e.a ?? e.attributes,
    }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);
}

/** Asks the recorder for the history of the entities read by the card, `undefined` when it cannot. */
export async function fetchHistory(
  hass: HomeAssistant | undefined,
  sources: WindSources,
  start: number,
  end: number,
): Promise<HistoryResult | undefined> {
  const entities = sourceEntities(sources);
  if (!hass?.callWS || entities.length === 0) return undefined;
  // Attributes are only recorded with the states when asked for: the weather entity needs them.
  const attributes = usesAttributes(sources);
  try {
    return await hass.callWS<HistoryResult>({
      type: 'history/history_during_period',
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      entity_ids: entities,
      include_start_time_state: true,
      significant_changes_only: false,
      minimal_response: !attributes,
      no_attributes: !attributes,
    });
  } catch {
    return undefined;
  }
}

/** The unit each speed source is written in right now, for histories recorded without attributes. */
export function liveUnits(
  states: Record<string, HassEntity>,
  sources: WindSources,
): { speed?: string; gust?: string } {
  const unit = (ref: SourceRef | undefined) =>
    ref ? speedUnitOf(states[ref.entity]?.attributes, ref) : undefined;
  return { speed: unit(sources.speed), gust: unit(sources.gust) };
}

/** Value of a source at a time: the last state recorded at or before it. */
function sample(
  timeline: TimelineEntry[],
  cursor: { i: number },
  t: number,
  read: (entry: TimelineEntry) => number | null,
): number | null {
  while (cursor.i + 1 < timeline.length && timeline[cursor.i + 1].t <= t) cursor.i++;
  const entry = timeline[cursor.i];
  return entry && entry.t <= t ? read(entry) : null;
}

export interface SeriesOptions {
  start: number;
  end: number;
  step?: number;
  /** Units of the entities, for the states recorded without attributes. */
  units?: { speed?: string; gust?: string };
}

/** Resamples the recorded states on a regular grid from `start` to `end` (inclusive). */
export function buildSeries(
  history: HistoryResult | undefined,
  sources: WindSources,
  { start, end, step = STEP_MS, units = {} }: SeriesOptions,
): WindPoint[] {
  const count = Math.max(0, Math.floor((end - start) / step)) + 1;
  const speedAt = (ref: SourceRef | undefined, fallbackUnit: string | undefined) => {
    const timeline = toTimeline(ref ? history?.[ref.entity] : undefined);
    const cursor = { i: 0 };
    return (t: number) =>
      sample(timeline, cursor, t, (e) => {
        const raw = rawValue(entityOf(ref!, e), ref!.attribute);
        return speedFromRaw(raw, speedUnitOf(e.attributes, ref!) ?? fallbackUnit);
      });
  };
  const speed = speedAt(sources.speed, units.speed);
  const gust = speedAt(sources.gust, units.gust);
  const directionRef = sources.direction;
  const directionTimeline = toTimeline(directionRef ? history?.[directionRef.entity] : undefined);
  const directionCursor = { i: 0 };

  const points: WindPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = start + i * step;
    const s = speed(t);
    let g = gust(t);
    if (g !== null && s !== null) g = Math.max(g, s);
    const d = sample(directionTimeline, directionCursor, t, (e) =>
      parseBearing(rawValue(entityOf(directionRef!, e), directionRef!.attribute)),
    );
    points.push({ t, s, g, d });
  }
  return points;
}

const entityOf = (ref: SourceRef, entry: TimelineEntry): HassEntity => ({
  entity_id: ref.entity,
  state: entry.state,
  attributes: entry.attributes ?? {},
});

/** The series with its last point replaced by the current reading, so the curve ends on "now". */
export function withLive(points: WindPoint[], reading: WindReading): WindPoint[] {
  if (points.length === 0) return points;
  const last = points[points.length - 1];
  return [...points.slice(0, -1), { t: last.t, s: reading.speed, g: reading.gust, d: reading.direction }];
}

/** The last `hours` hours of a series. */
export function windowOf(points: WindPoint[], hours: number): WindPoint[] {
  const n = Math.round(hours * POINTS_PER_HOUR) + 1;
  return points.slice(Math.max(0, points.length - n));
}

export interface Peak {
  /** Highest average speed (km/h) and when it happened. */
  speed: number | null;
  at: number | null;
  /** Highest gust (km/h). */
  gust: number | null;
}

/** Highest speed and gust of a window. */
export function peakOf(points: WindPoint[]): Peak {
  let speed: number | null = null;
  let at: number | null = null;
  let gust: number | null = null;
  for (const p of points) {
    if (p.s !== null && (speed === null || p.s > speed)) {
      speed = p.s;
      at = p.t;
    }
    const g = p.g ?? p.s;
    if (g !== null && (gust === null || g > gust)) gust = g;
  }
  return { speed, at, gust };
}
