import { describe, expect, it } from 'vitest';
import { entitiesOfKind, entitySelector, guessConfig, matchesKind, weatherEntities } from '../src/entities';
import type { HassEntity, HomeAssistant } from '../src/types';

const entity = (id: string, state = '1', attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes,
});

const hass = (...list: HassEntity[]): Pick<HomeAssistant, 'states'> => ({
  states: Object.fromEntries(list.map((e) => [e.entity_id, e])),
});

describe('entity kinds', () => {
  it('recognizes wind speed sensors by device class or unit', () => {
    expect(matchesKind(entity('sensor.a', '1', { device_class: 'wind_speed' }), 'speed')).toBe(true);
    expect(matchesKind(entity('sensor.b', '1', { unit_of_measurement: 'm/s' }), 'speed')).toBe(true);
    expect(matchesKind(entity('sensor.c', '1', { unit_of_measurement: '°C' }), 'speed')).toBe(false);
    expect(matchesKind(entity('light.d', '1', { unit_of_measurement: 'km/h' }), 'speed')).toBe(false);
    expect(matchesKind(undefined, 'speed')).toBe(false);
  });

  it('recognizes wind direction sensors', () => {
    expect(matchesKind(entity('sensor.a', '1', { device_class: 'wind_direction' }), 'direction')).toBe(true);
    expect(matchesKind(entity('sensor.wind_bearing', '1', { unit_of_measurement: '°' }), 'direction')).toBe(
      true,
    );
    expect(matchesKind(entity('sensor.station_wind_direction', 'W'), 'direction')).toBe(true);
    expect(matchesKind(entity('sensor.temperature', '1', { unit_of_measurement: '°' }), 'direction')).toBe(
      false,
    );
  });

  it('lists sorted ids, and the weather entities apart', () => {
    const h = hass(
      entity('sensor.b', '1', { unit_of_measurement: 'km/h' }),
      entity('sensor.a', '1', { device_class: 'wind_speed' }),
      entity('weather.home'),
      entity('sensor.t', '1', { unit_of_measurement: '°C' }),
    );
    expect(entitiesOfKind(h, 'speed')).toEqual(['sensor.a', 'sensor.b']);
    expect(weatherEntities(h)).toEqual(['weather.home']);
    expect(entitiesOfKind(undefined, 'speed')).toEqual([]);
    expect(weatherEntities({ states: undefined as never })).toEqual([]);
  });
});

describe('entitySelector', () => {
  const h = hass(entity('sensor.a', '1', { device_class: 'wind_speed' }), entity('weather.home'));

  it('offers the matching sensors and the weather entities', () => {
    expect(entitySelector(h, 'speed')).toEqual({
      entity: { include_entities: ['sensor.a', 'weather.home'] },
    });
  });

  it('keeps the current values selectable, even when they do not match', () => {
    expect(entitySelector(h, 'speed', ['sensor.odd', undefined]).entity.include_entities).toContain(
      'sensor.odd',
    );
  });

  it('is unrestricted when there is nothing to offer', () => {
    expect(entitySelector(hass(), 'speed')).toEqual({ entity: {} });
  });
});

describe('guessConfig', () => {
  it('suggests the first weather entity that reports a wind', () => {
    const h = hass(entity('weather.no_wind'), entity('weather.home', 'sunny', { wind_speed: 12 }));
    expect(guessConfig(h)).toEqual({ weather_entity: 'weather.home' });
  });

  it('falls back on wind sensors, leaving the gusts apart from the speed', () => {
    const h = hass(
      entity('sensor.station_gust', '1', { unit_of_measurement: 'km/h' }),
      entity('sensor.station_wind', '1', { unit_of_measurement: 'km/h' }),
      entity('sensor.station_wind_direction', 'W'),
    );
    expect(guessConfig(h)).toEqual({
      speed_entity: 'sensor.station_wind',
      gust_entity: 'sensor.station_gust',
      direction_entity: 'sensor.station_wind_direction',
    });
  });

  it('suggests nothing when there is no wind at all', () => {
    expect(guessConfig(hass(entity('sensor.t', '1', { unit_of_measurement: '°C' })))).toEqual({});
    expect(guessConfig(undefined)).toEqual({});
  });
});
