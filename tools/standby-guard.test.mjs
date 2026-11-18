import test from 'node:test';
import assert from 'node:assert/strict';
import '../standby-guard.js';

const { createWakeClickGuard } = globalThis.FamilyStandbyGuard;

function fakeClock() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
    fire(id) {
      const timer = timers.get(id);
      if (!timer) return;
      timers.delete(id);
      timer.callback();
    },
  };
}

test('wake gesture click is prevented once and the next intentional click passes', () => {
  const clock = fakeClock();
  const guard = createWakeClickGuard(clock);
  let dashboardClicks = 0;
  const makeEvent = () => ({
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  });

  guard.arm();
  const wakeClick = makeEvent();
  if (!guard.handleClick(wakeClick)) dashboardClicks += 1;
  assert.equal(wakeClick.prevented, true);
  assert.equal(wakeClick.stopped, true);
  assert.equal(dashboardClicks, 0);
  assert.equal(clock.timers.size, 0);

  const nextClick = makeEvent();
  if (!guard.handleClick(nextClick)) dashboardClicks += 1;
  assert.equal(nextClick.prevented, false);
  assert.equal(dashboardClicks, 1);
});

test('an unused wake-click guard expires instead of swallowing a later click', () => {
  const clock = fakeClock();
  const guard = createWakeClickGuard(clock);
  let dashboardClicks = 0;
  const event = { preventDefault() {}, stopImmediatePropagation() {} };

  guard.arm();
  const [timerId, timer] = [...clock.timers.entries()][0];
  assert.equal(timer.delay, 1500);
  clock.fire(timerId);
  if (!guard.handleClick(event)) dashboardClicks += 1;
  assert.equal(dashboardClicks, 1);
});

test('app arms click suppression on standby pointer/touch wake and installs a capture listener', async () => {
  const fs = await import('node:fs/promises');
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /event\.type === 'pointerdown' \|\| event\.type === 'touchstart'\) standbyWakeClickGuard\.arm\(\)/);
  assert.match(app, /document\.addEventListener\('click',[^\n]*standbyWakeClickGuard\.handleClick\(event\)[^\n]*, true\)/);
  assert.match(html, /standby-guard\.js/);
});
