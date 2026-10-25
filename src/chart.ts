import type { WindPoint } from './history';
import type { ArrowMode, ColorMode } from './types';
import { BEAUFORT_COLORS, BEAUFORT_LOWER, beaufortForce, niceMax, oppositeBearing, windColor } from './wind';

/**
 * Geometry of the history chart: paths, gradient, axis, direction arrows and time labels, as plain
 * data. The card only turns them into SVG, which keeps all the maths testable without a DOM.
 */

export const PLOT_HEIGHT = 112;
const PAD_RIGHT = 30;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;
/** Spacing between two direction arrows (px), at least. */
const ARROW_SPACING = 46;
const MIN_ARROWS = 4;
const MAX_ARROWS = 12;

export type Point = readonly [number, number];

/**
 * Smooth path through points, monotone in x (Fritsch–Carlson, like d3's `curveMonotoneX`): the
 * curve never overshoots between two samples, so a calm period does not dip below zero.
 */
export function monotonePath(pts: readonly Point[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const fmt = (v: number) => v.toFixed(1);
  if (n === 1) return `M${fmt(pts[0][0])},${fmt(pts[0][1])}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    slope[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] =
      slope[i - 1] * slope[i] <= 0
        ? 0
        : (3 * (dx[i - 1] + dx[i])) /
          ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
  }
  let d = `M${fmt(pts[0][0])},${fmt(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      `C${fmt(pts[i][0] + h)},${fmt(pts[i][1] + tangent[i] * h)} ` +
      `${fmt(pts[i + 1][0] - h)},${fmt(pts[i + 1][1] - tangent[i + 1] * h)} ` +
      `${fmt(pts[i + 1][0])},${fmt(pts[i + 1][1])}`;
  }
  return d;
}

/** Runs of consecutive indexes holding a value: the curve is cut where the data is missing. */
export function runsOf(values: readonly (number | null)[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(i);
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

/** Paths of the small speed curve of the compact layout: the line, and its closed shape for the fill. */
export function sparkPaths(
  points: readonly WindPoint[],
  width: number,
  height: number,
): { line: string; area: string }[] {
  const n = points.length;
  if (n < 2) return [];
  let peak = 10;
  for (const p of points) peak = Math.max(peak, p.g ?? p.s ?? 0, p.s ?? 0);
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (kmh: number) => height - 4 - (kmh / peak) * (height - 12);
  return runsOf(points.map((p) => p.s))
    .filter((run) => run.length >= 2)
    .map((run) => {
      const line = monotonePath(run.map((i): Point => [x(i), y(points[i].s as number)]));
      return {
        line,
        area: `${line} L${x(run[run.length - 1]).toFixed(1)},${height} L${x(run[0]).toFixed(1)},${height} Z`,
      };
    });
}

export interface ChartInput {
  points: readonly WindPoint[];
  width: number;
  showGust: boolean;
  showArrows: boolean;
  colors: ColorMode;
  arrow: ArrowMode;
  /** Plain CSS color used instead of the force colors in `accent` mode. */
  accent: string;
  /** A speed (km/h) as text in the display unit, without its unit. */
  formatSpeed: (kmh: number) => string;
  /** A time (ms) as text. */
  formatTime: (t: number) => string;
  /** Label of the last point. */
  nowLabel: string;
}

export interface ChartModel {
  width: number;
  height: number;
  /** Width of the plot, without the axis labels on the right. */
  plotWidth: number;
  /** y of the zero line. */
  baseline: number;
  top: number;
  maxValue: number;
  grid: { y: number; label: string }[];
  /** One path per run of data (the curve is cut where a value is missing). */
  speedPaths: string[];
  /** The same runs closed down to the zero line, for the fill. */
  areaPaths: string[];
  gustPaths: string[];
  /** Vertical gradient of the curve, from the zero line (offset 0) up. */
  stops: { offset: string; color: string }[];
  arrows: { x: number; y: number; angle: number; color: string }[];
  labels: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
  x: (index: number) => number;
  y: (kmh: number) => number;
  /** Index of the sample nearest to a pointer x, within the plot. */
  indexAt: (px: number) => number;
}

export function buildChart(input: ChartInput): ChartModel {
  const { points, width, showGust, showArrows, colors, arrow, accent } = input;
  const n = points.length;
  const plotWidth = Math.max(0, width - PAD_RIGHT);
  const height = PLOT_HEIGHT + (showArrows ? 54 : 22);
  const baseline = PLOT_HEIGHT - PAD_BOTTOM;

  let peak = 10;
  for (const p of points) peak = Math.max(peak, showGust ? (p.g ?? p.s ?? 0) : (p.s ?? 0), p.s ?? 0);
  const maxValue = niceMax(peak);

  const x = (i: number) => (n > 1 ? (i / (n - 1)) * plotWidth : 0);
  const y = (kmh: number) => PAD_TOP + (1 - kmh / maxValue) * (baseline - PAD_TOP);
  const indexAt = (px: number) =>
    n > 1 ? Math.min(n - 1, Math.max(0, Math.round((px / (plotWidth || 1)) * (n - 1)))) : 0;

  const pathsOf = (pick: (p: WindPoint) => number | null, closed: boolean): string[] =>
    runsOf(points.map(pick))
      .filter((run) => run.length >= 2)
      .map((run) => {
        const pts: Point[] = run.map((i) => [x(i), y(pick(points[i]) as number)]);
        const line = monotonePath(pts);
        return closed
          ? `${line} L${x(run[run.length - 1]).toFixed(1)},${baseline} L${x(run[0]).toFixed(1)},${baseline} Z`
          : line;
      });

  const stops =
    colors === 'accent'
      ? [
          { offset: '0', color: accent },
          { offset: '1', color: accent },
        ]
      : [
          ...BEAUFORT_LOWER.flatMap((lo, force) =>
            lo <= maxValue ? [{ offset: (lo / maxValue).toFixed(3), color: BEAUFORT_COLORS[force] }] : [],
          ),
          { offset: '1', color: BEAUFORT_COLORS[beaufortForce(maxValue)] },
        ];

  const arrows: ChartModel['arrows'] = [];
  const labels: ChartModel['labels'] = [];
  const count = Math.min(MAX_ARROWS, Math.max(MIN_ARROWS, Math.floor(plotWidth / ARROW_SPACING)));
  if (n > 1) {
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / (count - 1)) * (n - 1));
      const p = points[i];
      const px = x(i);
      if (showArrows && p.d !== null) {
        arrows.push({
          x: px,
          y: PLOT_HEIGHT + 14,
          angle: arrow === 'to' ? oppositeBearing(p.d) : p.d,
          color: windColor(p.s ?? 0, colors, accent),
        });
      }
      // A label every other arrow, counted from the last one, which is always labelled.
      if (k % 2 === (count - 1) % 2) {
        labels.push({
          x: Math.min(plotWidth - 2, Math.max(14, px)),
          y: PLOT_HEIGHT + (showArrows ? 44 : 14),
          text: k === count - 1 ? input.nowLabel : input.formatTime(p.t),
          anchor: k === 0 ? 'start' : k === count - 1 ? 'end' : 'middle',
        });
      }
    }
  }

  return {
    width,
    height,
    plotWidth,
    baseline,
    top: PAD_TOP,
    maxValue,
    grid: [0, maxValue / 2, maxValue].map((v) => ({ y: y(v), label: input.formatSpeed(v) })),
    speedPaths: pathsOf((p) => p.s, false),
    areaPaths: pathsOf((p) => p.s, true),
    gustPaths: showGust ? pathsOf((p) => (p.g !== null && p.s !== null ? p.g : null), false) : [],
    stops,
    arrows,
    labels,
    x,
    y,
    indexAt,
  };
}
