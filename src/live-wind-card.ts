import { mdiCompassOutline, mdiTrendingUp, mdiWeatherWindy } from '@mdi/js';
import {
  LitElement,
  html,
  nothing,
  svg,
  type PropertyValues,
  type SVGTemplateResult,
  type TemplateResult,
} from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { actionHandlers, isInteractive } from './actions';
import { buildChart, PLOT_HEIGHT, sparkPaths, type ChartModel } from './chart';
import { HISTORY_WINDOWS, resolveSettings, validateConfig, watchedEntities, type Settings } from './config';
import { guessConfig } from './entities';
import {
  buildSeries,
  fetchHistory,
  HISTORY_REFRESH_MS,
  liveUnits,
  MAX_HOURS,
  peakOf,
  windowOf,
  withLive,
  type WindPoint,
} from './history';
import { localize, resolveLanguage, type LocalizeKey } from './localize/localize';
import { NO_READING, readWind, resolveSources, type WindReading, type WindSources } from './reading';
import { StreakCanvas } from './streak-canvas';
import { cardStyles } from './styles';
import type { CardActions, HistoryHours, HomeAssistant, LiveWindCardConfig } from './types';
import { buildView, pointName, type WindView } from './view';
import {
  beaufortForce,
  BEAUFORT_COLORS,
  cardinalLetters,
  formatAge,
  formatSpeed,
  MAX_FORCE,
  nextRotation,
  oppositeBearing,
  pointIndex,
  pointLetters,
  unitLabel,
  windColor,
} from './wind';
import './editor/editor';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

export const CARD_TAG = 'live-wind-card';

/** How often the "updated … ago" text is refreshed. */
const TICK_MS = 30_000;

const ARROW_PATH = 'M0 5.2 L-4.8 -1.6 L-1.7 -1.6 L-1.7 -5.2 L1.7 -5.2 L1.7 -1.6 L4.8 -1.6 Z';
/** An arrow with a head and a shaft, pointing up, for the compact layout. */
const BIG_ARROW_PATH = 'M50 30 L38 50 L46 50 L46 69 L54 69 L54 50 L62 50 Z';

/** Ticks of the dial: every 10°, longer at the cardinal points. */
const TICKS = Array.from({ length: 36 }, (_, i) => {
  const angle = (i * 10 * Math.PI) / 180;
  const major = i % 9 === 0;
  const point = (r: number) => ({ x: 120 + r * Math.sin(angle), y: 120 - r * Math.cos(angle) });
  return { major, from: point(major ? 104 : 106.5), to: point(110.5) };
});

const polar = (r: number, deg: number) => ({
  x: 120 + r * Math.sin((deg * Math.PI) / 180),
  y: 120 - r * Math.cos((deg * Math.PI) / 180),
});

let instances = 0;

type Handlers = ReturnType<typeof actionHandlers>;

export class LiveWindCard extends LitElement {
  static override styles = cardStyles;

  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
    _history: { state: true },
    _period: { state: true },
    _scrub: { state: true },
    _chartWidth: { state: true },
    _now: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: LiveWindCardConfig;
  /** The last 24 hours, resampled every 5 minutes, `undefined` until the recorder has answered. */
  declare _history?: WindPoint[];
  /** History window picked by the reader, until the configuration changes. */
  declare _period?: HistoryHours;
  /** Index of the sample under the finger or the pointer in the chart. */
  declare _scrub: number | null;
  declare _chartWidth: number;
  declare _now: number;

  private _uid = `lwc${++instances}`;
  private _sources: WindSources = {};
  private _watched: string[] = [];
  private _reading: WindReading = NO_READING;
  private _settings?: Settings;
  private _language = 'en';
  private _handlers?: Handlers;
  private _streaks?: StreakCanvas;
  private _streakCanvas?: HTMLCanvasElement;
  private _visible = true;
  private _resize?: ResizeObserver;
  private _intersection?: IntersectionObserver;
  private _historyTimer?: number;
  private _tickTimer?: number;
  /** Continuous angles of the pointer and of the compact arrow (they may go beyond 360°). */
  private _rot = 0;
  private _arrowRot = 0;

  constructor() {
    super();
    this._scrub = null;
    this._chartWidth = 0;
    this._now = Date.now();
  }

  static getConfigElement(): HTMLElement {
    return document.createElement('live-wind-card-editor');
  }

  /** Configuration suggested when adding the card: the first weather entity that reports a wind. */
  static getStubConfig(hass?: HomeAssistant): Partial<LiveWindCardConfig> {
    return guessConfig(hass);
  }

  setConfig(config: LiveWindCardConfig): void {
    this._config = validateConfig(config);
    this._sources = resolveSources(this._config);
    this._watched = watchedEntities(this._config);
    this._history = undefined;
    this._period = undefined;
    this._scrub = null;
    this._handlers = undefined;
    this._stopHistory();
  }

  getCardSize(): number {
    return this._config?.layout === 'compact' ? 2 : 8;
  }

  getGridOptions() {
    return this._config?.layout === 'compact'
      ? { columns: 12, min_columns: 4, rows: 2, min_rows: 2 }
      : { columns: 12, min_columns: 6, rows: 'auto' };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resize = new ResizeObserver(() => this._measure());
    this._resize.observe(this);
    this._intersection = new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
      this._streaks?.setVisible(this._visible);
    });
    this._intersection.observe(this);
    this._tickTimer = window.setInterval(() => (this._now = Date.now()), TICK_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    this._intersection?.disconnect();
    window.clearInterval(this._tickTimer);
    this._streaks?.destroy();
    this._streaks = undefined;
    this._streakCanvas = undefined;
    this._stopHistory();
  }

  // --- History ----------------------------------------------------------------------------------

  /** Whether the layout shows something drawn from the history. */
  private _needsHistory(): boolean {
    const s = this._settings;
    return !!s && (s.layout === 'compact' || s.showHistory || s.showStats);
  }

  private _startHistory(): void {
    if (this._historyTimer !== undefined || !this.hass || !this.isConnected || !this._needsHistory()) return;
    this._historyTimer = window.setInterval(() => void this._refreshHistory(), HISTORY_REFRESH_MS);
    void this._refreshHistory();
  }

  private _stopHistory(): void {
    window.clearInterval(this._historyTimer);
    this._historyTimer = undefined;
  }

  private async _refreshHistory(): Promise<void> {
    const hass = this.hass;
    const config = this._config;
    if (!hass || !config) return;
    const end = Date.now();
    const start = end - MAX_HOURS * 3_600_000;
    const sources = this._sources;
    const result = await fetchHistory(hass, sources, start, end);
    // Ignore a late answer for a configuration that has changed since.
    if (config !== this._config) return;
    this._history = buildSeries(result, sources, { start, end, units: liveUnits(hass.states, sources) });
  }

  // --- Lifecycle --------------------------------------------------------------------------------

  private _measure(): void {
    const chart = this.renderRoot.querySelector<HTMLElement>('.chart');
    const width = Math.floor(chart?.clientWidth ?? 0);
    if (width > 0 && Math.abs(width - this._chartWidth) >= 1) this._chartWidth = width;
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.size === 1 && changed.has('hass')) {
      const old = changed.get('hass') as HomeAssistant | undefined;
      const hass = this.hass;
      if (!old || !hass) return true;
      if (old.language !== hass.language || old.locale?.language !== hass.locale?.language) return true;
      if (old.themes?.darkMode !== hass.themes?.darkMode) return true;
      return this._watched.some((id) => old.states[id] !== hass.states[id]);
    }
    return true;
  }

  protected override willUpdate(): void {
    if (!this._config || !this.hass) return;
    this._language = resolveLanguage(this._config.language, this.hass);
    this._settings = resolveSettings(this._config, this.hass.config?.unit_system?.wind_speed, this._language);
    this._reading = readWind(this.hass.states, this._sources);
    const { direction } = this._reading;
    if (direction !== null) {
      this._rot = nextRotation(this._rot, direction);
      this._arrowRot = nextRotation(
        this._arrowRot,
        this._settings.arrow === 'to' ? oppositeBearing(direction) : direction,
      );
    }
  }

  protected override firstUpdated(): void {
    this._measure();
  }

  protected override updated(): void {
    this.toggleAttribute('dark', !!this.hass?.themes?.darkMode);
    this._startHistory();
    this._bindStreaks();
  }

  /** Creates the streak animation on the canvas of the dial, and feeds it the wind. */
  private _bindStreaks(): void {
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>('.dial canvas') ?? undefined;
    if (canvas !== this._streakCanvas) {
      this._streaks?.destroy();
      this._streaks = canvas ? new StreakCanvas(canvas) : undefined;
      this._streakCanvas = canvas;
      this._streaks?.setVisible(this._visible);
    }
    const view = this._view();
    if (this._streaks && view) {
      this._streaks.update({
        from: view.bearing ?? 0,
        speed: this._reading.speed ?? 0,
        // The canvas cannot read a CSS variable: ask for the resolved color.
        color: this._cssColor(view.color),
        enabled: !!this._settings?.animations && view.bearing !== null,
      });
    }
  }

  /** A CSS color or `var(--x)` as a plain color, for the canvas. */
  private _cssColor(color: string): string {
    const match = /^var\((--[\w-]+)\)$/.exec(color);
    if (!match) return color;
    return getComputedStyle(this).getPropertyValue(match[1]).trim() || '#007aff';
  }

  // --- Helpers ----------------------------------------------------------------------------------

  private _t = (key: LocalizeKey, vars?: Record<string, string>): string =>
    localize(this._language, key, vars);

  private _actions(): CardActions {
    const config = this._config;
    const entity = this._sources.speed?.entity ?? config?.weather_entity;
    return {
      tap_action: config?.tap_action ?? (entity ? { action: 'more-info', entity } : { action: 'none' }),
      hold_action: config?.hold_action,
      double_tap_action: config?.double_tap_action,
    };
  }

  private _handlersFor(): Handlers {
    return (this._handlers ??= actionHandlers(this, () => this._actions()));
  }

  /** The history of the window shown, ending on the current reading. */
  private _series(): WindPoint[] {
    if (!this._history || !this._settings) return [];
    return windowOf(withLive(this._history, this._reading), this._period ?? this._settings.historyHours);
  }

  private _view(): WindView | undefined {
    if (!this._settings) return undefined;
    return buildView({
      reading: this._reading,
      settings: this._settings,
      language: this._language,
      t: this._t,
      peak: peakOf(this._series()),
      configured: !!this._sources.speed,
    });
  }

  // --- Render -----------------------------------------------------------------------------------

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass || !this._settings) return nothing;
    const view = this._view()!;
    const settings = this._settings;
    const compact = settings.layout === 'compact';
    const actions = this._actions();
    const interactive = isInteractive(actions);
    const h = this._handlersFor();
    return html`
      <ha-card
        class=${classMap({ compact, 'is-unavailable': !view.available, interactive })}
        style="--lwc-c: ${view.color}"
        role=${interactive ? 'button' : 'group'}
        tabindex=${interactive ? 0 : -1}
        aria-label=${view.summary}
        @pointerdown=${h.pointerdown}
        @pointermove=${h.pointermove}
        @pointercancel=${h.pointercancel}
        @pointerleave=${h.pointerleave}
        @click=${h.click}
        @keydown=${h.keydown}
      >
        ${compact ? this._renderCompact(view) : this._renderFull(view)}
      </ha-card>
    `;
  }

  private _title(): string {
    return this._config?.name ?? this._t('card.default_name');
  }

  private _renderFull(view: WindView): TemplateResult {
    const s = this._settings!;
    const sub = this._subtitle();
    return html`
      <div class="head">
        <div>
          <div class="title">${this._title()}</div>
          ${sub ? html`<div class="sub">${sub}</div>` : nothing}
        </div>
        <div class="force">
          <i></i>${view.available ? this._t('card.force', { force: String(view.force) }) : '–'}
        </div>
      </div>
      <div class="body">
        ${this._renderDial(view)}
        ${
          s.showStats || s.showBeaufort
            ? html`<div class="side">
                ${s.showStats ? this._renderStats(view, s.showGust ? 3 : 2) : nothing}
                ${s.showBeaufort ? this._renderScale(view) : nothing}
              </div>`
            : nothing
        }
      </div>
      ${s.showHistory ? this._renderHistory() : nothing}
    `;
  }

  private _subtitle(): string {
    const s = this._settings!;
    const parts: string[] = [];
    if (this._config?.subtitle) parts.push(this._config.subtitle);
    if (s.showUpdated && this._reading.updated !== null) {
      const time = formatAge(Math.max(0, this._now - this._reading.updated), this._language);
      parts.push(this._t('card.updated', { time }));
    }
    return parts.join(' · ');
  }

  // --- Dial ---

  private _renderDial(view: WindView): TemplateResult {
    const s = this._settings!;
    const letters = cardinalLetters(s.letters);
    const hidden = view.bearing === null;
    return html`
      <div class="dial">
        <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
          <circle class="dial-disc" cx="120" cy="120" r="118" />
          ${TICKS.map(
            (t) =>
              svg`<line class="dial-tick ${t.major ? 'major' : ''}" x1=${t.from.x} y1=${t.from.y} x2=${t.to.x} y2=${t.to.y} />`,
          )}
          ${letters.map((letter, i) => {
            const p = polar(93, i * 90);
            return svg`<text class="dial-letter ${i === 0 ? 'north' : ''}" x=${p.x} y=${p.y}>${letter}</text>`;
          })}
          ${[45, 135, 225, 315].map((a) => {
            const p = polar(93, a);
            return svg`<circle class="dial-dot" cx=${p.x} cy=${p.y} r="1.6" />`;
          })}
          <circle class="arc-track" cx="120" cy="120" r="76" stroke-width="7" />
          <circle
            class="arc-gust"
            cx="120"
            cy="120"
            r="76"
            stroke-width="7"
            pathLength="100"
            transform="rotate(-90 120 120)"
            style="stroke:${windColor(this._reading.gust ?? this._reading.speed ?? 0, s.colors, 'var(--lwc-accent)')};stroke-dasharray:${s.showGust ? view.arcGust : 0} 100"
          />
          <circle
            class="arc-speed"
            cx="120"
            cy="120"
            r="76"
            stroke-width="7"
            pathLength="100"
            transform="rotate(-90 120 120)"
            style="stroke:${view.color};stroke-dasharray:${view.arcSpeed} 100"
          />
          <g class="ptr" style="transform: rotate(${this._rot}deg); opacity: ${hidden ? 0 : 1}">
            <g transform="translate(120 11)">
              <circle class="ptr-badge" r="11" />
              <path class="ptr-arrow" d=${ARROW_PATH} transform=${s.arrow === 'to' ? '' : 'rotate(180)'} />
            </g>
          </g>
        </svg>
        <canvas></canvas>
        <div class="center">
          <div class="speed">${view.speed}</div>
          ${view.available ? html`<div class="unit">${view.unit}</div>` : nothing}
          <div class="bname">${view.caption}</div>
        </div>
      </div>
    `;
  }

  // --- Tiles and Beaufort scale ---

  private _renderStats(view: WindView, count: number): TemplateResult {
    const s = this._settings!;
    const icon = (path: string) => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path} /></svg>`;
    const peak = peakOf(this._series());
    return html`
      <div class="stats" style="--tiles: ${count}">
        ${
          s.showGust
            ? html`<div class="stat">
                <div class="label">${icon(mdiWeatherWindy)}${this._t('card.gust')}</div>
                <div class="value">${this._withUnit(view.gust, view.unit)}</div>
                <div class="note">
                  ${
                    view.available && this._reading.gust !== null
                      ? this._t('card.force', { force: String(beaufortForce(this._reading.gust)) })
                      : '–'
                  }
                </div>
              </div>`
            : nothing
        }
        <div class="stat">
          <div class="label">${icon(mdiCompassOutline)}${this._t('card.origin')}</div>
          <div class="value">
            ${view.bearing === null ? '–' : html`${view.letters}<small>${Math.round(view.bearing)}°</small>`}
          </div>
          <div class="note">
            ${view.bearing === null ? '–' : this._t('card.toward', { point: view.toward.toLowerCase() })}
          </div>
        </div>
        <div class="stat">
          <div class="label">
            ${icon(mdiTrendingUp)}${this._t('card.max', { hours: String(this._period ?? s.historyHours) })}
          </div>
          <div class="value">${this._withUnit(view.maxSpeed, view.unit)}</div>
          <div class="note">
            ${peak.gust === null ? '–' : this._t('card.gusts_up_to', { value: view.maxGust })}
          </div>
        </div>
      </div>
    `;
  }

  /** A value and its small unit, without the unit when there is no value. */
  private _withUnit(value: string, unit: string): TemplateResult {
    return value === '–' ? html`${value}` : html`${value}<small>${unit}</small>`;
  }

  private _renderScale(view: WindView): TemplateResult {
    return html`
      <div class="scale">
        <div class="top">
          <span>${this._t('card.beaufort_scale')}</span>
          <span><b>${view.available ? view.force : '–'}</b> / ${MAX_FORCE}</span>
        </div>
        <div class="bar">
          ${BEAUFORT_COLORS.map(
            (color, i) =>
              html`<span
                class=${view.available && i <= view.force ? 'on' : ''}
                style="background:${color}"
              ></span>`,
          )}
          ${
            view.available
              ? html`<div class="mark" style="left:${((view.force + 0.5) / (MAX_FORCE + 1)) * 100}%"></div>`
              : nothing
          }
        </div>
        <div class="ticks"><span>0</span><span>3</span><span>6</span><span>9</span><span>12</span></div>
      </div>
    `;
  }

  // --- History ---

  private _renderHistory(): TemplateResult {
    const s = this._settings!;
    const period = this._period ?? s.historyHours;
    const stop = (ev: Event) => ev.stopPropagation();
    return html`
      <div class="hist" @pointerdown=${stop} @click=${stop} @keydown=${stop}>
        <div class="hh">
          <div>
            <div class="t">${this._t('card.history')}</div>
            <div class="legend">
              <span><i></i>${this._t('card.speed')}</span>
              ${s.showGust ? html`<span><i class="gust"></i>${this._t('card.gust')}</span>` : nothing}
            </div>
          </div>
          <div class="seg" role="group">
            <div class="thumb" style=${this._thumbStyle(period)}></div>
            ${HISTORY_WINDOWS.map(
              (hours) =>
                html`<button class=${hours === period ? 'on' : ''} @click=${() => this._setPeriod(hours)}>
                  ${this._t('card.hours', { hours: String(hours) })}
                </button>`,
            )}
          </div>
        </div>
        ${this._renderChart()}
      </div>
    `;
  }

  /** Position of the sliding thumb behind the selected window: the three buttons are laid out the same way. */
  private _thumbStyle(period: HistoryHours): string {
    const index = HISTORY_WINDOWS.indexOf(period);
    return `width: calc((100% - 4px) / ${HISTORY_WINDOWS.length}); transform: translateX(calc(${index} * 100% + 2px))`;
  }

  private _setPeriod(hours: HistoryHours): void {
    this._period = hours;
    this._scrub = null;
  }

  private _chartModel(): ChartModel | undefined {
    const s = this._settings!;
    if (this._chartWidth < 40) return undefined;
    const language = this._language;
    const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
    return buildChart({
      points: this._series(),
      width: this._chartWidth,
      showGust: s.showGust,
      showArrows: s.showHistoryArrows,
      colors: s.colors,
      arrow: s.arrow,
      accent: 'var(--lwc-accent)',
      formatSpeed: (kmh) => formatSpeed(kmh, s.unit, language),
      formatTime: (t) => time.format(t),
      nowLabel: this._t('card.now_short'),
    });
  }

  private _renderChart(): TemplateResult {
    const m = this._chartModel();
    const id = this._uid;
    return html`
      <div
        class="chart"
        @pointermove=${this._scrubTo}
        @pointerdown=${this._scrubTo}
        @pointerleave=${this._scrubEnd}
        @pointerup=${this._scrubUp}
      >
        ${
          m
            ? html`<svg viewBox="0 0 ${m.width} ${m.height}" height=${m.height} aria-hidden="true">
                  <defs>
                    <linearGradient
                      id="${id}-g"
                      gradientUnits="userSpaceOnUse"
                      x1="0"
                      y1=${m.baseline}
                      x2="0"
                      y2=${m.top}
                    >
                      ${m.stops.map((st) => svg`<stop offset=${st.offset} style="stop-color:${st.color}" />`)}
                    </linearGradient>
                    <linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#fff" stop-opacity=".9" />
                      <stop offset="1" stop-color="#fff" stop-opacity="0" />
                    </linearGradient>
                    <mask id="${id}-m">
                      <rect x="0" y="0" width=${m.plotWidth} height=${PLOT_HEIGHT} fill="url(#${id}-f)" />
                    </mask>
                  </defs>
                  ${m.grid.map(
                    (g) =>
                      svg`<line class="grid" x1="0" x2=${m.plotWidth} y1=${g.y} y2=${g.y} /><text class="ax" x=${m.plotWidth + 6} y=${g.y + 3.5}>${g.label}</text>`,
                  )}
                  ${m.gustPaths.map((d) => svg`<path class="gustline" d=${d} />`)}
                  ${m.areaPaths.map((d) => svg`<path class="area" d=${d} fill="url(#${id}-g)" mask="url(#${id}-m)" />`)}
                  ${m.speedPaths.map((d) => svg`<path class="spdline" d=${d} stroke="url(#${id}-g)" />`)}
                  ${m.arrows.map((a) => this._arrow(a))}
                  ${m.labels.map(
                    (l) => svg`<text class="ax" x=${l.x} y=${l.y} text-anchor=${l.anchor}>${l.text}</text>`,
                  )}
                  ${this._renderCursor(m)}</svg
                >${this._renderTip(m)}`
            : nothing
        }
      </div>
    `;
  }

  private _arrow(a: ChartModel['arrows'][number]): SVGTemplateResult {
    return svg`<g transform="translate(${a.x.toFixed(1)} ${a.y}) rotate(${a.angle.toFixed(0)}) scale(1.05)" opacity=${this._reading.speed === null ? 0.3 : 0.95}>
      <path d="M0 -6.2 L5 4 L0 1.6 L-5 4 Z" style="fill:${a.color}" transform="rotate(180)" />
    </g>`;
  }

  private _renderCursor(m: ChartModel): SVGTemplateResult | typeof nothing {
    const point = this._scrubPoint();
    if (!point || point.s === null) return nothing;
    const x = m.x(point.index);
    return svg`<line class="cursor" x1=${x} x2=${x} y1=${m.top} y2=${m.baseline} />
      <circle class="cdot" r="5" cx=${x} cy=${m.y(point.s)} style="fill:${windColor(point.s, this._settings!.colors, 'var(--lwc-accent)')}" />`;
  }

  private _scrubPoint(): (WindPoint & { index: number }) | undefined {
    const series = this._series();
    return this._scrub === null || !series[this._scrub]
      ? undefined
      : { ...series[this._scrub], index: this._scrub };
  }

  private _renderTip(m: ChartModel): TemplateResult | typeof nothing {
    const point = this._scrubPoint();
    const s = this._settings!;
    if (!point) return nothing;
    const series = this._series();
    const last = point.index === series.length - 1;
    const time = new Intl.DateTimeFormat(this._language, { hour: '2-digit', minute: '2-digit' }).format(
      point.t,
    );
    const value = (kmh: number | null) => (kmh === null ? '–' : formatSpeed(kmh, s.unit, this._language));
    const left = Math.min(Math.max(m.x(point.index), 62), m.plotWidth - 20);
    return html`<div class="tip" style="left:${left}px">
      <span class="m">${last ? this._t('card.now') : time}</span><br />
      <b>${value(point.s)} ${unitLabel(s.unit)}</b>
      ${
        s.showGust && point.g !== null
          ? html`<span class="m">· ${this._t('card.gusts_up_to', { value: value(point.g) })}</span>`
          : nothing
      }
      ${
        point.d === null
          ? nothing
          : html`<br /><span class="m"
                >${pointLetters(pointIndex(point.d), s.letters)} · ${Math.round(point.d)}°</span
              >`
      }
    </div>`;
  }

  private _scrubTo = (ev: PointerEvent): void => {
    const target = ev.currentTarget as HTMLElement;
    const m = this._chartModel();
    if (!m) return;
    const x = ev.clientX - target.getBoundingClientRect().left;
    this._scrub = m.indexAt(Math.min(Math.max(x, 0), m.plotWidth));
  };

  private _scrubEnd = (): void => {
    this._scrub = null;
  };

  /** A finger leaves the chart when it is lifted; a mouse stays on it. */
  private _scrubUp = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') this._scrub = null;
  };

  // --- Compact layout ---

  private _renderCompact(view: WindView): TemplateResult {
    const s = this._settings!;
    const hidden = view.bearing === null;
    const point = view.bearing === null ? '' : pointName(this._t, view.bearing);
    const spark = sparkPaths(
      windowOf(this._history ? withLive(this._history, this._reading) : [], 3),
      76,
      48,
    );
    const id = `${this._uid}-s`;
    return html`
      <div class="mini">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="dial-disc" cx="50" cy="50" r="48" />
          <circle class="arc-track" cx="50" cy="50" r="36" stroke-width="5" />
          <circle
            class="arc-speed"
            cx="50"
            cy="50"
            r="36"
            stroke-width="5"
            pathLength="100"
            transform="rotate(-90 50 50)"
            style="stroke:${view.color};stroke-dasharray:${view.arcSpeed} 100"
          />
          <g class="ptr" style="transform: rotate(${this._rot}deg); opacity: ${hidden ? 0 : 1}">
            <g transform="translate(50 7)">
              <circle class="ptr-badge" r="6" />
              <path
                class="ptr-arrow"
                d=${ARROW_PATH}
                transform="scale(0.55) ${s.arrow === 'to' ? '' : 'rotate(180)'}"
              />
            </g>
          </g>
          <g class="carrow" style="transform: rotate(${this._arrowRot}deg)">
            <path d=${BIG_ARROW_PATH} />
          </g>
        </svg>
      </div>
      <div class="cmain">
        <div class="ct">${[this._title(), point].filter(Boolean).join(' · ')}</div>
        <div class="cs">${view.speed}${view.available ? html`<small>${view.unit}</small>` : nothing}</div>
        <div class="cb">
          ${view.caption}${
            view.available && s.showGust && this._reading.gust !== null
              ? html` <span>· ${this._t('card.gust_short')} ${view.gust}</span>`
              : nothing
          }
        </div>
      </div>
      ${
        spark.length
          ? html`<svg class="spark" viewBox="0 0 76 48" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style="stop-color:${view.color}" stop-opacity=".3" />
                  <stop offset="1" style="stop-color:${view.color}" stop-opacity="0" />
                </linearGradient>
              </defs>
              ${spark.map(
                (p) =>
                  svg`<path d=${p.area} fill="url(#${id})" /><path d=${p.line} fill="none" style="stroke:${view.color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />`,
              )}
            </svg>`
          : nothing
      }
    `;
  }
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, LiveWindCard);
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: localize(navigator.language, 'card.name'),
    description: localize(navigator.language, 'card.description'),
    preview: true,
  });
}

console.info(
  `%c LIVE-WIND-CARD %c ${VERSION} `,
  'color:#fff;background:#0a84ff;font-weight:600;border-radius:4px 0 0 4px;padding:2px 4px',
  'color:#0a84ff;background:transparent;font-weight:600;padding:2px 4px',
);
