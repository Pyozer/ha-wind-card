import type { Settings } from './config';
import type { Peak } from './history';
import type { LocalizeKey } from './localize/localize';
import type { WindReading } from './reading';
import {
  arcFraction,
  beaufortForce,
  formatSpeed,
  oppositeBearing,
  pointIndex,
  pointLetters,
  unitLabel,
  windColor,
} from './wind';

export type Translate = (key: LocalizeKey, vars?: Record<string, string>) => string;

/** What the card shows, as plain values: texts, colors and angles. */
export interface WindView {
  available: boolean;
  /** Beaufort force 0 to 12. */
  force: number;
  /** CSS color of the current force. */
  color: string;
  /** Speed in the display unit, `–` when unavailable. */
  speed: string;
  gust: string;
  unit: string;
  /** "Gentle breeze", or why there is nothing to show. */
  caption: string;
  /** Bearing the wind comes from. */
  bearing: number | null;
  /** Bearing the arrow of the compact layout points to. */
  arrowBearing: number | null;
  letters: string;
  /** "West" */
  origin: string;
  /** "East" */
  toward: string;
  /** Arc of the dial, 0 to 100, for the speed and for the gusts. */
  arcSpeed: number;
  arcGust: number;
  maxSpeed: string;
  maxGust: string;
  /** For screen readers. */
  summary: string;
}

const DASH = '–';

export function pointName(t: Translate, bearing: number): string {
  return t(`compass.p${pointIndex(bearing)}` as LocalizeKey);
}

export function forceName(t: Translate, force: number): string {
  return t(`bft.f${force}` as LocalizeKey);
}

export interface ViewInput {
  reading: WindReading;
  settings: Settings;
  language: string;
  t: Translate;
  /** Peaks of the window shown. */
  peak: Peak;
  /** Whether an entity to read is configured at all. */
  configured: boolean;
}

export function buildView({ reading, settings, language, t, peak, configured }: ViewInput): WindView {
  const speed = reading.speed;
  const available = speed !== null;
  const force = available ? beaufortForce(speed) : 0;
  const bearing = reading.direction;
  const text = (kmh: number | null) => (kmh === null ? DASH : formatSpeed(kmh, settings.unit, language));
  const unit = unitLabel(settings.unit);
  const letters = bearing === null ? DASH : pointLetters(pointIndex(bearing), settings.letters);
  const origin = bearing === null ? DASH : pointName(t, bearing);
  const toward = bearing === null ? DASH : pointName(t, oppositeBearing(bearing));
  const caption = available ? forceName(t, force) : configured ? t('card.unavailable') : t('card.no_source');
  const gust = reading.gust ?? speed;

  return {
    available,
    force,
    color: windColor(speed ?? 0, settings.colors, 'var(--lwc-accent)'),
    speed: text(speed),
    gust: text(gust),
    unit,
    caption,
    bearing,
    arrowBearing: bearing === null ? null : settings.arrow === 'to' ? oppositeBearing(bearing) : bearing,
    letters,
    origin,
    toward,
    arcSpeed: available ? arcFraction(speed, settings.maxSpeed) * 100 : 0,
    arcGust: available && gust !== null ? arcFraction(Math.max(gust, speed), settings.maxSpeed) * 100 : 0,
    maxSpeed: text(peak.speed),
    maxGust: text(peak.gust),
    summary: available
      ? `${text(speed)} ${unit}, ${caption}${bearing === null ? '' : `, ${t('card.wind_from', { point: origin })}`}`
      : caption,
  };
}
