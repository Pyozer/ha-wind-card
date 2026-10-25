import { describe, expect, it } from 'vitest';
import { resolveSettings } from '../src/config';
import { localize, type LocalizeKey } from '../src/localize/localize';
import type { WindReading } from '../src/reading';
import type { LiveWindCardConfig } from '../src/types';
import { buildView, forceName, pointName, windowLabel } from '../src/view';
import { BEAUFORT_COLORS } from '../src/wind';

const t = (language: string) => (key: LocalizeKey, vars?: Record<string, string>) =>
  localize(language, key, vars);
const reading = (over: Partial<WindReading> = {}): WindReading => ({
  speed: 25,
  gust: 50,
  direction: 280,
  updated: null,
  ...over,
});
const view = (r: WindReading, config: Partial<LiveWindCardConfig> = {}, language = 'en', configured = true) =>
  buildView({
    reading: r,
    settings: resolveSettings({ type: 'x', ...config }, language),
    language,
    t: t(language),
    peak: { speed: 40, at: 0, gust: 60 },
    configured,
  });

describe('buildView', () => {
  it('describes the wind in the language of the card', () => {
    const v = view(reading());
    expect(v).toMatchObject({
      available: true,
      force: 4,
      color: BEAUFORT_COLORS[4],
      speed: '25',
      gust: '50',
      unit: 'km/h',
      caption: 'Moderate breeze',
      letters: 'W',
      origin: 'West',
      toward: 'East',
      maxSpeed: '40',
      maxGust: '60',
    });
    expect(v.summary).toBe('25 km/h, Moderate breeze, Wind from West');
    const fr = view(reading(), {}, 'fr');
    expect(fr).toMatchObject({ caption: 'Jolie brise', letters: 'O', origin: 'Ouest', toward: 'Est' });
  });

  it('converts to the display unit, with its decimals', () => {
    const v = view(reading({ speed: 36, gust: 72 }), { unit: 'ms' }, 'fr');
    expect(v).toMatchObject({ speed: '10,0', gust: '20,0', unit: 'm/s', maxSpeed: '11,1' });
    expect(view(reading(), { unit: 'bft' })).toMatchObject({ speed: '4', unit: 'Bft' });
  });

  it('fills the arc with the speed and the gusts', () => {
    const v = view(reading());
    expect(v.arcSpeed).toBeGreaterThan(0);
    expect(v.arcGust).toBeGreaterThan(v.arcSpeed);
    expect(view(reading({ speed: 0, gust: null })).arcSpeed).toBe(0);
    expect(view(reading({ gust: null })).arcGust).toBe(view(reading({ gust: null })).arcSpeed);
  });

  it('points the compact arrow where the wind blows to, or where it comes from', () => {
    expect(view(reading()).arrowBearing).toBe(100);
    expect(view(reading(), { arrow: 'from' }).arrowBearing).toBe(280);
    expect(view(reading({ direction: null })).arrowBearing).toBeNull();
  });

  it('colors with the accent when asked to', () => {
    expect(view(reading(), { colors: 'accent' }).color).toBe('var(--lwc-accent)');
  });

  it('shows dashes, not NaN, when the speed cannot be read', () => {
    const v = view(reading({ speed: null, gust: null }));
    expect(v).toMatchObject({
      available: false,
      speed: '–',
      gust: '–',
      force: 0,
      arcSpeed: 0,
      arcGust: 0,
      caption: 'Sensor unavailable',
    });
    expect(v.summary).toBe('Sensor unavailable');
    expect(JSON.stringify(v)).not.toMatch(/NaN/);
  });

  it('asks for an entity when none is configured', () => {
    expect(view(reading({ speed: null }), {}, 'en', false).caption).toBe(
      'Pick a weather or wind speed entity',
    );
  });

  it('copes with a wind whose direction is unknown', () => {
    const v = view(reading({ direction: null }));
    expect(v).toMatchObject({ bearing: null, letters: '–', origin: '–', toward: '–' });
    expect(v.summary).toBe('25 km/h, Moderate breeze');
  });

  it('names the forces and the points', () => {
    expect(forceName(t('en'), 12)).toBe('Hurricane');
    expect(pointName(t('fr'), 247.5)).toBe('Ouest-sud-ouest');
    expect(pointName(t('en'), 359)).toBe('North');
  });
});

describe('windowLabel', () => {
  it('writes hours, and days from two days on', () => {
    expect(windowLabel(t('en'), 3)).toBe('3 h');
    expect(windowLabel(t('en'), 24)).toBe('24 h');
    expect(windowLabel(t('en'), 48)).toBe('2 d');
    expect(windowLabel(t('en'), 72)).toBe('3 d');
    expect(windowLabel(t('fr'), 72)).toBe('3 j');
    expect(windowLabel(t('fr'), 6)).toBe('6 h');
  });
});
