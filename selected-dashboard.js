/* Selected tablet layout. Read-only display: no persisted values or reward rules. */
(()=>{
 function install(){
 const $=s=>document.querySelector(s),media=matchMedia('(min-width:768px) and (max-width:1366px) and (min-height:600px)'),phone=matchMedia('(max-width:767px), (max-height:599px) and (max-width:1023px)');
 if(!window.FamilyRefresh||!$('#choreList'))return;
 const top=$('.selected-top'),lower=$('.selected-lower'),lead=$('.selected-outfit'),primary=$('.selected-primary'),caption=$('.selected-stamp-caption');
 const chipsHome=$('#wChips').parentNode;
 caption.addEventListener('click',()=>$('#stampBoardOpenBtn').click());
 let active='initial',queued=false;
 function update(){
  queued=false;
  const family=document.body.classList.contains('family-information-open');
  const mode=phone.matches?'phone':'tablet';
  document.body.classList.toggle('selected-dashboard',!family&&mode==='tablet');document.body.classList.toggle('selected-phone',!family&&mode==='phone');
  if(mode!==active){active=mode;if(mode==='tablet')$('#outfitSuggestions').append($('#wChips'));else chipsHome.append($('#wChips'));}
  top.hidden=$('#mainGrid').hidden||family;
  lead.hidden=primary.hidden=caption.hidden=family||mode!=='tablet';
  const data=window.FamilyDashboard?.state,missions=data?.missions||[],order=new Map(missions.map((m,i)=>[String(m.id),i]));
  const today=FamilyStreak.kstDate(FamilyBoardClock.now());
  const points=new Map(missions.map(m=>[String(m.id),Number(m.points)||0]));
  const early=new Map(missions.map(m=>[String(m.id),Number((window.MissionRewards?.maximumEarlyBonus(MissionRewards.deadlineOf(m,today))||0)>0)]));
  const special=new Map(missions.map(m=>[String(m.id),m.special===true&&(!m.specialDate||m.specialDate===today)]));
  const rows=[...$('#choreList').children].filter(n=>n.classList.contains('chore'));
  const sorted=rows.slice().sort((a,b)=>Number(a.classList.contains('done'))-Number(b.classList.contains('done'))||(!a.classList.contains('done')?(Number(!special.get(a.dataset.id))-Number(!special.get(b.dataset.id))||(points.get(b.dataset.id)||0)-(points.get(a.dataset.id)||0)||(early.get(b.dataset.id)||0)-(early.get(a.dataset.id)||0)):0)||(order.get(a.dataset.id)||0)-(order.get(b.dataset.id)||0));
  if(rows.some((r,i)=>r!==sorted[i])){sorted.forEach(r=>$('#choreList').append(r));$('#missionScroll').scrollLeft=0;}
  if(mode!=='tablet')return;
  // Weather cache is the same snapshot renderWeather saves before updating #wChips.
  try{const weather=JSON.parse(localStorage.getItem('family-dashboard:weather')||'null');
   if(weather?.now&&Math.round(weather.now.temperature_2m)===parseInt($('#wTempCard').textContent,10)){
    for(const [key,title,unit] of [['relative_humidity_2m','습도','%'],['wind_speed_10m','바람','km/h']]){
     const value=weather.now[key];if(value==null||!Number.isFinite(Number(value)))continue;
     let chip=$('#wChips [data-selected-metric="'+key+'"]');if(!chip){chip=document.createElement('span');chip.className='wchip';chip.dataset.selectedMetric=key;$('#wChips').append(chip)}
     const text=title+' '+Math.round(value)+unit;if(chip.textContent!==text)chip.textContent=text;
    }
   }
  }catch(_){/* Preserve the original weather display on unavailable cache. */}
  lead.textContent=$('#outfitSuggestions .outfit-item small')?.textContent||'날씨를 기다려요';
  primary.replaceChildren(...[...$('#wChips').children].filter(n=>/강수|미세먼지/.test(n.textContent)).map(n=>n.cloneNode(true)));
  $('#weatherDetailsBtn').textContent='날씨 상세';
  const count=Number(($('#readingProgress').textContent.match(/\d+/)||[])[0]||0);
  caption.textContent=count<10?`${10-count}개 더 모으면 +1P`:'도장 완성';
  $('.width-access-tools').querySelector('span').textContent='포인트 높은 순 · 동점은 조기보너스 먼저 · 완료는 맨 뒤';
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(update);}}
 const obs=new MutationObserver(queue);['#choreList','#wChips','#outfitSuggestions','#readingProgress','#mainGrid'].forEach(s=>obs.observe($(s),{childList:true,subtree:true,characterData:true,attributes:s==='#mainGrid',attributeFilter:s==='#mainGrid'?['hidden']:undefined}));
 new MutationObserver(events=>{if(events.some(e=>e.target.matches('#choreList>.chore')))queue();}).observe($('#choreList'),{subtree:true,attributes:true,attributeFilter:['class']});
 obs.observe(document.body,{attributes:true,attributeFilter:['class']});media.addEventListener('change',queue);phone.addEventListener('change',queue);update();
 }
 if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',install);else install();
})();
