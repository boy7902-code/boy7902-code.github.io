import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamilySync } from '../firebase-sync.js';

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
