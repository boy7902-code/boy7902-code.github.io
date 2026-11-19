/* Display-only streak: consecutive days on which every scheduled kid mission was finished.
   Sundays (free day) and days with no scheduled mission are skipped, they neither count nor break the streak.
   Today only counts once it is complete, an unfinished today does not break yesterday's streak. */
(function installStreakCore(root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MAX_LOOKBACK = 400;

  function streakDays({ missions = [], logs = [], today, freeDow = 0 } = {}) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
    if (!m) return 0;
    const doneByDate = new Map();
    (Array.isArray(logs) ? logs : []).forEach((l) => {
      if (!l || l.kind === 'bonus' || !l.date || l.mid == null) return;
      if (!doneByDate.has(l.date)) doneByDate.set(l.date, new Set());
      doneByDate.get(l.date).add(String(l.mid));
    });
    const list = (Array.isArray(missions) ? missions : []).filter((x) => x && x.id != null);
    const base = new Date(+m[1], +m[2] - 1, +m[3]);
    let streak = 0;
    for (let i = 0; i < MAX_LOOKBACK; i += 1) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow === freeDow) continue;
      const due = list.filter((x) => !Array.isArray(x.days) || !x.days.length || x.days.indexOf(dow) >= 0);
      if (!due.length) continue;
      const done = doneByDate.get(fmt(d)) || new Set();
      const complete = due.every((x) => done.has(String(x.id)));
      if (complete) streak += 1;
      else if (i === 0) continue;
      else break;
    }
    return streak;
  }

  root.FamilyStreak = Object.freeze({ streakDays });
})(globalThis);
