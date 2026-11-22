/* Read-only home entry points reuse the existing calendar and records. */
(()=>{
 'use strict';
 function install(){
  if(!window.FamilyRefresh||!window.FamilyDashboard)return;
  const grid=document.querySelector('#mainGrid'),head=document.querySelector('.weekly-head');
  if(!grid||!head)return;
  const agenda=document.createElement('section');agenda.id='referenceHomeAgenda';agenda.setAttribute('aria-label','오늘 가족 일정');
  const title=document.createElement('b');title.textContent='오늘 가족 일정';
  const text=document.createElement('span');text.id='referenceHomeAgendaText';
  const calendar=document.createElement('button');calendar.type='button';calendar.id='referenceCalendarEntry';calendar.textContent='가족 달력 · 위키 열기 ↗';
  agenda.append(title,text,calendar);grid.before(agenda);
  const growth=document.createElement('button');growth.type='button';growth.id='referenceGrowthEntry';growth.textContent='성장 기록 전체 ↗';head.append(growth);document.body.classList.add('reference-home-ready');
  function render(){
   const d=window.FamilyBoardClock?.now?.()||new Date(),today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
   const events=(FamilyDashboard.state.events||[]).filter(e=>e.date===today&&!e.done).slice().sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
   text.textContent=events.length?events.map(e=>[e.time,e.title].filter(Boolean).join(' ')).join(' · '):'오늘 등록된 일정이 없어요.';
   text.title=text.textContent;
  }
  calendar.addEventListener('click',()=>{FamilyRefresh.showFamily(true);document.querySelector('[data-schedtab="cal"]').click();requestAnimationFrame(()=>document.querySelector('#calToday').focus({preventScroll:true}));});
  growth.addEventListener('click',()=>{FamilyRefresh.showFamily(true);requestAnimationFrame(()=>{const node=document.querySelector('.refresh-record-details');node.scrollIntoView({block:'start'});document.querySelector('#histOpenBtn').focus({preventScroll:true});});});
  new MutationObserver(render).observe(document.querySelector('#calGrid'),{childList:true,subtree:true});
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else if(document.readyState==='interactive')document.addEventListener('DOMContentLoaded',install);else install();
})();
