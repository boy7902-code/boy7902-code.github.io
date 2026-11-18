import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../alarm-core.js';

const {
  isHhmm, toMin, daysOf, onDay, dowOf, normalizeAlarms,
  missionItems, eventItems, customItems, collectItems,
  targetsAt, fireKeyOf, upcoming, alarmMessage,
} = globalThis.FamilyAlarmCore;

/* 2026-11-19 는 목요일(4) */
const DATE = '2026-11-19';
const DOW = 4;

const missions = [
  { id: 'm-morning', title: '밥 다 먹기', member: 'm3', due: '07:15', days: [1, 2, 3, 4, 5], doneOn: null },
  { id: 'm-done', title: '인사 잘하기', member: 'm3', due: '08:00', days: [], doneOn: DATE },
  { id: 'm-weekend', title: '주말 청소', member: 'm3', due: '10:00', days: [0, 6], doneOn: null },
  { id: 'm-adult', title: '설거지', member: 'm2', due: '21:00', days: [], doneOn: null },
  { id: 'm-nodue', title: '신발장 정리', member: 'm3', due: '', days: [], doneOn: null },
];
const events = [
  { id: 'e-school', date: DATE, time: '08:30', title: '등교', member: 'm3', done: false },
  { id: 'e-allday', date: DATE, time: '', title: '현충일', member: '', done: false },
  { id: 'e-done', date: DATE, time: '19:00', title: '가족 회의', member: 'm1', done: true },
  { id: 'e-other', date: '2026-11-20', time: '09:00', title: '내일 일정', member: '', done: false },
  { id: 'gcal:primary:1', date: DATE, time: '16:30', title: '영어 학원', member: '', done: false, source: 'gcal' },
];
const alarms = [
  { id: 'a1', time: '08:25', title: '등교 출발', days: [1, 2, 3, 4, 5], on: true },
  { id: 'a2', time: '09:00', title: '주말 나들이', days: [0, 6], on: true },
  { id: 'a3', time: '07:00', title: '꺼 둔 알람', days: [], on: false },
];

test('시각은 00:00~23:59 만 받아들인다', () => {
  assert.equal(isHhmm('07:15'), true);
  assert.equal(isHhmm('23:59'), true);
  assert.equal(isHhmm('24:00'), false);
  assert.equal(isHhmm('7:15'), false);
  assert.equal(isHhmm(''), false);
  assert.equal(toMin('07:15'), 435);
  assert.equal(toMin('24:00'), null);
  assert.equal(dowOf(DATE), DOW);
});

test('요일 규칙: 빈 목록은 매일, 7일을 다 고르면 매일로 되돌린다', () => {
  assert.deepEqual(daysOf([]), []);
  assert.equal(onDay([], DOW), true);
  assert.equal(onDay([1, 2, 3, 4, 5], DOW), true);
  assert.equal(onDay([0, 6], DOW), false);
  assert.deepEqual(daysOf([0, 1, 2, 3, 4, 5, 6]), []);
  assert.deepEqual(daysOf([4, 1, 4, 9, '2']), [1, 2, 4]);
});

test('미션 알람: 오늘·안 끝낸·요일 맞는 미션만, 성인 미션은 보기 설정일 때만', () => {
  const kid = missionItems(missions, { date: DATE, dow: DOW });
  const ids = kid.map((i) => i.key);
  assert.deepEqual(ids, ['mission:m-morning']);          // 끝낸 미션·주말 미션·마감 없는 미션 제외
  const withAdults = missionItems(missions, { date: DATE, dow: DOW, includeAdults: true });
  assert.deepEqual(withAdults.map((i) => i.key), ['mission:m-morning', 'mission:m-adult']);
  // 공용 미션(member '')은 아이 화면에 보이는 미션이므로 포함
  const shared = missionItems([{ id: 's1', title: '분리수거', member: '', due: '21:00', days: [] }], { date: DATE, dow: DOW });
  assert.equal(shared.length, 1);
  // 어제 끝낸 미션은 오늘 다시 울립니다
  const yesterday = missionItems([{ id: 'y', title: '양치', member: 'm3', due: '22:00', days: [], doneOn: '2026-11-18' }], { date: DATE, dow: DOW });
  assert.equal(yesterday.length, 1);
});

test('일정 알람: 오늘·시각 있는·안 끝낸 일정만 (종일·다른 날 제외, 중복 id 한 번만)', () => {
  const items = eventItems(events, { date: DATE });
  assert.deepEqual(items.map((i) => i.key), ['event:e-school', 'event:gcal:primary:1']);
  const dup = eventItems([{ id: 'x', date: DATE, time: '10:00', title: '중복' }, { id: 'x', date: DATE, time: '10:00', title: '중복' }], { date: DATE });
  assert.equal(dup.length, 1);
});

test('맞춤 알람: 켜 둔 것만, 요일이 맞을 때만', () => {
  assert.deepEqual(customItems(alarms, { dow: DOW }).map((i) => i.key), ['custom:a1']);
  assert.deepEqual(customItems(alarms, { dow: 6 }).map((i) => i.key), ['custom:a2']);
  // 형식이 깨진 알람은 조용히 버립니다
  const bad = normalizeAlarms([{ time: '25:00', title: 'x' }, { time: '08:00', title: '' }, null, { time: '08:00', title: '  아침   준비  ' }]);
  assert.deepEqual(bad.map((a) => a.title), ['아침 준비']);
});

test('collectItems: 종류를 합쳐 시각 순으로', () => {
  const all = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  assert.deepEqual(all.map((i) => i.key), ['mission:m-morning', 'custom:a1', 'event:e-school', 'event:gcal:primary:1']);
});

test('울릴 시점: 미션은 마감 5분 전과 정각, 일정은 10분 전과 정각', () => {
  const items = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  const at = (nowMin) => targetsAt(items, nowMin).map((h) => `${h.key}:${h.slot}`);

  assert.deepEqual(at(toMin('07:10')), ['mission:m-morning:pre']);
  assert.deepEqual(at(toMin('07:15')), ['mission:m-morning:now']);
  assert.deepEqual(at(toMin('07:14')), []);             // 1분 이르면 울리지 않습니다
  assert.deepEqual(at(toMin('08:20')), ['event:e-school:pre']);   // 08:30 일정의 10분 전
  assert.deepEqual(at(toMin('08:25')), ['custom:a1:now']);        // 맞춤 알람은 정각만
  assert.deepEqual(at(toMin('08:30')), ['event:e-school:now']);
  assert.deepEqual(at(toMin('16:30')), ['event:gcal:primary:1:now']);
});

test('늦게 깨어난 화면은 grace 안에서만 따라 울린다', () => {
  const items = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  assert.deepEqual(targetsAt(items, toMin('08:31'), { grace: 1 }).map((h) => h.slot), ['now']);
  assert.deepEqual(targetsAt(items, toMin('08:33'), { grace: 1 }), []);   // 2분 지난 알람은 울리지 않음
  assert.deepEqual(targetsAt(items, toMin('08:33'), { grace: 3 }).map((h) => h.slot), ['now']);
});

test('같은 날·같은 항목·같은 시점은 같은 열쇠 — 하루가 바뀌면 다시 울릴 수 있다', () => {
  const items = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  const [pre] = targetsAt(items, toMin('07:10'));
  const [preAgain] = targetsAt(items, toMin('07:10'));
  assert.equal(fireKeyOf(DATE, pre, pre.slot), fireKeyOf(DATE, preAgain, preAgain.slot));
  assert.notEqual(fireKeyOf(DATE, pre, 'pre'), fireKeyOf('2026-11-20', pre, 'pre'));
  assert.notEqual(fireKeyOf(DATE, pre, 'pre'), fireKeyOf(DATE, pre, 'now'));
});

test('알람 문구는 종류·시점에 맞게 나온다', () => {
  const items = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  const [missionPre] = targetsAt(items, toMin('07:10'));
  assert.deepEqual(alarmMessage(missionPre), { title: '밥 다 먹기 마감 5분 전이에요!', sub: '07:15까지예요 · 지금 시작하면 딱 맞아요' });
  const [missionNow] = targetsAt(items, toMin('07:15'));
  assert.equal(alarmMessage(missionNow).title, '밥 다 먹기 마감 시간이에요!');
  const [eventPre] = targetsAt(items, toMin('08:20'));
  assert.deepEqual(alarmMessage(eventPre), { title: '등교 10분 전이에요!', sub: '08:30 일정이 곧 시작해요' });
  const [custom] = targetsAt(items, toMin('08:25'));
  assert.deepEqual(alarmMessage(custom), { title: '등교 출발', sub: '08:25 알람이에요' });
});

test('upcoming: 지금 이후 울릴 알람만 시각 순으로', () => {
  const items = collectItems({ missions, events, alarms, date: DATE, dow: DOW });
  const rows = upcoming(items, toMin('07:00'), 3);
  assert.deepEqual(rows.map((r) => `${r.at}:${r.key}:${r.slot}`), [
    `${toMin('07:10')}:mission:m-morning:pre`,
    `${toMin('07:15')}:mission:m-morning:now`,
    `${toMin('08:20')}:event:e-school:pre`,
  ]);
  assert.deepEqual(upcoming(items, toMin('22:00')), []);
});

test('같은 시각의 미션 알람과 맞춤 알람은 한 번에 같이 울린다', () => {
  const items = collectItems({
    missions: [{ id: 'k', title: '밥 다 먹기', member: 'm3', due: '07:15', days: [], doneOn: null }],
    alarms: [{ id: 'c', time: '07:15', title: '밥 먹기 끝', days: [], on: true }],
    date: DATE, dow: DOW,
  });
  const hits = targetsAt(items, toMin('07:15'));
  assert.deepEqual(hits.map((h) => `${h.kind}:${h.slot}`), ['mission:now', 'custom:now']);
});

test('기본 맞춤 알람 2건(밥 먹기 끝 07:15 · 준비 끝 08:05, 월~금)이 처음부터 들어 있다', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /\{ id: 'def-morning-done', time: '07:15', title: '밥 먹기 끝', days: \[1, 2, 3, 4, 5\], on: true \}/);
  assert.match(app, /\{ id: 'def-ready-done', time: '08:05', title: '준비 끝', days: \[1, 2, 3, 4, 5\], on: true \}/);
  // 저장된 목록이 아예 없을 때만 기본값을 넣고, 빈 목록(보호자가 모두 지운 경우)은 그대로 존중합니다
  assert.match(app, /raw\.alarms === undefined \? defaultAlarms\(\)/);
  // 두 기본 알람은 코어를 그대로 통과합니다(형식이 깨지지 않음)
  const list = normalizeAlarms([
    { id: 'def-morning-done', time: '07:15', title: '밥 먹기 끝', days: [1, 2, 3, 4, 5], on: true },
    { id: 'def-ready-done', time: '08:05', title: '준비 끝', days: [1, 2, 3, 4, 5], on: true },
  ]);
  assert.deepEqual(list.map((a) => `${a.time} ${a.title} ${a.days.join('')}`), ['07:15 밥 먹기 끝 12345', '08:05 준비 끝 12345']);
});

test('자정을 넘어가는 미리 알람은 그날 울리지 않는다', () => {
  const items = collectItems({
    missions: [{ id: 'z', title: '새벽 준비', member: 'm3', due: '00:03', days: [], doneOn: null }],
    date: DATE, dow: DOW,
  });
  assert.deepEqual(targetsAt(items, 0).map((h) => h.slot), []);        // 00:00 에는 아직
  assert.deepEqual(targetsAt(items, 3).map((h) => h.slot), ['now']);   // 00:03 정각만
  assert.deepEqual(targetsAt(items, 1439).map((h) => h.slot), []);     // 23:59 에 5분 전은 없음
});
