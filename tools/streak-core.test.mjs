import test from 'node:test';
import assert from 'node:assert/strict';
import '../streak-core.js';
const { observe, status, normalize } = globalThis.FamilyStreak;
const logs = (date, ...mids) => mids.map((mid) => ({ date, mid, member: 'm3' }));
const add = (raw, date, mids = [], required = ['a', 'b'], skip = false) => observe(raw, { date, required, skip, logs: logs(date, ...mids) });

test('starts today, never reconstructs prior targets from mission configuration', () => {
  const journal = add({}, '2026-11-20', ['a', 'b']);
  assert.deepEqual(Object.keys(journal.days), ['2026-11-20']);
  assert.equal(status(journal, '2026-11-20').count, 1);
  assert.equal(status(journal, '2026-11-20').started, '2026-11-20');
});
test('same-day edits/additions/deletions cannot change captured target IDs', () => {
  const first = add({}, '2026-11-20', ['a', 'b']);
  const edited = add(first, '2026-11-20', ['a', 'b'], ['c']);
  assert.deepEqual(edited.days['2026-11-20'].required, ['a', 'b']);
  assert.equal(status(edited, '2026-11-20').count, 1);
});
test('incomplete today preserves yesterday until midnight, missed past day resets', () => {
  let j = add({}, '2026-11-18', ['a', 'b']);
  j = observe(j, { date: '2026-11-19', required: ['a', 'b'], logs: logs('2026-11-18', 'a', 'b') });
  assert.equal(status(j, '2026-11-19').count, 1);
  j = observe(j, { date: '2026-11-20', required: ['a', 'b'], logs: [...logs('2026-11-18', 'a', 'b'), ...logs('2026-11-20', 'a', 'b')] });
  assert.equal(status(j, '2026-11-20').count, 1);
});
test('explicit free/no-mission days are skipped, unobserved days never are', () => {
  let j = add({}, '2026-11-20', ['a', 'b']);
  j = observe(j, { date: '2026-11-21', required: [], skip: true, logs: logs('2026-11-20', 'a', 'b') });
  j = observe(j, { date: '2026-11-22', required: [], skip: true, logs: logs('2026-11-20', 'a', 'b') });
  j = observe(j, { date: '2026-11-23', required: ['a','b'], logs: [...logs('2026-11-20', 'a', 'b'), ...logs('2026-11-23', 'a', 'b')] });
  assert.equal(status(j, '2026-11-23').count, 2);
  delete j.days['2026-11-21'];
  assert.equal(status(j, '2026-11-23').count, 1);
  assert.equal(status(j, '2026-11-23').gap, true);
});
test('duplicates, bonuses and adult/shared records cannot fill kid targets', () => {
  const j = observe({}, { date: '2026-11-20', required: ['a', 'b'], logs: [
    ...logs('2026-11-20', 'a', 'a'),
    { date:'2026-11-20',mid:'b',member:'m1' },
    { date:'2026-11-20',mid:'b',member:'' },
    { date:'2026-11-20',mid:'b',member:'m3',kind:'bonus' },
  ] });
  assert.deepEqual(j.days['2026-11-20'].done,['a']);
  assert.equal(status(j,'2026-11-20').count,0);
});
test('cancelling a completion is reflected, settled and pending logs both count', () => {
  let j=add({},'2026-11-20',['a','b']);
  j=add(j,'2026-11-20',['a']);
  assert.equal(status(j,'2026-11-20').count,0);
  j=observe(j,{date:'2026-11-20',required:[],logs:logs('2026-11-20','a','b').map((l,i)=>({...l,settled:!!i}))});
  assert.equal(status(j,'2026-11-20').count,1);
});
test('month boundary retains prior recorded completion without loaded old logs', () => {
  let j=add({},'2026-11-30',['a','b']);
  j=add(j,'2026-12-01',['a','b']);
  assert.equal(status(j,'2026-12-01').count,2);
});
test('invalid input is safe, ledger bounded to 120 days without modifying source', () => {
  const raw={}; assert.deepEqual(observe(raw,{}),normalize({}));
  assert.deepEqual(raw,{});
  assert.equal(status(raw,'bad').count,0);
  let j={};
  for(let i=0;i<125;i++){
    const d=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
    j=observe(j,{date:d,required:['a'],logs:logs(d,'a'),monthStart:d});
  }
  assert.equal(Object.keys(j.days).length,120);
  assert.equal(j.started,'2026-01-01');
});

test('exactly 120 observed days has no plus, older truncated history has plus', () => {
  let j = {};
  for (let i = 0; i < 120; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    j = observe(j, { date, required: ['a'], logs: logs(date, 'a'), monthStart: date });
  }
  assert.equal(status(j, '2026-04-30').count, 120);
  assert.equal(status(j, '2026-04-30').capped, false);
  j = observe(j, { date: '2026-05-01', required: ['a'], logs: logs('2026-05-01', 'a'), monthStart: '2026-05-01' });
  assert.equal(status(j, '2026-05-01').count, 120);
  assert.equal(status(j, '2026-05-01').capped, true);
});

test('KST journal date is independent of input timezone and crosses midnight correctly', () => {
  const { kstDate } = globalThis.FamilyStreak;
  assert.equal(kstDate(new Date('2026-11-19T14:59:59Z')), '2026-11-19');
  assert.equal(kstDate(new Date('2026-11-19T15:00:00Z')), '2026-11-20');
  assert.equal(kstDate(new Date('2026-11-19T07:00:00-08:00')), '2026-11-20');
  assert.equal(kstDate(new Date('bad')), '');
});

test('deletion impact only applies to captured targets on an open non-skip day', () => {
  const { deletionImpact } = globalThis.FamilyStreak;
  let j = add({}, '2026-11-20', ['a']);
  assert.deepEqual(deletionImpact(j, '2026-11-20', 'a'), { done: true });
  assert.deepEqual(deletionImpact(j, '2026-11-20', 'b'), { done: false });
  assert.equal(deletionImpact(j, '2026-11-20', 'not-target'), null);
  assert.equal(deletionImpact(j, '2026-11-21', 'a'), null);
  j.days['2026-11-20'].skip = true;
  assert.equal(deletionImpact(j, '2026-11-20', 'a'), null);
  j.days['2026-11-20'].skip = false;
  j.days['2026-11-20'].finalized = true;
  assert.equal(deletionImpact(j, '2026-11-20', 'a'), null);
});
