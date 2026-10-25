/**
 * Wind streaks of the dial: short lines crossing the disc in the direction the wind blows, more
 * numerous and faster as the speed grows. The simulation is pure (`stepParticle`); `StreakCanvas`
 * (in `streak-canvas.ts`) only draws it.
 */

export interface Particle {
  /** Position along the wind, in radii from the center (-1.25 to 1.25). */
  u: number;
  /** Position across the wind, -1 to 1. */
  v: number;
  /** Speed factor: no two streaks go at the same pace. */
  k: number;
  /** Length factor. */
  l: number;
}

type Random = () => number;

/** The wind stops being shown below this speed (km/h). */
export const MIN_SPEED = 0.5;
const EDGE = 1.25;

/** Number of streaks for a speed (km/h): none when calm, up to about 47. */
export function particleCount(kmh: number): number {
  return kmh >= MIN_SPEED ? Math.round(9 + Math.min(kmh, 90) * 0.42) : 0;
}

/** Travel speed (radii per second) of an average streak. */
export function streakVelocity(kmh: number): number {
  return 0.55 + kmh / 38;
}

/** Length of an average streak, as a share of the radius. */
export function streakLength(kmh: number): number {
  return Math.min(0.5, Math.max(0.1, 0.1 + kmh / 220));
}

export function createParticle(random: Random, spread = true): Particle {
  return {
    u: spread ? random() * 2 * EDGE - EDGE : -EDGE,
    v: random() * 2 - 1,
    k: 0.75 + random() * 0.6,
    l: 0.7 + random() * 0.7,
  };
}

/** Moves a streak, and sends it back to the upwind edge, with new traits, once it has left. */
export function stepParticle(p: Particle, dt: number, kmh: number, random: Random): Particle {
  const u = p.u + streakVelocity(kmh) * p.k * dt;
  return u > EDGE ? createParticle(random, false) : { ...p, u };
}

/** Opacity of a streak: it fades in and out towards the edges of the disc. */
export function particleAlpha(p: Particle): number {
  const edge = 1 - Math.abs(p.u) / EDGE;
  return Math.min(1, Math.max(0, edge * 2.2)) * 0.85;
}

/** Adds or removes streaks so that there are `count` of them. */
export function resizePool(pool: Particle[], count: number, random: Random): Particle[] {
  if (pool.length >= count) return pool.slice(0, count);
  const next = [...pool];
  while (next.length < count) next.push(createParticle(random));
  return next;
}
