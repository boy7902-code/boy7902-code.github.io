import test from 'node:test';
import assert from 'node:assert/strict';
import '../streak-core.js';
import {computeScreenStats} from '../firebase-sync.js';
const C=globalThis.FamilyMissionStars;
const holidays={covers:()=>true,isRest:d=>['2026-12-25','2026-11-25'].includes(d)};
const mission={id:'a',member:'m3',days:[]};
const policy=C.observe({}, {date:'2026-11-22',missions:[mission]});
const log=(date,earned=3)=>({id:date+'_a_m3',mid:'a',member:'m3',date,earned,settled:false,createdAt:date+'T08:00:00+09:00'});
const logs=['2026-11-23','2026-11-24','2026-11-26','2026-11-27','2026-11-30'].map(d=>log(d));
test('five scheduled school days skip official holiday/weekend, round 30%, reset immediately',()=>{
 const r=C.compute(policy,{logs,today:'2026-11-30',holidays});assert.equal(r.total,5);assert.equal(r.byMission.a.progress,0);assert.equal(r.byMission.a.completed,1);assert.equal(r.bonuses[0].earnedSum,15);
 assert.deepEqual(C.compute(policy,{logs:[...logs,...logs],today:'2026-11-30',holidays}),r);
 assert.equal(C.compute(policy,{logs:logs.slice(0,-1),today:'2026-11-30',holidays}).byMission.a.progress,4);
 assert.equal(C.compute(policy,{logs:logs.slice(0,-1),today:'2026-12-01',holidays}).byMission.a.progress,0);
 assert.equal(C.compute(policy,{logs:[...logs,log('2026-12-01',2)],today:'2026-12-01',holidays}).byMission.a.progress,1);
});
test('past records do not count, actual earned 3 to 2 does not reprice old cycle, cancellation/recompletion deduplicate',()=>{
 const actual=logs.map((l,i)=>({...l,earned:i<3?3:2}));
 const r=C.compute(policy,{logs:[log('2026-11-20',100),...actual],today:'2026-11-30',holidays});assert.equal(r.total,4);assert.equal(r.bonuses[0].earnedSum,13);
 assert.equal(C.compute(policy,{logs:actual.slice(0,4),today:'2026-11-30',holidays}).total,0);
 assert.equal(C.compute(policy,{logs:[...actual.slice(0,4),actual[4]],today:'2026-11-30',holidays}).total,4);
});
test('scheduled weekday only and forward-only edits survive idle days without reconstructing old schedules',()=>{
 const p=C.observe({}, {date:'2026-11-22',missions:[{...mission,days:[1,3,5]}]});
 const r=C.compute(p,{logs:['2026-11-23','2026-11-27','2026-11-30','2026-12-02','2026-12-04'].map(d=>log(d)),today:'2026-12-04',holidays});assert.equal(r.total,5);
 const edit=C.observe(p,{date:'2026-11-24',missions:[{...mission,days:[2,4]}]});assert.deepEqual(edit.snapshots['2026-11-22'],p.snapshots['2026-11-22']);assert.deepEqual(edit.snapshots['2026-11-25'][0].days,[2,4]);
 const twice=C.observe(edit,{date:'2026-11-24',missions:[{...mission,days:[1,3,5]}]});assert(!twice.snapshots['2026-11-25']);
});
test('month boundaries, zero-earn completions, other actors and bonus records are separated',()=>{
 const r=C.compute(policy,{logs:[...logs,log('2026-12-01',0),{...log('2026-12-02'),member:'m1'},{...log('2026-12-03'),kind:'bonus'}],today:'2026-12-01',holidays});assert.equal(r.total,5);assert.equal(r.byMission.a.progress,1);
 assert.equal(C.compute(policy,{logs,today:'2026-11-30',holidays:{covers:()=>false,isRest:()=>false}}).covered,false);
 const stats=computeScreenStats({logs,missionStars:policy,now:new Date('2026-11-30T12:00:00+09:00'),holidays});assert.equal(stats.totalXp,20);assert.equal(stats.todayXp,8);assert.equal(stats.monthly['2026-11'].total,20);
 const used=computeScreenStats({logs,missionStars:policy,pointUses:[{amount:7}],now:new Date('2026-11-30T12:00:00+09:00'),holidays});assert.equal(used.totalXp,20);assert.equal(used.balance,13);assert.equal(used.partnerXp,20);
});
test('board date and mission payload share five-minute clock, including month/year midnight',()=>{
 const C=globalThis.FamilyBoardClock;
 assert.equal(C.OFFSET_MS,300000);
 for(const [real,board] of [['2026-11-30T23:54:59+09:00','2026-11-30'],['2026-11-30T23:55:00+09:00','2026-12-01'],['2026-12-31T23:55:00+09:00','2027-01-01']]){
  assert.equal(globalThis.FamilyStreak.kstDate(new Date(real)),board);
  const shifted=C.now(+new Date(real));assert.equal(shifted.getTime()-new Date(real).getTime(),300000);
 }
});
