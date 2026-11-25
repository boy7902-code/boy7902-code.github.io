import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'content-validation-'));
const readable=path.join(temp,'app.js');
fs.copyFileSync(path.join(root,'app.js'),readable);
execFileSync('patch',['--silent',readable,path.join(root,'tools/integrated-dex-source.patch')]);
const source=fs.readFileSync(readable,'utf8');
fs.rmSync(temp,{recursive:true,force:true});
const part=source.slice(source.indexOf('  function letterImageSource('),source.indexOf('  const pad',source.indexOf('  function letterImageSource(')));
const context={URL};vm.createContext(context);vm.runInContext(part,context);
test('letter preview accepts raster data images and does not accept remote or other formats',()=>{
 for(const type of ['png','jpeg','webp','gif'])assert.equal(context.letterImageSource('data:image/'+type+';base64,AAAA'),'data:image/'+type+';base64,AAAA');
 for(const value of ['',null,23,'https://example.org/letter.png','data:text/plain;base64,AAAA','data:image/svg+xml;base64,AAAA','data:image/png;base64,not base64','data:image/png;base64,'+'A'.repeat(700000)])assert.equal(context.letterImageSource(value),'');
});
test('saved links are absolute http or https without embedded credentials or control characters',()=>{
 assert.equal(context.savedLinkSource('https://example.org/a?q=family'),'https://example.org/a?q=family');
 assert.equal(context.savedLinkSource('http://example.org/'),'http://example.org/');
 for(const value of ['',null,'about:blank','file:///tmp/letter','/relative','https://name:password@example.org/','https://example.org/\n'])assert.equal(context.savedLinkSource(value),'');
});

test('free-day banner is Saturday only, without changing family state',()=>{
 const banners=[{hidden:true,title:'',querySelector:()=>({textContent:''})}];
 const names=[{textContent:''}];const state={missions:[{id:'keep',doneOn:'2026-11-22'}],logs:[{date:'2026-11-21'}],points:17};
 const c={Date,kidMember:()=>({name:'합성 아이'}),$$:selector=>selector==='.free-day-banner'?banners:names,S:state};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('  function renderFreeDay('),source.indexOf('  /* -------------------------------------------- 대시보드 이름')),c);
 const before=JSON.stringify(state);
 for(const [date,free] of [['2026-11-20',false],['2026-11-21',true],['2026-11-22',false],['2026-11-28',true],['2026-11-29',false]]){
  c.renderFreeDay(new Date(date+'T12:00:00'));assert.equal(banners[0].hidden,!free,date);
  if(free)assert(banners[0].title.includes('토요일'));
 }
 assert.equal(JSON.stringify(state),before);
});

const sortSource=fs.readFileSync(new URL('../selected-dashboard.js',import.meta.url),'utf8');
test('mission display is descending points for incomplete rows, stable ties, completed last in original order',()=>{
 const missions=[{id:'a',points:2},{id:'b',points:9},{id:'c',points:5},{id:'d',points:9},{id:'e',points:20},{id:'f',points:1}];
 const order=new Map(missions.map((m,i)=>[m.id,i])),points=new Map(missions.map(m=>[m.id,m.points]));
 const rows=missions.map(m=>({dataset:{id:m.id},classList:{contains:()=>m.id==='e'||m.id==='f'}}));
 const comparator=sortSource.match(/rows\.slice\(\)\.sort\((\(a,b\)=>[^\n]+)\);/)[1];
 const early=new Map([['d',1]]);
 const special=new Map();
 const sort=new Function('order','points','early','special','return '+comparator)(order,points,early,special);
 const before=JSON.stringify(missions);assert.deepEqual(rows.slice().sort(sort).map(r=>r.dataset.id),['d','b','c','a','e','f']);assert.equal(JSON.stringify(missions),before);
});
test('school card tablet box is invisible without changing its sizing',()=>{
 const css=fs.readFileSync(new URL('../tablet-safe-layout.css',import.meta.url),'utf8');
 assert.match(css,/padding:12px 14px!important;min-height:160px!important;border:1px solid transparent!important;border-radius:0!important;background:none!important;box-shadow:none!important/);
});

test('editing completed mission 3P to 2P keeps earned history and partner XP unchanged',async()=>{
 const mission={id:'frozen',title:'test',points:3,member:'m3',days:[],due:'',doneOn:'2026-11-22',doneAt:'08:00',earned:3,goalMet:false,earlyBonusEarned:0};
 const state={missions:[mission],points:{total:13,byMember:{m3:13}},pokemon:{xp:13},missionLog:[{mid:'frozen',earned:3,base:3,member:'m3',at:'08:00'}]};
 const baseline=JSON.stringify({points:state.points,pokemon:state.pokemon,logs:state.missionLog});let saved=0;
 const c={S:state,askModal:async()=>({title:'test',points:2,member:'m3',days:[],due:'09:00'}),basePtsOf:m=>m.points,missionMemberOptions:()=>[],daysOf:m=>m.days,TIME_QUICK:[],parseDays:d=>d,syncDex:()=>{},save:()=>saved++,renderMissions:()=>{},toast:()=>{}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  async function editMission('),source.indexOf('  async function resetPoints(')),c);await c.editMission('frozen');
 assert.equal(mission.points,2);assert.equal(mission.earned,3);assert.equal(mission.doneAt,'08:00');assert.equal(mission.earlyBonusEarned,0);assert.equal(saved,1);assert.equal(JSON.stringify({points:state.points,pokemon:state.pokemon,logs:state.missionLog}),baseline);
});
test('standby no-photo rest copy is absent and standby household title is Suho',()=>{
 assert.match(source,/if \(\$\('#sbSub'\)\) \$\('#sbSub'\)\.textContent = '';/);
 assert.match(source,/if \(\$\('#sbTitle'\)\) \$\('#sbTitle'\)\.textContent = '수호네';/);
});

test('standby incomplete missions match dashboard priority and preserve completed count',()=>{
 const missions=[{id:'low',points:1},{id:'tie',points:2},{id:'early',points:2,due:'08:00'},{id:'early2',points:2,due:'08:05'},{id:'high',points:3},{id:'done',points:9,doneOn:'2026-11-23'}];
 const c={missions,S:{missions},todayStr:()=> '2026-11-23',isSpecialMissionToday:()=>false,MissionRewards:{maximumEarlyBonus:d=>d?2:0,deadlineOf:m=>m.due},Number};vm.createContext(c);
 const expression=source.match(/const remaining = ([^;]+);/)[1];const before=JSON.stringify(missions);
 assert.deepEqual(Array.from(vm.runInContext(expression,c),m=>m.id),['high','early','early2','tie','low']);
 assert.equal(JSON.stringify(missions),before);
});

 test('stamp reward label shows current per-board 1P, not past cumulative 3P',()=>{
 assert.match(source,/readingReward'\)\.textContent = '10개 완성 보상 \+1P'/);
 assert.doesNotMatch(source,/readingReward'\)\.textContent = `누적/);
 });
