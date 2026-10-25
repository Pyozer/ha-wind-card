import type { HassEntity, HomeAssistant, LiveWindCardConfig } from './types';
import { kmhPerUnit } from './wind';

/**
 * Entity kinds offered by the visual editor, so that a speed field does not list temperatures.
 * A weather entity is always offered: it holds the three values as attributes.
 */
export type WindEntityKind = 'speed' | 'direction';

const DOMAINS = ['sensor', 'input_number', 'number'];

const unitOf = (s: HassEntity): string => String(s.attributes.unit_of_measurement ?? '').trim();
const deviceClassOf = (s: HassEntity): string => String(s.attributes.device_class ?? '');
const domainOf = (id: string): string => id.split('.')[0];

const MATCHERS: Record<WindEntityKind, (s: HassEntity) => boolean> = {
  speed: (s) => deviceClassOf(s) === 'wind_speed' || kmhPerUnit(unitOf(s)) !== undefined,
  direction: (s) =>
    deviceClassOf(s) === 'wind_direction' ||
    (unitOf(s) === '°' && /wind|vent|wind_bearing|direction|bearing/i.test(s.entity_id)) ||
    /wind[_ ]?(direction|bearing)|direction[_ ]du[_ ]vent/i.test(s.entity_id),
};

export const isWeatherEntity = (entity: HassEntity | undefined): boolean =>
  !!entity && domainOf(entity.entity_id) === 'weather';

export function matchesKind(entity: HassEntity | undefined, kind: WindEntityKind): boolean {
  if (!entity) return false;
  return DOMAINS.includes(domainOf(entity.entity_id)) && MATCHERS[kind](entity);
}

const cache = new WeakMap<object, Partial<Record<WindEntityKind | 'weather', string[]>>>();

function memo(
  hass: Pick<HomeAssistant, 'states'> | undefined,
  key: WindEntityKind | 'weather',
  compute: (states: HassEntity[]) => string[],
): string[] {
  if (!hass?.states) return [];
  let byKind = cache.get(hass.states);
  if (!byKind) {
    byKind = {};
    cache.set(hass.states, byKind);
  }
  return (byKind[key] ??= compute(Object.values(hass.states)).sort());
}

/** Sorted ids of the sensors of a kind. Memoized on the `hass.states` object. */
export function entitiesOfKind(
  hass: Pick<HomeAssistant, 'states'> | undefined,
  kind: WindEntityKind,
): string[] {
  return memo(hass, kind, (all) => all.filter((s) => matchesKind(s, kind)).map((s) => s.entity_id));
}

/** Sorted ids of the weather entities. */
export function weatherEntities(hass: Pick<HomeAssistant, 'states'> | undefined): string[] {
  return memo(hass, 'weather', (all) => all.filter(isWeatherEntity).map((s) => s.entity_id));
}

/**
 * `ha-form` entity selector for a kind: its sensors and the weather entities. The current values
 * stay selectable even when they do not match, so an existing configuration is never emptied.
 */
export function entitySelector(
  hass: Pick<HomeAssistant, 'states'> | undefined,
  kind: WindEntityKind,
  current: readonly (string | undefined)[] = [],
): { entity: { include_entities?: string[] } } {
  const ids = new Set([...entitiesOfKind(hass, kind), ...weatherEntities(hass)]);
  for (const id of current) if (id) ids.add(id);
  return { entity: ids.size ? { include_entities: [...ids].sort() } : {} };
}

/** Whether a weather entity carries a wind speed. */
const hasWind = (s: HassEntity | undefined): boolean => !!s && s.attributes.wind_speed !== undefined;

/**
 * Configuration suggested when adding the card: the first weather entity that reports a wind,
 * otherwise the first wind speed sensor.
 */
export function guessConfig(hass: Pick<HomeAssistant, 'states'> | undefined): Partial<LiveWindCardConfig> {
  if (!hass?.states) return {};
  const weather = weatherEntities(hass).find((id) => hasWind(hass.states[id]));
  if (weather) return { weather_entity: weather };
  const speeds = entitiesOfKind(hass, 'speed');
  const isGust = (id: string) => /gust|rafale|burst/i.test(id);
  const speed = speeds.find((id) => !isGust(id)) ?? speeds[0];
  if (!speed) return {};
  const gust = speeds.find(isGust);
  const direction = entitiesOfKind(hass, 'direction')[0];
  return {
    speed_entity: speed,
    ...(gust && gust !== speed ? { gust_entity: gust } : {}),
    ...(direction ? { direction_entity: direction } : {}),
  };
}
