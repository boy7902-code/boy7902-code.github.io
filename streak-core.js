/* Forward-only mission streak journal. A day's target IDs are captured once,
   never reconstructed from today's mission configuration for older dates.
   Missing days are unknown (break the known streak), not invented rest days.
   No points, rewards or mission completion records are changed here. */
(function installStreakJournal(root) {
  'use strict';
  const KEEP_DAYS = 120;
  const validDate = (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return false;
    const d = new Date(v + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  };
  const prevDay = (v) => { const d = new Date(v + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const unique = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((v) => typeof v === 'string' && v.length <= 160))].sort();
  function normalize(raw = {}) {
    const days = {};
    Object.keys(raw.days || {}).filter(validDate).sort().slice(-KEEP_DAYS).forEach((date) => {
      const row = raw.days[date];
      if (!row || !Array.isArray(row.required)) return;
      const required = unique(row.required);
      days[date] = { required, done: unique(row.done).filter((id) => required.includes(id)), skip: row.skip === true, finalized: row.finalized === true };
    });
    return { version: 1, started: validDate(raw.started) ? raw.started : '', days };
  }
  function observe(raw, { date = '', required = [], skip = false, logs = [], monthStart = date.slice(0, 7) + '-01' } = {}) {
    const out = normalize(raw);
    if (!validDate(date)) return out;
    if (!out.started) out.started = date;
    // Only today's first observation can create a target snapshot. Edits apply
    // to tomorrow's streak target, not an already-captured day.
    if (!out.days[date]) out.days[date] = { required: unique(required), done: [], skip: !!skip || !required.length, finalized: false };
    const byDate = new Map();
    (Array.isArray(logs) ? logs : []).forEach((l) => {
      if (!l || l.kind === 'bonus' || l.member !== 'm3' || !validDate(l.date) || typeof l.mid !== 'string') return;
      if (/^(bonus|combo|dbl|surprise|secret|stamp)_/i.test(l.mid)) return;
      if (!byDate.has(l.date)) byDate.set(l.date, new Set());
      byDate.get(l.date).add(l.mid);
    });
    Object.keys(out.days).forEach((day) => {
      // The app's subscribed log window is the current month. Older snapshots
      // must remain intact when those logs are no longer loaded.
      if (day < monthStart || day > date || out.days[day].finalized) return;
      const completed = byDate.get(day) || new Set();
      out.days[day].done = out.days[day].required.filter((id) => completed.has(id));
    });
    return normalize(out);
  }
  function kstDate(now = new Date()) {
    const d = new Date(+now + 9 * 60 * 60 * 1000 + 5 * 60 * 1000);
    return Number.isFinite(+d) ? d.toISOString().slice(0, 10) : '';
  }
  function deletionImpact(raw, date, mid) {
    const row = normalize(raw).days[date];
    if (!row || row.skip || (root.FamilyHolidays && root.FamilyHolidays.isRest(date)) || row.finalized || !row.required.includes(mid)) return null;
    return { done: row.done.includes(mid) };
  }
  const isWeekend = (date) => validDate(date) && [0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
  function status(raw, today) {
    const journal = normalize(raw);
    if (!validDate(today) || !journal.started) return { count: 0, started: '', known: false };
    let count = 0, day = today, gap = false, exhausted = true;
    for (let i = 0; i < KEEP_DAYS; i += 1, day = prevDay(day)) {
      if (day < journal.started) { exhausted = false; break; }
      const row = journal.days[day];
      // Saturday and Sunday are calendar exemptions, not an inferred mission-free day.
      // Do not create a row or a completion for a day never observed.
      if (isWeekend(day) || (root.FamilyHolidays && root.FamilyHolidays.name(day))) continue;
      if (!row) { gap = true; exhausted = false; break; }
      if (row.skip) continue;
      if (row.required.every((id) => row.done.includes(id))) count += 1;
      else if (day !== today) { exhausted = false; break; } // Today stays open until midnight.
    }
    return { count, started: journal.started, known: !!journal.days[today] || isWeekend(today) || !!(root.FamilyHolidays && root.FamilyHolidays.name(today)), gap, capped: exhausted && day >= journal.started };
  }
  root.FamilyStreak = Object.freeze({ normalize, observe, status, validDate, kstDate, deletionImpact });
})(globalThis);

/* Per-mission five-completion stars. Rest-day completions count; rest-day misses do not reset. Rewards are derived from unique completion
   records, never written back as grants. Schedule versions apply forward only. */
(function(root){
 'use strict';
 const APPROVED_START='2026-11-22';
 const valid=root.FamilyStreak.validDate;
 const nextDate=d=>{const n=new Date(d+'T12:00:00Z');n.setUTCDate(n.getUTCDate()+1);return n.toISOString().slice(0,10);};
 function schedule(missions){
  return (Array.isArray(missions)?missions:[]).filter(m=>m&&typeof m.id==='string'&&(m.member==='m3'||!m.member)).map(m=>({id:m.id,days:[...new Set((Array.isArray(m.days)?m.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 }
 function normalize(raw={}){
  const snapshots={};Object.keys(raw.snapshots||{}).filter(valid).sort().forEach(d=>{snapshots[d]=schedule(raw.snapshots[d]);});
  const started=valid(raw.started)&&raw.started>=APPROVED_START?raw.started:'';
  return {version:1,started,snapshots};
 }
 function observe(raw,{date,missions=[]}={}){
  const out=normalize(raw);if(!valid(date)||date<APPROVED_START)return out;
  const latest=schedule(missions),keys=Object.keys(out.snapshots).sort();
  if(!out.started||!keys.length){out.started=date;out.snapshots[date]=latest;return out;}
  // An edit cannot rewrite the schedule already used to earn today's points.
  const effective=nextDate(date),past=keys.filter(d=>d<=date),baseline=past.length?out.snapshots[past.at(-1)]:[];
  if(JSON.stringify(latest)===JSON.stringify(baseline))delete out.snapshots[effective];
  else out.snapshots[effective]=latest;
  return out;
 }
 function compute(raw,{logs=[],today,holidays=root.FamilyHolidays}={}){
  const policy=normalize(raw),byMission={},bonuses=[];let covered=true;
  if(!policy.started||!valid(today)||today<policy.started)return {byMission,bonuses,total:0,covered:false,started:policy.started};
  const keys=Object.keys(policy.snapshots).sort();const records=new Map();
  for(const l of Array.isArray(logs)?logs:[]){
   if(!l||l.member!=='m3'||l.kind==='bonus'||!valid(l.date)||typeof l.mid!=='string'||/^(bonus|combo|dbl|surprise|secret|stamp)_/i.test(l.mid))continue;
   if(!Number.isFinite(Number(l.earned))||Number(l.earned)<0)continue;
   const key=l.date+'_'+l.mid;if(!records.has(key))records.set(key,l);
  }
  let current=[],cursor=0;
  for(let day=policy.started,n=0;day<=today&&n<10000;day=nextDate(day),n++){
   while(cursor<keys.length&&keys[cursor]<=day){current=policy.snapshots[keys[cursor++]];}
   const dow=new Date(day+'T12:00:00Z').getUTCDay();
   if(!holidays||!holidays.covers(day)){covered=false;break;}
   const rest=dow===0||dow===6||holidays.isRest(day);
   for(const m of current){
    const row=byMission[m.id]||(byMission[m.id]={progress:0,cycleEarned:0,completed:0,lastAwardDate:'',total:0});
    const log=records.get(day+'_'+m.id);
    if(!log){
     if(!rest&&(!m.days.length||m.days.includes(dow))&&day!==today){row.progress=0;row.cycleEarned=0;}
     continue;
    }
    if(row.progress===5){row.progress=0;row.cycleEarned=0;}
    row.progress++;row.cycleEarned+=Math.round(Number(log.earned));
    if(row.progress===5){const earnedSum=row.cycleEarned,amount=Math.round(earnedSum*0.3);row.completed++;row.lastAwardDate=day;row.total+=amount;row.progress=0;row.cycleEarned=0;bonuses.push({id:'mission-star_'+m.id+'_'+day,mid:m.id,date:day,amount,earnedSum});}
   }

  }
  return {byMission,bonuses,total:bonuses.reduce((s,b)=>s+b.amount,0),covered,started:policy.started};
 }
 root.FamilyMissionStars=Object.freeze({APPROVED_START,normalize,schedule,observe,compute});
})(globalThis);
