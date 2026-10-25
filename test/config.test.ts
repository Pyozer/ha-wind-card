import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  DEFAULT_HISTORY_WINDOWS,
  HISTORY_WINDOWS,
  pickWindow,
  resolveSettings,
  sortedWindows,
  validateConfig,
  watchedEntities,
} from '../src/config';

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
    expect(() => validateConfig({ type: 'x', history_hours: 5 })).toThrow(/"history_hours"/);
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

describe('history windows', () => {
  it('offers 3, 12 and 24 hours by default, among six possible durations', () => {
    expect([...DEFAULT_HISTORY_WINDOWS]).toEqual([3, 12, 24]);
    expect([...HISTORY_WINDOWS]).toEqual([3, 6, 12, 24, 48, 72]);
    expect(resolveSettings({ type: 'x' }, 'en').historyWindows).toEqual([3, 12, 24]);
  });

  it('accepts a list of windows, coerces text and keeps the order shortest first', () => {
    const config = validateConfig({ type: 'x', history_windows: ['72', 3, 24] });
    expect(config.history_windows).toEqual([72, 3, 24]);
    expect(resolveSettings(config, 'en').historyWindows).toEqual([3, 24, 72]);
    expect(validateConfig({ type: 'x', history_hours: '48' }).history_hours).toBe(48);
  });

  it('explains a list that is not valid', () => {
    for (const bad of [[], [5], ['abc'], [3, 100], 'all', 12]) {
      expect(() => validateConfig({ type: 'x', history_windows: bad })).toThrow(
        'Invalid "history_windows": ' +
          JSON.stringify(bad) +
          '. Expected a list made of: 3, 6, 12, 24, 48, 72.',
      );
    }
  });

  it('drops the duplicates, and falls back on the default windows for an empty choice', () => {
    expect(sortedWindows([24, 3, 24, 3])).toEqual([3, 24]);
    expect(sortedWindows([])).toEqual([3, 12, 24]);
    expect(sortedWindows(undefined)).toEqual([3, 12, 24]);
    expect(sortedWindows([5, 7])).toEqual([3, 12, 24]);
    expect(sortedWindows([72])).toEqual([72]);
  });

  it('shows first the wanted window, or else the closest one that can be picked', () => {
    expect(pickWindow([3, 12, 24], 12)).toBe(12);
    expect(pickWindow([3, 24], 12)).toBe(3);
    expect(pickWindow([3, 6, 24], 12)).toBe(6);
    expect(pickWindow([24, 48, 72], 12)).toBe(24);
    expect(pickWindow([3, 6], 72)).toBe(6);
    expect(pickWindow([72], 3)).toBe(72);
    // On a tie, the shorter.
    expect(pickWindow([6, 24], 15)).toBe(6);
    expect(pickWindow([3, 24], 13.5)).toBe(3);
    expect(pickWindow([12, 24], 18)).toBe(12);
  });

  it('starts on a window that can be picked, whatever the configuration', () => {
    const s = resolveSettings({ type: 'x', history_windows: [24, 48], history_hours: 3 }, 'en');
    expect(s.historyWindows).toEqual([24, 48]);
    expect(s.historyHours).toBe(24);
    expect(resolveSettings({ type: 'x', history_windows: [6, 72] }, 'en').historyHours).toBe(6);
    expect(
      resolveSettings({ type: 'x', history_windows: [3, 12, 24, 72], history_hours: 72 }, 'en').historyHours,
    ).toBe(72);
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
    expect(resolveSettings({ type: 'x' }, 'en')).toEqual({
      unit: 'kmh',
      arrow: 'to',
      letters: 'NESW',
      colors: 'beaufort',
      maxSpeed: 100,
      layout: 'full',
      historyWindows: [3, 12, 24],
      historyHours: 12,
      showGust: true,
      showStats: true,
      showBeaufort: true,
      showHistory: true,
      showHistoryArrows: true,
      showRose: true,
      showBeam: false,
      showUpdated: true,
      animations: true,
    });
    expect(DEFAULTS.max_speed).toBe(100);
  });

  it('follows the unit of the speed entity on `auto`', () => {
    expect(resolveSettings({ type: 'x' }, 'en', { entity: 'km/h', system: 'm/s' }).unit).toBe('kmh');
    expect(resolveSettings({ type: 'x', unit: 'auto' }, 'en', { entity: 'mph' }).unit).toBe('mph');
    expect(resolveSettings({ type: 'x' }, 'en', { entity: 'kn' }).unit).toBe('kn');
    expect(resolveSettings({ type: 'x' }, 'en', { entity: 'Bft' }).unit).toBe('bft');
  });

  it('falls back on the unit system when the entity has no unit we can display', () => {
    expect(resolveSettings({ type: 'x' }, 'en', { system: 'mph' }).unit).toBe('mph');
    expect(resolveSettings({ type: 'x' }, 'en', { entity: 'ft/s', system: 'm/s' }).unit).toBe('ms');
    expect(resolveSettings({ type: 'x' }, 'en', { entity: 'furlongs', system: 'm/s' }).unit).toBe('ms');
    expect(resolveSettings({ type: 'x' }, 'en', {}).unit).toBe('kmh');
    expect(resolveSettings({ type: 'x' }, 'en').unit).toBe('kmh');
  });

  it('keeps the unit that was chosen, whatever the entity says', () => {
    expect(resolveSettings({ type: 'x', unit: 'kn' }, 'en', { entity: 'km/h', system: 'mph' }).unit).toBe(
      'kn',
    );
    expect(resolveSettings({ type: 'x', unit: 'ms' }, 'en', { entity: 'km/h' }).unit).toBe('ms');
  });

  it('writes the west with an O in the languages that do, on `auto`', () => {
    for (const language of ['fr', 'fr-FR', 'es', 'it', 'pt-BR']) {
      expect(resolveSettings({ type: 'x' }, language).letters).toBe('NESO');
    }
    for (const language of ['en', 'en-GB', 'de', 'nl']) {
      expect(resolveSettings({ type: 'x' }, language).letters).toBe('NESW');
    }
    expect(resolveSettings({ type: 'x', compass_letters: 'NESW' }, 'fr').letters).toBe('NESW');
    expect(resolveSettings({ type: 'x', compass_letters: 'NESO' }, 'en').letters).toBe('NESO');
  });

  it('shows the wind rose and hides the beam by default, each one being a choice', () => {
    expect(resolveSettings({ type: 'x' }, 'en')).toMatchObject({ showRose: true, showBeam: false });
    expect(resolveSettings({ type: 'x', show_rose: false, show_beam: true }, 'en')).toMatchObject({
      showRose: false,
      showBeam: true,
    });
    expect(() => validateConfig({ type: 'x', show_beam: 'yes' })).toThrow(/"show_beam"/);
    expect(() => validateConfig({ type: 'x', show_rose: 1 })).toThrow(/"show_rose"/);
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
