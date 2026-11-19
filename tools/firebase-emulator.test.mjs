import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import * as authSdk from 'firebase/auth';
import * as firestoreSdk from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { computeScreenStats, createFamilySync, FAMILY_ROOT } from '../firebase-sync.js';

const PROJECT_ID = 'demo-family-dashboard';
const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8080';
const password = 'Emulator-only-Password-123!';

for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  if (!process.env[key]) throw new Error(`Missing ${key}; start tests with npm run test:emulator.`);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) {
  throw new Error(`Unexpected project ${process.env.GCLOUD_PROJECT}; expected ${PROJECT_ID}.`);
}

const clientApp = initializeClientApp({
  apiKey: 'demo-emulator-placeholder',
  authDomain: 'localhost',
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:0000000000000000000000',
}, 'family-dashboard-emulator-test');
const auth = authSdk.getAuth(clientApp);
authSdk.connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
const db = firestoreSdk.getFirestore(clientApp);
firestoreSdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'family-dashboard-emulator-admin');
const adminAuth = getAdminAuth(adminApp);
const sdk = { ...authSdk, ...firestoreSdk };
const sync = createFamilySync({ sdk, auth, db });
let serial = 0;
function kstMinuteNow() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}
function hhmmOfMinute(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

async function createClaimedUser(role) {
  const n = ++serial;
  const user = await adminAuth.createUser({
    email: `${role}-${n}@example.test`,
    password,
    displayName: `Emulator ${role}`,
  });
  await adminAuth.setCustomUserClaims(user.uid, { role });
  await authSdk.signInWithEmailAndPassword(auth, user.email, password);
  await auth.currentUser.getIdToken(true);
  const result = await sync.applyAuthUser(auth.currentUser);
  assert.equal(result.state, 'ready');
  assert.equal(result.role, role);
  return { user, result };
}

async function clearSignedInUser() {
  sync.stopAll();
  if (auth.currentUser) await authSdk.signOut(auth);
}

test('Auth + Firestore emulator enforces family roles and settles child mission logs', async () => {
  try {
    const { user: parent } = await createClaimedUser('parent');
    const mission = {
      id: 'emulator-morning',
      title: '에뮬레이터 테스트 미션',
      points: 5,
      due: '',
      bonus: 0,
      member: 'm3',
      days: [],
    };
    const earlyAtMinute = kstMinuteNow();
    const earlyAt = hhmmOfMinute(earlyAtMinute);
    const earlyDueMinute = earlyAtMinute + 10;
    const earlyMission = earlyDueMinute < 1430 ? {
      id: 'emulator-early-bonus', title: '조기 보너스 테스트 미션', points: 5,
      due: hhmmOfMinute(earlyDueMinute), bonus: 3, member: 'm3', days: [],
    } : null;
    const forgedMission = earlyMission ? { ...earlyMission, id: 'emulator-forged-bonus' } : null;
    const missions = [mission, ...(earlyMission ? [earlyMission, forgedMission] : [])];
    const parentWrite = await sync.pushPatch({
      prev: {}, next: { missions }, by: parent.uid, r: 'parent', skipLogs: true,
    });
    assert.equal(parentWrite.ok, true);
    assert.equal(parentWrite.written.length, missions.length);
    const pinWrite = await sync.saveParentPin({ pin: '2468', by: parent.uid });
    assert.equal(pinWrite.ok, true);
    const privateConfig = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/private/parent_config`));
    assert.equal(privateConfig.data().parentPin, '2468');

    await clearSignedInUser();
    const { user: child } = await createClaimedUser('child');
    const childRole = await sync.applyAuthUser(auth.currentUser);
    assert.equal(childRole.role, 'child');

    const childCollections = await sync.pushPatch({
      prev: { wishlist: [], shopping: [], letters: [] },
      next: {
        wishlist: [{ id: 'child-wish', title: '그림책', need: 0, cat: 'book', at: '', by: 'm3', boughtAt: '' }],
        shopping: [{ id: 'child-shopping', cat: 'buy', text: '우유', done: false }],
        letters: [{ id: 'child-letter', img: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz', author: '아이', when: '오늘' }],
      },
      by: child.uid, r: 'child', skipLogs: true,
    });
    assert.equal(childCollections.ok, true);
    assert.deepEqual(childCollections.denied, []);
    assert.equal(childCollections.written.length, 3);
    const childWish = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/wishlist/child-wish`));
    const childLetter = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/letters/child-letter`));
    assert.equal(childWish.exists(), true, 'child wishlist create survives a fresh server read');
    assert.equal(childWish.data().by, 'm3');
    assert.equal(childWish.data().boughtAt, '');
    assert.equal(childLetter.exists(), true, 'child letter create survives a fresh server read');
    assert.equal(childLetter.data().createdBy, child.uid);

    const childPatch = await sync.pushPatch({
      prev: {}, next: { missions: [{ ...mission, title: '바꾸려는 이름' }] }, by: child.uid, r: 'child', skipLogs: true,
    });
    assert.equal(childPatch.written.length, 0);
    assert.equal(childPatch.denied[0].collection, 'missions');
    await assert.rejects(
      firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/private/parent_config`)),
      (error) => error.code === 'permission-denied',
    );
    await assert.rejects(
      firestoreSdk.setDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`), {
        totalXp: 999, settledCount: 0, monthly: {}, updatedAt: firestoreSdk.serverTimestamp(),
      }),
      (error) => error.code === 'permission-denied',
    );

    const missionSnap = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/missions/${mission.id}`));
    assert.equal(missionSnap.exists(), true);
    const logResult = await sync.writeLog(mission, { by: child.uid, member: 'm3' });
    assert.equal(logResult.ok, true, JSON.stringify(logResult.error || {}));
    assert.equal(logResult.payload.member, 'm3');
    assert.equal(logResult.payload.bonus, 0);
    assert.equal(logResult.payload.earlyBonus, 0);
    assert.equal(logResult.payload.earned, 5);
    assert.equal(logResult.payload.settled, false);
    if (earlyMission && forgedMission) {
      const earlyLog = await sync.writeLog(earlyMission, { at: earlyAt, by: child.uid, member: 'm3' });
      assert.equal(earlyLog.ok, true, JSON.stringify(earlyLog.error || {}));
      assert.equal(earlyLog.payload.bonus, 0);
      assert.equal(earlyLog.payload.earlyBonus, 2);
      assert.equal(earlyLog.payload.earned, 7);
      const earlyLogRef = firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/${earlyLog.payload.id}`);
      const savedEarlyLog = await firestoreSdk.getDoc(earlyLogRef);
      assert.equal(savedEarlyLog.data().earlyBonus, 2);
      assert.equal(savedEarlyLog.data().earned, 7);

      const forged = sync.buildLogPayload(forgedMission, { at: earlyAt, by: child.uid, member: 'm3' });
      forged.earlyBonus = 1;
      forged.earned = forged.base + 1;
      await assert.rejects(
        firestoreSdk.setDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/${forged.id}`), forged),
        (error) => error.code === 'permission-denied',
        'Firestore rejects an early bonus that disagrees with the fixed tier',
      );
      await firestoreSdk.deleteDoc(earlyLogRef);
      assert.equal((await firestoreSdk.getDoc(earlyLogRef)).exists(), false, 'test early log is removed before settlement');
    }

    await clearSignedInUser();
    const { user: signedInParent } = await createClaimedUser('parent');
    const adultLogId = `${logResult.payload.date}_emulator-adult-mission_m1`;
    await firestoreSdk.setDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/${adultLogId}`), {
      id: adultLogId,
      date: logResult.payload.date,
      at: logResult.payload.at,
      mid: 'emulator-adult-mission',
      title: '어른 미션',
      member: 'm1',
      base: 7,
      bonus: 0,
      earned: 7,
      due: '',
      goalMet: false,
      settled: false,
      createdAt: firestoreSdk.serverTimestamp(),
      createdBy: signedInParent.uid,
    });
    const settlement = await sync.settleUnsettled({ by: signedInParent.uid });
    assert.equal(settlement.ok, true, JSON.stringify(settlement));
    assert.equal(settlement.count, 2);
    assert.equal(settlement.total, 12);

    const summary = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`));
    assert.equal(summary.exists(), true);
    assert.equal(summary.data().totalXp, 5);
    assert.equal(summary.data().settledCount, 2);
    assert.equal(summary.data().byMember.m3, 5);
    assert.equal(summary.data().byMember.m1, 7);
    assert.equal(summary.data().stampProgress, 2);
    assert.equal(summary.data().stampBoardsCompleted, 0);

    const stampMissions = Array.from({ length: 8 }, (_, i) => ({
      id: `emulator-stamp-${i + 1}`,
      title: `도장 테스트 미션 ${i + 1}`,
      points: i % 2 ? 3 : 2,
      due: '',
      bonus: 0,
    }));
    let sevenMissionPoints = 0;
    for (const missionToLog of stampMissions.slice(0, 7)) {
      const created = await sync.writeLog(missionToLog, { by: signedInParent.uid, member: 'm3' });
      assert.equal(created.ok, true, JSON.stringify(created.error || {}));
      sevenMissionPoints += missionToLog.points;
    }
    const nineSettlement = await sync.settleUnsettled({ by: signedInParent.uid });
    assert.equal(nineSettlement.ok, true, JSON.stringify(nineSettlement));
    assert.equal(nineSettlement.count, 7);
    assert.equal(nineSettlement.bonusPoints, 0);
    const atNine = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`));
    assert.equal(atNine.data().stampProgress, 9);
    assert.equal(atNine.data().stampBoardsCompleted, 0);
    assert.equal(atNine.data().totalXp, 5 + sevenMissionPoints);
    assert.equal(atNine.data().byMember.m3, 5 + sevenMissionPoints);

    const tenthLog = await sync.writeLog(stampMissions[7], { by: signedInParent.uid, member: 'm3' });
    assert.equal(tenthLog.ok, true, JSON.stringify(tenthLog.error || {}));
    const tenthSettlement = await sync.settleUnsettled({ by: signedInParent.uid });
    assert.equal(tenthSettlement.ok, true, JSON.stringify(tenthSettlement));
    assert.equal(tenthSettlement.count, 1);
    assert.equal(tenthSettlement.bonusPoints, 3);
    assert.equal(tenthSettlement.boardsCompleted, 1);
    const atTen = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`));
    assert.equal(atTen.data().stampProgress, 0);
    assert.equal(atTen.data().stampBoardsCompleted, 1);
    assert.equal(atTen.data().totalXp, 5 + sevenMissionPoints + stampMissions[7].points + 3);
    assert.equal(atTen.data().byMember.m3, 5 + sevenMissionPoints + stampMissions[7].points + 3);
    assert.equal(atTen.data().byMember.m1, 7);
    assert.equal(atTen.data().monthly[logResult.payload.date.slice(0, 7)].total, 12 + sevenMissionPoints + stampMissions[7].points + 3);

    const adultLogRef = firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/${adultLogId}`);
    const beforeRetry = atTen.data();
    const adultRetry = await sync.writeLog(
      { id: 'emulator-adult-mission', title: '어른 미션', points: 7, due: '', bonus: 0 },
      { by: signedInParent.uid, member: 'm1' },
    );
    assert.equal(adultRetry.ok, false, 'settled adult log cannot be overwritten as unsettled');
    const adultDelete = await sync.deleteLog({ date: logResult.payload.date, mid: 'emulator-adult-mission', member: 'm1', settled: true });
    assert.equal(adultDelete.ok, false, 'settled adult log cannot be deleted');
    const secondSettlement = await sync.settleUnsettled({ by: signedInParent.uid });
    assert.equal(secondSettlement.ok, true);
    assert.equal(secondSettlement.count, 0);
    const afterRetryLog = await firestoreSdk.getDoc(adultLogRef);
    const afterRetrySummary = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`));
    assert.equal(afterRetryLog.data().settled, true);
    assert.equal(afterRetrySummary.data().totalXp, beforeRetry.totalXp);
    assert.equal(afterRetrySummary.data().settledCount, beforeRetry.settledCount);
    assert.deepEqual(afterRetrySummary.data().byMember, beforeRetry.byMember);
    assert.equal(afterRetrySummary.data().stampProgress, 0);
    assert.equal(afterRetrySummary.data().stampBoardsCompleted, 1);

    await clearSignedInUser();
    const { user: childAgain } = await createClaimedUser('child');
    const sharedSummaryOnChild = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`));
    const childStats = computeScreenStats({ summary: sharedSummaryOnChild.data(), logs: [] });
    assert.equal(childStats.stampProgress, 0);
    assert.equal(childStats.stampBoardsCompleted, 1);
    assert.equal(childStats.stampBonusPoints, 3);
    assert.equal(childStats.totalXp, beforeRetry.totalXp);
    const childDelete = await sync.deleteLog({ ...logResult.payload, settled: true });
    assert.equal(childDelete.ok, false);
    assert.equal(childDelete.error.kind, 'settled');
    assert.ok(childAgain.uid);

    await clearSignedInUser();
    const noRole = await adminAuth.createUser({
      email: `no-role-${++serial}@example.test`, password,
    });
    await authSdk.signInWithEmailAndPassword(auth, noRole.email, password);
    const denied = await sync.applyAuthUser(auth.currentUser);
    assert.equal(denied.state, 'denied');
    assert.equal(auth.currentUser, null);
    await assert.rejects(
      firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`)),
      (error) => error.code === 'permission-denied',
    );
  } finally {
    sync.stopAll();
    if (auth.currentUser) await authSdk.signOut(auth);
    await deleteClientApp(clientApp);
    await deleteAdminApp(adminApp);
  }
});
