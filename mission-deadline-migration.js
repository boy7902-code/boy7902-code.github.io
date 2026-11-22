/* One explicitly approved household migration. It never edits or deletes a log. */
(function(root){
 'use strict';
 const nextDate=d=>{const n=new Date(d+'T12:00:00Z');n.setUTCDate(n.getUTCDate()+1);return n.toISOString().slice(0,10);};
 function prepare({missions,missionStars,date,holidayData}){
  if(!root.FamilyStreak.validDate(date)||!root.FamilyHolidays.valid(holidayData))throw Error('Invalid date or official holiday data');
  const next=JSON.parse(JSON.stringify(missions)),pairs=[['ms-bab','ms-bab-we','07:15','08:00',[]],['ms-morning-study','fnlwnprw','08:05','08:30',[0,1,2,3,4,5]]];
  const policy=root.FamilyMissionStars.normalize(missionStars);
  for(const [id,old,due,weekendDue,days] of pairs){
   const active=next.find(m=>m.id===id),archived=next.find(m=>m.id===old);
   if(!active||!archived)throw Error('Expected mission missing');
   if(archived.doneOn===date)throw Error('Archived source completed today; manual review required');
   Object.assign(active,{points:2,due,weekendDue,days,mergedFrom:[...new Set([...(active.mergedFrom||[]),old])]});
   Object.assign(archived,{archived:true,mergedInto:id});
   policy.merges=policy.merges||[];
   if(!policy.merges.some(m=>m.from===old&&m.to===id))policy.merges.push({date:nextDate(date),from:old,to:id});
  }
  // Today's snapshot and completed earnings are immutable; the merged schedule starts tomorrow.
  policy.snapshots[nextDate(date)]=root.FamilyMissionStars.schedule(next);
  const holidayCalendar={years:Object.keys(holidayData.years),dates:Object.values(holidayData.years).flat().map(r=>r.date),holidayData};
  return {missions:next,missionStars:policy,holidayCalendar};
 }
 root.FamilyDeadlineMigration=Object.freeze({prepare});
})(globalThis);

(function(root){
 if(!root.document)return;
 let busy=false,lastCalendar='';
 async function holidaySync(){
  const boot=root.FamilySyncBoot;if(!boot?.auth?.currentUser||!root.FamilyDashboard?.state?.missions.some(m=>m.weekendDue))return;
  try{const data=await fetch('data/kr-holidays.json',{cache:'no-cache'}).then(r=>r.json());if(lastCalendar===data.checkedAt)return;const out=await boot.sync.pushHolidayCalendar(data);if(out.ok)lastCalendar=data.checkedAt;}catch(_){}
 }
 function install(){
  const host=document.querySelector('.display-menu-controls');if(!host)return;
  const button=document.createElement('button');button.className='btn parent-only';button.id='migrateMissionDeadlines';button.textContent='승인한 평일·주말 미션 통합 적용';
  button.addEventListener('click',async()=>{
   if(busy)return;busy=true;button.disabled=true;
   try{const data=await fetch('data/kr-holidays.json',{cache:'no-cache'}).then(r=>r.json());const out=await root.FamilySyncBoot.sync.migrateMissionDeadlines({holidayData:data});button.textContent=out.ok?'미션 통합 적용 완료':'통합 실패 · 새로고침 후 확인';if(out.ok)button.hidden=true;}finally{busy=false;button.disabled=false;}
  });host.append(button);
  root.setInterval(()=>{const pair=root.FamilyDashboard?.state?.missions.filter(m=>['ms-bab-we','fnlwnprw'].includes(m.id));button.hidden=pair?.length===2&&pair.every(m=>m.archived);},1000);
  holidaySync();root.addEventListener('family-holidays-ready',holidaySync);
 }
 if(document.readyState==='complete')install();else root.addEventListener('load',install,{once:true});
})(globalThis);
