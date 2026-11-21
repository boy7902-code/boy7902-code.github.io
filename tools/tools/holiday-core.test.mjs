import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../holiday-core.js';
import '../streak-core.js';
const H=globalThis.FamilyHolidays,S=globalThis.FamilyStreak;
const data=JSON.parse(fs.readFileSync(new URL('../data/kr-holidays.json',import.meta.url)));
test('official complete years validate and invalid/older lists never replace last good data',()=>{
 assert.equal(H.install(data),true);assert.ok(H.name('2026-12-25'));assert.equal(H.covers('2027-01-01'),true);
 assert.equal(H.install({...data,years:{}}),false);assert.ok(H.name('2026-12-25'));
 assert.equal(H.install({...data,checkedAt:'2020-01-01T00:00:00Z'}),false);
 assert.equal(H.valid({...data,years:{2026:[{date:'2026-02-30',name:'bad'}]}}),false);
});
test('weekends and official public holidays are exempt, weekdays are not',()=>{
 H.install(data);assert.equal(H.isRest('2026-12-25'),true);assert.equal(H.isRest('2026-12-26'),true);assert.equal(H.isRest('2026-12-27'),true);assert.equal(H.isRest('2026-12-24'),false);
});
test('unobserved holiday and weekend keep a weekday streak without changing journal',()=>{
 H.install(data);let j=S.observe({}, {date:'2026-12-24',required:['a'],logs:[{date:'2026-12-24',mid:'a',member:'m3'}]});
 j=S.observe(j,{date:'2026-12-28',required:['a'],logs:[{date:'2026-12-28',mid:'a',member:'m3'}],monthStart:'2026-12-28'});
 const before=JSON.stringify(j);assert.equal(S.status(j,'2026-12-28').count,2);assert.equal(S.status(j,'2026-12-28').gap,false);assert.equal(JSON.stringify(j),before);
});
test('observed holiday/weekend with stale skip=false does not break or add to streak',()=>{
 H.install(data);const days={};for(const date of ['2026-12-24','2026-12-25','2026-12-26','2026-12-27','2026-12-28'])days[date]={required:['a'],done:date==='2026-12-24'||date==='2026-12-28'?['a']:[],skip:false,finalized:true};
 const j={started:'2026-12-24',days};const before=JSON.stringify(j);assert.equal(S.status(j,'2026-12-28').count,2);assert.equal(JSON.stringify(j),before);
});
