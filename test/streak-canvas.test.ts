import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreakCanvas } from '../src/streak-canvas';

interface FakeCtx {
  lineCap: string;
  lineWidth: number;
  strokeStyle: string;
  globalAlpha: number;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
}

function fakeCtx(): FakeCtx {
  return {
    lineCap: '',
    lineWidth: 0,
    strokeStyle: '',
    globalAlpha: 1,
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
}

function fakeCanvas(ctx: FakeCtx | null, clientWidth = 200, clientHeight = 200) {
  return {
    width: 0,
    height: 0,
    clientWidth,
    clientHeight,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

describe('StreakCanvas', () => {
  let reduced = false;
  let now = 1000;
  let nextId = 1;
  let frames: Map<number, FrameRequestCallback>;
  let resizeCb: (() => void) | undefined;
  let disconnectSpy: ReturnType<typeof vi.fn<() => void>>;

  const flushFrame = (advanceMs: number) => {
    now += advanceMs;
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, cb] of pending) cb(now);
  };

  beforeEach(() => {
    reduced = false;
    now = 1000;
    nextId = 1;
    frames = new Map();
    resizeCb = undefined;
    disconnectSpy = vi.fn();

    vi.stubGlobal('window', { devicePixelRatio: 3 });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resizeCb = cb;
        }
        observe() {}
        disconnect() {
          disconnectSpy();
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sizes the canvas with DPR capped at 2 and redraws on resize', () => {
    const ctx = fakeCtx();
    const canvas = fakeCanvas(ctx, 180, 180);
    const sc = new StreakCanvas(canvas);
    expect(canvas.width).toBe(360);
    expect(canvas.height).toBe(360);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);

    Object.assign(canvas, { clientWidth: 0, clientHeight: 0 });
    resizeCb?.();
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
    sc.destroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('draws streaks on animation frames and stops when disabled', () => {
    const ctx = fakeCtx();
    const canvas = fakeCanvas(ctx, 200, 200);
    const sc = new StreakCanvas(canvas);

    sc.update({ from: 270, speed: 35, color: '#ff9500', enabled: true });
    expect(frames.size).toBe(1);

    flushFrame(16);
    expect(ctx.strokeStyle).toBe('#ff9500');
    expect(ctx.lineCap).toBe('round');
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
    expect(frames.size).toBe(1);

    ctx.stroke.mockClear();
    sc.update({ from: 270, speed: 35, color: '#ff9500', enabled: false });
    flushFrame(16);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    sc.destroy();
  });

  it('pauses off-screen and resumes when visible again', () => {
    const ctx = fakeCtx();
    const sc = new StreakCanvas(fakeCanvas(ctx));
    sc.setVisible(false);
    sc.update({ from: 90, speed: 40, color: '#34c759', enabled: true });
    expect(frames.size).toBe(0);

    sc.setVisible(true);
    expect(frames.size).toBe(1);
    sc.setVisible(false);
    flushFrame(16);
    expect(frames.size).toBe(0);
    sc.destroy();
  });

  it('throttles frames when maxFps is set', () => {
    const ctx = fakeCtx();
    const sc = new StreakCanvas(fakeCanvas(ctx));
    sc.setMaxFps(20);
    sc.update({ from: 180, speed: 30, color: '#007aff', enabled: true });

    ctx.stroke.mockClear();
    flushFrame(10); // 10 ms < 50 ms budget: skipped, rescheduled
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);

    flushFrame(50); // 60 ms elapsed >= 50 ms budget: drawn
    expect(ctx.stroke).toHaveBeenCalled();
    sc.destroy();
  });

  it('draws a single static frame and does not loop under prefers-reduced-motion', () => {
    reduced = true;
    const ctx = fakeCtx();
    const sc = new StreakCanvas(fakeCanvas(ctx));
    sc.update({ from: 0, speed: 45, color: '#ff3b30', enabled: true });
    flushFrame(16);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    sc.destroy();
  });

  it('tolerates a missing 2D context without throwing', () => {
    const sc = new StreakCanvas(fakeCanvas(null));
    sc.update({ from: 0, speed: 20, color: '#34c759', enabled: true });
    expect(() => flushFrame(16)).not.toThrow();
    sc.destroy();
  });
});
