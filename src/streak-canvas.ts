import {
  particleAlpha,
  particleCount,
  resizePool,
  stepParticle,
  streakLength,
  type Particle,
} from './streaks';
import { oppositeBearing } from './wind';

/** Draws the wind streaks on a canvas, on its own animation frames. The simulation is in `streaks.ts`. */

export interface StreakParams {
  /** Bearing the wind comes from. */
  from: number;
  /** km/h */
  speed: number;
  /** CSS color of the lines. */
  color: string;
  enabled: boolean;
}

/** Draws the streaks of a pool on a canvas, on its own animation frames. */
export class StreakCanvas {
  private ctx: CanvasRenderingContext2D | null;
  private pool: Particle[] = [];
  private params: StreakParams = { from: 0, speed: 0, color: '#34c759', enabled: true };
  private raf = 0;
  private last = 0;
  private visible = true;
  private reduced = false;
  private maxFps = 0;
  private resizeObserver?: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  /** Pauses the animation while the card is off-screen. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.kick();
  }

  /** Caps the frame rate (eco mode); 0 for no cap. */
  setMaxFps(fps: number): void {
    this.maxFps = fps;
  }

  update(params: StreakParams): void {
    this.params = params;
    this.pool = resizePool(this.pool, params.enabled ? particleCount(params.speed) : 0, Math.random);
    this.kick();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.draw();
  }

  private kick(): void {
    if (this.raf || !this.visible) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number): void {
    this.raf = 0;
    const elapsed = now - this.last;
    if (this.maxFps && elapsed < 1000 / this.maxFps) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
      return;
    }
    this.last = now;
    const dt = this.reduced ? 0 : Math.min(elapsed / 1000, 0.05);
    this.pool = this.pool.map((p) => stepParticle(p, dt, this.params.speed, Math.random));
    this.draw();
    if (this.visible && !this.reduced && this.pool.length) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
  }

  private draw(): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, canvas.height);
    if (!this.pool.length) return;
    // The streaks travel towards where the wind blows to.
    const to = (oppositeBearing(this.params.from) * Math.PI) / 180;
    const dx = Math.sin(to);
    const dy = -Math.cos(to);
    const radius = size / 2;
    const length = streakLength(this.params.speed) * radius;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.6, size * 0.012);
    ctx.strokeStyle = this.params.color;
    for (const p of this.pool) {
      const x = radius + radius * (p.u * dx + p.v * 0.92 * -dy);
      const y = radius + radius * (p.u * dy + p.v * 0.92 * dx);
      const len = length * p.l;
      ctx.globalAlpha = particleAlpha(p);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * len, y - dy * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
