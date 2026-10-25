import { css } from 'lit';

/**
 * Visual language inspired by iOS apps, like Live Energy Card: borderless filled surfaces, a clear
 * typographic hierarchy, color reserved for the wind (the Beaufort force). Everything goes through
 * `--lwc-*` variables, which follow the Home Assistant theme and can be overridden by `card_mod`.
 */
export const cardStyles = css`
  :host {
    --lwc-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --lwc-text: var(--primary-text-color, #1c1c1e);
    --lwc-muted: var(--secondary-text-color, #8e8e93);
    --lwc-accent: var(--primary-color, #007aff);
    --lwc-north: #ff3b30;
    --lwc-fill: color-mix(in srgb, var(--lwc-text) 4.5%, var(--lwc-surface));
    --lwc-fill-strong: color-mix(in srgb, var(--lwc-text) 8%, transparent);
    --lwc-track: color-mix(in srgb, var(--lwc-text) 9%, transparent);
    --lwc-tick: color-mix(in srgb, var(--lwc-text) 22%, transparent);
    --lwc-ease: cubic-bezier(0.32, 0.72, 0, 1);
    /* Color of the current wind force, set by the card. */
    --lwc-c: #34c759;
    display: block;
    container-type: inline-size;
    container-name: lwc;
  }

  :host([dark]) {
    --lwc-north: #ff453a;
    --lwc-fill: color-mix(in srgb, var(--lwc-text) 7%, var(--lwc-surface));
    --lwc-fill-strong: color-mix(in srgb, var(--lwc-text) 12%, transparent);
    --lwc-track: color-mix(in srgb, var(--lwc-text) 12%, transparent);
    --lwc-tick: color-mix(in srgb, var(--lwc-text) 28%, transparent);
  }

  ha-card {
    height: 100%;
    overflow: hidden;
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    color: var(--lwc-text);
    -webkit-tap-highlight-color: transparent;
  }

  ha-card.interactive {
    cursor: pointer;
  }

  ha-card:focus-visible {
    outline: 2px solid var(--lwc-accent);
    outline-offset: -2px;
  }

  /* ---------- Header ---------- */

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .sub {
    font-size: 12px;
    color: var(--lwc-muted);
    margin-top: 2px;
  }

  .force {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px 5px 8px;
    border-radius: 999px;
    white-space: nowrap;
    color: var(--lwc-c);
    background: color-mix(in srgb, var(--lwc-c) 14%, transparent);
    transition:
      color 0.5s var(--lwc-ease),
      background-color 0.5s var(--lwc-ease);
  }

  .force i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    display: block;
  }

  /* ---------- Dial ---------- */

  .body {
    display: grid;
    gap: 18px;
    grid-template-columns: 1fr;
    justify-items: center;
  }

  @container lwc (min-width: 560px) {
    .body {
      grid-template-columns: 250px minmax(0, 1fr);
      justify-items: stretch;
      align-items: center;
      gap: 24px;
    }
  }

  .dial {
    position: relative;
    width: min(100%, 270px);
    aspect-ratio: 1;
    container-type: inline-size;
    container-name: dial;
  }

  .dial svg.ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .dial canvas {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 55%;
    height: 55%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    pointer-events: none;
    -webkit-mask-image: radial-gradient(circle, transparent 0 26%, #000 58%, #000 86%, transparent 100%);
    mask-image: radial-gradient(circle, transparent 0 26%, #000 58%, #000 86%, transparent 100%);
  }

  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    pointer-events: none;
  }

  .speed {
    font-size: 21cqw;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 0.95;
    font-variant-numeric: tabular-nums;
  }

  .unit {
    font-size: 6.4cqw;
    font-weight: 600;
    color: var(--lwc-muted);
    margin-top: 1.2cqw;
  }

  .bname {
    font-size: 5cqw;
    color: var(--lwc-c);
    font-weight: 600;
    margin-top: 2.4cqw;
    transition: color 0.5s var(--lwc-ease);
  }

  .is-unavailable .speed {
    color: var(--lwc-muted);
  }

  .is-unavailable .bname {
    color: var(--lwc-muted);
  }

  .dial-disc {
    fill: var(--lwc-fill);
  }

  .dial-tick {
    stroke: var(--lwc-tick);
    stroke-width: 1.2;
    stroke-linecap: round;
  }

  .dial-tick.major {
    stroke-width: 1.8;
  }

  .dial-letter {
    fill: var(--lwc-muted);
    font-size: 11.5px;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
    /* A halo in the color of the disc keeps the letters readable over the petals of the rose. */
    paint-order: stroke;
    stroke: var(--lwc-fill);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .petal {
    stroke-width: 2.5px;
    stroke-linejoin: round;
  }

  .dial-letter.north {
    fill: var(--lwc-north);
  }

  .dial-dot {
    fill: var(--lwc-tick);
  }

  .arc-track {
    stroke: var(--lwc-track);
    fill: none;
  }

  .arc-speed,
  .arc-gust {
    fill: none;
    stroke-linecap: round;
    transition:
      stroke-dasharray 0.9s var(--lwc-ease),
      stroke 0.5s var(--lwc-ease);
  }

  .arc-gust {
    opacity: 0.38;
  }

  .ptr {
    transform-origin: 120px 120px;
    transition:
      transform 1.1s var(--lwc-ease),
      opacity 0.4s;
  }

  .ptr-badge {
    fill: var(--lwc-c);
    transition: fill 0.5s var(--lwc-ease);
    filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--lwc-c) 45%, transparent));
  }

  .ptr-arrow {
    fill: #fff;
  }

  .is-unavailable .ptr,
  .is-unavailable .carrow {
    opacity: 0;
  }

  /* ---------- Tiles and Beaufort scale ---------- */

  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    /* The body centers its items on a narrow card: without this, the column shrinks to its content
       (the scale alone is only as wide as its labels) instead of taking the width of the card. */
    width: 100%;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(var(--tiles, 3), minmax(0, 1fr));
    gap: 8px;
  }

  .stat {
    background: var(--lwc-fill);
    border-radius: 14px;
    padding: 10px 12px 11px;
    min-width: 0;
  }

  .stat .label {
    font-size: 11.5px;
    color: var(--lwc-muted);
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .stat .label svg {
    width: 13px;
    height: 13px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stat .value {
    font-size: 21px;
    font-weight: 650;
    letter-spacing: -0.02em;
    margin-top: 5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat .value small {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--lwc-muted);
    margin-left: 2px;
    letter-spacing: 0;
  }

  .stat .note {
    font-size: 11.5px;
    color: var(--lwc-muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scale {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .scale .top {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--lwc-muted);
  }

  .scale .top b {
    color: var(--lwc-text);
    font-weight: 600;
  }

  .bar {
    position: relative;
    display: grid;
    grid-template-columns: repeat(13, 1fr);
    gap: 3px;
    height: 8px;
  }

  .bar span {
    border-radius: 4px;
    opacity: 0.28;
    transition: opacity 0.4s;
  }

  .bar span.on {
    opacity: 1;
  }

  .bar .mark {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    box-sizing: border-box;
    border-radius: 50%;
    background: var(--lwc-surface);
    border: 3px solid var(--lwc-c);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    transition:
      left 0.9s var(--lwc-ease),
      border-color 0.5s var(--lwc-ease);
  }

  .scale .ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    color: var(--lwc-muted);
    font-variant-numeric: tabular-nums;
  }

  .is-unavailable .stats,
  .is-unavailable .scale,
  .is-unavailable .hist {
    opacity: 0.35;
    filter: grayscale(1);
  }

  .is-unavailable .force {
    color: var(--lwc-muted);
    background: var(--lwc-fill-strong);
  }

  /* ---------- History ---------- */

  .hist {
    display: flex;
    flex-direction: column;
    gap: 10px;
    cursor: default;
  }

  .hist .hh {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
  }

  .hist .hh .t {
    font-size: 13px;
    font-weight: 600;
  }

  .legend {
    font-size: 11.5px;
    color: var(--lwc-muted);
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }

  .legend i {
    display: inline-block;
    width: 12px;
    height: 0;
    border-top: 2px solid var(--lwc-c);
    vertical-align: middle;
    margin-right: 4px;
  }

  .legend i.gust {
    border-top: 2px dashed var(--lwc-muted);
  }

  .seg {
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    background: var(--lwc-fill-strong);
    border-radius: 9px;
    padding: 2px;
    position: relative;
    flex: none;
  }

  .seg button {
    position: relative;
    z-index: 1;
    border: 0;
    background: none;
    color: var(--lwc-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 11px;
    border-radius: 7px;
    cursor: pointer;
    transition: color 0.25s;
  }

  .seg.many button {
    padding: 4px 8px;
  }

  .seg button.on {
    color: var(--lwc-text);
  }

  .seg button:focus-visible {
    outline: 2px solid var(--lwc-accent);
  }

  .seg .thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    border-radius: 7px;
    background: var(--lwc-surface);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.18),
      0 0 0 0.5px rgba(0, 0, 0, 0.04);
    transition:
      transform 0.35s var(--lwc-ease),
      width 0.35s var(--lwc-ease);
  }

  :host([dark]) .seg .thumb {
    background: color-mix(in srgb, var(--lwc-text) 20%, var(--lwc-surface));
  }

  .chart {
    position: relative;
    width: 100%;
    touch-action: pan-y;
  }

  .chart svg {
    display: block;
    width: 100%;
    overflow: visible;
  }

  .chart .grid {
    stroke: var(--lwc-track);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }

  .chart .ax {
    fill: var(--lwc-muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .chart .gustline {
    fill: none;
    stroke: var(--lwc-muted);
    stroke-width: 1.3;
    stroke-dasharray: 3 4;
    opacity: 0.8;
    stroke-linecap: round;
  }

  .chart .spdline {
    fill: none;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .chart .area {
    opacity: 0.45;
  }

  .chart .cursor {
    stroke: var(--lwc-muted);
    stroke-width: 1;
  }

  .chart .cdot {
    stroke: var(--lwc-surface);
    stroke-width: 2.5;
  }

  .tip {
    position: absolute;
    top: -6px;
    pointer-events: none;
    transform: translate(-50%, -100%);
    background: color-mix(in srgb, var(--lwc-surface) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 12px;
    padding: 8px 11px;
    font-size: 12px;
    line-height: 1.35;
    white-space: nowrap;
    box-shadow:
      0 4px 18px rgba(0, 0, 0, 0.16),
      0 0 0 0.5px rgba(0, 0, 0, 0.06);
    z-index: 3;
  }

  .tip b {
    font-weight: 650;
    font-size: 13px;
  }

  .tip .m {
    color: var(--lwc-muted);
  }

  /* ---------- Compact layout ---------- */

  ha-card.compact {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
  }

  .mini {
    width: 84px;
    height: 84px;
    flex: none;
  }

  .mini svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .mini .ptr,
  .mini .carrow {
    transform-origin: 50px 50px;
  }

  .carrow {
    transition:
      transform 1.1s var(--lwc-ease),
      opacity 0.4s;
  }

  .carrow path {
    fill: var(--lwc-c);
    transition: fill 0.5s var(--lwc-ease);
  }

  .cmain {
    flex: 1;
    min-width: 0;
  }

  .ct {
    font-size: 12px;
    color: var(--lwc-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cs {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.05;
    margin-top: 1px;
    font-variant-numeric: tabular-nums;
  }

  .is-unavailable .cs {
    color: var(--lwc-muted);
  }

  .cs small {
    font-size: 14px;
    font-weight: 600;
    color: var(--lwc-muted);
    letter-spacing: 0;
    margin-left: 3px;
  }

  .cb {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--lwc-c);
    margin-top: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 0.5s var(--lwc-ease);
  }

  .is-unavailable .cb {
    color: var(--lwc-muted);
  }

  .cb span {
    color: var(--lwc-muted);
    font-weight: 400;
  }

  .spark {
    width: 76px;
    height: 48px;
    flex: none;
  }

  @container lwc (max-width: 330px) {
    .spark {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
    }
  }
`;
