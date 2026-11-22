import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStampBoard, computeScreenStats, createFamilySync, reconcileMissionCompletions, schoolDocOf, customAlarmDoc, gcalEventToApp, gcalEventsToApp, gcalCalendars, gcalWindow, gcalBoundaryIso, STAMP_START_AT } from '../firebase-sync.js';

function fakeSdk() {
  const listeners = [];
  const writes = [];
  let holdNextWrite = null;
  return {
    listeners,
    writes,
    holdNextWrite(promise) { holdNextWrite = promise; },
    sdk: {
      collection: (_db, path) => ({ path }),
      doc: (_db, path) => ({ path }),
      query: (ref, ...constraints) => ({ ref, constraints }),
      where: (field, value) => ({ field, value }),
      onSnapshot(ref, next, error) {
        const listener = { ref, next, error, active: true };
        listeners.push(listener);
        return () => { listener.active = false; };
      },
      serverTimestamp: () => 'server-time',
      setDoc: async (ref, data, options) => {
        writes.push({ path: ref.path, data, options });
        if (holdNextWrite) {
          const held = holdNextWrite;
          holdNextWrite = null;
          await held;
        }
      },
      updateDoc: async (ref, data) => writes.push({ path: ref.path, data, op: 'update' }),
      deleteDoc: async (ref) => writes.push({ path: ref.path, op: 'delete' }),
      signOut: async (auth) => { auth.currentUser = null; },
    },
  };
}

const userWithRole = (uid, role) => ({
  uid,
  getIdTokenResult: async () => ({ claims: { role } }),
});

test('today mission completion is restored from the matching member log', () => {
  const missions = [
    { id: 'adult-1', member: 'm1', doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
    { id: 'adult-2', member: 'm2', doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
    { id: 'kid-1', member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
    { id: 'shared-1', member: '', doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
    { id: 'missed', member: 'm1', doneOn: '2026-11-18', doneAt: '08:00', earned: 9, goalMet: true, earlyBonusEarned: 2 },
  ];
  const logs = [
    { mid: 'adult-1', date: '2026-11-18', member: 'm1', at: '07:30', earned: 8, goalMet: true, earlyBonus: 2 },
    { mid: 'adult-2', date: '2026-11-18', member: 'm2', at: '08:10', earned: 4, goalMet: false },
    { mid: 'kid-1', date: '2026-11-18', member: 'm3', at: '07:50', earned: 6, goalMet: true, earlyBonus: 1 },
    { mid: 'shared-1', date: '2026-11-18', member: '', at: '09:00', earned: 3, goalMet: false },
  ];

  reconcileMissionCompletions(missions, logs, '2026-11-18');

  assert.deepEqual(missions.slice(0, 4).map((mission) => [mission.doneOn, mission.doneAt, mission.earned, mission.goalMet, mission.earlyBonusEarned]), [
    ['2026-11-18', '07:30', 8, true, 2],
    ['2026-11-18', '08:10', 4, false, 0],
    ['2026-11-18', '07:50', 6, true, 1],
    ['2026-11-18', '09:00', 3, false, 0],
  ]);
  assert.deepEqual([missions[4].doneOn, missions[4].doneAt, missions[4].earned, missions[4].goalMet, missions[4].earlyBonusEarned], [null, '', 0, false, 0]);
});

test('Firebase log payload ignores legacy deadline bonus and records early bonus separately', () => {
  const { sdk } = fakeSdk();
  const sync = createFamilySync({ sdk, auth: { currentUser: null }, db: {} });
  const mission = { id: 'mission-early', title: '아침 준비', points: 5, due: '08:00', bonus: 3 };
  const atFiveEarly = sync.buildLogPayload(mission, { at: '07:55', date: '2026-11-18', by: 'child-user', member: 'm3' });
  assert.equal(atFiveEarly.base, 5);
  assert.equal(atFiveEarly.bonus, 0);
  assert.equal(atFiveEarly.earlyBonus, 1);
  assert.equal(atFiveEarly.earned, 6);
  assert.equal(atFiveEarly.goalMet, true);
  const atTenEarly = sync.buildLogPayload(mission, { at: '07:50', date: '2026-11-18', by: 'child-user', member: 'm3' });
  assert.equal(atTenEarly.earlyBonus, 2);
  assert.equal(atTenEarly.earned, 7);
  const atDue = sync.buildLogPayload(mission, { at: '08:00', date: '2026-11-18', by: 'child-user', member: 'm3' });
  assert.equal(atDue.earlyBonus, 0);
  assert.equal(atDue.earned, 5);
  const noDue = sync.buildLogPayload({ ...mission, due: '' }, { at: '07:00', date: '2026-11-18', by: 'child-user', member: 'm3' });
  assert.equal(noDue.earlyBonus, 0);
  assert.equal(noDue.earned, 5);
});

test('child can create wishlist, shopping, and letter documents using child-safe fields', async () => {
  const { sdk, writes } = fakeSdk();
  const auth = { currentUser: userWithRole('child-user', 'child') };
  const sync = createFamilySync({ sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);

  const result = await sync.pushPatch({
    prev: { wishlist: [], shopping: [], letters: [] },
    next: {
      wishlist: [{ id: 'wish-1', title: '그림책', need: 0, cat: 'book', at: '2026-11-18', by: 'm3', boughtAt: '' }],
      shopping: [{ id: 'shop-1', cat: 'buy', text: '우유', done: false }],
      letters: [{ id: 'letter-1', img: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz', author: '아이', when: '오늘' }],
    },
    by: 'child-user', r: 'child', skipLogs: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.denied, []);
  assert.equal(result.written.length, 3);
  const wish = writes.find((entry) => entry.path.endsWith('/wishlist/wish-1'));
  assert.equal(wish.data.by, 'm3');
  assert.equal(wish.data.boughtAt, '');
  assert.equal(wish.data.createdBy, 'child-user');
  assert.equal(wish.data.createdAt, 'server-time');
  assert.equal(writes.find((entry) => entry.path.endsWith('/shopping/shop-1')).data.createdBy, 'child-user');
  assert.equal(writes.find((entry) => entry.path.endsWith('/letters/letter-1')).data.createdBy, 'child-user');
});

test('child updates only own shopping/letters and cannot edit wishlist or another author\'s letter', async () => {
  const { sdk, writes } = fakeSdk();
  const auth = { currentUser: userWithRole('child-user', 'child') };
  const sync = createFamilySync({ sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);
  const prev = {
    wishlist: [{ id: 'wish-1', title: '책', need: 0, cat: 'book', at: '', by: 'm3', boughtAt: '', createdBy: 'child-user' }],
    shopping: [{ id: 'shop-1', cat: 'buy', text: '우유', done: false, createdBy: 'child-user', createdAt: 'old-time' }],
    letters: [
      { id: 'letter-own', img: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz', author: '아이', when: '오늘', createdBy: 'child-user', createdAt: 'old-time' },
      { id: 'letter-other', img: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz', author: '부모', when: '오늘', createdBy: 'parent-user', createdAt: 'old-time' },
    ],
  };
  const next = {
    wishlist: [{ ...prev.wishlist[0], title: '바꾼 책' }],
    shopping: [],
    letters: [
      { ...prev.letters[0], author: '아이 수정' },
      { ...prev.letters[1], author: '위조 시도' },
    ],
  };

  const result = await sync.pushPatch({ prev, next, by: 'child-user', r: 'child', skipLogs: true });

  assert.equal(result.ok, true);
  assert.deepEqual(writes.map((entry) => [entry.path.split('/').slice(-2).join('/'), entry.op || 'create']), [
    ['shopping/shop-1', 'delete'],
    ['letters/letter-own', 'update'],
  ]);
  assert.deepEqual(result.denied.map((entry) => [entry.collection, entry.id]), [
    ['wishlist', 'wish-1'],
    ['letters', 'letter-other'],
  ]);
});

test('an older role lookup cannot overwrite the current auth session', async () => {
  const { sdk } = fakeSdk();
  const auth = { currentUser: null };
  const sync = createFamilySync({ sdk, auth, db: {} });
  let finishOld;
  const oldUser = { uid: 'old-user', getIdTokenResult: () => new Promise((resolve) => { finishOld = resolve; }) };
  auth.currentUser = oldUser;
  const oldResultPromise = sync.applyAuthUser(oldUser);

  const currentUser = userWithRole('current-user', 'parent');
  auth.currentUser = currentUser;
  const currentResult = await sync.applyAuthUser(currentUser);
  finishOld({ claims: { role: 'child' } });
  const oldResult = await oldResultPromise;

  assert.equal(currentResult.state, 'ready');
  assert.equal(oldResult.state, 'stale');
  assert.equal(sync.uid, 'current-user');
  assert.equal(sync.role, 'parent');
});

test('logout unsubscribes and ignores late snapshot callbacks', async () => {
  const { sdk, listeners } = fakeSdk();
  const auth = { currentUser: null };
  const received = [];
  const sync = createFamilySync({ sdk, auth, db: {}, onData: (data) => received.push(data) });
  auth.currentUser = userWithRole('parent-user', 'parent');
  await sync.applyAuthUser(auth.currentUser);
  sync.startSubscriptions();
  const lateCallback = listeners.find((entry) => entry.ref.path.endsWith('/missions')).next;

  await sync.signOut();
  lateCallback({ docs: [{ id: 'stale', data: () => ({ title: 'stale family data' }) }] });

  assert.equal(sync.role, '');
  assert.equal(sync.uid, '');
  assert.equal(sync.listening, false);
  assert.ok(listeners.every((entry) => !entry.active));
  assert.equal(received.length, 0);
});

test('a queued patch stops before submitting its next operation after logout', async () => {
  const { sdk, writes, holdNextWrite } = fakeSdk();
  const auth = { currentUser: null };
  const sync = createFamilySync({ sdk, auth, db: {} });
  auth.currentUser = userWithRole('parent-user', 'parent');
  await sync.applyAuthUser(auth.currentUser);

  let release;
  const heldWrite = new Promise((resolve) => { release = resolve; });
  holdNextWrite(heldWrite);
  const pending = sync.pushPatch({
    prev: { members: [] },
    next: { members: [{ id: 'adult-a' }, { id: 'adult-b' }] },
    by: 'parent-user',
    r: 'parent',
    skipLogs: true,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);

  await sync.signOut();
  release();
  const result = await pending;
  assert.equal(result.cancelled, true);
  assert.equal(writes.length, 1);
});

test('parent PIN is stored only in the protected parent config document', async () => {
  const { sdk, writes } = fakeSdk();
  const auth = { currentUser: null };
  const sync = createFamilySync({ sdk, auth, db: {} });
  auth.currentUser = userWithRole('parent-user', 'parent');
  await sync.applyAuthUser(auth.currentUser);

  const result = await sync.saveParentPin({ pin: '2468', by: 'parent-user' });
  assert.equal(result.ok, true);
  assert.deepEqual(writes[0], {
    path: 'households/main/private/parent_config',
    data: { parentPin: '2468', updatedAt: 'server-time' },
    options: { merge: true },
  });
  assert.equal((await sync.saveParentPin({ pin: '12', by: 'parent-user' })).ok, false);
});

test('only parent sessions subscribe to private parent PIN snapshots', async () => {
  const parentSdk = fakeSdk();
  const parentAuth = { currentUser: userWithRole('parent-user', 'parent') };
  const received = [];
  const parentSync = createFamilySync({ sdk: parentSdk.sdk, auth: parentAuth, db: {}, onData: (data) => received.push(data) });
  await parentSync.applyAuthUser(parentAuth.currentUser);
  parentSync.startSubscriptions();
  const privateListener = parentSdk.listeners.find((entry) => entry.ref && entry.ref.path && entry.ref.path.endsWith('/private/parent_config'));
  assert.ok(privateListener);
  privateListener.next({
    id: 'parent_config',
    exists: () => true,
    data: () => ({ parentPin: '2468' }),
  });
  assert.equal(received.find((entry) => entry.key === 'parentConfig').docs[0].parentPin, '2468');

  const childSdk = fakeSdk();
  const childAuth = { currentUser: userWithRole('child-user', 'child') };
  const childSync = createFamilySync({ sdk: childSdk.sdk, auth: childAuth, db: {} });
  await childSync.applyAuthUser(childAuth.currentUser);
  childSync.startSubscriptions();
  assert.equal(childSdk.listeners.some((entry) => entry.ref && entry.ref.path && entry.ref.path.endsWith('/private/parent_config')), false);
});

test('event center is stored in the existing child_state doc path and only a parent may write it', async () => {
  const { sdk, writes } = fakeSdk();
  const auth = { currentUser: userWithRole('parent-user', 'parent') };
  const sync = createFamilySync({ sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);

  const result = await sync.pushEventCenter({
    combo: { on: true, bonus: 3 },
    doubleDays: [{ id: 'd1', date: '2026-11-20', label: '생일' }],
    secret: { date: '2026-11-18', title: '안마 5분', points: 4, opened: false, done: false },
    stamps: { baseball: { n: 3, done: 1 }, reading: { n: 0, done: 0 } },
    gacha: { step: 50, rewards: [{ id: 'g1', label: '아이스크림', weight: 30 }], draws: [] },
    ignored: 'drop-me',
  });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'households/main/child_state/event_center');
  assert.equal(writes[0].data.updatedAt, 'server-time');
  assert.equal(writes[0].data.combo.bonus, 3);
  assert.equal(writes[0].data.stamps.baseball.n, 3);
  assert.equal('ignored' in writes[0].data, false);

  const childSdk = fakeSdk();
  const childAuth = { currentUser: userWithRole('child-user', 'child') };
  const childSync = createFamilySync({ sdk: childSdk.sdk, auth: childAuth, db: {} });
  await childSync.applyAuthUser(childAuth.currentUser);
  const deniedResult = await childSync.pushEventCenter({ combo: { on: false } });
  assert.equal(deniedResult.ok, false);
  assert.equal(childSdk.writes.length, 0);
  assert.equal(deniedResult.denied[0].id, 'event_center');
});

test('bonus points are written as a parent-created log document that settlement can count', async () => {
  const { sdk, writes } = fakeSdk();
  const auth = { currentUser: userWithRole('parent-user', 'parent') };
  const sync = createFamilySync({ sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);

  const res = await sync.writeBonusLog({ date: '2026-11-18', at: '19:05', mid: 'combo_m-1_2026-11-18', title: '🔥 3일 연속!', points: 3 });
  assert.equal(res.ok, true);
  assert.equal(writes[0].path, 'households/main/logs/2026-11-18_combo_m-1_2026-11-18_m3');
  assert.equal(writes[0].data.member, 'm3');
  assert.equal(writes[0].data.earned, 3);
  assert.equal(writes[0].data.kind, 'bonus');
  assert.equal(writes[0].data.settled, false);
  assert.equal(writes[0].data.due, '');
  assert.equal(res.id, '2026-11-18_combo_m-1_2026-11-18_m3');

  const childSdk = fakeSdk();
  const childAuth = { currentUser: userWithRole('child-user', 'child') };
  const childSync = createFamilySync({ sdk: childSdk.sdk, auth: childAuth, db: {} });
  await childSync.applyAuthUser(childAuth.currentUser);
  const denied = await childSync.writeBonusLog({ date: '2026-11-18', mid: 'x', title: 'x', points: 3 });
  assert.equal(denied.ok, false);
  assert.equal(childSdk.writes.length, 0);
});

test('every signed-in role subscribes to the event center document', async () => {
  for (const role of ['parent', 'child']) {
    const probe = fakeSdk();
    const auth = { currentUser: userWithRole(`${role}-user`, role) };
    const sync = createFamilySync({ sdk: probe.sdk, auth, db: {} });
    await sync.applyAuthUser(auth.currentUser);
    sync.startSubscriptions();
    assert.ok(probe.listeners.some((entry) => entry.ref && entry.ref.path === 'households/main/child_state/event_center'));
    assert.ok(probe.listeners.some((entry) => entry.ref && entry.ref.path === 'households/main/child_state/today_school'));
    assert.ok(probe.listeners.some((entry) => entry.ref && entry.ref.path === 'households/main/child_state/custom_alarms'));
  }
});

test('custom alarm document keeps only valid times/titles/days and 40 alarms at most', () => {
  const doc = customAlarmDoc({
    alarms: [
      { id: 'def-morning-done', time: '07:15', title: ' 밥 먹기  끝 ', days: [1, 2, 3, 4, 5], on: true },
      { id: 'x y', time: '08:05', title: '준비 끝', days: [1, 9, 2, '3'], on: false },
      { id: 'bad', time: '24:00', title: '잘못된 시각' },
      { id: 'empty', time: '09:00', title: '   ' },
    ],
  });
  assert.deepEqual(doc.alarms, [
    { id: 'def-morning-done', time: '07:15', title: '밥 먹기 끝', days: [1, 2, 3, 4, 5], on: true },
    { id: 'a2', time: '08:05', title: '준비 끝', days: [1, 2, 3], on: false },
  ]);
  const many = customAlarmDoc({ alarms: Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, time: '08:00', title: `알람 ${i}` })) });
  assert.equal(many.alarms.length, 40);
});

test('child dashboard never writes the custom alarm document', async () => {
  const probe = fakeSdk();
  const auth = { currentUser: userWithRole('child-user', 'child') };
  const sync = createFamilySync({ sdk: probe.sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);
  const res = await sync.pushAlarms({ alarms: [{ id: 'a1', time: '07:15', title: '밥 먹기 끝' }] });
  assert.equal(res.ok, false);
  assert.equal(res.denied[0].id, 'custom_alarms');
  assert.equal(probe.writes.length, 0);
});

test('school document keeps only real dates and the meal/timetable of each day', () => {
  const doc = schoolDocOf({
    name: '  예시초등학교 ',
    cls: '2학년 3반',
    byDate: {
      '2026-11-18': { meal: '비빔밥, 계란실파국, 닭윙구이, 백김치', timetable: '국어, 국어, 즐거운생활, 자율·자치활동' },
      '2026-11-19': { meal: '강황밥, 미역국' },
      'not-a-date': { meal: '버려질 값' },
      '2026-11-20': { meal: '', timetable: '' },
    },
  });
  assert.deepEqual(Object.keys(doc.byDate), ['2026-11-18', '2026-11-19', '2026-11-20']);
  assert.equal(doc.byDate['2026-11-18'].meal, '비빔밥, 계란실파국, 닭윙구이, 백김치');
  assert.equal(doc.byDate['2026-11-19'].timetable, '');
  assert.equal(doc.byDate['2026-11-20'].meal, '');
  assert.equal(doc.name, '예시초등학교');
});

test('school document is written only by a parent session', async () => {
  const parentFake = fakeSdk();
  const parentAuth = { currentUser: null };
  const parentSync = createFamilySync({ sdk: parentFake.sdk, db: {}, auth: parentAuth });
  parentAuth.currentUser = userWithRole('dad', 'parent');
  await parentSync.applyAuthUser(parentAuth.currentUser);
  const ok = await parentSync.pushSchool({ name: '예시초등학교', cls: '2학년 3반', byDate: { '2026-11-18': { meal: '비빔밥', timetable: '국어' } } });
  assert.equal(ok.ok, true);
  const write = parentFake.writes.find((w) => w.path === 'households/main/child_state/today_school');
  assert.ok(write, 'parent writes today_school');
  assert.equal(write.data.name, '예시초등학교');
  assert.equal(write.data.byDate['2026-11-18'].meal, '비빔밥');
  assert.equal(write.data.updatedAt, 'server-time');

  const childFake = fakeSdk();
  const childAuth = { currentUser: null };
  const childSync = createFamilySync({ sdk: childFake.sdk, db: {}, auth: childAuth });
  childAuth.currentUser = userWithRole('kid', 'child');
  await childSync.applyAuthUser(childAuth.currentUser);
  const denied = await childSync.pushSchool({ name: '바꾸면 안 됨' });
  assert.equal(denied.ok, false);
  assert.equal(denied.denied[0].id, 'today_school');
  assert.equal(childFake.writes.length, 0, 'child device never writes the school document');
});

test('shared mission logs add one stamp each; 9/10 pays nothing and 10/10 awards +3P once', () => {
  const cutoff = Date.parse(STAMP_START_AT);
  const makeLog = (i, overrides = {}) => ({
    id: `stamp-mission-${i + 1}`,
    mid: `stamp-mission-${i + 1}`,
    date: '2026-11-19',
    at: `08:${String(23 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    member: i % 2 ? 'm1' : 'm3',
    kind: 'mission',
    earned: i % 2 ? 3 : 2,
    settled: false,
    createdAt: new Date(cutoff + (i + 1) * 1000),
    ...overrides,
  });
  const logs = Array.from({ length: 10 }, (_, i) => makeLog(i));

  const nine = advanceStampBoard({ progress: 0, completed: 0, logs: logs.slice(0, 9) });
  assert.equal(nine.progress, 9);
  assert.equal(nine.completed, 0);
  assert.equal(nine.bonusPoints, 0);

  const ten = advanceStampBoard({ progress: nine.progress, completed: nine.completed, logs: logs.slice(9) });
  assert.equal(ten.progress, 0);
  assert.equal(ten.completed, 1);
  assert.equal(ten.boardsAwarded, 1);
  assert.equal(ten.bonusPoints, 3);
  assert.equal(nine.counted + ten.counted, 10);
  assert.equal(ten.bonusByMonth['2026-11'], 3);
  assert.equal(ten.bonusByDate['2026-11-19'], 3);

  const replay = advanceStampBoard({ progress: 0, completed: ten.completed, logs: logs.map((log) => ({ ...log, settled: true })) });
  assert.equal(replay.completed, 1);
  assert.equal(replay.bonusPoints, 0, 'settled logs cannot award the board bonus again');

  const excluded = advanceStampBoard({ logs: [
    makeLog(20, { id: 'pre-cutoff', mid: 'mission-pre-cutoff', createdAt: new Date(cutoff - 1) }),
    makeLog(21, { id: 'no-created-at', mid: 'mission-no-created-at', createdAt: undefined }),
    makeLog(22, { id: 'legacy-bonus', mid: 'combo-old', kind: 'bonus' }),
    makeLog(23, { id: 'manual-stamp', mid: 'stamp_reading_legacy' }),
  ] });
  assert.equal(excluded.counted, 0, 'old, timestamp-less, and non-mission bonus logs are never retroactively stamped');
});

test('shared summary and pending logs calculate the same +3P on both devices without double-counting after settlement', () => {
  const now = new Date('2026-11-19T09:30:00+09:00');
  const summary = {
    totalXp: 20,
    byMember: { m3: 20 },
    settledCount: 9,
    stampProgress: 9,
    stampBoardsCompleted: 0,
    monthly: { '2026-11': { total: 20, count: 9, byMember: { m3: 20 } } },
  };
  const tenthLog = {
    id: 'shared-household-mission', mid: 'shared-household-mission', date: '2026-11-19', at: '09:00',
    member: 'm1', kind: 'mission', earned: 2, settled: false,
    createdAt: new Date(Date.parse(STAMP_START_AT) + 60_000),
  };
  const deviceA = computeScreenStats({ summary, logs: [tenthLog], now });
  const deviceB = computeScreenStats({ summary, logs: [tenthLog], now });
  assert.deepEqual(deviceB, deviceA, 'every device derives the same board from the shared summary and log');
  const legacySummaryDevice = computeScreenStats({ summary: { ...summary, byMember: { m1: 0 } }, logs: [tenthLog], now });
  assert.equal(legacySummaryDevice.totalXp, 23, 'legacy totalXp is preserved even if byMember.m3 is absent');
  assert.equal(legacySummaryDevice.byMember.m3, 23);
  assert.equal(deviceA.stampProgress, 0);
  assert.equal(deviceA.stampBoardsCompleted, 1);
  assert.equal(deviceA.stampBonusPending, 0);
  assert.equal(deviceA.stampBonusPoints, 3);
  assert.equal(deviceA.totalXp, 23, 'the adult mission contributes to the board; only its own 2P goes to the adult');
  assert.equal(deviceA.byMember.m1, 2);
  assert.equal(deviceA.byMember.m3, 23);
  assert.equal(deviceA.monthly['2026-11'].total, 25);
  assert.equal(deviceA.monthly['2026-11'].count, 10);

  const settledSummary = {
    ...summary,
    totalXp: deviceA.totalXp,
    byMember: deviceA.byMember,
    stampProgress: deviceA.stampProgress,
    stampBoardsCompleted: deviceA.stampBoardsCompleted,
    monthly: deviceA.monthly,
  };
  const afterSettlement = computeScreenStats({ summary: settledSummary, logs: [{ ...tenthLog, settled: true }], now });
  assert.equal(afterSettlement.totalXp, deviceA.totalXp);
  assert.equal(afterSettlement.monthly['2026-11'].total, deviceA.monthly['2026-11'].total);
  assert.equal(afterSettlement.stampBonusPending, 0);
  assert.equal(afterSettlement.stampBonusPoints, 3);
});

test('google calendar events become read-only all-day or KST timed events', () => {
  const timed = gcalEventToApp({ id: 'a', summary: '가족 야구', start: { dateTime: '2026-11-21T03:00:00Z' }, end: { dateTime: '2026-11-21T05:00:00Z' } }, 'family-calendar@example.com');
  assert.equal(timed.date, '2026-11-21');          // UTC 03:00 = KST 12:00
  assert.equal(timed.time, '12:00');
  assert.equal(timed.title, '가족 야구');
  assert.equal(timed.source, 'gcal');
  assert.equal(timed.allDay, false);
  assert.equal(timed.id, 'gcal:family-calendar@example.com:a');

  const allDay = gcalEventToApp({ id: 'b', summary: '현충일', start: { date: '2026-11-22' } }, 'primary');
  assert.equal(allDay.date, '2026-11-22');
  assert.equal(allDay.time, '');
  assert.equal(allDay.allDay, true);

  assert.equal(gcalEventToApp({ status: 'cancelled', summary: '취소', start: { date: '2026-11-22' } }), null);
  assert.equal(gcalEventToApp({ id: 'c', summary: '   ', start: { date: '2026-11-22' } }), null);

  const list = gcalEventsToApp([
    { id: 'a', summary: '하나', start: { date: '2026-11-22' } },
    { id: 'a', summary: '하나(중복)', start: { date: '2026-11-22' } },
    { id: 'b', summary: '둘', start: { date: '2026-11-23' } },
  ], 'primary');
  assert.equal(list.length, 2);
});

test('google calendar list and query window are prepared without hard-coded ids', () => {
  const cals = gcalCalendars([
    { id: 'primary@example.com', summary: '내 캘린더', primary: true },
    { id: 'family-calendar@example.com', summaryOverride: '가족', deleted: false },
    { id: 'gone@example.com', deleted: true },
    null,
  ]);
  assert.deepEqual(cals.map((c) => c.id), ['primary@example.com', 'family-calendar@example.com']);
  assert.equal(cals[1].name, '가족');
  assert.equal(cals[0].primary, true);

  assert.deepEqual(gcalWindow('2026-11-18', { back: 3, ahead: 5 }), { from: '2026-11-15', to: '2026-11-23' });
  assert.equal(gcalBoundaryIso('2026-11-18'), '2026-11-18T00:00:00+09:00');
  assert.equal(gcalBoundaryIso('2026-11-18', true), '2026-11-18T23:59:59+09:00');
});

test('streak journal uses authoritative transaction logs, freezes targets and never touches points', async () => {
  const fake = fakeSdk();
  const records = new Map();
  const snap = (value) => ({ exists: () => value != null, data: () => value });
  fake.sdk.runTransaction = async (_db, fn) => fn({
    get: async (ref) => snap(records.get(ref.path)),
    set: (ref, data) => { records.set(ref.path, data); fake.writes.push({ path: ref.path, data }); },
  });
  const auth = { currentUser: userWithRole('parent-streak', 'parent') };
  let now = new Date('2026-11-20T08:00:00+09:00');
  const sync = createFamilySync({ sdk: fake.sdk, auth, db: {}, now: () => now });
  await sync.applyAuthUser(auth.currentUser);
  const root = 'households/main/';
  const logPath = root + 'logs/2026-11-20_a_m3';
  records.set(logPath, { date: '2026-11-20', mid: 'a', member: 'm3' });
  let out = await sync.observeStreak({ date: '2026-11-20', required: ['a'], logs: [] });
  assert.equal(out.ok, true);
  assert.deepEqual(out.data.days['2026-11-20'].done, ['a'], 'client missing log cannot erase a server completion');
  records.delete(logPath);
  out = await sync.observeStreak({ date: '2026-11-20', required: ['changed'], logs: [{ date: '2026-11-20', mid: 'a', member: 'm3' }] });
  assert.deepEqual(out.data.days['2026-11-20'].required, ['a']);
  assert.deepEqual(out.data.days['2026-11-20'].done, [], 'server undo overrides a stale client completion');
  records.set(logPath, { date: '2026-11-20', mid: 'a', member: 'm3' });
  now = new Date('2026-11-21T08:00:00+09:00');
  out = await sync.observeStreak({ date: '2026-11-21', required: [], skip: true });
  assert.equal(out.data.days['2026-11-20'].finalized, true);
  assert.deepEqual(out.data.days['2026-11-20'].done, ['a'], 'last open day checked from server even after midnight');
  assert.ok(fake.writes.every((w) => w.path.endsWith('/child_state/mission_streak')), 'points, summary and logs are never written');
  assert.equal((await sync.observeStreak({ date: '2026-11-20', required: ['x'] })).ok, false, 'stale date rejected');
});
test('child sessions cannot write streak history', async () => {
  const fake = fakeSdk();
  fake.sdk.runTransaction = async () => { throw new Error('must not be called'); };
  const auth = { currentUser: userWithRole('child-streak', 'child') };
  const sync = createFamilySync({ sdk: fake.sdk, auth, db: {} });
  await sync.applyAuthUser(auth.currentUser);
  assert.equal((await sync.observeStreak({ date: '2026-11-20' })).ok, false);
  assert.equal(fake.writes.length, 0);
});

test('earnings require no settlement, legacy settlement endpoint cannot write',async()=>{
 const fake=fakeSdk(),sync=createFamilySync({sdk:fake.sdk,auth:{currentUser:null},db:{}});
 const out=await sync.settleUnsettled();assert.equal(out.code,'earnings-auto');assert.equal(out.ok,false);assert.equal(fake.writes.length,0);
});
test('automatic mission and stamp earnings preserve old balances across month, cancellation and re-completion',()=>{
 const summary={totalXp:20,byMember:{m3:20},stampProgress:9,stampBoardsCompleted:2,monthly:{}};
 const log={id:'2026-11-22_one_m3',date:'2026-11-22',at:'08:00',mid:'one',member:'m3',earned:2,settled:false,createdAt:new Date('2026-11-22T08:00:00+09:00')};
 const input={summary,logs:[log],pointUses:[{amount:4}],now:new Date('2026-12-01T08:00:00+09:00')};
 const before=JSON.stringify(input),a=computeScreenStats(input),b=computeScreenStats({...input,logs:JSON.parse(JSON.stringify(input.logs))});
 assert.equal(a.totalXp,25);assert.equal(a.balance,21);assert.equal(a.stampBonusPending,0);assert.equal(a.stampBonusAuto,3);assert.equal(a.stampBoardsCompleted,3);assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(computeScreenStats({...input,logs:[log,log]}),a,'duplicate snapshot of same completion never adds points or stamps');
 const cancel=computeScreenStats({...input,logs:[]});assert.equal(cancel.totalXp,20);assert.equal(cancel.balance,16);assert.equal(cancel.stampBoardsCompleted,2);assert.equal(cancel.stampProgress,9);
 assert.deepEqual(computeScreenStats(input),a,'recompletion once restores exact earnings');
 const used=computeScreenStats({...input,pointUses:[{amount:8}]});assert.equal(used.totalXp,a.totalXp);assert.equal(used.balance,a.balance-4);
});


test('stamp reward boundary preserves old 3P, progress and future 1P without duplicate replay',()=>{
 const before=new Date('2026-11-23T07:30:32+09:00');const after=new Date('2026-11-23T07:30:34+09:00');
 const make=(i)=>({id:'new'+i,date:'2026-11-23',at:'08:'+String(i).padStart(2,'0'),mid:'m'+i,member:'m3',settled:false,createdAt:i<10?before:after,earned:1});
 const logs=Array.from({length:20},(_,i)=>make(i));
 const fifteen=advanceStampBoard({logs:logs.slice(0,15)});assert.equal(fifteen.progress,5);assert.equal(fifteen.bonusPoints,3);
 const twenty=advanceStampBoard({logs:[...logs,...logs]});assert.equal(twenty.progress,0);assert.equal(twenty.completed,2);assert.equal(twenty.bonusPoints,4);assert.equal(twenty.bonusByDate['2026-11-23'],4);
 assert.deepEqual(advanceStampBoard({logs}),twenty);
});
