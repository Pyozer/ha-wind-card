import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionHandlers, isInteractive, runAction } from '../src/actions';
import type { CardActions } from '../src/types';

// The handlers use `window` timers; Node has the same API on `globalThis`.
vi.stubGlobal('window', globalThis);

/** A host element that records the `hass-action` events it receives. */
function host() {
  const target = new EventTarget();
  const events: { action: string; config: CardActions }[] = [];
  target.addEventListener('hass-action', (ev) => events.push((ev as CustomEvent).detail));
  return { el: target as unknown as HTMLElement, events };
}

const pointer = (x = 0, y = 0, button = 0) => ({ button, clientX: x, clientY: y }) as PointerEvent;
const click = () => ({ stopPropagation: () => {} }) as MouseEvent;

const more: CardActions = { tap_action: { action: 'more-info' } };

describe('actions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the tap action right away when there is no double tap', () => {
    const h = host();
    const handlers = actionHandlers(h.el, () => more);
    handlers.pointerdown(pointer());
    handlers.click(click());
    expect(h.events).toEqual([{ action: 'tap', config: more }]);
  });

  it('runs the hold action on long press, and suppresses the following click', () => {
    const h = host();
    const actions: CardActions = { ...more, hold_action: { action: 'toggle' } };
    const handlers = actionHandlers(h.el, () => actions);
    handlers.pointerdown(pointer());
    vi.advanceTimersByTime(500);
    handlers.click(click());
    expect(h.events.map((e) => e.action)).toEqual(['hold']);
  });

  it('cancels the long press when the pointer moves, cancels, or leaves', () => {
    const actions: CardActions = { ...more, hold_action: { action: 'toggle' } };
    const moved = host();
    const movedHandlers = actionHandlers(moved.el, () => actions);
    movedHandlers.pointerdown(pointer(0, 0));
    movedHandlers.pointermove(pointer(20, 0));
    vi.advanceTimersByTime(600);
    expect(moved.events).toEqual([]);

    for (const cancelEvent of ['pointercancel', 'pointerleave'] as const) {
      const h = host();
      const handlers = actionHandlers(h.el, () => actions);
      handlers.pointerdown(pointer(0, 0));
      handlers[cancelEvent]();
      vi.advanceTimersByTime(600);
      expect(h.events, cancelEvent).toEqual([]);
    }
  });

  it('ignores secondary mouse buttons for the long press', () => {
    const h = host();
    const actions: CardActions = { ...more, hold_action: { action: 'toggle' } };
    actionHandlers(h.el, () => actions).pointerdown(pointer(0, 0, 2));
    vi.advanceTimersByTime(600);
    expect(h.events).toEqual([]);
  });

  it('waits before tapping when a double tap action is set, and runs double tap on two quick taps', () => {
    const single = host();
    const actions: CardActions = { ...more, double_tap_action: { action: 'toggle' } };
    const singleHandlers = actionHandlers(single.el, () => actions);
    singleHandlers.click(click());
    expect(single.events).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(single.events.map((e) => e.action)).toEqual(['tap']);

    const dbl = host();
    const dblHandlers = actionHandlers(dbl.el, () => actions);
    dblHandlers.click(click());
    vi.advanceTimersByTime(100);
    dblHandlers.click(click());
    vi.advanceTimersByTime(500);
    expect(dbl.events.map((e) => e.action)).toEqual(['double_tap']);
  });

  it('runs the tap action on Enter and Space only', () => {
    const h = host();
    const handlers = actionHandlers(h.el, () => more);
    for (const key of ['Enter', ' ', 'a']) {
      handlers.keydown({ key, preventDefault: () => {} } as KeyboardEvent);
    }
    expect(h.events.map((e) => e.action)).toEqual(['tap', 'tap']);
  });

  it('lets a card-internal handler intercept an action before Home Assistant', () => {
    const h = host();
    const local = vi.fn((name: string) => name === 'toggle-panel');
    runAction(h.el, { tap_action: { action: 'toggle-panel' } }, 'tap', local);
    expect(local).toHaveBeenCalledWith('toggle-panel');
    expect(h.events).toEqual([]);
    runAction(h.el, more, 'tap', local);
    expect(h.events).toHaveLength(1);
  });

  it('reports interactive only when at least one action is not "none"', () => {
    expect(isInteractive({ tap_action: { action: 'none' } })).toBe(false);
    expect(isInteractive({})).toBe(false);
    expect(isInteractive({ hold_action: { action: 'more-info' } })).toBe(true);
    expect(isInteractive({ double_tap_action: { action: 'toggle' } })).toBe(true);
  });
});
