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
    const d = new Date(+now + 9 * 60 * 60 * 1000);
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
