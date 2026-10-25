import type { HassEntity, LiveWindCardConfig } from './types';
import { beaufortToKmh, kmhPerUnit, parseBearing } from './wind';

/**
 * Reading the wind from entities. Speeds come out in km/h and bearings in degrees, whatever the
 * unit of the entity or the way it spells the direction.
 */

/** Where a value is read: the state of an entity, or one of its attributes. */
export interface SourceRef {
  entity: string;
  attribute?: string;
}

export interface WindSources {
  speed?: SourceRef;
  gust?: SourceRef;
  direction?: SourceRef;
}

/** Attributes of a `weather.*` entity holding each value. */
export const WEATHER_ATTRIBUTES = {
  speed: 'wind_speed',
  gust: 'wind_gust_speed',
  direction: 'wind_bearing',
} as const;

export const isWeather = (entityId: string): boolean => entityId.startsWith('weather.');

function source(
  entity: string | undefined,
  attribute: string | undefined,
  weather: string | undefined,
  weatherAttribute: string,
): SourceRef | undefined {
  if (entity) {
    // A weather entity picked as a dedicated one is read through its attribute: its state is the sky.
    const attr = attribute || (isWeather(entity) ? weatherAttribute : undefined);
    return attr ? { entity, attribute: attr } : { entity };
  }
  return weather ? { entity: weather, attribute: weatherAttribute } : undefined;
}

/** What to read for each value: a dedicated entity wins over the weather entity. */
export function resolveSources(config: LiveWindCardConfig): WindSources {
  const w = config.weather_entity || undefined;
  return {
    speed: source(config.speed_entity, config.speed_attribute, w, WEATHER_ATTRIBUTES.speed),
    gust: source(config.gust_entity, config.gust_attribute, w, WEATHER_ATTRIBUTES.gust),
    direction: source(config.direction_entity, config.direction_attribute, w, WEATHER_ATTRIBUTES.direction),
  };
}

/** Distinct entity ids of the sources. */
export function sourceEntities(sources: WindSources): string[] {
  const ids = [sources.speed, sources.gust, sources.direction].flatMap((s) => (s ? [s.entity] : []));
  return [...new Set(ids)];
}

/** Whether a source is read from an attribute, so that its history needs the attributes too. */
export function usesAttributes(sources: WindSources): boolean {
  return [sources.speed, sources.gust, sources.direction].some((s) => !!s?.attribute);
}

const MISSING = new Set(['unavailable', 'unknown', '']);

/** The raw value of a source, `undefined` when the entity or the attribute is missing or unavailable. */
export function rawValue(entity: HassEntity | undefined, attribute: string | undefined): unknown {
  if (!entity) return undefined;
  if (attribute) return entity.attributes?.[attribute] ?? undefined;
  return MISSING.has(entity.state) ? undefined : entity.state;
}

/** The speed unit written by an entity, from its own attributes (a weather entity has a dedicated one). */
export function speedUnitOf(
  attributes: Record<string, unknown> | undefined,
  ref: Pick<SourceRef, 'entity' | 'attribute'>,
): string | undefined {
  const raw = isWeather(ref.entity) ? attributes?.wind_speed_unit : attributes?.unit_of_measurement;
  return typeof raw === 'string' ? raw : undefined;
}

/** A speed in km/h from a raw value and the unit it is written in (km/h when the unit is unknown). */
export function speedFromRaw(raw: unknown, unit: string | undefined): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const u = unit?.trim().toLowerCase();
  if (u === 'bft' || u === 'beaufort') return beaufortToKmh(n);
  return n * (kmhPerUnit(unit) ?? 1);
}

export interface WindReading {
  /** km/h, `null` when the speed cannot be read: the card is then unavailable. */
  speed: number | null;
  /** km/h, never below the speed. */
  gust: number | null;
  /** Degrees the wind comes from. */
  direction: number | null;
  /** Latest update (ms since the epoch) among the entities read. */
  updated: number | null;
}

export const NO_READING: WindReading = { speed: null, gust: null, direction: null, updated: null };

export function readSpeed(states: Record<string, HassEntity>, ref: SourceRef | undefined): number | null {
  if (!ref) return null;
  const entity = states[ref.entity];
  return speedFromRaw(rawValue(entity, ref.attribute), speedUnitOf(entity?.attributes, ref));
}

export function readBearing(states: Record<string, HassEntity>, ref: SourceRef | undefined): number | null {
  if (!ref) return null;
  return parseBearing(rawValue(states[ref.entity], ref.attribute));
}

/** The current wind. */
export function readWind(states: Record<string, HassEntity>, sources: WindSources): WindReading {
  const speed = readSpeed(states, sources.speed);
  let gust = readSpeed(states, sources.gust);
  if (gust !== null && speed !== null) gust = Math.max(gust, speed);
  const times = sourceEntities(sources).flatMap((id) => {
    const t = Date.parse(states[id]?.last_updated ?? '');
    return Number.isFinite(t) ? [t] : [];
  });
  return {
    speed,
    gust,
    direction: readBearing(states, sources.direction),
    updated: times.length ? Math.max(...times) : null,
  };
}
