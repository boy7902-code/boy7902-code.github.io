/* Read-only countdown. Its 30-minute display window never changes rewards. */
(function(root){
 'use strict';
 function view(missions,date,nowSeconds,dow,holidays=root.FamilyHolidays){
  const rows=(missions||[]).filter(m=>!m.archived&&(!m.member||m.member==='m3')&&m.doneOn!==date&&(!m.days?.length||m.days.includes(dow))).map(m=>({mission:m,due:root.MissionRewards.deadlineOf(m,date,holidays)})).filter(r=>root.MissionRewards.minuteOf(r.due)!=null).map(r=>({...r,target:root.MissionRewards.minuteOf(r.due)*60}));
  const row=rows.filter(r=>r.target+60>nowSeconds).sort((a,b)=>a.target-b.target||String(a.mission.id).localeCompare(String(b.mission.id)))[0];
  if(!row)return null;
  const remaining=Math.max(0,row.target-nowSeconds),start=Math.max(0,row.target-1800),span=row.target-start;
  const minute=Math.floor(nowSeconds/60),early=root.MissionRewards.earlyBonusOf(row.due,String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'));
  const tierEnd=row.target-(early===2?9:early===1?4:0)*60;
  return {...row,start,remaining,progress:span?Math.max(0,Math.min(100,(nowSeconds-start)/span*100)):100,early,tierRemaining:Math.max(0,tierEnd-nowSeconds)};
 }
 root.FamilyTimeBar=Object.freeze({view});
 if(!root.document)return;
 function install(){
  if(!root.FamilyDashboard)return;
  const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
  function render(){
   const d=root.FamilyBoardClock.now(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),seconds=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();
   const standby=document.getElementById('sbMission');
   if(standby){
    const next=view(FamilyDashboard.state.missions,date,seconds,d.getDay());
    let timer=standby.querySelector('.sb-countdown');
    if(!next){if(timer)timer.remove();}
    else{
     if(!timer){timer=document.createElement('section');timer.className='sb-countdown';timer.setAttribute('aria-label','다음 미션 전체 마감까지 남은 시간');timer.innerHTML='<div class="sb-countdown-heading"><span class="sb-countdown-title"></span><span class="sb-countdown-due"></span></div><b class="sb-countdown-time"></b>';standby.prepend(timer);}
     timer.classList.toggle('soon',next.remaining<=300);
     timer.querySelector('.sb-countdown-title').textContent=next.mission.title;
     timer.querySelector('.sb-countdown-due').textContent=next.due+' 마감';
     timer.querySelector('.sb-countdown-time').textContent=fmt(next.remaining)+' 남음';
    }
   }
   for(const card of document.querySelectorAll('#choreList>.chore')){
    const mission=FamilyDashboard.state.missions.find(m=>m.id===card.dataset.id);
    if(!mission)continue;
    let bar=card.querySelector('.mission-card-timebar');
    const r=view([mission],date,seconds,d.getDay());
    if(!r){if(bar)bar.remove();card.classList.remove('has-timebar');continue;}
    if(!bar){bar=document.createElement('section');bar.className='mission-card-timebar';bar.setAttribute('aria-label','미션 목표시간');bar.innerHTML='<div class="timebar-bonus-time"></div><div class="timebar-track" role="progressbar" aria-label="목표 전 30분 경과" aria-valuemin="0" aria-valuemax="100"><i class="timebar-fill"></i><i class="timebar-mark two"></i><i class="timebar-mark one"></i></div><div class="timebar-tier"></div>';card.querySelector('.chore-main').append(bar);}
    bar.classList.toggle('soon',r.remaining<=300);
    bar.querySelector('.timebar-track').setAttribute('aria-valuetext',fmt(r.remaining)+' 남음');
    bar.querySelector('.timebar-bonus-time').textContent=fmt(r.remaining)+' 남음';
    bar.querySelector('.timebar-bonus-time').hidden=false;
    bar.querySelector('.timebar-tier').textContent=r.early?'조기 +'+r.early+'P':'기본 포인트 적립';
    bar.querySelector('.timebar-fill').style.width=r.progress+'%';bar.querySelector('.timebar-track').setAttribute('aria-valuenow',String(Math.round(r.progress)));
    card.classList.add('has-timebar');
   }
  }
  render();root.setInterval(render,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 }
 if(document.readyState==='complete')install();else root.addEventListener('load',install,{once:true});
})(globalThis);
