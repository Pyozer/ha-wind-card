import { describe, expect, it } from 'vitest';
import { buildChart, monotonePath, runsOf, sparkPaths, type ChartInput, type Point } from '../src/chart';
import { STEP_MS, type WindPoint } from '../src/history';
import { BEAUFORT_COLORS } from '../src/wind';

const series = (values: (number | null)[], gusts = 8, dir: number | null = 280): WindPoint[] =>
  values.map((s, i) => ({ t: i * STEP_MS, s, g: s === null ? null : s + gusts, d: dir }));

const input = (points: WindPoint[], over: Partial<ChartInput> = {}): ChartInput => ({
  points,
  width: 400,
  showGust: true,
  showArrows: true,
  colors: 'beaufort',
  arrow: 'to',
  accent: '#007aff',
  formatSpeed: (kmh) => String(Math.round(kmh)),
  formatTime: (t) => `t${t / STEP_MS}`,
  nowLabel: 'Now',
  ...over,
});

describe('monotonePath', () => {
  it('draws nothing, a point, or a curve through every sample', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([[1, 2]])).toBe('M1.0,2.0');
    const path = monotonePath([
      [0, 10],
      [10, 20],
      [20, 15],
    ]);
    expect(path.startsWith('M0.0,10.0C')).toBe(true);
    expect(path.endsWith('20.0,15.0')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(2);
  });

  it('never overshoots between two samples', () => {
    // A step: a naive spline would dip below 0 and above 100.
    const pts: Point[] = [0, 1, 2, 3, 4, 5].map((i): Point => [i * 10, i < 3 ? 100 : 0]);
    const controlYs = (monotonePath(pts).match(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g) ?? []).flatMap(
      (c) => {
        const [, y1, , y2] = c.slice(1).split(/[, ]/);
        return [Number(y1), Number(y2)];
      },
    );
    for (const y of controlYs) {
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(100.001);
    }
  });
});

describe('runsOf', () => {
  it('splits where a value is missing', () => {
    expect(runsOf([1, 2, null, 3, null, null, 4, 5])).toEqual([[0, 1], [3], [6, 7]]);
    expect(runsOf([])).toEqual([]);
    expect(runsOf([null, null])).toEqual([]);
  });
});

describe('buildChart', () => {
  const values = Array.from({ length: 37 }, (_, i) => 10 + (i % 12));

  it('puts the zero line at the bottom and the axis on round values', () => {
    const m = buildChart(input(series(values)));
    expect(m.maxValue).toBe(30);
    expect(m.grid.map((g) => g.label)).toEqual(['0', '15', '30']);
    expect(m.y(0)).toBe(m.baseline);
    expect(m.y(m.maxValue)).toBe(m.top);
    expect(m.plotWidth).toBe(370);
    expect(m.x(0)).toBe(0);
    expect(m.x(36)).toBe(370);
  });

  it('scales the axis on the gusts only when they are shown', () => {
    const points = series(values, 30);
    expect(buildChart(input(points, { showGust: true })).maxValue).toBeGreaterThan(
      buildChart(input(points, { showGust: false })).maxValue,
    );
    expect(buildChart(input(points, { showGust: false })).gustPaths).toEqual([]);
    expect(buildChart(input(points)).gustPaths).toHaveLength(1);
  });

  it('cuts the curve where data is missing, and ignores a lone sample', () => {
    const m = buildChart(input(series([10, 12, 14, null, 20, null, 18, 19, 21])));
    expect(m.speedPaths).toHaveLength(2);
    expect(m.areaPaths).toHaveLength(2);
    expect(m.areaPaths[0].endsWith('Z')).toBe(true);
  });

  it('never produces NaN, even with no data at all', () => {
    for (const points of [series([]), series([5]), series([null, null, null]), series(values)]) {
      const m = buildChart(input(points));
      const all = [m.speedPaths, m.areaPaths, m.gustPaths].flat().join(' ');
      expect(all).not.toMatch(/NaN|undefined/);
      expect(m.stops.every((s) => !s.offset.includes('NaN'))).toBe(true);
      for (const a of m.arrows) expect(Number.isFinite(a.x) && Number.isFinite(a.angle)).toBe(true);
    }
    expect(buildChart(input(series([]))).speedPaths).toEqual([]);
  });

  it('colors the curve by force, from the zero line up, or with the accent', () => {
    const m = buildChart(input(series(values)));
    expect(m.stops[0]).toEqual({ offset: '0.000', color: BEAUFORT_COLORS[0] });
    expect(m.stops.at(-1)!.offset).toBe('1');
    const offsets = m.stops.map((s) => Number(s.offset));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(buildChart(input(series(values), { colors: 'accent' })).stops).toEqual([
      { offset: '0', color: '#007aff' },
      { offset: '1', color: '#007aff' },
    ]);
  });

  it('shows arrows pointing where the wind blows to, or where it comes from', () => {
    const to = buildChart(input(series(values, 8, 280)));
    expect(to.arrows.length).toBeGreaterThanOrEqual(4);
    expect(to.arrows.every((a) => a.angle === 100)).toBe(true);
    const from = buildChart(input(series(values, 8, 280), { arrow: 'from' }));
    expect(from.arrows.every((a) => a.angle === 280)).toBe(true);
    expect(buildChart(input(series(values), { showArrows: false })).arrows).toEqual([]);
    expect(buildChart(input(series(values, 8, null))).arrows).toEqual([]);
    expect(buildChart(input(series(values), { showArrows: false })).height).toBeLessThan(to.height);
  });

  it('labels the time under the arrows, the last one being "now"', () => {
    const m = buildChart(input(series(values)));
    expect(m.labels.at(-1)).toMatchObject({ text: 'Now', anchor: 'end' });
    expect(m.labels[0].text).not.toBe('Now');
    for (const l of m.labels) expect(l.x).toBeLessThanOrEqual(m.plotWidth);
    const narrow = buildChart(input(series(values), { width: 200 }));
    expect(narrow.arrows.length).toBeLessThan(m.arrows.length + 1);
    expect(narrow.arrows.length).toBeGreaterThanOrEqual(4);
  });

  it('finds the sample under a pointer, within the plot', () => {
    const m = buildChart(input(series(values)));
    expect(m.indexAt(-50)).toBe(0);
    expect(m.indexAt(0)).toBe(0);
    expect(m.indexAt(m.plotWidth / 2)).toBe(18);
    expect(m.indexAt(m.plotWidth)).toBe(36);
    expect(m.indexAt(5000)).toBe(36);
    expect(buildChart(input(series([]))).indexAt(10)).toBe(0);
  });
});

describe('sparkPaths', () => {
  it('draws the line and its fill, cut where data is missing', () => {
    const paths = sparkPaths(series([5, 8, 12, null, 9, 11]), 76, 48);
    expect(paths).toHaveLength(2);
    expect(paths[0].area.startsWith(paths[0].line)).toBe(true);
    expect(paths[0].area.endsWith('Z')).toBe(true);
    expect(sparkPaths(series([5]), 76, 48)).toEqual([]);
    expect(sparkPaths([], 76, 48)).toEqual([]);
    for (const p of paths) expect(p.line + p.area).not.toMatch(/NaN/);
  });
});
