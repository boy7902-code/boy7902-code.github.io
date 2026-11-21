import test from 'node:test';import assert from 'node:assert/strict';import '../partner-growth-core.js';
const c=globalThis.PartnerGrowthCore;
test('legacy partner remains hatched at0/4XP',()=>{for(const xp of [0,1,4]){assert.equal(c.isEgg(null,xp),false);assert.deepEqual(c.transition(null,0,xp),{state:null,event:null});}});
test('new cycle hatches exactly once at5XP without owning points',()=>{let s=c.adopt('cycle-1');assert(c.isEgg(s,0));assert(c.isEgg(s,4));let r=c.transition(s,4,5);assert.equal(r.event,'hatch');assert(r.state.hatched);assert.equal(c.transition(r.state,5,8).event,null);assert.equal(c.transition(r.state,5,5).event,null);assert.deepEqual(Object.keys(r.state),['cycleId','hatched','celebrated']);});
test('crossing5inonejump hatches once',()=>{let r=c.transition(c.adopt('jump'),0,100);assert.equal(r.event,'hatch');assert(r.state.hatched);});
test('undo exception requires explicit decision',()=>{let s=c.transition(c.adopt('undo'),4,5).state;assert.equal(c.transition(s,5,3).unresolved,'hatch-undo-policy');assert(s.hatched);});
test('optional policies do not replay celebration',()=>{let s=c.transition(c.adopt('undo'),4,5).state;assert.equal(c.transition(s,5,3,'keep-hatched').state.hatched,true);let r=c.transition(s,5,3,'return-to-egg');assert.equal(r.state.hatched,false);assert.equal(c.transition(r.state,3,5,'return-to-egg').event,null);});
test('serialized state retains cycle and hatch, missing legacy defaults safe',()=>{let s=c.transition(c.adopt('sync-cycle'),0,5).state;assert.deepEqual(c.normalized(JSON.parse(JSON.stringify(s))),s);assert.equal(c.normalized({}),null);assert.notEqual(c.adopt('next').cycleId,s.cycleId);});

import {migrateFromLegacyJson,computeScreenStats,docsToState} from '../firebase-sync.js';
test('migration retains legacy current XP and new explicit egg/cycle without points loss',()=>{
 for(const xp of [0,4,40,90,200]){
  const input={points:{byMember:{m3:550}},pokemon:{key:'pikachu',xp},logs:[]};
  const plan=migrateFromLegacyJson(input);assert.equal(plan.partner.growth,undefined);
  assert.equal(computeScreenStats({summary:plan.summary,partner:plan.partner,logs:[]}).partnerXp,xp);
  assert.equal(plan.summary.totalXp,550);
 }
 const growth=c.adopt('migration-cycle');const plan=migrateFromLegacyJson({points:{byMember:{m3:550}},pokemon:{key:'turtwig',xp:4,growth}});
 assert.deepEqual(plan.partner.growth,growth);assert.equal(plan.partner.sinceXp,546);
 assert.deepEqual(docsToState({partner:plan.partner}).partner.growth,growth);
});
