import { describe, expect, it } from 'vitest';
import {
  readBearing,
  readSpeed,
  readWind,
  resolveSources,
  sourceEntities,
  speedFromRaw,
  speedUnitOf,
  usesAttributes,
} from '../src/reading';
import type { HassEntity } from '../src/types';

const entity = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  updated?: string,
): HassEntity => ({
  entity_id: id,
  state,
  attributes,
  last_updated: updated,
});

const states = (...list: HassEntity[]): Record<string, HassEntity> =>
  Object.fromEntries(list.map((e) => [e.entity_id, e]));

const WEATHER = entity('weather.home', 'sunny', {
  wind_speed: 25,
  wind_gust_speed: 50,
  wind_bearing: 280,
  wind_speed_unit: 'km/h',
});

describe('resolveSources', () => {
  it('reads everything from the weather entity attributes', () => {
    expect(resolveSources({ type: 'x', weather_entity: 'weather.home' })).toEqual({
      speed: { entity: 'weather.home', attribute: 'wind_speed' },
      gust: { entity: 'weather.home', attribute: 'wind_gust_speed' },
      direction: { entity: 'weather.home', attribute: 'wind_bearing' },
    });
  });

  it('lets a dedicated entity win over the weather entity, value by value', () => {
    const sources = resolveSources({
      type: 'x',
      weather_entity: 'weather.home',
      speed_entity: 'sensor.wind',
      direction_entity: 'sensor.dir',
      direction_attribute: 'bearing',
    });
    expect(sources.speed).toEqual({ entity: 'sensor.wind' });
    expect(sources.gust).toEqual({ entity: 'weather.home', attribute: 'wind_gust_speed' });
    expect(sources.direction).toEqual({ entity: 'sensor.dir', attribute: 'bearing' });
  });

  it('reads a weather entity picked as a dedicated one through its attribute', () => {
    const sources = resolveSources({
      type: 'x',
      speed_entity: 'weather.other',
      gust_entity: 'weather.other',
    });
    expect(sources.speed).toEqual({ entity: 'weather.other', attribute: 'wind_speed' });
    expect(sources.gust).toEqual({ entity: 'weather.other', attribute: 'wind_gust_speed' });
  });

  it('has nothing to read without entities', () => {
    expect(resolveSources({ type: 'x' })).toEqual({
      speed: undefined,
      gust: undefined,
      direction: undefined,
    });
    expect(resolveSources({ type: 'x', weather_entity: '' }).speed).toBeUndefined();
  });

  it('lists each entity once and tells when attributes are needed', () => {
    const weather = resolveSources({ type: 'x', weather_entity: 'weather.home' });
    expect(sourceEntities(weather)).toEqual(['weather.home']);
    expect(usesAttributes(weather)).toBe(true);
    const sensors = resolveSources({ type: 'x', speed_entity: 'sensor.a', gust_entity: 'sensor.b' });
    expect(sourceEntities(sensors)).toEqual(['sensor.a', 'sensor.b']);
    expect(usesAttributes(sensors)).toBe(false);
  });
});

describe('speedFromRaw', () => {
  it('converts to km/h from the unit written', () => {
    expect(speedFromRaw(10, 'm/s')).toBeCloseTo(36);
    expect(speedFromRaw('10', 'kn')).toBeCloseTo(18.52);
    expect(speedFromRaw(20, 'mph')).toBeCloseTo(32.19, 1);
    expect(speedFromRaw(25, 'km/h')).toBe(25);
    expect(speedFromRaw(25, undefined)).toBe(25);
    expect(speedFromRaw(25, 'unknown unit')).toBe(25);
  });

  it('reads a Beaufort force as the middle of its band', () => {
    expect(speedFromRaw(4, 'Bft')).toBe(24.5);
    expect(speedFromRaw(0, 'beaufort')).toBe(0);
  });

  it('refuses what is not a speed', () => {
    for (const bad of ['', '  ', 'abc', NaN, -3, null, undefined, {}])
      expect(speedFromRaw(bad, 'km/h')).toBeNull();
  });
});

describe('speedUnitOf', () => {
  it('reads the unit of a weather entity or of a sensor', () => {
    expect(speedUnitOf({ wind_speed_unit: 'mph' }, { entity: 'weather.home', attribute: 'wind_speed' })).toBe(
      'mph',
    );
    expect(speedUnitOf({ unit_of_measurement: 'm/s' }, { entity: 'sensor.wind' })).toBe('m/s');
    expect(speedUnitOf({}, { entity: 'sensor.wind' })).toBeUndefined();
    expect(speedUnitOf(undefined, { entity: 'sensor.wind' })).toBeUndefined();
  });
});

describe('readWind', () => {
  it('reads a weather entity', () => {
    const reading = readWind(states(WEATHER), resolveSources({ type: 'x', weather_entity: 'weather.home' }));
    expect(reading).toMatchObject({ speed: 25, gust: 50, direction: 280 });
  });

  it('reads sensors in their own units', () => {
    const reading = readWind(
      states(
        entity('sensor.wind', '10', { unit_of_measurement: 'm/s' }, '2026-10-25T10:00:00Z'),
        entity('sensor.gust', '20', { unit_of_measurement: 'm/s' }, '2026-10-25T10:05:00Z'),
        entity('sensor.dir', 'WSW'),
      ),
      resolveSources({
        type: 'x',
        speed_entity: 'sensor.wind',
        gust_entity: 'sensor.gust',
        direction_entity: 'sensor.dir',
      }),
    );
    expect(reading.speed).toBeCloseTo(36);
    expect(reading.gust).toBeCloseTo(72);
    expect(reading.direction).toBe(247.5);
    expect(reading.updated).toBe(Date.parse('2026-10-25T10:05:00Z'));
  });

  it('never reports a gust below the average speed', () => {
    const reading = readWind(
      states(
        entity('sensor.wind', '30', { unit_of_measurement: 'km/h' }),
        entity('sensor.gust', '12', { unit_of_measurement: 'km/h' }),
      ),
      resolveSources({ type: 'x', speed_entity: 'sensor.wind', gust_entity: 'sensor.gust' }),
    );
    expect(reading.gust).toBe(30);
  });

  it('is unavailable when the speed cannot be read, whatever the other values', () => {
    const sources = resolveSources({
      type: 'x',
      speed_entity: 'sensor.wind',
      direction_entity: 'sensor.dir',
    });
    for (const state of ['unavailable', 'unknown', '', 'abc']) {
      const reading = readWind(states(entity('sensor.wind', state), entity('sensor.dir', '90')), sources);
      expect(reading.speed).toBeNull();
      expect(reading.direction).toBe(90);
    }
    expect(readWind({}, sources)).toMatchObject({ speed: null, gust: null, direction: null, updated: null });
  });

  it('reads a missing attribute as no value', () => {
    const s = states(entity('weather.home', 'sunny', {}));
    expect(readSpeed(s, { entity: 'weather.home', attribute: 'wind_speed' })).toBeNull();
    expect(readBearing(s, { entity: 'weather.home', attribute: 'wind_bearing' })).toBeNull();
    expect(readSpeed(s, undefined)).toBeNull();
    expect(readBearing(s, undefined)).toBeNull();
  });
});
