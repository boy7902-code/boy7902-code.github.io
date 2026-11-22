/* ⏰ 알람 판단 — 미션 마감·가족 일정·맞춤 알람 중 "지금 울려야 하는 것"을 고르는 계산만 담당합니다.
   화면(app.js)과 따로 두어 브라우저 없이도 시험할 수 있습니다(tools/alarm-core.test.mjs).

   규칙
   · 미션 : 오늘 요일에 해당하고 아직 끝내지 않은 미션 → 마감 5분 전과 정각
            (보호자가 '성인 미션 보기'를 켰을 때만 성인 미션도 포함)
   · 일정 : 오늘 날짜의 가족 일정·구글 캘린더 일정 중 시각(HH:MM)이 있는 것 → 10분 전과 정각
            (종일 일정은 시각이 없으므로 울리지 않습니다)
   · 맞춤 : 보호자가 정한 고정 알람(시간·제목·요일) → 정각
   · 같은 날·같은 항목·같은 시점은 한 번만 울리도록 fireKeyOf() 로 열쇠를 만듭니다. */
(function installAlarmCore(root) {
  'use strict';

  const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_ALARMS = 40;
  const MAX_TITLE = 40;
  /** 미리 울리는 간격(분) — 미션 5분 전, 일정 10분 전, 맞춤 알람은 정각만 */
  const LEADS = { mission: [5, 0], event: [10, 0], custom: [0] };

  const isHhmm = (s) => HHMM.test(String(s == null ? '' : s));
  const isDateStr = (s) => DATE.test(String(s == null ? '' : s));

  function toMin(s) {
    if (!isHhmm(s)) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(String(s));
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const minToHhmm = (n) => `${pad2(Math.floor(n / 60) % 24)}:${pad2(n % 60)}`;

  /** 요일 목록 정리 — [] = 매일, 0=일 … 6=토 */
  function daysOf(v) {
    const out = [];
    (Array.isArray(v) ? v : []).forEach((n) => {
      const d = parseInt(n, 10);
      if (d >= 0 && d <= 6 && out.indexOf(d) < 0) out.push(d);
    });
    out.sort((a, b) => a - b);
    return out.length >= 7 ? [] : out;      // 7일을 다 고르면 '매일'과 같습니다
  }
  const onDay = (days, dow) => {
    const d = daysOf(days);
    return !d.length || d.indexOf(dow) >= 0;
  };

  /** 'YYYY-MM-DD' → 요일(0=일 … 6=토). 형식이 틀리면 -1 */
  function dowOf(dateStr) {
    if (!isDateStr(dateStr)) return -1;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  }

  function cleanTitle(t, max = MAX_TITLE) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, Math.max(1, Math.round(+max || MAX_TITLE)));
  }

  /* ─────────────────────────── 맞춤 알람 형식 ─────────────────────────── */
  /** 맞춤 알람 1건 — 시각이 없거나 제목이 비면 버립니다(깨진 값이 화면을 망가뜨리지 않게) */
  function normalizeAlarm(a, index = 0) {
    if (!a || typeof a !== 'object') return null;
    const time = isHhmm(a.time) ? String(a.time) : '';
    if (!time) return null;
    const title = cleanTitle(a.title);
    if (!title) return null;
    const rawId = String(a.id == null ? '' : a.id);
    const id = /^[A-Za-z0-9_-]{1,24}$/.test(rawId) ? rawId : `a${index + 1}${time.replace(':', '')}`;
    return { id, time, title, days: daysOf(a.days), on: a.on !== false };
  }
  function normalizeAlarms(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((a, i) => {
      const n = normalizeAlarm(a, i);
      if (!n || seen.has(n.id)) return;
      seen.add(n.id);
      if (out.length < MAX_ALARMS) out.push(n);
    });
    return out;
  }

  /* ─────────────────────────── 오늘의 알람 후보 ─────────────────────────── */
  const DEFAULT_MISSION_LINKS = Object.freeze({
    'def-morning-done': ['ms-bab', 'ms-bab-we'],
    'def-ready-done': ['ms-morning-study', 'fnlwnprw'],
  });
  function completedToday(mission, {date, logs = [], kidId = 'm3'} = {}) {
    if (!mission || !date) return false;
    if (mission.doneOn === date) return true;
    const member = mission.member || kidId;
    return logs.some(l => l && l.date === date && l.mid === mission.id && (l.member || kidId) === member && !l.kind);
  }

  function missionItems(missions, { date, dow, includeAdults = false, kidId = 'm3', logs = [] } = {}) {
    const out = [];
    (Array.isArray(missions) ? missions : []).forEach((m) => {
      if (!m || typeof m !== 'object') return;
      if (!isHhmm(m.due)) return;                    // 마감 시각이 없는 미션은 알람도 없습니다
      if (completedToday(m, {date, logs, kidId})) return;         // 이미 끝낸 미션은 울리지 않습니다
      if (!onDay(m.days, dow)) return;               // 오늘 쉬는 미션
      const member = m.member || '';
      if (!includeAdults && member && member !== kidId) return;   // 성인 미션은 부모가 '보기'를 켰을 때만
      const title = cleanTitle(m.title);
      if (!title) return;
      out.push({ key: 'mission:' + (m.id || title), kind: 'mission', title, time: m.due, leads: LEADS.mission });
    });
    return out;
  }

  function eventItems(events, { date } = {}) {
    const out = [];
    const seen = new Set();
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      if (!date || e.date !== date) return;
      if (e.done) return;                            // 끝낸 일정은 울리지 않습니다
      if (!isHhmm(e.time)) return;                   // 종일 일정('')은 시각이 없어 제외
      const title = cleanTitle(e.title, 60);
      if (!title) return;
      const key = 'event:' + (e.id || `${e.time}|${title}`);
      if (seen.has(key)) return;                     // 같은 일정이 두 번 들어와도 한 번만
      seen.add(key);
      out.push({ key, kind: 'event', title, time: e.time, leads: LEADS.event, source: e.source || '' });
    });
    return out;
  }

  function customItems(alarms, { dow, date, missions = [], logs = [], kidId = 'm3' } = {}) {
    const out = [];
    normalizeAlarms(alarms).forEach((a) => {
      if (!a.on) return;
      const linked = DEFAULT_MISSION_LINKS[a.id];
      if (linked && missions.some(m => linked.includes(m.id) && completedToday(m, {date, logs, kidId}))) return;
      if (!onDay(a.days, dow)) return;
      out.push({ key: 'custom:' + a.id, kind: 'custom', title: a.title, time: a.time, leads: LEADS.custom });
    });
    return out;
  }

  /** 오늘 울릴 수 있는 알람 전부 — 종류별로 모아 시각 순으로 */
  function collectItems({ missions = [], events = [], alarms = [], logs = [], date = '', dow = null, includeAdults = false, kidId = 'm3' } = {}) {
    const day = dow != null ? dow : dowOf(date);
    const all = [
      ...missionItems(missions, { date, dow: day, includeAdults, kidId, logs }),
      ...eventItems(events, { date }),
      ...customItems(alarms, { dow: day, date, missions, logs, kidId }),
    ];
    return all.sort((a, b) => (toMin(a.time) - toMin(b.time)) || a.title.localeCompare(b.title));
  }

  /* ─────────────────────────── 지금 울릴 것 고르기 ─────────────────────────── */
  /**
   * targetsAt(items, nowMin, { grace }) — 목표 시각이 지금 분(nowMin)이거나
   * grace분 안에 막 지난 알람. 화면이 잠깐 멈췄다 돌아와도 한 번은 울리게 하되,
   * 한참 지난 알람이 뒤늦게 울리지는 않습니다.
   */
  function targetsAt(items, nowMin, { grace = 1 } = {}) {
    const now = Math.max(0, Math.round(+nowMin || 0));
    const g = Math.max(0, Math.round(+grace || 0));
    const hits = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const due = toMin(item && item.time);
      if (due == null) return;
      const leads = Array.isArray(item.leads) && item.leads.length ? item.leads : [0];
      leads.forEach((lead) => {
        const before = Math.max(0, Math.round(+lead || 0));
        const at = due - before;
        if (at < 0) return;                          // 자정을 넘어가는 '5분 전'은 그날 울리지 않습니다
        if (now < at || now - at > g) return;
        hits.push({ key: item.key, kind: item.kind, title: item.title, time: item.time, slot: before > 0 ? 'pre' : 'now', lead: before, at });
      });
    });
    return hits.sort((a, b) => (a.at - b.at) || a.title.localeCompare(b.title));
  }

  /** 같은 날·같은 항목·같은 시점인지 구분하는 열쇠 — 이 열쇠로 중복 울림을 막습니다 */
  function fireKeyOf(date, item, slot) {
    return `${isDateStr(date) ? date : ''}|${(item && item.key) || ''}|${slot === 'pre' ? 'pre' : 'now'}`;
  }

  /** 앞으로 울릴 알람(설정 화면의 '오늘의 알람' 안내용) */
  function upcoming(items, nowMin, limit = 4) {
    const now = Math.max(0, Math.round(+nowMin || 0));
    const rows = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const due = toMin(item && item.time);
      if (due == null) return;
      (Array.isArray(item.leads) && item.leads.length ? item.leads : [0]).forEach((lead) => {
        const before = Math.max(0, Math.round(+lead || 0));
        const at = due - before;
        if (at < 0 || at < now) return;
        rows.push({ key: item.key, kind: item.kind, title: item.title, time: item.time, slot: before > 0 ? 'pre' : 'now', lead: before, at });
      });
    });
    return rows.sort((a, b) => (a.at - b.at) || a.title.localeCompare(b.title)).slice(0, Math.max(0, limit));
  }

  /** 울릴 때 보여 줄 말 — 항목 종류와 시점(미리/정각)에 맞춰 다르게 */
  function alarmMessage(hit) {
    const title = cleanTitle(hit && hit.title, 60) || '알람';
    const time = hit && isHhmm(hit.time) ? String(hit.time) : '';
    if (hit && hit.kind === 'mission') {
      return hit.slot === 'pre'
        ? { title: `${title} 보너스 기준 5분 전이에요!`, sub: `${time} 보너스 기준 · 기본 포인트는 이후에도 쌓여요` }
        : { title: `${title} 보너스 기준 시각이에요!`, sub: `${time} · 이후에도 완료와 기본 적립은 가능해요` };
    }
    if (hit && hit.kind === 'event') {
      return hit.slot === 'pre'
        ? { title: `${title} 10분 전이에요!`, sub: `${time} 일정이 곧 시작해요` }
        : { title: `${title} 시작할 시간이에요!`, sub: `${time} 일정` };
    }
    return { title: `${title}`, sub: `${time} 알람이에요` };
  }

  root.FamilyAlarmCore = Object.freeze({
    HHMM,
    LEADS,
    MAX_ALARMS,
    isHhmm,
    isDateStr,
    toMin,
    minToHhmm,
    daysOf,
    onDay,
    dowOf,
    cleanTitle,
    normalizeAlarm,
    normalizeAlarms,
    completedToday,
    missionItems,
    eventItems,
    customItems,
    collectItems,
    targetsAt,
    fireKeyOf,
    upcoming,
    alarmMessage,
  });
})(globalThis);
