import test from 'node:test';
import assert from 'node:assert/strict';
import '../dashboard-insights.js';
const {weekly,estimate}=globalThis.FamilyDashboardInsights;
test('week summary reads stored amounts without changing logs and separates bonus count',()=>{
 const logs=[{date:'2026-11-16',earned:18},{date:'2026-11-17',earned:24},{date:'2026-11-18',earned:16},{date:'2026-11-19',earned:21},{date:'2026-11-20',earned:23},{date:'2026-11-20',earned:3,kind:'bonus'},{date:'2026-11-21',earned:900},{date:'2026-11-20',earned:-6},{date:'invalid',earned:8}];
 const before=JSON.stringify(logs),s=weekly(logs,'2026-11-20');
 assert.deepEqual(s.days.map(d=>d.points),[18,24,16,21,26,0,0]);assert.equal(s.total,105);assert.equal(s.earningDays,5);assert.equal(s.average,21);assert.equal(s.count,6);assert.equal(JSON.stringify(logs),before);
 assert.equal(estimate(138,s.average),7);
});
test('month/year edges and empty history do not invent days or ETA',()=>{
 const s=weekly([], '2027-01-01');assert.equal(s.days[0].date,'2026-12-28');assert.equal(s.days[6].date,'2027-01-03');assert.equal(s.average,0);assert.equal(estimate(10,0),null);assert.equal(estimate(0,0),0);
});
test('28-day earnings window excludes older history and non-finite values',()=>{
 const s=weekly([{date:'2026-10-23',earned:100},{date:'2026-10-24',earned:10},{date:'2026-11-20',earned:20},{date:'2026-11-20',earned:Infinity}], '2026-11-20');assert.equal(s.earningDays,2);assert.equal(s.average,15);assert.equal(s.total,20);
});
