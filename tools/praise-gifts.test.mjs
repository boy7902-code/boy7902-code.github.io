import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createFamilySync, computeScreenStats, advanceStampBoard, FAMILY_ROOT } from '../firebase-sync.js';
const core = globalThis.FamilyPraiseCore;
const ID = '0123456789abcdef0123456789abcdef';
const ID2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const parent = { uid: 'parent', getIdTokenResult: async () => ({ claims: { role: 'parent' } }) };
const child = { uid: 'child', getIdTokenResult: async () => ({ claims: { role: 'child' } }) };
function fixture() {
  const store = new Map(), commits = [];
  let reject = false, onGet = null;
  const auth = { currentUser: parent };
  const snapshot = path => ({ exists: () => store.has(path), data: () => structuredClone(store.get(path)), id: path.split('/').at(-1) });
  const sdk = {
    doc: (_, path) => ({ path }), collection: (_, path) => ({ path }),
    serverTimestamp: () => ({ seconds: 1795317000, nanoseconds: 0 }),
    signOut: async () => {},
    getDoc: async ref => snapshot(ref.path),
    getDocs: async ref => ({ docs: [...store.keys()].filter(path => path.startsWith(ref.path + '/') && !path.slice(ref.path.length + 1).includes('/')).map(snapshot) }),
    setDoc: async (ref, data) => { store.set(ref.path, data); },
    runTransaction: async (_, fn) => {
      const ops = [];
      const result = await fn({
        get: async ref => { if (onGet) await onGet(); return snapshot(ref.path); },
        set: (ref, data) => ops.push({ path: ref.path, data, type: 'set' }),
        update: (ref, data) => ops.push({ path: ref.path, data, type: 'update' }),
      });
      if (reject) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      ops.forEach(op => store.set(op.path, op.type === 'update' ? { ...store.get(op.path), ...op.data } : op.data));
      commits.push(ops); return result;
    },
  };
  let date = new Date('2026-11-22T04:00:00Z');
  const sync = createFamilySync({ sdk, auth, db: {}, crypto: { getRandomValues: a => { a[0] = 60; return a; } }, now: () => date });
  return { sync, auth, store, commits, sdk, reject: value => reject = value, onGet: value => onGet = value, date: value => date = new Date(value) };
}

test('approved praise odds sum to 100 and exactly yield 60/28/9/2/1, expected 1.63P', () => {
  assert.equal(core.validatePolicy(), true);
  assert.deepEqual(core.POLICY.rewards.map(x => x.weight), [60, 28, 9, 2, 1]);
  const counts = Object.fromEntries([1, 2, 3, 5, 10].map(x => [x, 0]));
  for (let n = 0; n < 100; n++) counts[core.pickPoints(core.POLICY, n)]++;
  assert.deepEqual(counts, { 1: 60, 2: 28, 3: 9, 5: 2, 10: 1 });
  assert.equal(Object.entries(counts).reduce((s, [p, w]) => s + Number(p) * w, 0), 163);
  assert.equal(core.POLICY.dailyLimit, null); assert.equal(core.POLICY.weeklyLimit, null);
  assert.throws(() => core.pickPoints({ ...core.POLICY, approved: false }, 50));
  assert.throws(() => core.pickPoints(core.POLICY, 100));
});

test('praise randomness rejects modulo-biased values and never falls back to Math.random', () => {
  let calls = 0;
  assert.equal(core.secureRoll({ getRandomValues: a => { a[0] = ++calls === 1 ? 4294967295 : 99; } }), 99);
  assert.equal(calls, 2);
  assert.throws(() => core.secureRoll({}));
  assert.match(core.newId(webcrypto), /^[a-f0-9]{32}$/);
});

test('parent issue is idempotent and does not award points before opening', async () => {
  const f = fixture(); await f.sync.applyAuthUser(parent);
  assert.equal((await f.sync.issuePraiseGift({ id: ID, reason: '스스로 정리를 도왔어요' })).ok, true);
  const saved = f.store.get(`${FAMILY_ROOT}/praiseGifts/${ID}`);
  assert.equal(saved.state, 'ready'); assert.equal(saved.points, 2);
  assert.equal([...f.store.keys()].filter(k => k.includes('/logs/')).length, 0);
  assert.equal((await f.sync.issuePraiseGift({ id: ID, reason: '스스로 정리를 도왔어요' })).alreadyIssued, true);
  assert.equal(f.store.size, 1);
  assert.equal((await f.sync.issuePraiseGift({ id: ID, reason: '다른 내용' })).ok, false);
  assert.equal((await f.sync.issuePraiseGift({ id: ID2, reason: '' })).ok, false);
});

test('child cannot issue, but can claim one exact parent gift once across reloads and dates', async () => {
  const f = fixture(); await f.sync.applyAuthUser(parent);
  await f.sync.issuePraiseGift({ id: ID, reason: '칭찬 이유' });
  f.auth.currentUser = child; await f.sync.applyAuthUser(child);
  assert.equal((await f.sync.issuePraiseGift({ id: ID2, reason: '위조' })).denied, true);
  const out = await f.sync.claimPraiseGift({ id: ID }); assert.equal(out.ok, true); assert.equal(out.points, 2);
  assert.equal(f.commits.at(-1).length, 2, 'receipt + state are committed together');
  assert.equal(f.store.get(`${FAMILY_ROOT}/praiseGifts/${ID}`).state, 'claimed');
  const logs = [...f.store].filter(([p]) => p.includes('/logs/')).map(([, log]) => log);
  assert.equal(logs.length, 1); assert.equal(logs[0].giftId, ID); assert.equal(logs[0].kind, 'bonus'); assert.equal(logs[0].earned, 2);
  assert.equal(advanceStampBoard({ logs }).progress, 0, 'praise never produces mission stamps');
  assert.equal(computeScreenStats({ logs }).totalXp, 2);
  f.date('2026-11-23T04:00:00Z');
  const again = await f.sync.claimPraiseGift({ id: ID }); assert.equal(again.alreadyClaimed, true); assert.equal(f.store.size, 2);
  const fresh = createFamilySync({ sdk: f.sdk, auth: f.auth, db: {} }); await fresh.applyAuthUser(child);
  assert.equal((await fresh.claimPraiseGift({ id: ID })).alreadyClaimed, true, 'new device/client returns the existing receipt');
  assert.equal((await fresh.claimPraiseGift({ id: ID2 })).ok, false);
});

test('failed atomic commit grants nothing and the same gift can retry without reroll', async () => {
  const f = fixture(); await f.sync.applyAuthUser(parent); await f.sync.issuePraiseGift({ id: ID, reason: '고마워' });
  f.auth.currentUser = child; await f.sync.applyAuthUser(child); f.reject(true);
  assert.equal((await f.sync.claimPraiseGift({ id: ID })).ok, false);
  assert.equal(f.store.size, 1); assert.equal(f.store.get(`${FAMILY_ROOT}/praiseGifts/${ID}`).state, 'ready');
  f.reject(false); assert.equal((await f.sync.claimPraiseGift({ id: ID })).points, 2); assert.equal(f.store.size, 2);
});

test('backup includes the gift ledger but restore preserves current issued/claimed state', async () => {
  const f = fixture(); await f.sync.applyAuthUser(parent); await f.sync.issuePraiseGift({ id: ID, reason: '고마워' });
  const backup = await f.sync.createBackup(); assert.equal(backup.skipped, false);
  assert.equal(backup.chunks.flatMap(x => x.records).filter(x => x.path.includes('/praiseGifts/')).length, 1);
  await f.sync.claimPraiseGift({ id: ID });
  const restored = await f.sync.restoreBackup(backup); assert.equal(restored.ok, true); assert.equal(restored.preservedGiftRecords.length, 1);
  assert.equal(f.store.get(`${FAMILY_ROOT}/praiseGifts/${ID}`).state, 'claimed');
  assert.equal((await f.sync.claimPraiseGift({ id: ID })).alreadyClaimed, true);
});
