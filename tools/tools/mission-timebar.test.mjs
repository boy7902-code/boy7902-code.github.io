import test from 'node:test';import assert from 'node:assert/strict';import '../mission-rewards.js';import '../mission-timebar.js';
const mission={id:'m',title:'밥',member:'m3',points:2,due:'07:15',days:[]};const day='2026-11-23';const secs=s=>MissionRewards.minuteOf(s)*60;
test('countdown and early tier use the same existing minute-based cutoffs',()=>{
 for(const [time,seconds,bonus,left] of [['07:03',0,2,180],['07:05',59,2,1],['07:06',0,1,300],['07:10',59,1,1],['07:11',0,0,240]]){
  const r=FamilyTimeBar.view([mission],day,secs(time)+seconds,1);assert.equal(r.early,bonus);assert.equal(r.tierRemaining,left);
 }
 assert.equal(FamilyTimeBar.view([mission],day,secs('06:30'),1).progress,0);assert.equal(FamilyTimeBar.view([mission],day,secs('07:03'),1).progress,60);assert.equal(FamilyTimeBar.view([mission],day,secs('07:16'),1),null);
});
test('completion, archive, off-day exclusion, holiday selection and automatic next target',()=>{
 const later={...mission,id:'later',due:'08:05'};
 assert.equal(FamilyTimeBar.view([{...mission,doneOn:day},later],day,secs('07:03'),1).mission.id,'later');
 assert.equal(FamilyTimeBar.view([{...mission,archived:true}],day,secs('07:03'),1),null);
 assert.equal(FamilyTimeBar.view([{...mission,days:[0]}],day,secs('07:03'),1),null);
 assert.equal(FamilyTimeBar.view([{...mission,weekendDue:'08:00'}],'2026-11-22',secs('07:03'),0).due,'08:00');
});
