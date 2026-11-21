import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFamilySync} from '../firebase-sync.js';
const boot=fs.readFileSync(new URL('../firebase-boot.js',import.meta.url),'utf8');
const parser=boot.slice(boot.indexOf('function parseOAuthHash()'),boot.indexOf('/* 연결 실패'));
function parse(saved,state,unavailable=false){
 let removed=false,cleared=false;
 const c={window:{location:{hash:'#access_token=synthetic-review-token&expires_in=3600'+(state?'&state='+state:'')}},sessionStorage:{getItem:()=>{if(unavailable)throw Error('unavailable');return saved},removeItem:()=>{removed=true}},OAUTH_STATE_KEY:'review',history:{replaceState:()=>{cleared=true}},URLSearchParams,Date,TOKEN_MARGIN_MS:60000};
 vm.createContext(c);const result=vm.runInContext(parser+';parseOAuthHash()',c);return{result,removed,cleared};
}
test('calendar response requires both matching request and response states',()=>{
 assert.equal(parse('expected','expected').result.ok,true);
 for(const [saved,state] of [['expected','different'],['expected',''],['','injected'],['','']]){
  const {result,removed,cleared}=parse(saved,state);assert.equal(result.ok,false);assert.equal(result.code,'oauth/state-mismatch');assert(removed&&cleared);
 }
 assert.equal(parse('expected','expected',true).result.ok,false);
});
test('calendar state is single use',()=>{const a=parse('expected','expected');assert(a.result.ok&&a.removed);assert.equal(parse('','expected').result.ok,false)});
test('cloud backup includes all four shared settings and restores by merging without deleting extra records',async()=>{
 const root='households/main';
 const shared={today_school:{name:'Synthetic School',byDate:{'2026-11-22':{meal:'Synthetic meal'}}},event_center:{synthetic:true},custom_alarms:{alarms:[{id:'synthetic',time:'08:00'}]},mission_streak:{count:7}};
 const docs=new Map(Object.entries(shared).map(([k,v])=>[root+'/child_state/'+k,v]));
 docs.set(root+'/events/extra',{id:'extra',title:'Extra event'});
 const sdk={collection:(_db,path)=>({path}),doc:(_db,path)=>({path}),serverTimestamp:()=>0,getDocs:async r=>({docs:[...docs].filter(([p])=>p.startsWith(r.path+'/')&&!p.slice(r.path.length+1).includes('/')).map(([path,data])=>({id:path.split('/').pop(),data:()=>data}))}),getDoc:async r=>({exists:()=>docs.has(r.path),data:()=>docs.get(r.path)}),setDoc:async(r,d)=>docs.set(r.path,d)};
 const user={uid:'synthetic-parent',getIdTokenResult:async()=>({claims:{role:'parent'}})};
 const sync=createFamilySync({sdk,db:{},auth:{currentUser:user}});await sync.applyAuthUser(user);
 const backup=await sync.createBackup();assert.equal(backup.skipped,false);
 const paths=backup.chunks.flatMap(c=>c.records.map(r=>r.path));
 for(const key of Object.keys(shared)){assert(paths.includes(root+'/child_state/'+key));docs.set(root+'/child_state/'+key,{changed:true})}
 docs.set(root+'/events/after-backup',{id:'after-backup',title:'Added after backup'});
 const restored=await sync.restoreBackup(backup);assert.equal(restored.ok,true);
 for(const [key,value] of Object.entries(shared))assert.deepEqual(docs.get(root+'/child_state/'+key),value);
 assert(docs.has(root+'/events/after-backup'));
});
test('active backup dialog describes a non-destructive merge',()=>{
 const active=fs.readFileSync(new URL('../app-dex-integrated.js',import.meta.url),'utf8');
 assert(active.includes('백업에 없는 현재 기록은 그대로 남아요.'));assert(!active.includes('지금 기록 중 덮어쓰이지 않은 것은 남지 않아요.'));
});
