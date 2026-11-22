/* Read-only weather detail. Uses the same cached Open-Meteo snapshot as home. */
(()=>{'use strict';
 const KEY='family-dashboard:weather';let dialog,body,returnFocus;
 const known={0:['맑음','clear'],1:['대체로 맑음','clear'],2:['구름 조금','cloud'],3:['흐림','cloud'],45:['안개','fog'],48:['서리 안개','fog'],51:['약한 이슬비','rain'],53:['이슬비','rain'],55:['짙은 이슬비','rain'],56:['어는 이슬비','rain'],57:['어는 이슬비','rain'],61:['약한 비','rain'],63:['비','rain'],65:['강한 비','rain'],66:['어는 비','rain'],67:['어는 비','rain'],71:['약한 눈','snow'],73:['눈','snow'],75:['많은 눈','snow'],77:['눈 알갱이','snow'],80:['소나기','rain'],81:['소나기','rain'],82:['강한 소나기','storm'],85:['소나기 눈','snow'],86:['많은 눈','snow'],95:['천둥번개','storm'],96:['우박 동반','storm'],97:['강한 천둥번개','storm'],99:['우박 동반','storm']};
 const condition=(code,day)=>{const [label,kind]=known[code]||['날씨 정보 없음','unknown'];return{label,kind,icon:kind==='clear'?(day===0?'🌙':'☀️'):({cloud:'☁️',fog:'🌫️',rain:'🌧️',snow:'❄️',storm:'⛈️',unknown:'🌡️'})[kind]};};
 const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const number=(v,unit='')=>valid(v)?Math.round(Number(v))+unit:'정보 없음';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function scene(code,day){
  const {kind,label}=condition(code,day),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 340 175');svg.setAttribute('role','img');svg.setAttribute('aria-label',label+' 날씨 그림');
  const celestial=day===0?'<path d="M241 29a31 31 0 1 0 34 42 35 35 0 0 1-34-42" fill="#e9d6a1"/>':'<g stroke="#efc66e" stroke-width="5" stroke-linecap="round"><path d="M239 13v10m0 68v10m-44-44h10m68 0h10m-75-31 8 8m46 46 8 8m0-62-8 8m-46 46-8 8"/><circle cx="239" cy="57" r="26" fill="#f3cf77" stroke="none"/></g>';
  const cloud='<path d="M95 91c-5-21 10-39 31-37 14-26 53-17 57 10 20-4 36 9 34 26-2 15-13 23-28 23h-72c-17 0-25-10-22-22" fill="#fffef8" stroke="#dce5e5" stroke-width="2"/>';
  const wet=['rain','snow','storm'].includes(kind);const marks=kind==='snow'?'<g fill="#bfd3e5"><circle cx="123" cy="129" r="4"/><circle cx="155" cy="139" r="4"/><circle cx="184" cy="126" r="4"/></g>':wet?'<g stroke="#8fb4ce" stroke-width="5" stroke-linecap="round"><path d="m124 123-7 13m39-12-7 13m39-14-7 13"/></g>':'';
  svg.innerHTML='<ellipse cx="174" cy="158" rx="144" ry="10" fill="#dce8d6"/>'+(['clear','cloud'].includes(kind)?celestial:'')+(kind==='clear'?'':cloud)+marks+(kind==='storm'?'<path d="m151 105-12 22h12l-6 22 25-30h-15l8-14" fill="#e6bd66"/>':'')+'<g><path d="m38 150 20-48 20 48" fill="#93af8c"/><path d="M58 128v30" stroke="#77906e" stroke-width="3"/><path d="M269 147v-31l20-15 21 15v31" fill="#eddabd"/><path d="m263 116 26-21 27 21" fill="none" stroke="#ba9272" stroke-width="5" stroke-linecap="round"/><path d="M285 146v-17h9v17" fill="#d3ad87"/></g>';
  if(kind==='fog')svg.innerHTML+='<path d="M93 121h122m-109 10h105m-91 11h85" stroke="#bdcbce" stroke-width="5" stroke-linecap="round"/>';
  return svg;
 }
 function snapshot(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&typeof x==='object'?x:null;}catch(_){return null;}}
 function localStamp(x){if(typeof x.now?.time==='string'&&/^\d{4}-\d\d-\d\dT\d\d:/.test(x.now.time))return x.now.time;const at=valid(x.at)?Number(x.at):NaN;return Number.isFinite(at)?new Date(at+(Number(x.utcOffsetSeconds)||0)*1000).toISOString().slice(0,16):'';}
 function close(){if(dialog?.open)dialog.close();returnFocus?.focus({preventScroll:true});}
 function metric(icon,label,value,note){const box=el('div','wd-metric');box.append(el('span','wd-metric-icon',icon),el('span','wd-label',label),el('b','',value));if(note)box.append(el('small','',note));return box;}
 function section(title,sub){const n=el('section','wd-section'),h=el('div','wd-section-title');h.append(el('h3','',title));if(sub)h.append(el('span','',sub));n.append(h);return n;}
 function draw(){
  body.replaceChildren();const w=snapshot();if(!w?.now){body.append(el('div','wd-empty','아직 받은 날씨 정보가 없어요. 연결 후 홈의 날씨를 새로고침해 주세요.'));return;}
  const n=w.now,d=Array.isArray(w.daily)?w.daily[0]:null,c=condition(n.weather_code,n.is_day),stamp=localStamp(w),stale=!valid(w.at)||Date.now()-Number(w.at)>30*60*1000;
  const hero=el('section','wd-hero'),reading=el('div','wd-reading'),eyebrow=el('div','wd-eyebrow',w.locName||'저장된 위치');
  reading.append(eyebrow,el('h2','',c.label),el('div','wd-temperature'+(valid(n.temperature_2m)?'':' wd-unavailable'),number(n.temperature_2m,'°')),el('p','wd-feel','체감 '+number(n.apparent_temperature,'°')+(d?' · 최고 '+number(d.max,'°')+' / 최저 '+number(d.min,'°'):'')),el('p','wd-update',(stale?'이전에 받은 정보 · ':'예보 기준 · ')+(stamp?stamp.replace('T',' '):'시각 정보 없음')+(w.timezone?' · '+w.timezone:'')));
  hero.append(reading,scene(n.weather_code,n.is_day));body.append(hero);
  const metrics=el('div','wd-metrics');metrics.append(metric('☂️','오늘 강수 확률',number(d?.pop,'%'),'하루 중 최대 예보'),metric('💨','지금 바람',number(n.wind_speed_10m,' km/h')),metric('💧','지금 습도',number(n.relative_humidity_2m,'%')),metric('🌡️','오늘 일교차',valid(d?.max)&&valid(d?.min)?number(Number(d.max)-Number(d.min),'°'):'정보 없음'));body.append(metrics);
  const hourly=section('시간대별 날씨','12시간 예보 · 옆으로 넘겨 보기');const key=stamp.slice(0,13),hours=(Array.isArray(w.hourly)?w.hourly:[]).filter(h=>h&&typeof h.time==='string'&&(!key||h.time.slice(0,13)>=key)).slice(0,12);
  if(!hours.length)hourly.append(el('p','wd-empty','시간대별 예보를 아직 받지 못했어요. 날씨를 새로고침하면 표시돼요.'));
  else{
   const cards=el('div','wd-hours');for(const [i,h]of hours.entries()){const hc=condition(h.code,h.isDay),card=el('div','wd-hour');card.append(el('b','wd-hour-label',(i===0?'지금 이후 · ':'')+h.time.slice(11,13)+'시'),el('span','wd-hour-icon',hc.icon),el('b','wd-hour-temp',number(h.temperature,'°')),el('span','wd-hour-condition',hc.label),el('span','wd-hour-rain','강수 '+number(h.pop,'%')),el('small','','바람 '+number(h.wind,' km/h')),el('small','','습도 '+number(h.humidity,'%')));cards.append(card);}hourly.append(cards);
  }body.append(hourly);
  const bottom=el('div','wd-bottom'),week=section('이번 주 날씨','최고 / 최저 · 강수 확률'),days=el('div','wd-week');
  for(const [i,d]of (Array.isArray(w.daily)?w.daily:[]).filter(d=>d&&typeof d==='object').slice(0,7).entries()){const row=el('div','wd-day'),date=/^\d{4}-\d\d-\d\d$/.test(d.date)?new Date(d.date+'T12:00:00Z'):null,cc=condition(d.code,1);row.append(el('b','',i===0?'오늘':date?['일','월','화','수','목','금','토'][date.getUTCDay()]:'날짜 없음'),el('span','wd-day-icon',cc.icon),el('span','wd-day-condition',cc.label),el('b','wd-day-temp',valid(d.max)&&valid(d.min)?number(d.max,'°')+' / '+number(d.min,'°'):'정보 없음'),el('span','wd-day-pop',number(d.pop,'%')));days.append(row);}if(!days.children.length)days.append(el('p','wd-empty','주간 예보를 아직 받지 못했어요.'));week.append(days);bottom.append(week);
  const prep=section('옷차림과 공기질','외출 전 확인'),guide=el('div','wd-guide');for(const item of document.querySelectorAll('#outfitSuggestions .outfit-item'))guide.append(item.cloneNode(true));if(!guide.children.length)guide.append(el('p','wd-empty','옷차림 안내를 아직 받지 못했어요.'));prep.append(guide);
  const air=el('div','wd-air');air.append(metric('🌿','미세먼지 PM10',number(w.air?.pm10,' μg/m³')),metric('🍃','초미세먼지 PM2.5',number(w.air?.pm25,' μg/m³')));prep.append(air);bottom.append(prep);body.append(bottom);
  body.append(el('p','wd-source','날씨·공기질: Open-Meteo 예보 · 비어 있는 정보는 추정하지 않아요. 예보는 달라질 수 있어요.'));
 }
 function open(){if(!dialog){dialog=el('dialog','wd-dialog');dialog.id='weatherDetail';dialog.setAttribute('aria-labelledby','weatherDetailTitle');const head=el('header','wd-header'),title=el('h2','','날씨 상세');title.id='weatherDetailTitle';const btn=el('button','wd-close','닫기 ×');btn.type='button';btn.id='weatherDetailClose';btn.addEventListener('click',close);head.append(title,btn);body=el('div','wd-body');dialog.append(head,body);document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});}returnFocus=document.activeElement;draw();dialog.showModal();dialog.scrollTop=0;dialog.querySelector('button').focus({preventScroll:true});}
 function install(){const btn=document.querySelector('#weatherDetailsBtn');if(btn)btn.addEventListener('click',e=>{e.stopImmediatePropagation();open();},true);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
