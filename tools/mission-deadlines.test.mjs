import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../mission-rewards.js';
import '../holiday-core.js';
import '../streak-core.js';
import '../mission-deadline-migration.js';
import {missionDocOf,createFamilySync} from '../firebase-sync.js';
const holidays=JSON.parse(fs.readFileSync(new URL('../data/kr-holidays.json',import.meta.url)));
globalThis.FamilyHolidays.install(holidays);
const m={id:'test',points:2,due:'07:15',weekendDue:'08:00'};
test('weekday, Saturday, Sunday and official holiday select one common deadline',()=>{
 for(const [date,due] of [['2026-11-23','07:15'],['2026-11-21','08:00'],['2026-11-22','08:00'],['2026-12-25','08:00']]){
  assert.equal(MissionRewards.deadlineOf(m,date),due);
  const sync=createFamilySync({sdk:{serverTimestamp:()=>''},auth:{},db:{}});
  const log=sync.buildLogPayload(m,{date,at:'07:55',member:'m3',by:'x'});
  assert.equal(log.due,due);assert.equal(log.earlyBonus,due==='08:00'?1:0);
 }
 assert.equal(MissionRewards.deadlineOf({...m,weekendDue:''},'2026-11-22'),'07:15');
 assert.equal(missionDocOf(m).weekendDue,'08:00');
});
test('approved migration archives definitions and carries fragments without touching previous earnings',()=>{
 const missions=[{id:'ms-bab',days:[1,2,3,4,5],member:'m3',points:2},{id:'ms-bab-we',days:[0,6],member:'m3',points:3},{id:'ms-morning-study',days:[1,2,3,4,5],member:'m3',points:1},{id:'fnlwnprw',days:[0],member:'m3',points:2}];
 const policy=FamilyMissionStars.observe({}, {date:'2026-11-22',missions});
 const logs=[{date:'2026-11-22',mid:'ms-bab-we',member:'m3',earned:3},{date:'2026-11-22',mid:'fnlwnprw',member:'m3',earned:2}];
 const source=JSON.stringify({missions,policy,logs});
 const out=FamilyDeadlineMigration.prepare({missions,missionStars:policy,date:'2026-11-23',holidayData:holidays});
 const view=FamilyMissionStars.compute(out.missionStars,{logs,today:'2026-11-24'});
 assert.equal(view.byMission['ms-bab'].progress,1);assert.equal(view.byMission['ms-morning-study'].progress,1);assert.equal(view.total,0);
 assert.equal(JSON.stringify({missions,policy,logs}),source);
 assert.deepEqual(out.missions[2].days,[0,1,2,3,4,5]);assert.equal(out.missions[1].archived,true);
 assert.deepEqual(out.missionStars.snapshots['2026-11-22'],policy.snapshots['2026-11-22']);
 const done={...missions[0],doneOn:'2026-11-23',earned:4,doneAt:'07:05'};const kept=FamilyDeadlineMigration.prepare({missions:[done,...missions.slice(1)],missionStars:policy,date:'2026-11-23',holidayData:holidays});assert.equal(kept.missions[0].earned,4);assert.equal(kept.missions[0].doneOn,'2026-11-23');assert.deepEqual(kept.missionStars.snapshots['2026-11-22'],policy.snapshots['2026-11-22']);
});

test('fragment merge keeps historical completed-star bonus stable',()=>{
 const old={id:'ms-bab-we',member:'m3',days:[0,6]},active={id:'ms-bab',member:'m3',days:[1,2,3,4,5]};
 const raw={started:'2026-11-22',snapshots:{'2026-11-22':[old,active],'2026-12-01':[active]},merges:[{date:'2026-12-01',from:old.id,to:active.id}]};
 const logs=['2026-11-22','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27'].map(date=>({mid:old.id,date,member:'m3',earned:3}));
 const before=FamilyMissionStars.compute({...raw,merges:[]},{logs,today:'2026-11-30'});
 const after=FamilyMissionStars.compute(raw,{logs,today:'2026-12-01'});
 assert.deepEqual(after.bonuses,before.bonuses);assert.equal(after.total,before.total);assert.equal(after.byMission[active.id].progress,1);
});
