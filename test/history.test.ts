import { describe, expect, it, vi } from 'vitest';
import {
  buildSeries,
  fetchHistory,
  historyRefreshMs,
  liveUnits,
  peakOf,
  STEP_MS,
  toTimeline,
  windowOf,
  withLive,
  type HistoryResult,
  type WindPoint,
} from '../src/history';
import { resolveSources } from '../src/reading';
import type { HomeAssistant } from '../src/types';

const START = Date.parse('2026-10-25T00:00:00Z');
const at = (minutes: number) => (START + minutes * 60_000) / 1000;

const sensors = resolveSources({
  type: 'x',
  speed_entity: 'sensor.wind',
  gust_entity: 'sensor.gust',
  direction_entity: 'sensor.dir',
});
const weather = resolveSources({ type: 'x', weather_entity: 'weather.home' });

describe('toTimeline', () => {
  it('sorts the states and understands both key styles', () => {
    const timeline = toTimeline([
      { s: 'b', lu: at(10) },
      { state: 'a', last_updated: '2026-10-25T00:00:00Z' },
      { s: 'no time' },
    ]);
    expect(timeline.map((e) => e.state)).toEqual(['a', 'b']);
    expect(toTimeline(undefined)).toEqual([]);
  });
});

describe('buildSeries', () => {
  it('samples the last state recorded at or before each time', () => {
    const history: HistoryResult = {
      'sensor.wind': [
        { s: '10', lu: at(0) },
        { s: '20', lu: at(7) },
        { s: 'unavailable', lu: at(12) },
        { s: '30', lu: at(16) },
      ],
    };
    const points = buildSeries(history, sensors, {
      start: START,
      end: START + 4 * STEP_MS,
      units: { speed: 'km/h' },
    });
    expect(points.map((p) => p.s)).toEqual([10, 10, 20, null, 30]);
    expect(points.map((p) => p.t)).toEqual([0, 1, 2, 3, 4].map((i) => START + i * STEP_MS));
  });

  it('has no value before the first state of an entity', () => {
    const history: HistoryResult = { 'sensor.wind': [{ s: '10', lu: at(8) }] };
    const points = buildSeries(history, sensors, { start: START, end: START + 3 * STEP_MS });
    expect(points.map((p) => p.s)).toEqual([null, null, 10, 10]);
  });

  it('converts with the unit of the entity when the history has no attributes', () => {
    const history: HistoryResult = {
      'sensor.wind': [{ s: '10', lu: at(0) }],
      'sensor.gust': [{ s: '5', lu: at(0) }],
      'sensor.dir': [{ s: 'WSW', lu: at(0) }],
    };
    const [point] = buildSeries(history, sensors, {
      start: START,
      end: START,
      units: { speed: 'm/s', gust: 'm/s' },
    });
    expect(point.s).toBeCloseTo(36);
    // 18 km/h of gust, below the 36 km/h of wind: lifted to the wind.
    expect(point.g).toBeCloseTo(36);
    expect(point.d).toBe(247.5);
  });

  it('reads the attributes of a weather entity, with their unit', () => {
    const history: HistoryResult = {
      'weather.home': [
        {
          s: 'sunny',
          lu: at(0),
          a: { wind_speed: 10, wind_gust_speed: 20, wind_bearing: 90, wind_speed_unit: 'm/s' },
        },
        {
          s: 'sunny',
          lu: at(5),
          a: { wind_speed: 12, wind_gust_speed: 25, wind_bearing: 100, wind_speed_unit: 'm/s' },
        },
      ],
    };
    const points = buildSeries(history, weather, { start: START, end: START + STEP_MS });
    expect(points[0]).toMatchObject({ d: 90 });
    expect(points[0].s).toBeCloseTo(36);
    expect(points[1].g).toBeCloseTo(90);
    expect(points[1].d).toBe(100);
  });

  it('gives empty points without any history', () => {
    const points = buildSeries(undefined, sensors, { start: START, end: START + 2 * STEP_MS });
    expect(points).toHaveLength(3);
    expect(points.every((p) => p.s === null && p.g === null && p.d === null)).toBe(true);
  });
});

describe('series helpers', () => {
  const series: WindPoint[] = Array.from({ length: 289 }, (_, i) => ({
    t: i * STEP_MS,
    s: i % 50,
    g: (i % 50) + 5,
    d: i % 360,
  }));

  it('cuts a window of 3, 12 or 24 hours ending on the last point', () => {
    expect(windowOf(series, 3)).toHaveLength(37);
    expect(windowOf(series, 12)).toHaveLength(145);
    expect(windowOf(series, 24)).toHaveLength(289);
    expect(windowOf(series, 48)).toHaveLength(289);
    expect(windowOf(series, 3).at(-1)).toBe(series.at(-1));
  });

  it('ends the series on the current reading', () => {
    const live = withLive(series, { speed: 99, gust: 120, direction: 45, updated: null });
    expect(live.at(-1)).toEqual({ t: series.at(-1)!.t, s: 99, g: 120, d: 45 });
    expect(live).toHaveLength(series.length);
    expect(series.at(-1)!.s).not.toBe(99);
    expect(withLive([], { speed: 1, gust: 1, direction: 1, updated: null })).toEqual([]);
  });

  it('finds the highest speed, when, and the highest gust', () => {
    const peak = peakOf([
      { t: 1, s: 10, g: 15, d: 0 },
      { t: 2, s: 30, g: 35, d: 0 },
      { t: 3, s: null, g: null, d: null },
      { t: 4, s: 20, g: 60, d: 0 },
      { t: 5, s: 5, g: null, d: 0 },
    ]);
    expect(peak).toEqual({ speed: 30, at: 2, gust: 60 });
    expect(peakOf([])).toEqual({ speed: null, at: null, gust: null });
    expect(peakOf([{ t: 1, s: null, g: null, d: null }]).speed).toBeNull();
  });
});

describe('fetchHistory', () => {
  const hass = (callWS?: HomeAssistant['callWS']): HomeAssistant => ({ states: {}, callWS });

  it('asks the recorder for the entities, with attributes only when read', async () => {
    const callWS = vi.fn().mockResolvedValue({ 'weather.home': [] });
    expect(await fetchHistory(hass(callWS), weather, START, START + 3_600_000)).toEqual({
      'weather.home': [],
    });
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history/history_during_period',
        entity_ids: ['weather.home'],
        no_attributes: false,
        minimal_response: false,
        start_time: '2026-10-25T00:00:00.000Z',
      }),
    );
    await fetchHistory(hass(callWS), sensors, START, START + 1000);
    expect(callWS).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entity_ids: ['sensor.wind', 'sensor.gust', 'sensor.dir'],
        no_attributes: true,
        minimal_response: true,
      }),
    );
  });

  it('gives nothing when it cannot ask or the recorder fails', async () => {
    expect(await fetchHistory(hass(undefined), sensors, START, START + 1000)).toBeUndefined();
    expect(await fetchHistory(undefined, sensors, START, START + 1000)).toBeUndefined();
    expect(await fetchHistory(hass(vi.fn()), {}, START, START + 1000)).toBeUndefined();
    const failing = vi.fn().mockRejectedValue(new Error('no recorder'));
    expect(await fetchHistory(hass(failing), sensors, START, START + 1000)).toBeUndefined();
  });
});

describe('liveUnits', () => {
  it('reads the units from the current states', () => {
    const states = {
      'sensor.wind': { entity_id: 'sensor.wind', state: '1', attributes: { unit_of_measurement: 'm/s' } },
      'sensor.gust': { entity_id: 'sensor.gust', state: '1', attributes: {} },
    };
    expect(liveUnits(states, sensors)).toEqual({ speed: 'm/s', gust: undefined });
  });
});

describe('historyRefreshMs', () => {
  it('reads a history of days less often than a history of hours', () => {
    expect(historyRefreshMs(3)).toBe(5 * 60_000);
    expect(historyRefreshMs(24)).toBe(5 * 60_000);
    expect(historyRefreshMs(48)).toBe(15 * 60_000);
    expect(historyRefreshMs(72)).toBe(15 * 60_000);
  });
});
