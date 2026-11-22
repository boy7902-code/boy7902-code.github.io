import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import * as authSDK from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createFamilySync, FAMILY_ROOT } from '../firebase-sync.js';
const projectId = 'demo-family-dashboard';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Disposable local emulators only');
const admin = adminInit({ projectId }, 'praise-test-admin');
const apps = [];
async function client(label, user) {
  const app = initializeApp({ apiKey: 'demo-emulator-placeholder', authDomain: 'localhost', projectId }, 'praise-' + label); apps.push(app);
  const auth = authSDK.getAuth(app), db = fs.getFirestore(app);
  authSDK.connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(db, host, Number(port));
  if (user) { await authSDK.signInWithEmailAndPassword(auth, user.email, 'EmulatorOnly!praise123'); await auth.currentUser.getIdToken(true); }
  const sync = createFamilySync({ sdk: { ...authSDK, ...fs }, auth, db });
  if (user) await sync.applyAuthUser(auth.currentUser);
  return { app, auth, db, sync, ref: path => fs.doc(db, `${FAMILY_ROOT}/${path}`) };
}
async function user(role) { const u = await getAuth(admin).createUser({ email: `praise-${role}-${Date.now()}@example.test`, password: 'EmulatorOnly!praise123' }); await getAuth(admin).setCustomUserClaims(u.uid, { role }); return u; }
const denied = e => e.code === 'permission-denied';
const A = '11111111111111111111111111111111', B = '22222222222222222222222222222222', C = '33333333333333333333333333333333';

test('praise gift emulator: parent issue, child atomic once-only claim, tamper denial and two-device race', async () => {
  try {
    const p = await client('parent', await user('parent')), child = await user('child');
    const a = await client('child-a', child), b = await client('child-b', child), anonymous = await client('anonymous');
    const out = await p.sync.issuePraiseGift({ id: A, reason: '에뮬레이터 칭찬 선물' }); assert.equal(out.ok, true, JSON.stringify(out));
    const source = (await fs.getDoc(p.ref(`praiseGifts/${A}`))).data();
    assert.equal((await fs.getDoc(p.ref(`logs/praise_${A}`))).exists(), false, 'issue does not earn before opening');
    assert.equal((await a.sync.issuePraiseGift({ id: B, reason: '아이가 발급' })).ok, false);
    await assert.rejects(fs.setDoc(a.ref(`praiseGifts/${B}`), { ...source, id: B, createdBy: child.uid, createdAt: fs.serverTimestamp() }), denied);
    await assert.rejects(fs.updateDoc(a.ref(`praiseGifts/${A}`), { points: 10 }), denied);
    await assert.rejects(fs.updateDoc(a.ref(`praiseGifts/${A}`), { state: 'claimed', openedAt: fs.serverTimestamp(), openedBy: child.uid, claimDate: '2026-11-22', claimAt: '00:00' }), denied);
    await assert.rejects(fs.getDoc(a.ref('private/parent_config')), denied);
    await assert.rejects(fs.getDoc(anonymous.ref(`praiseGifts/${A}`)), denied);
    const stamp = new Date(Date.now() + (9 * 60 + 5) * 60000), date = stamp.toISOString().slice(0, 10), at = stamp.toISOString().slice(11, 16);
    const receipt = { id: 'praise_' + A, date, at, mid: 'praise_' + A, giftId: A, title: '🎁 칭찬 선물 · ' + source.reason, kind: 'bonus', member: 'm3', base: source.points, bonus: 0, earlyBonus: 0, earned: source.points, due: '', goalMet: false, settled: false, createdAt: fs.serverTimestamp(), createdBy: child.uid };
    await assert.rejects(fs.setDoc(a.ref(`logs/praise_${A}`), receipt), denied, 'no log without consuming the gift');
    const bad = fs.writeBatch(a.db); bad.set(a.ref(`logs/praise_${A}`), { ...receipt, base: 999, earned: 999 }); bad.update(a.ref(`praiseGifts/${A}`), { state: 'claimed', openedAt: fs.serverTimestamp(), openedBy: child.uid, claimDate: date, claimAt: at });
    await assert.rejects(bad.commit(), denied, 'wrong award is rejected atomically');
    assert.equal((await fs.getDoc(a.ref(`praiseGifts/${A}`))).data().state, 'ready');
    const wrongMember = fs.writeBatch(a.db); wrongMember.set(a.ref(`logs/praise_${A}`), { ...receipt, member: 'm1' }); wrongMember.update(a.ref(`praiseGifts/${A}`), { state: 'claimed', openedAt: fs.serverTimestamp(), openedBy: child.uid, claimDate: date, claimAt: at });
    await assert.rejects(wrongMember.commit(), denied);
    const races = await Promise.all([a.sync.claimPraiseGift({ id: A }), b.sync.claimPraiseGift({ id: A })]);
    assert.equal(races.every(x => x.ok), true, JSON.stringify(races));
    assert.equal(races.filter(x => !x.alreadyClaimed).length, 1, 'one device claims, the other reads the same result');
    assert.equal(races[0].points, source.points); assert.equal(races[1].points, source.points);
    const saved = (await fs.getDoc(p.ref(`logs/praise_${A}`))).data(); assert.equal(saved.earned, source.points);
    assert.equal((await fs.getDoc(p.ref(`praiseGifts/${A}`))).data().state, 'claimed');
    await assert.rejects(fs.deleteDoc(a.ref(`logs/praise_${A}`)), denied, 'child cannot erase a gift receipt');
    await assert.rejects(fs.updateDoc(a.ref(`logs/praise_${A}`), { earned: 999 }), denied);
    await assert.rejects(fs.updateDoc(p.ref(`praiseGifts/${A}`), { state: 'ready' }), denied, 'even parent UI cannot reset a consumed gift');
    assert.equal((await a.sync.claimPraiseGift({ id: A })).alreadyClaimed, true);
    assert.equal((await a.sync.claimPraiseGift({ id: C })).ok, false, 'unknown gift cannot earn');
    const second = await p.sync.issuePraiseGift({ id: B, reason: '두 번째 칭찬' }); assert.equal(second.ok, true);
    assert.equal((await p.sync.claimPraiseGift({ id: B })).ok, true, 'parent-operated child screen may open too');
    const logs = await fs.getDocs(fs.query(fs.collection(p.db, `${FAMILY_ROOT}/logs`), fs.where('kind', '==', 'bonus')));
    assert.equal(logs.docs.filter(d => d.data().giftId === A).length, 1);
    assert.equal(logs.docs.filter(d => d.data().giftId === B).length, 1);
    console.log('Verified praise permission boundaries, unchanged parent/private restrictions and two-device exact-once ledger.');
  } finally { for (const app of apps) await deleteApp(app); await adminDelete(admin); }
});
