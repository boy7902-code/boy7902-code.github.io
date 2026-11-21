/* Selected tablet layout. Read-only display: no persisted values or reward rules. */
(()=>{
 function install(){
 const $=s=>document.querySelector(s),media=matchMedia('(min-width:768px) and (max-width:1366px) and (min-height:600px)'),phone=matchMedia('(max-width:767px), (max-height:599px) and (max-width:1023px)');
 if(!window.FamilyRefresh||!$('#choreList'))return;
 const top=document.createElement('div');top.className='selected-top';
 const lower=document.createElement('div');lower.className='selected-lower';
 const nodes=[$('#cardOverview'),$('#cardSchool'),$('.mission-stamp-board'),$('#cardWish'),$('.weekly-report'),$('.width-access-tools')];
 const homes=nodes.map(n=>{const anchor=document.createComment('selected-layout-home');n.before(anchor);return anchor;});
 const lead=document.createElement('div');lead.className='selected-outfit';
 const primary=document.createElement('div');primary.className='selected-primary';
 const caption=document.createElement('button');caption.type='button';caption.className='selected-stamp-caption';caption.addEventListener('click',()=>$('#stampBoardOpenBtn').click());
 const chipsHome=document.createComment('weather-chips-home');$('#wChips').before(chipsHome);
 let active='initial',queued=false;
 function update(){
  queued=false;
  const mode=document.body.classList.contains('family-information-open')?'':media.matches?'tablet':phone.matches?'phone':'';
  if(mode!==active){
   if($('#screenDetail')?.open)$('#screenDetailClose').click();
   nodes.forEach((n,i)=>homes[i].after(n));chipsHome.after($('#wChips'));
   top.remove();lower.remove();lead.remove();primary.remove();caption.remove();
   active=mode;document.body.classList.toggle('selected-dashboard',mode==='tablet');document.body.classList.toggle('selected-phone',mode==='phone');
   if(mode==='tablet'){$('.topbar').insertBefore(top,$('.top-actions'));top.append(nodes[0],nodes[1]);$('.mission-area').append(lower);lower.append(nodes[2],nodes[3],nodes[4]);$('#cardChores>.card-head').append(nodes[5]);$('#cardOverview').append(lead,primary);$('#outfitSuggestions').append($('#wChips'));nodes[2].append(caption);}
   if(mode==='phone'){$('#cardChores').before(top);top.append(nodes[0],nodes[1]);$('#cardChores').append(lower);lower.append(nodes[3]);}
  }
  top.hidden=$('#mainGrid').hidden;
  const data=window.FamilyDashboard?.state,missions=data?.missions||[],order=new Map(missions.map((m,i)=>[String(m.id),i]));
  const points=new Map(missions.map(m=>[String(m.id),Number(m.points)||0]));
  const rows=[...$('#choreList').children].filter(n=>n.classList.contains('chore'));
  const sorted=rows.slice().sort((a,b)=>Number(a.classList.contains('done'))-Number(b.classList.contains('done'))||(!a.classList.contains('done')?(points.get(b.dataset.id)||0)-(points.get(a.dataset.id)||0):0)||(order.get(a.dataset.id)||0)-(order.get(b.dataset.id)||0));
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
  caption.textContent=count<10?`${10-count}개 더 모으면 +3P`:'도장 완성';
  nodes[5].querySelector('span').textContent='미완료는 포인트 높은 순 · 완료한 카드는 맨 뒤로';
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(update);}}
 const obs=new MutationObserver(queue);['#choreList','#wChips','#outfitSuggestions','#readingProgress','#mainGrid'].forEach(s=>obs.observe($(s),{childList:true,subtree:true,characterData:true,attributes:s==='#mainGrid',attributeFilter:s==='#mainGrid'?['hidden']:undefined}));
 new MutationObserver(events=>{if(events.some(e=>e.target.matches('#choreList>.chore')))queue();}).observe($('#choreList'),{subtree:true,attributes:true,attributeFilter:['class']});
 obs.observe(document.body,{attributes:true,attributeFilter:['class']});media.addEventListener('change',queue);phone.addEventListener('change',queue);update();
 }
 if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',install);else install();
})();
