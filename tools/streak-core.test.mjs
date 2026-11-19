import test from 'node:test';
import assert from 'node:assert/strict';
import '../streak-core.js';

const { streakDays } = globalThis.FamilyStreak;
const weekdays = [{ id: 'a', days: [1, 2, 3, 4, 5] }, { id: 'b', days: [1, 2, 3, 4, 5] }];
const log = (date, mid) => ({ date, mid });
const full = (date) => [log(date, 'a'), log(date, 'b')];

test('counts consecutive complete days, today included when complete', () => {
  // 2026-11-19 is Thursday
  const logs = [...full('2026-11-19'), ...full('2026-11-18'), ...full('2026-11-17')];
  assert.equal(streakDays({ missions: weekdays, logs, today: '2026-11-19' }), 3);
});
test('unfinished today does not break yesterday streak', () => {
  const logs = [...full('2026-11-18'), ...full('2026-11-17')];
  assert.equal(streakDays({ missions: weekdays, logs: [...logs, log('2026-11-19', 'a')], today: '2026-11-19' }), 2);
});
test('a skipped (incomplete) past day resets the streak', () => {
  const logs = [...full('2026-11-19'), log('2026-11-18', 'a'), ...full('2026-11-17')];
  assert.equal(streakDays({ missions: weekdays, logs, today: '2026-11-19' }), 1);
});
test('free Sunday and days without missions are skipped without breaking', () => {
  // Monday 11-16, Sunday 11-15, Saturday 11-14 (no weekday missions), Friday 11-13
  const logs = [...full('2026-11-16'), ...full('2026-11-13')];
  assert.equal(streakDays({ missions: weekdays, logs, today: '2026-11-16' }), 2);
});
test('midnight boundary uses the supplied date string only', () => {
  const logs = full('2026-11-19');
  assert.equal(streakDays({ missions: weekdays, logs, today: '2026-11-20' }), 1, 'Friday not done yet, Thursday counts');
  assert.equal(streakDays({ missions: weekdays, logs, today: '2026-11-21' }), 0, 'Friday was missed, so Saturday shows no streak');
});
test('bonus logs never count and first day starts at 1', () => {
  assert.equal(streakDays({ missions: weekdays, logs: [{ date: '2026-11-19', mid: 'a', kind: 'bonus' }, { date: '2026-11-19', mid: 'b', kind: 'bonus' }], today: '2026-11-19' }), 0);
  assert.equal(streakDays({ missions: weekdays, logs: full('2026-11-19'), today: '2026-11-19' }), 1);
});
test('invalid input is safe', () => {
  assert.equal(streakDays({}), 0);
  assert.equal(streakDays({ missions: weekdays, logs: null, today: 'x' }), 0);
});
