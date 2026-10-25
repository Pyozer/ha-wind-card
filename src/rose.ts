import type { WindPoint } from './history';
import { dialPoint, pointIndex, POINT_COUNT } from './wind';

/**
 * The wind rose of a history window: for each of the 16 points of the compass, how much wind came
 * from there. The pull of each sample is its speed, so a gale from the west weighs more than a
 * breeze from the north. Pure geometry and counting, drawn by the card.
 */

/** Below this speed (km/h) the direction is not worth reading: the sample is left out. */
export const ROSE_MIN_SPEED = 1;

/** Radius (dial units, the dial being 240 wide) where the petals start, and the room they have. */
export const ROSE_INNER = 50;
export const ROSE_REACH = 40;
/** Space kept between the inner circle and the shortest petal. */
const ROSE_FLOOR = 5;
/** Half the angle of a petal, a bit under half of the 22.5° of a sector, so petals do not touch. */
const HALF_ANGLE = 9.4;

export interface RoseSector {
  /** Index of the compass point, 0 (north) to 15. */
  index: number;
  /** Length of the petal, 0 to 1: the strongest sector is 1. */
  length: number;
  /** Average speed (km/h) of the wind from this sector, for its color. */
  mean: number;
  /** Share (0 to 1) of the samples that came from this sector. */
  timeShare: number;
}

/** The 16 sectors of a window, in compass order; those the wind never came from have no length. */
export function computeRose(points: readonly WindPoint[]): RoseSector[] {
  const sectors = Array.from({ length: POINT_COUNT }, (_, index) => ({ index, count: 0, speeds: 0 }));
  let total = 0;
  for (const p of points) {
    if (p.s === null || p.d === null || p.s < ROSE_MIN_SPEED) continue;
    const sector = sectors[pointIndex(p.d)];
    sector.count++;
    sector.speeds += p.s;
    total++;
  }
  // Weighted by the speed, the pull of a sector is the sum of its speeds.
  const strongest = Math.max(0, ...sectors.map((s) => s.speeds));
  return sectors.map((s) => ({
    index: s.index,
    length: strongest ? Math.pow(s.speeds / strongest, 0.8) : 0,
    mean: s.count ? s.speeds / s.count : 0,
    timeShare: total ? s.count / total : 0,
  }));
}

/** Path of a petal: a ring section around the compass point, as long as `length` (0 to 1) says. */
export function petalPath(index: number, length: number): string {
  const angle = index * (360 / POINT_COUNT);
  const outer = ROSE_INNER + ROSE_FLOOR + Math.min(1, Math.max(0, length)) * ROSE_REACH;
  const at = (radius: number, deg: number) => {
    const { x, y } = dialPoint(radius, deg);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  return (
    `M${at(ROSE_INNER, angle - HALF_ANGLE)} L${at(outer, angle - HALF_ANGLE)} ` +
    `A${outer} ${outer} 0 0 1 ${at(outer, angle + HALF_ANGLE)} ` +
    `L${at(ROSE_INNER, angle + HALF_ANGLE)} ` +
    `A${ROSE_INNER} ${ROSE_INNER} 0 0 0 ${at(ROSE_INNER, angle - HALF_ANGLE)} Z`
  );
}
