import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveSettings, validateConfig, watchedEntities } from '../src/config';

describe('validateConfig', () => {
  it('accepts a card without any entity, so it can be added before being set up', () => {
    expect(validateConfig({ type: 'custom:live-wind-card' })).toEqual({ type: 'custom:live-wind-card' });
  });

  it('rejects what is not a configuration', () => {
    for (const bad of [null, undefined, 'text', 12, ['a']])
      expect(() => validateConfig(bad)).toThrow(/object is expected/);
  });

  it('explains a wrong value of a choice', () => {
    expect(() => validateConfig({ type: 'x', unit: 'furlongs' })).toThrow(
      'Invalid "unit": "furlongs". Expected one of: auto, kmh, ms, kn, mph, bft.',
    );
    expect(() => validateConfig({ type: 'x', layout: 'huge' })).toThrow(/"layout"/);
    expect(() => validateConfig({ type: 'x', history_hours: 6 })).toThrow(/"history_hours"/);
    expect(() => validateConfig({ type: 'x', arrow: 'up' })).toThrow(/"arrow"/);
    expect(() => validateConfig({ type: 'x', colors: 'red' })).toThrow(/"colors"/);
    expect(() => validateConfig({ type: 'x', compass_letters: 'NSEW' })).toThrow(/"compass_letters"/);
  });

  it('coerces what a form or hand-written YAML may give as text', () => {
    expect(validateConfig({ type: 'x', history_hours: '24', max_speed: '60' })).toMatchObject({
      history_hours: 24,
      max_speed: 60,
    });
  });

  it('checks the full-dial speed, the toggles and the entities', () => {
    expect(() => validateConfig({ type: 'x', max_speed: 5 })).toThrow(/"max_speed"/);
    expect(() => validateConfig({ type: 'x', max_speed: 'fast' })).toThrow(/"max_speed"/);
    expect(() => validateConfig({ type: 'x', show_gust: 'yes' })).toThrow(
      'Invalid "show_gust": "yes". Expected true or false.',
    );
    expect(() => validateConfig({ type: 'x', speed_entity: 12 })).toThrow(/"speed_entity"/);
    expect(() => validateConfig({ type: 'x', weather_entity: ['weather.a'] })).toThrow(/"weather_entity"/);
  });

  it('keeps an option it does not know and leaves null and undefined alone', () => {
    const config = validateConfig({
      type: 'x',
      card_mod: { style: 'x' },
      unit: null,
      max_speed: null,
      show_gust: undefined,
    });
    expect(config).toMatchObject({ card_mod: { style: 'x' } });
  });

  it('does not change the object it is given', () => {
    const input = { type: 'x', history_hours: '3' };
    validateConfig(input);
    expect(input.history_hours).toBe('3');
  });
});

describe('watchedEntities', () => {
  it('lists the entities that redraw the card', () => {
    expect(watchedEntities({ type: 'x', weather_entity: 'weather.home' })).toEqual(['weather.home']);
    expect(
      watchedEntities({ type: 'x', weather_entity: 'weather.home', speed_entity: 'sensor.wind' }),
    ).toEqual(['sensor.wind', 'weather.home']);
    expect(watchedEntities({ type: 'x' })).toEqual([]);
  });
});

describe('resolveSettings', () => {
  it('applies the defaults', () => {
    expect(resolveSettings({ type: 'x' }, undefined, 'en')).toEqual({
      unit: 'kmh',
      arrow: 'to',
      letters: 'NESW',
      colors: 'beaufort',
      maxSpeed: 100,
      layout: 'full',
      historyHours: 12,
      showGust: true,
      showStats: true,
      showBeaufort: true,
      showHistory: true,
      showHistoryArrows: true,
      showUpdated: true,
      animations: true,
    });
    expect(DEFAULTS.max_speed).toBe(100);
  });

  it('follows the unit system of Home Assistant on `auto`, or the choice made', () => {
    expect(resolveSettings({ type: 'x' }, 'mph', 'en').unit).toBe('mph');
    expect(resolveSettings({ type: 'x', unit: 'auto' }, 'm/s', 'en').unit).toBe('ms');
    expect(resolveSettings({ type: 'x', unit: 'kn' }, 'mph', 'en').unit).toBe('kn');
  });

  it('writes the west with an O in the languages that do, on `auto`', () => {
    for (const language of ['fr', 'fr-FR', 'es', 'it', 'pt-BR']) {
      expect(resolveSettings({ type: 'x' }, undefined, language).letters).toBe('NESO');
    }
    for (const language of ['en', 'en-GB', 'de', 'nl']) {
      expect(resolveSettings({ type: 'x' }, undefined, language).letters).toBe('NESW');
    }
    expect(resolveSettings({ type: 'x', compass_letters: 'NESW' }, undefined, 'fr').letters).toBe('NESW');
    expect(resolveSettings({ type: 'x', compass_letters: 'NESO' }, undefined, 'en').letters).toBe('NESO');
  });

  it('keeps the options set, including the ones that turn something off', () => {
    const s = resolveSettings(
      {
        type: 'x',
        show_gust: false,
        animations: false,
        layout: 'compact',
        history_hours: 3,
        max_speed: 60,
        arrow: 'from',
        colors: 'accent',
      },
      undefined,
      'en',
    );
    expect(s).toMatchObject({
      showGust: false,
      animations: false,
      layout: 'compact',
      historyHours: 3,
      maxSpeed: 60,
      arrow: 'from',
      colors: 'accent',
    });
  });
});
