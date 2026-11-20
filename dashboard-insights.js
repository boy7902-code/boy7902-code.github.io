/* Read-only summaries. No scoring, reward or persistence rules live here. */
(function (root) {
  'use strict';
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function weekly(logs, today) {
    const now = new Date(today+'T12:00:00');
    const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay()+6)%7);
    const days = Array.from({length:7}, (_,i) => { const d=new Date(monday); d.setDate(d.getDate()+i); return {date:dateKey(d),points:0,count:0}; });
    const floor = new Date(now); floor.setDate(floor.getDate()-27);
    const recent={};
    for (const l of logs || []) {
      if (!l || !/^\d{4}-\d{2}-\d{2}$/.test(l.date) || l.date>today) continue;
      const parsed=new Date(l.date+'T12:00:00');
      if(!Number.isFinite(parsed.getTime()) || dateKey(parsed)!==l.date) continue;
      const earned=Number(l.earned);
      const points=Number.isFinite(earned)?Math.max(0,Math.round(earned)):0;
      const d=days.find(x=>x.date===l.date);
      if (d) { d.points+=points; if(l.kind!=='bonus') d.count++; }
      if(l.date>=dateKey(floor) && points>0) recent[l.date]=(recent[l.date]||0)+points;
    }
    const vals=Object.values(recent);
    return {days,total:days.reduce((s,d)=>s+d.points,0),count:days.reduce((s,d)=>s+d.count,0),average:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0,earningDays:vals.length};
  }
  function estimate(left, average) { return left<=0?0:average>0?Math.ceil(left/average):null; }
  root.FamilyDashboardInsights=Object.freeze({weekly,estimate});
})(globalThis);
