import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamilySync, reconcileMissionCompletions } from '../firebase-sync.js';

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
    { id: 'adult-1', member: 'm1', doneOn: null, doneAt: '', earned: 0, goalMet: false },
    { id: 'adult-2', member: 'm2', doneOn: null, doneAt: '', earned: 0, goalMet: false },
    { id: 'kid-1', member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false },
    { id: 'shared-1', member: '', doneOn: null, doneAt: '', earned: 0, goalMet: false },
    { id: 'missed', member: 'm1', doneOn: '2026-11-18', doneAt: '08:00', earned: 9, goalMet: true },
  ];
  const logs = [
    { mid: 'adult-1', date: '2026-11-18', member: 'm1', at: '07:30', earned: 8, goalMet: true },
    { mid: 'adult-2', date: '2026-11-18', member: 'm2', at: '08:10', earned: 4, goalMet: false },
    { mid: 'kid-1', date: '2026-11-18', member: 'm3', at: '07:50', earned: 6, goalMet: true },
    { mid: 'shared-1', date: '2026-11-18', member: '', at: '09:00', earned: 3, goalMet: false },
  ];

  reconcileMissionCompletions(missions, logs, '2026-11-18');

  assert.deepEqual(missions.slice(0, 4).map((mission) => [mission.doneOn, mission.doneAt, mission.earned, mission.goalMet]), [
    ['2026-11-18', '07:30', 8, true],
    ['2026-11-18', '08:10', 4, false],
    ['2026-11-18', '07:50', 6, true],
    ['2026-11-18', '09:00', 3, false],
  ]);
  assert.deepEqual([missions[4].doneOn, missions[4].doneAt, missions[4].earned, missions[4].goalMet], [null, '', 0, false]);
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
