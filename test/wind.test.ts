import { describe, expect, it } from 'vitest';
import {
  arcFraction,
  clockFormat,
  beaufortForce,
  beaufortToKmh,
  BEAUFORT_COLORS,
  BEAUFORT_LIMITS,
  cardinalLetters,
  convertSpeed,
  displayUnitOf,
  formatAge,
  formatNumber,
  formatSpeed,
  kmhPerUnit,
  nextRotation,
  niceMax,
  normalizeDegrees,
  oppositeBearing,
  parseBearing,
  pointIndex,
  pointLetters,
  systemUnit,
  unitDecimals,
  unitLabel,
  windColor,
} from '../src/wind';

describe('Beaufort scale', () => {
  it('maps speeds to forces on the bounds of the scale', () => {
    expect(beaufortForce(0)).toBe(0);
    expect(beaufortForce(0.99)).toBe(0);
    expect(beaufortForce(1)).toBe(1);
    expect(beaufortForce(5.9)).toBe(1);
    expect(beaufortForce(6)).toBe(2);
    expect(beaufortForce(25)).toBe(4);
    expect(beaufortForce(117.9)).toBe(11);
    expect(beaufortForce(118)).toBe(12);
    expect(beaufortForce(300)).toBe(12);
  });

  it('has a color per force and increasing limits', () => {
    expect(BEAUFORT_COLORS).toHaveLength(13);
    expect([...BEAUFORT_LIMITS]).toEqual([...BEAUFORT_LIMITS].sort((a, b) => a - b));
  });

  it('turns a force back into a speed that belongs to it', () => {
    for (let force = 0; force <= 12; force++) expect(beaufortForce(beaufortToKmh(force))).toBe(force);
    expect(beaufortToKmh(-3)).toBe(0);
    expect(beaufortToKmh(40)).toBe(beaufortToKmh(12));
  });

  it('colors by force, or with the accent', () => {
    expect(windColor(25, 'beaufort', 'red')).toBe(BEAUFORT_COLORS[4]);
    expect(windColor(25, 'accent', 'red')).toBe('red');
  });
});

describe('compass', () => {
  it('rounds a bearing to the nearest of the 16 points', () => {
    expect(pointIndex(0)).toBe(0);
    expect(pointIndex(11.2)).toBe(0);
    expect(pointIndex(11.3)).toBe(1);
    expect(pointIndex(280)).toBe(12);
    expect(pointIndex(359)).toBe(0);
    expect(pointIndex(-90)).toBe(12);
  });

  it('writes the west with an O or a W', () => {
    expect(pointLetters(12, 'NESO')).toBe('O');
    expect(pointLetters(12, 'NESW')).toBe('W');
    expect(pointLetters(11, 'NESO')).toBe('OSO');
    expect(pointLetters(15, 'NESO')).toBe('NNO');
    expect(pointLetters(16, 'NESW')).toBe('N');
    expect(cardinalLetters('NESO')).toEqual(['N', 'E', 'S', 'O']);
    expect(cardinalLetters('NESW')).toEqual(['N', 'E', 'S', 'W']);
  });

  it('normalizes and reverses bearings', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(oppositeBearing(280)).toBe(100);
    expect(oppositeBearing(10)).toBe(190);
  });

  it('reads degrees and compass letters, and nothing else', () => {
    expect(parseBearing(280)).toBe(280);
    expect(parseBearing('280.5')).toBe(280.5);
    expect(parseBearing(370)).toBe(10);
    expect(parseBearing('WSW')).toBe(247.5);
    expect(parseBearing('osO')).toBe(247.5);
    expect(parseBearing('n')).toBe(0);
    for (const bad of ['variable', '', '  ', NaN, null, undefined, {}, 'unknown']) {
      expect(parseBearing(bad)).toBeNull();
    }
  });

  it('turns by the shortest way, without a full spin across north', () => {
    expect(nextRotation(350, 10)).toBe(370);
    expect(nextRotation(10, 350)).toBe(-10);
    expect(nextRotation(370, 20)).toBe(380);
    for (const [from, to] of [
      [0, 280],
      [725, 3],
      [-200, 181],
    ]) {
      const next = nextRotation(from, to);
      expect(normalizeDegrees(next)).toBeCloseTo(normalizeDegrees(to));
      expect(Math.abs(next - from)).toBeLessThanOrEqual(180);
    }
  });
});

describe('speed units', () => {
  it('knows the units written by Home Assistant', () => {
    expect(kmhPerUnit('km/h')).toBe(1);
    expect(kmhPerUnit(' KM/H ')).toBe(1);
    expect(kmhPerUnit('m/s')).toBe(3.6);
    expect(kmhPerUnit('mph')).toBeCloseTo(1.609344);
    expect(kmhPerUnit('kn')).toBe(1.852);
    expect(kmhPerUnit('ft/s')).toBeCloseTo(1.09728);
    expect(kmhPerUnit('furlongs per fortnight')).toBeUndefined();
    expect(kmhPerUnit(undefined)).toBeUndefined();
  });

  it('finds the display unit that matches a unit written by Home Assistant', () => {
    expect(displayUnitOf('km/h')).toBe('kmh');
    expect(displayUnitOf(' KPH ')).toBe('kmh');
    expect(displayUnitOf('m/s')).toBe('ms');
    expect(displayUnitOf('mph')).toBe('mph');
    expect(displayUnitOf('kn')).toBe('kn');
    expect(displayUnitOf('Bft')).toBe('bft');
    expect(displayUnitOf('beaufort')).toBe('bft');
    expect(displayUnitOf('ft/s')).toBeUndefined();
    expect(displayUnitOf('furlongs')).toBeUndefined();
    expect(displayUnitOf(undefined)).toBeUndefined();
  });

  it('follows the unit system of Home Assistant', () => {
    expect(systemUnit('m/s')).toBe('ms');
    expect(systemUnit('mph')).toBe('mph');
    expect(systemUnit('kn')).toBe('kn');
    expect(systemUnit('km/h')).toBe('kmh');
    expect(systemUnit(undefined)).toBe('kmh');
    expect(systemUnit('ft/s')).toBe('kmh');
  });

  it('converts and formats', () => {
    expect(convertSpeed(36, 'ms')).toBeCloseTo(10);
    expect(convertSpeed(18.52, 'kn')).toBeCloseTo(10);
    expect(convertSpeed(25, 'bft')).toBe(4);
    expect(unitLabel('bft')).toBe('Bft');
    expect(unitLabel('kn')).toBe('kn');
    expect(unitDecimals('ms')).toBe(1);
    expect(unitDecimals('kmh')).toBe(0);
    expect(unitDecimals('bft')).toBe(0);
    expect(formatSpeed(25, 'ms', 'en')).toBe('6.9');
    expect(formatSpeed(25, 'ms', 'fr')).toBe('6,9');
    expect(formatSpeed(25.4, 'kmh', 'en')).toBe('25');
    expect(formatNumber(1234.5, 1, 'not a language')).toBe('1234.5');
  });
});

describe('dial', () => {
  it('fills the arc with the speed, breezes staying visible', () => {
    expect(arcFraction(0, 100)).toBe(0);
    expect(arcFraction(100, 100)).toBe(1);
    expect(arcFraction(500, 100)).toBe(1);
    expect(arcFraction(-4, 100)).toBe(0);
    expect(arcFraction(25, 100)).toBeGreaterThan(0.25);
    expect(arcFraction(30, 100)).toBeGreaterThan(arcFraction(20, 100));
    expect(arcFraction(10, 0)).toBe(0);
  });

  it('picks a round axis maximum above the peak', () => {
    expect(niceMax(0)).toBe(5);
    expect(niceMax(10)).toBe(10);
    expect(niceMax(26)).toBe(30);
    expect(niceMax(52)).toBe(60);
    expect(niceMax(95)).toBe(120);
    for (const peak of [1, 7, 24, 49, 51, 89, 91, 160]) expect(niceMax(peak)).toBeGreaterThanOrEqual(peak);
  });
});

describe('age', () => {
  it('says how long ago, in the language asked', () => {
    expect(formatAge(10_000, 'en')).toBe('now');
    expect(formatAge(5 * 60_000, 'en')).toMatch(/5 min/);
    expect(formatAge(3 * 3_600_000, 'en')).toMatch(/3 hr/);
    // Some locales put a non-breaking space between the number and the unit.
    expect(formatAge(5 * 60_000, 'fr')).toMatch(/5\smin/);
    expect(formatAge(3 * 86_400_000, 'en')).toMatch(/3 days/);
    expect(formatAge(-5000, 'en')).toBe('now');
  });
});

describe('clockFormat', () => {
  const t = Date.UTC(2026, 9, 26, 14, 30);

  it('shows the time within a day, and the weekday as well beyond', () => {
    const day = clockFormat(24, 'en').format(t);
    const days = clockFormat(48, 'en').format(t);
    expect(day).toMatch(/\d{1,2}:30/);
    expect(day).not.toMatch(/Mon|Sun|Tue/);
    expect(days).toMatch(/Mon|Sun|Tue/);
    expect(clockFormat(3, 'fr').format(t)).toMatch(/:30/);
  });

  it('copes with a language it does not know', () => {
    expect(clockFormat(12, 'not a language').format(t)).toMatch(/30/);
  });
});
