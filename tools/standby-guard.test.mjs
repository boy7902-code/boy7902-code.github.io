import test from 'node:test';
import assert from 'node:assert/strict';
import '../standby-guard.js';

const { createWakeClickGuard, createMultiTapGate } = globalThis.FamilyStandbyGuard;

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

test('app arms click suppression only on the third standby tap and keeps 1·2 as pokemon reactions', async () => {
  const fs = await import('node:fs/promises');
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /const standbyTapGate = window\.FamilyStandbyGuard\.createMultiTapGate\(\{ taps: 3, windowMs: 1500 \}\)/);
  assert.match(app, /const r = standbyTapGate\.tap\(\)/);
  assert.match(app, /if \(r\.done\) \{[\s\S]{0,240}standbyWakeClickGuard\.arm\(\)[\s\S]{0,80}exitStandby\(\)/);
  assert.match(app, /showStandbyTapHint\(r\.count, r\.needed\)/);
  assert.match(app, /standbyTapReact\(r\.count, r\.needed\)/);
  assert.match(app, /t\.closest\('#standbyExit'\)/);
  assert.match(app, /document\.addEventListener\('click',[^\n]*standbyWakeClickGuard\.handleClick\(event\)[^\n]*, true\)/);
  assert.match(html, /standby-guard\.js/);
  assert.match(html, /id="sbTap"[^>]*>화면을 연속 3번 터치하면 대시보드로 돌아가요/);
  assert.match(html, /id="standbyExit"[^>]*>🏠 홈으로/);
});

test('the standby tap gate opens only after three taps inside the window', () => {
  const clock = fakeClock();
  const gate = createMultiTapGate({ taps: 3, windowMs: 1500, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

  assert.deepEqual(gate.tap(), { count: 1, needed: 3, done: false });
  assert.equal(gate.count, 1);
  assert.deepEqual(gate.tap(), { count: 2, needed: 3, done: false });
  assert.deepEqual(gate.tap(), { count: 3, needed: 3, done: true });
  // 세 번째에서 열리면 문은 새로 닫혀 다음 한 번은 다시 1/3 입니다
  assert.equal(gate.count, 0);
  assert.deepEqual(gate.tap(), { count: 1, needed: 3, done: false });
});

test('a tap pauses waiting for the next tap, and letting the window pass resets the count', () => {
  const clock = fakeClock();
  const gate = createMultiTapGate({ taps: 3, windowMs: 1500, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

  gate.tap();
  assert.equal(clock.timers.size, 1);
  const [, timer] = [...clock.timers.entries()][0];
  assert.equal(timer.delay, 1500);
  // 두 번째 탭은 기다림을 새로 시작합니다
  gate.tap();
  assert.equal(gate.count, 2);
  const ids = [...clock.timers.keys()];
  const lastTimer = clock.timers.get(ids[ids.length - 1]);
  assert.equal(lastTimer.delay, 1500);
  // 1.5초가 지나면 횟수가 초기화되고 대기화면은 그대로입니다
  clock.fire(ids[ids.length - 1]);
  assert.equal(gate.count, 0);
  assert.deepEqual(gate.tap(), { count: 1, needed: 3, done: false });
});

