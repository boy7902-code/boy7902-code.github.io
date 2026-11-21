/* Public data only. The official service key never reaches this client. */
(function(root){
  'use strict';
  const KEY='family-kr-holidays-v1';
  let data=null;
  function valid(raw){
    if(!raw||raw.version!==1||raw.country!=='KR'||!raw.years||!Number.isFinite(Date.parse(raw.checkedAt)))return false;
    return Object.keys(raw.years).length>0&&Object.entries(raw.years).every(([year,rows])=>/^\d{4}$/.test(year)&&Array.isArray(rows)&&rows.length>0&&rows.length<=100&&rows.every(r=>r&&typeof r.name==='string'&&r.name.length>0&&r.name.length<=200&&typeof r.date==='string'&&r.date.startsWith(year+'-')&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&new Date(r.date+'T12:00:00Z').toISOString().slice(0,10)===r.date));
  }
  function install(raw){try{if(!valid(raw))return false;if(data&&Date.parse(raw.checkedAt)<Date.parse(data.checkedAt))return false;data=raw;return true;}catch(_){return false;}}
  function name(date){const rows=data&&data.years[String(date).slice(0,4)];return rows?(rows.find(r=>r.date===date)||{}).name||'':'';}
  function covers(date){return !!(data&&data.years[String(date).slice(0,4)]);}
  function isRest(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return day===0||day===6||!!name(date);}
  root.FamilyHolidays=Object.freeze({name,covers,isRest,install,valid,info:()=>data?{checkedAt:data.checkedAt,source:data.source}:null});
  try{install(JSON.parse(root.localStorage.getItem(KEY)||'null'));}catch(_){}
  if(typeof root.fetch==='function'&&root.document){
    let last=0;
    function refresh(){last=Date.now();return root.fetch('data/kr-holidays.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(raw=>{if(!install(raw))throw Error('Invalid data');try{root.localStorage.setItem(KEY,JSON.stringify(raw));}catch(_){};root.dispatchEvent(new Event('family-holidays-ready'));}).catch(()=>{root.dispatchEvent(new Event('family-holidays-ready'));});}
    refresh();
    root.setInterval(refresh,6*60*60*1000);
    root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden&&Date.now()-last>60*60*1000)refresh();});
  }
})(globalThis);
