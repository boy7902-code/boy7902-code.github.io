/* Current dashboard controls. The current composition is native HTML. */
(function(){
 function install(){
  'use strict';
  const $=s=>document.querySelector(s),body=document.body,nav=$('#appTabs'),family=$('#familyNav'),recordsTab=nav.querySelector('[data-records]'),actions=$('.top-actions'),menu=$('.display-menu'),controls=$('.display-menu-controls'),event=$('.today-event-preview'),info=$('.refresh-partner-info');
  function showFamily(on){if(on)nav.querySelector('[data-apptab="dash"]').click();body.classList.remove('records-open');body.classList.toggle('family-information-open',on);family.setAttribute('aria-pressed',String(on));recordsTab.setAttribute('aria-pressed','false');}
  family.addEventListener('click',()=>showFamily(!body.classList.contains('family-information-open')));
  nav.querySelectorAll('[data-apptab]').forEach(b=>b.addEventListener('click',()=>{body.classList.remove('family-information-open','records-open');family.setAttribute('aria-pressed','false');recordsTab.setAttribute('aria-pressed','false');}));
  recordsTab.addEventListener('click',()=>{showFamily(true);body.classList.add('records-open');recordsTab.setAttribute('aria-pressed','true');family.setAttribute('aria-pressed','false');});
  document.addEventListener('pointerdown',e=>{if(!actions.contains(e.target))menu.open=false;});controls.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});
  event.addEventListener('click',()=>showFamily(true));
  info.addEventListener('click',()=>{const img=$('#charStage img');if(!img||!window.PokemonEncyclopedia)return;const id=Number(img.dataset.poke||((img.src.match(/\/(\d+)\.png/)||[])[1]));if(id)PokemonEncyclopedia.show(id,{name:img.alt,art:img.src});});
  const arrows=$('.width-access-tools').querySelectorAll('button');arrows[0].addEventListener('click',()=>$('.mission-scroll').scrollBy({left:-321,behavior:'instant'}));arrows[1].addEventListener('click',()=>$('.mission-scroll').scrollBy({left:321,behavior:'instant'}));
  let queued=false;
  function updateSummary(){const text=[...$('#calDay').querySelectorAll('.ev-title,.event-title,.ev-name')].map(n=>n.textContent.trim()).filter(Boolean).slice(0,2).join(' · ');event.textContent=text?`선택일 일정  ${text}  ›`:'가족 일정 · 학교 소식 보기  ›';const kid=window.FamilyDashboard&&FamilyDashboard.kid().name;if(kid)$('#tChores').textContent=`${kid}의 오늘 미션`;info.disabled=!!document.querySelector('#charStage .partner-egg');info.textContent=info.disabled?'알은 5XP에 부화해요':'파트너 도감 정보';$('#choreSub').textContent=`오늘 목표 ${$('#todayGoal').textContent} · 미션을 끝내면 차곡차곡`;}
  function queue(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;updateSummary();});}}
  new MutationObserver(queue).observe($('#calDay'),{childList:true,subtree:true,characterData:true});new MutationObserver(queue).observe($('#todayGoal'),{childList:true,subtree:true,characterData:true});updateSummary();window.FamilyRefresh=Object.freeze({showFamily});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
