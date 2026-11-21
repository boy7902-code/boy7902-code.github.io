/* Selected tablet layout. Read-only display: no persisted values or reward rules. */
(()=>{
 function install(){
 const $=s=>document.querySelector(s),media=matchMedia('(min-width:768px) and (max-width:1366px)');
 if(!window.FamilyRefresh||!$('#choreList'))return;
 const top=document.createElement('div');top.className='selected-top';
 const lower=document.createElement('div');lower.className='selected-lower';
 const nodes=[$('#cardOverview'),$('#cardSchool'),$('.mission-stamp-board'),$('#cardWish'),$('.weekly-report'),$('.width-access-tools')];
 const homes=nodes.map(n=>{const anchor=document.createComment('selected-layout-home');n.before(anchor);return anchor;});
 const lead=document.createElement('div');lead.className='selected-outfit';
 const primary=document.createElement('div');primary.className='selected-primary';
 const caption=document.createElement('button');caption.type='button';caption.className='selected-stamp-caption';caption.addEventListener('click',()=>$('#stampBoardOpenBtn').click());
 const chipsHome=document.createComment('weather-chips-home');$('#wChips').before(chipsHome);
 let active=false,queued=false;
 function update(){
  queued=false;
  const on=media.matches;
  if(on!==active){if($('#screenDetail')?.open)$('#screenDetailClose').click();active=on;document.body.classList.toggle('selected-dashboard',on);
   if(on){$('.topbar').insertBefore(top,$('.top-actions'));top.append(nodes[0],nodes[1]);$('.mission-area').append(lower);lower.append(nodes[2],nodes[3],nodes[4]);$('#cardChores>.card-head').append(nodes[5]);$('#cardOverview').append(lead,primary);$('#outfitSuggestions').append($('#wChips'));nodes[2].append(caption);}
   else{nodes.forEach((n,i)=>homes[i].after(n));chipsHome.after($('#wChips'));top.remove();lower.remove();lead.remove();primary.remove();caption.remove();}
  }
  if(!on)return;
  top.hidden=$('#mainGrid').hidden;
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
  const data=window.FamilyDashboard?.state,missions=data?.missions||[],order=new Map(missions.map((m,i)=>[String(m.id),i]));
  const rows=[...$('#choreList').children].filter(n=>n.classList.contains('chore'));
  const sorted=rows.slice().sort((a,b)=>Number(a.classList.contains('done'))-Number(b.classList.contains('done'))||(order.get(a.dataset.id)||0)-(order.get(b.dataset.id)||0));
  if(rows.some((r,i)=>r!==sorted[i]))sorted.forEach(r=>$('#choreList').append(r));
  nodes[5].querySelector('span').textContent='미완료부터 오른쪽으로 · 완료한 카드는 맨 뒤로';
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(update);}}
 const obs=new MutationObserver(queue);['#choreList','#wChips','#outfitSuggestions','#readingProgress','#mainGrid'].forEach(s=>obs.observe($(s),{childList:true,subtree:true,characterData:true,attributes:s==='#mainGrid',attributeFilter:s==='#mainGrid'?['hidden']:undefined}));
 media.addEventListener('change',queue);update();
 }
 if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',install);else install();
})();
