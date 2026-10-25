import { describe, expect, it } from 'vitest';
import { STEP_MS, type WindPoint } from '../src/history';
import { computeRose, petalPath, ROSE_INNER, ROSE_MIN_SPEED, ROSE_REACH } from '../src/rose';
import { dialPoint } from '../src/wind';

const point = (s: number | null, d: number | null, i = 0): WindPoint => ({ t: i * STEP_MS, s, g: s, d });

/** `n` samples at the same speed and bearing. */
const run = (n: number, s: number, d: number): WindPoint[] =>
  Array.from({ length: n }, (_, i) => point(s, d, i));

describe('computeRose', () => {
  it('has the 16 sectors in compass order, none with a petal when there is no wind', () => {
    for (const points of [[], run(5, 0, 90), [point(null, null)]]) {
      const rose = computeRose(points);
      expect(rose.map((r) => r.index)).toEqual([...Array(16).keys()]);
      expect(rose.every((r) => r.length === 0 && r.mean === 0 && r.timeShare === 0)).toBe(true);
    }
  });

  it('puts the wind in the sector it came from', () => {
    const rose = computeRose(run(10, 20, 280));
    expect(rose[12]).toMatchObject({ length: 1, mean: 20, timeShare: 1 });
    expect(rose.filter((r) => r.length > 0)).toHaveLength(1);
    // The edges of a sector: 11.25° to 33.75° is NNE.
    expect(computeRose(run(1, 20, 11.2))[0].length).toBe(1);
    expect(computeRose(run(1, 20, 11.3))[1].length).toBe(1);
    expect(computeRose(run(1, 20, 359))[0].length).toBe(1);
  });

  it('lets the strong winds weigh the most, whatever the time spent', () => {
    // Two hours of a 10 km/h breeze from the north, one hour of a 60 km/h gale from the west.
    const points = [...run(24, 10, 0), ...run(12, 60, 270)];
    const rose = computeRose(points);
    expect(rose[12].length).toBe(1);
    // 24 × 10 against 12 × 60: a third of the pull, and a petal shortened by the power of 0.8.
    expect(rose[0].length).toBeCloseTo(Math.pow(1 / 3, 0.8));
    // The shares are about time, not about force.
    expect(rose[0].timeShare).toBeCloseTo(24 / 36);
    expect(rose[12].timeShare).toBeCloseTo(12 / 36);
    expect(rose[12].mean).toBe(60);
    expect(rose.reduce((sum, r) => sum + r.timeShare, 0)).toBeCloseTo(1);
  });

  it('leaves out the calm and the samples without direction or speed', () => {
    const rose = computeRose([
      point(ROSE_MIN_SPEED - 0.1, 90),
      point(null, 90),
      point(30, null),
      point(ROSE_MIN_SPEED, 90),
    ]);
    expect(rose[4]).toMatchObject({ timeShare: 1, mean: ROSE_MIN_SPEED });
    expect(rose.filter((r) => r.timeShare > 0)).toHaveLength(1);
  });

  it('keeps the petals between 0 and 1, and the strongest sector at 1', () => {
    const points = [...run(7, 5, 10), ...run(3, 80, 100), ...run(9, 30, 200), ...run(2, 15, 330)];
    const lengths = computeRose(points).map((r) => r.length);
    for (const l of lengths) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...lengths)).toBe(1);
  });
});

describe('petalPath', () => {
  const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('draws a closed section of a ring around the compass point', () => {
    const path = petalPath(12, 1);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.match(/A/g)).toHaveLength(2);
    expect(path).not.toMatch(/NaN|undefined/);
  });

  it('is longer for a longer petal, between the inner circle and the reach', () => {
    const outerRadius = (path: string) => Number(/A(\d+(\.\d+)?) /.exec(path)![1]);
    expect(outerRadius(petalPath(0, 0))).toBeGreaterThan(ROSE_INNER);
    expect(outerRadius(petalPath(0, 1))).toBe(ROSE_INNER + 5 + ROSE_REACH);
    expect(outerRadius(petalPath(0, 0.5))).toBeGreaterThan(outerRadius(petalPath(0, 0.1)));
    // A length out of range is held to it.
    expect(petalPath(0, 5)).toBe(petalPath(0, 1));
    expect(petalPath(0, -1)).toBe(petalPath(0, 0));
  });

  it('points at its compass point', () => {
    // A petal to the west starts left of the center, one to the north above it, one to the south below.
    expect(numbers(petalPath(12, 1))[0]).toBeLessThan(120);
    expect(numbers(petalPath(0, 1))[1]).toBeLessThan(120);
    expect(numbers(petalPath(8, 1))[1]).toBeGreaterThan(120);
  });

  it('keeps neighbouring petals apart', () => {
    const edge = (index: number, side: 'start' | 'end') => {
      const n = numbers(petalPath(index, 1));
      return side === 'start' ? { x: n[0], y: n[1] } : { x: n[4], y: n[5] };
    };
    const gap = Math.hypot(edge(0, 'end').x - edge(1, 'start').x, edge(0, 'end').y - edge(1, 'start').y);
    expect(gap).toBeGreaterThan(1);
  });
});

describe('dialPoint', () => {
  it('finds a point of the dial from a radius and a bearing', () => {
    expect(dialPoint(100, 0)).toEqual({ x: 120, y: 20 });
    const east = dialPoint(100, 90);
    expect(east.x).toBeCloseTo(220);
    expect(east.y).toBeCloseTo(120);
    const south = dialPoint(50, 180);
    expect(south.x).toBeCloseTo(120);
    expect(south.y).toBeCloseTo(170);
    expect(dialPoint(0, 123)).toEqual({ x: 120, y: 120 });
  });
});
