/* Presentation only: keep all existing data, controls and handlers. */
(function () {
 function install(){
  'use strict';
  const $ = s => document.querySelector(s);
  const body = document.body;
  body.classList.add('dashboard-refresh');
  const nav = $('#appTabs');
  const family = document.createElement('button');
  family.type = 'button'; family.className = 'family-nav';
  family.textContent = '달력 · 성장';
  family.setAttribute('aria-pressed','false');
  family.setAttribute('aria-controls','familyInformation');
  $('.col-left').id = 'familyInformation';
  function showFamily(on) {
    if (on) nav.querySelector('[data-apptab="dash"]').click();
    body.classList.remove('records-open');
    body.classList.toggle('family-information-open',on);
    family.setAttribute('aria-pressed',String(on));
    const rt=nav.querySelector('[data-records]');if(rt)rt.setAttribute('aria-pressed','false');
  }
  family.addEventListener('click',()=>showFamily(!body.classList.contains('family-information-open')));
  nav.insertBefore(family,nav.children[1]);
  nav.querySelectorAll('[data-apptab]').forEach(b=>b.addEventListener('click',()=>{
    body.classList.remove('family-information-open'); family.setAttribute('aria-pressed','false');
  }));
  const actions = $('.top-actions');
  const menu = document.createElement('details'); menu.className='display-menu';
  const summary=document.createElement('summary');summary.textContent='보기 · 설정';menu.append(summary);
  const controls=document.createElement('div');controls.className='display-menu-controls';
  [...actions.children].forEach(n=>{if(n!==$('#parentBtn') && n!==$('#safeRefreshBtn'))controls.append(n);});
  menu.append(controls);actions.append(menu);
  document.addEventListener('pointerdown',e=>{if(!actions.contains(e.target))menu.open=false;});
  controls.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});

  const records=document.createElement('section');records.className='card refresh-record-details';
  const title=document.createElement('h2');title.textContent='성장 · 미션 기록';records.append(title);
  ['#memberStats','#missionBadges','#todayMeter','.char-aside'].forEach(sel=>{const n=$(sel);if(n)records.append(n);});
  $('.col-left').append(records);
  const recordsTab=document.createElement('button');recordsTab.type='button';recordsTab.dataset.records='true';recordsTab.className='family-nav';recordsTab.textContent='성장 기록';recordsTab.setAttribute('aria-pressed','false');
  recordsTab.hidden=true;
  recordsTab.addEventListener('click',()=>{showFamily(true);body.classList.add('records-open');recordsTab.setAttribute('aria-pressed','true');family.setAttribute('aria-pressed','false');});
  nav.querySelectorAll('[data-apptab]').forEach(b=>b.addEventListener('click',()=>{body.classList.remove('records-open');recordsTab.setAttribute('aria-pressed','false');}));
  $('#cardChores>.card-head .card-tools').prepend($('.mission-pager'));
  const footer=document.createElement('div');footer.className='refresh-summary-row';
  const event=document.createElement('button');event.type='button';event.className='today-event-preview';
  event.addEventListener('click',()=>showFamily(true));
  footer.append($('.mission-stamp-board'),$('.weekly-report'));
  const eventCard=document.createElement('section');eventCard.className='card';eventCard.append(event);$('.col-left').append(eventCard);
  $('#cardChores').append(footer);
  const info=document.createElement('button');info.type='button';info.className='btn refresh-partner-info';
  info.textContent='파트너 도감 정보';
  info.addEventListener('click',()=>{
    const img=$('#charStage img');if(!img||!window.PokemonEncyclopedia)return;
    const id=Number(img.dataset.poke||((img.src.match(/\/(\d+)\.png/)||[])[1]));
    if(id)PokemonEncyclopedia.show(id,{name:img.alt,art:img.src});
  });
  $('.char-panel').append(info,$('.char-foot'));
  const missionScroll=$('.mission-scroll');
  const widthBar=document.createElement('div');widthBar.className='width-access-tools';
  const left=document.createElement('button'),right=document.createElement('button'),hint=document.createElement('span');
  left.type=right.type='button';left.textContent='◀';right.textContent='▶';
  left.setAttribute('aria-label','왼쪽 미션');right.setAttribute('aria-label','오른쪽 미션');
  hint.textContent='카드 크기 유지 · 옆으로 이동해 미션 보기';
  widthBar.append(left,hint,right);$('.mission-area').prepend(widthBar);
  left.addEventListener('click',()=>missionScroll.scrollBy({left:-321,behavior:'instant'}));
  right.addEventListener('click',()=>missionScroll.scrollBy({left:321,behavior:'instant'}));
  let queued=false;
  function updateSummary(){
    const nodes=[...$('#calDay').querySelectorAll('.ev-title,.event-title,.ev-name')];
    const text=nodes.map(n=>n.textContent.trim()).filter(Boolean).slice(0,2).join(' · ');
    event.textContent=text?`선택일 일정  ${text}  ›`:'가족 일정 · 학교 소식 보기  ›';
    const kid=window.FamilyDashboard&&FamilyDashboard.kid().name;
    if(kid)$('#tChores').textContent=`${kid}의 오늘 미션`;
    info.disabled=!!document.querySelector('#charStage .partner-egg');
    info.textContent=info.disabled?'알은 5XP에 부화해요':'파트너 도감 정보';
    const goal=$('#todayGoal').textContent;
    $('#choreSub').textContent=`오늘 목표 ${goal} · 미션을 끝내면 차곡차곡`;
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;updateSummary();});}
  new MutationObserver(queue).observe($('#calDay'),{childList:true,subtree:true,characterData:true});
  new MutationObserver(queue).observe($('#todayGoal'),{childList:true,subtree:true,characterData:true});
  updateSummary();
  window.FamilyRefresh=Object.freeze({showFamily});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
