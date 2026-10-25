import { describe, expect, it } from 'vitest';
import {
  createParticle,
  MIN_SPEED,
  particleAlpha,
  particleCount,
  resizePool,
  stepParticle,
  streakLength,
  streakVelocity,
} from '../src/streaks';

/** A deterministic "random" that walks through a short list of values. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('wind streaks', () => {
  it('shows none when calm, and more as the wind rises, within a cap', () => {
    expect(particleCount(0)).toBe(0);
    expect(particleCount(MIN_SPEED - 0.01)).toBe(0);
    expect(particleCount(MIN_SPEED)).toBeGreaterThan(8);
    expect(particleCount(60)).toBeGreaterThan(particleCount(10));
    expect(particleCount(500)).toBe(particleCount(90));
  });

  it('goes faster and longer with the wind, longer streaks being capped', () => {
    expect(streakVelocity(80)).toBeGreaterThan(streakVelocity(5));
    expect(streakLength(100)).toBeGreaterThan(streakLength(5));
    expect(streakLength(10_000)).toBe(0.5);
    expect(streakLength(0)).toBeCloseTo(0.1);
  });

  it('creates streaks anywhere on the path, or at the upwind edge', () => {
    const anywhere = createParticle(sequence(0.5, 0.25, 0, 1));
    expect(anywhere).toEqual({ u: 0, v: -0.5, k: 0.75, l: 1.4 });
    expect(createParticle(sequence(0.5), false).u).toBe(-1.25);
  });

  it('moves a streak along the wind, and sends it back upwind once it left', () => {
    const p = { u: 0, v: 0.2, k: 1, l: 1 };
    const moved = stepParticle(p, 0.5, 38, () => 0.5);
    expect(moved.u).toBeCloseTo(0.775);
    expect(moved.v).toBe(0.2);
    expect(p.u).toBe(0);
    const gone = stepParticle({ u: 1.2, v: 0, k: 1.3, l: 1 }, 1, 100, () => 0.5);
    expect(gone.u).toBe(-1.25);
    expect(gone.k).toBeCloseTo(0.75 + 0.5 * 0.6);
  });

  it('fades the streaks in and out towards the edges', () => {
    const alpha = (u: number) => particleAlpha({ u, v: 0, k: 1, l: 1 });
    expect(alpha(0)).toBeCloseTo(0.85);
    expect(alpha(1.25)).toBe(0);
    expect(alpha(-1.25)).toBe(0);
    expect(alpha(1.1)).toBeLessThan(alpha(0.6) + 0.001);
    for (const u of [-3, -1, 0, 1, 3]) {
      expect(alpha(u)).toBeGreaterThanOrEqual(0);
      expect(alpha(u)).toBeLessThanOrEqual(0.85);
    }
  });

  it('grows and shrinks the pool without touching the streaks it keeps', () => {
    const pool = resizePool([], 5, Math.random);
    expect(pool).toHaveLength(5);
    expect(resizePool(pool, 3, Math.random)).toEqual(pool.slice(0, 3));
    expect(resizePool(pool, 8, Math.random).slice(0, 5)).toEqual(pool);
    expect(resizePool(pool, 0, Math.random)).toEqual([]);
  });
});
