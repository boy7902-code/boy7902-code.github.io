import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import * as authSdk from 'firebase/auth';
import * as firestoreSdk from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { computeScreenStats, createFamilySync, migrateFromLegacyJson, FAMILY_ROOT } from '../firebase-sync.js';

const PROJECT_ID = 'demo-family-dashboard';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
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
firestoreSdk.connectFirestoreEmulator(db, FIRESTORE_EMULATOR.split(':')[0], Number(FIRESTORE_EMULATOR.split(':')[1]));
const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'family-dashboard-emulator-admin');
const adminAuth = getAdminAuth(adminApp);
const sdk = { ...authSdk, ...firestoreSdk };
const sync = createFamilySync({ sdk, auth, db });
let serial = 0;
function kstMinuteNow() {
  const now = new Date(Date.now() + (9 * 60 + 5) * 60 * 1000);
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

test('Auth + Firestore emulator enforces family roles and automatically derives mission and stamp earnings', async () => {
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

    const parentPermissionLog = firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/parent-permission-check`);
    await firestoreSdk.setDoc(parentPermissionLog, { id: 'parent-permission-check', title: 'before', settled: true });
    await firestoreSdk.updateDoc(parentPermissionLog, { title: 'parent edited', settled: false, parentEditAllowed: true });
    const editedParentLog = await firestoreSdk.getDoc(parentPermissionLog);
    assert.equal(editedParentLog.data().title, 'parent edited', 'parent retains existing permission to edit any mission log');
    assert.equal(editedParentLog.data().parentEditAllowed, true);
    await firestoreSdk.deleteDoc(parentPermissionLog);
    assert.equal((await firestoreSdk.getDoc(parentPermissionLog)).exists(), false, 'parent retains existing permission to delete any mission log');

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
    assert.equal(logResult.payload.at,hhmmOfMinute(kstMinuteNow()),'completion time matches the five-minutes-fast board');
    if(kstMinuteNow()<1438){
      const future=sync.buildLogPayload(mission,{at:hhmmOfMinute(kstMinuteNow()+2),by:child.uid,member:'m3'});
      future.mid='future-time';future.id=future.date+'_future-time_m3';
      await assert.rejects(()=>firestoreSdk.setDoc(firestoreSdk.doc(db,`${FAMILY_ROOT}/logs/${future.id}`),future),e=>e.code==='permission-denied');
    }
    assert.equal((await sync.observeMissionStars({date:logResult.payload.date,missions:[mission]})).ok,false,'child cannot change schedules');
    await assert.rejects(()=>firestoreSdk.setDoc(firestoreSdk.doc(db,`${FAMILY_ROOT}/child_state/mission_stars`),{forged:true}),e=>e.code==='permission-denied');

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
    const summaryRef=firestoreSdk.doc(db, `${FAMILY_ROOT}/stats/summary`);
    const readAuto=async()=>{
      const snap=await firestoreSdk.getDoc(summaryRef);
      const all=await firestoreSdk.getDocs(firestoreSdk.collection(db,`${FAMILY_ROOT}/logs`));
      return computeScreenStats({summary:snap.exists()?snap.data():{},logs:all.docs.map(d=>({...d.data(),id:d.id}))});
    };
    const beforeSummary=await firestoreSdk.getDoc(summaryRef);
    const retired=await sync.settleUnsettled({by:signedInParent.uid});
    assert.equal(retired.code,'earnings-auto');assert.equal(retired.ok,false);
    assert.deepEqual((await firestoreSdk.getDoc(summaryRef)).data(),beforeSummary.data());
    const firstAuto=await readAuto();assert.equal(firstAuto.totalXp,5);assert.equal(firstAuto.byMember.m1,7);assert.equal(firstAuto.stampProgress,2);
    const stampMissions = Array.from({length:8},(_,i)=>({id:`emulator-stamp-${i+1}`,title:`도장 테스트 미션 ${i+1}`,points:i%2?3:2,due:'',bonus:0}));
    let sevenMissionPoints=0;
    for(const m of stampMissions.slice(0,7)){const r=await sync.writeLog(m,{by:signedInParent.uid,member:'m3'});assert.equal(r.ok,true);sevenMissionPoints+=m.points;}
    const nineAuto=await readAuto();assert.equal(nineAuto.stampProgress,9);assert.equal(nineAuto.stampBoardsCompleted,0);assert.equal(nineAuto.totalXp,5+sevenMissionPoints);
    const tenthLog=await sync.writeLog(stampMissions[7],{by:signedInParent.uid,member:'m3'});assert.equal(tenthLog.ok,true);
    const tenAuto=await readAuto();assert.equal(tenAuto.stampProgress,0);assert.equal(tenAuto.stampBoardsCompleted,1);assert.equal(tenAuto.stampBonusPending,0);assert.equal(tenAuto.totalXp,5+sevenMissionPoints+stampMissions[7].points+3);
    const cancel=await sync.deleteLog(tenthLog.payload);assert.equal(cancel.ok,true);assert.equal((await readAuto()).totalXp,nineAuto.totalXp);assert.equal((await readAuto()).stampProgress,9);
    const recreated=await sync.writeLog(stampMissions[7],{by:signedInParent.uid,member:'m3'});assert.equal(recreated.ok,true);assert.equal((await readAuto()).totalXp,tenAuto.totalXp);
    // Emulator-only historical fixture verifies compatibility with old archived summaries.
    // Production migration and settlement are never invoked by this test.
    const allForFixture=await firestoreSdk.getDocs(firestoreSdk.collection(db,`${FAMILY_ROOT}/logs`));
    for(const doc of allForFixture.docs)await firestoreSdk.updateDoc(doc.ref,{settled:true});
    await firestoreSdk.setDoc(summaryRef,{totalXp:tenAuto.totalXp,byMember:tenAuto.byMember,monthly:tenAuto.monthly,settledCount:10,stampProgress:0,stampBoardsCompleted:1,updatedAt:firestoreSdk.serverTimestamp()});
    const atTen=await firestoreSdk.getDoc(summaryRef);
    const streakResult = await sync.observeStreak({ date: logResult.payload.date, required: [mission.id], logs: [] });
    assert.equal(streakResult.ok, true, JSON.stringify(streakResult.error));
    assert.deepEqual(streakResult.data.days[logResult.payload.date].done, [mission.id]);
    const streakSecond = await sync.observeStreak({ date: logResult.payload.date, required: ['edited-target'] });
    assert.deepEqual(streakSecond.data.days[logResult.payload.date].required, [mission.id]);

    const adultLogRef = firestoreSdk.doc(db, `${FAMILY_ROOT}/logs/${adultLogId}`);
    const beforeRetry = atTen.data();
    const secondSettlement = await sync.settleUnsettled({ by: signedInParent.uid });
    assert.equal(secondSettlement.ok, false);
    assert.equal(secondSettlement.code,'earnings-auto');
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
    const streakOnChild = await firestoreSdk.getDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/child_state/mission_streak`));
    assert.deepEqual(streakOnChild.data().days[logResult.payload.date].required, [mission.id]);
    const childStreak = await sync.observeStreak({ date: logResult.payload.date, required: ['forged'] });
    assert.equal(childStreak.ok, false);
    await assert.rejects(() => firestoreSdk.setDoc(firestoreSdk.doc(db, `${FAMILY_ROOT}/child_state/mission_streak`), { forged: true }));
    const childDelete = await sync.deleteLog({ ...logResult.payload, settled: true });
    assert.equal(childDelete.ok, false);
    assert.equal(childDelete.error.kind, 'settled');
    assert.ok(childAgain.uid);
    const partnerRef = firestoreSdk.doc(db, `${FAMILY_ROOT}/child_state/partner`);
    assert.equal((await sync.adoptPartner({ key:'pikachu', sinceXp:0 })).ok,true);
    assert.equal((await firestoreSdk.getDoc(partnerRef)).data().growth,undefined,'legacy missing state stays legacy');
    const egg={cycleId:'emulator-cycle-1',hatched:false,celebrated:false};
    assert.equal((await sync.adoptPartner({key:'pikachu',sinceXp:0,growth:egg})).ok,true);
    const claims=await Promise.all([sync.claimPartnerHatch({cycleId:egg.cycleId}),sync.claimPartnerHatch({cycleId:egg.cycleId})]);
    assert.equal(claims.filter(x=>x.ok&&x.claimed).length,1,'one concurrent visual claim');
    assert.deepEqual((await firestoreSdk.getDoc(partnerRef)).data().growth,{...egg,hatched:true,celebrated:true});
    await assert.rejects(()=>firestoreSdk.updateDoc(partnerRef,{growth:egg,updatedAt:firestoreSdk.serverTimestamp()}),e=>e.code==='permission-denied','same cycle cannot revert hatch');
    const next={cycleId:'emulator-cycle-2',hatched:false,celebrated:false};
    assert.equal((await sync.adoptPartner({key:'pikachu',sinceXp:200,growth:next})).ok,true,'same species new cycle persisted');
    assert.equal((await sync.claimPartnerHatch({cycleId:egg.cycleId})).claimed,false,'stale device cannot hatch next egg');
    assert.deepEqual((await firestoreSdk.getDoc(partnerRef)).data().growth,next);
    const oldChildWrite=await sync.adoptPartner({key:'riolu',sinceXp:200});
    assert.equal(oldChildWrite.ok,false,'old child client cannot erase explicit cycle');
    assert.deepEqual((await firestoreSdk.getDoc(partnerRef)).data().growth,next);

    await clearSignedInUser();
    await createClaimedUser('parent');
    const starsJournal=await sync.observeMissionStars({date:logResult.payload.date,missions:[mission]});
    assert.equal(starsJournal.ok,true);
    assert.equal((await firestoreSdk.getDoc(firestoreSdk.doc(db,`${FAMILY_ROOT}/child_state/mission_stars`))).data().started,logResult.payload.date);
    const beforeOldParent=(await firestoreSdk.getDoc(partnerRef)).data();
    await assert.rejects(()=>firestoreSdk.setDoc(partnerRef,{restoreIntent:firestoreSdk.serverTimestamp()}),e=>e.code==='permission-denied','empty explicit restore denied');
    await assert.rejects(()=>firestoreSdk.setDoc(partnerRef,{partnerKey:'pikachu',sinceXp:-1,restoreIntent:firestoreSdk.serverTimestamp(),updatedAt:firestoreSdk.serverTimestamp()}),e=>e.code==='permission-denied','invalid explicit restore denied');
    const oldParentWrite=await sync.adoptPartner({key:'riolu',sinceXp:200});
    assert.equal(oldParentWrite.ok,false,'old parent cannot erase explicit growth');
    assert.deepEqual((await firestoreSdk.getDoc(partnerRef)).data().growth,next,'old parent cycle preserved');
    await firestoreSdk.setDoc(partnerRef,{...beforeOldParent,updatedAt:firestoreSdk.serverTimestamp()});
    const backup=await sync.createBackup();
    assert.equal(backup.skipped,false);
    const partnerBackup=backup.chunks.flatMap(c=>c.records).find(r=>r.path===`${FAMILY_ROOT}/child_state/partner`);
    assert.deepEqual(partnerBackup.data.growth,next,'backup includes explicit egg cycle');
    await firestoreSdk.updateDoc(partnerRef,{growth:{...next,hatched:true,celebrated:true},updatedAt:firestoreSdk.serverTimestamp()});
    const restored=await sync.restoreBackup(backup);
    assert.equal(restored.ok,true,JSON.stringify(restored));
    assert.deepEqual((await firestoreSdk.getDoc(partnerRef)).data().growth,next,'parent restore returns exact saved egg state');
    await assert.rejects(()=>firestoreSdk.updateDoc(partnerRef,{growth:firestoreSdk.deleteField(),updatedAt:firestoreSdk.serverTimestamp()}),e=>e.code==='permission-denied','stored restore marker cannot authorize later old update');
    assert.equal((await sync.adoptPartner({key:'pikachu',sinceXp:200,growth:{...next,cycleId:'parent-new-cycle'}})).ok,true,'new parent readoption still works');
    assert.equal((await sync.restoreBackup(backup)).ok,true,'explicit parent restore after new adoption still works');
    const migration=migrateFromLegacyJson({points:{byMember:{m3:550}},pokemon:{key:'turtwig',xp:4,growth:next},letters:[],logs:[]},{stamp:firestoreSdk.serverTimestamp()});
    const migrationResult=await sync.applyMigration(migration);
    assert.equal(migrationResult.ok,true,JSON.stringify(migrationResult));
    const importedPartner=(await firestoreSdk.getDoc(partnerRef)).data();
    const importedSummary=(await firestoreSdk.getDoc(firestoreSdk.doc(db,`${FAMILY_ROOT}/stats/summary`))).data();
    assert.deepEqual(importedPartner.growth,next);
    assert.equal(computeScreenStats({summary:importedSummary,partner:importedPartner,logs:[]}).partnerXp,4);
    assert.equal(importedSummary.totalXp,550);
    const legacyImport=migrateFromLegacyJson({points:{byMember:{m3:550}},pokemon:{key:'turtwig',xp:4},letters:[],logs:[]},{stamp:firestoreSdk.serverTimestamp()});
    assert.equal((await sync.applyMigration(legacyImport)).ok,true,'explicit legacy import remains available');
    assert.equal((await firestoreSdk.getDoc(partnerRef)).data().growth,undefined);
    assert.equal((await sync.restoreBackup(backup)).ok,true);



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
