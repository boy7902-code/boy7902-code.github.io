/* ============================================================================
   우리 가족 대시보드 — Firebase Auth + Firestore 연동 모듈

   · 실제 공개 사이트의 동작은 별도 배포 시점의 파일 상태에 따릅니다.
   · 로컬 검증은 firebase-runtime.js 의 demo 설정과 Auth/Firestore 에뮬레이터만 사용합니다.
   · 예전 Apps Script 주소/PIN 값은 자동으로 읽거나 이관하지 않습니다.

   설계 원칙
   1) 브라우저 코드에는 관리자 비밀키(Service Account)도, 가족 이메일 목록도 넣지 않습니다.
      - 부모/아이 구분은 **서버 Custom Claims(`claims.role`)** 만 믿습니다.
      - `firebaseConfig` 는 공개되어도 되는 값(apiKey·projectId 등)뿐입니다.
   2) 앱(app.js)은 이 모듈에 **Firebase SDK 함수 묶음(sdk)** 을 넘겨 줍니다.
      - 브라우저: firebase-boot.js 가 gstatic CDN 의 모듈을 넘깁니다.
      - Node 테스트: `firebase/firestore` 모듈을 그대로 넘깁니다.
      덕분에 같은 코드를 에뮬레이터 테스트에서 실제로 실행할 수 있습니다.
   3) 계산(포인트·경험치·월간 합계)은 저장하지 않고 매번 계산합니다.
      저장하는 확정값은 `stats/summary` 뿐이고, 그 합계는 **정산 트랜잭션**만 올립니다.
   ========================================================================== */

/* ────────────────────────────── 상수 ────────────────────────────── */
export const KID_ID = 'm3';              // 아이 구성원 id (앱과 동일)
export const FINAL_P = 200;              // 최종 진화 기준 경험치 (앱과 동일)
export const STAMP_START_AT = '2026-11-19T08:22:29+09:00';
export const STAMPS_PER_BOARD = 10;
export const STAMP_BONUS_POINTS = 3;
export const FAMILY_ROOT = 'households/main';
export const SUMMARY_PATH = `${FAMILY_ROOT}/stats/summary`;
export const PARTNER_PATH = `${FAMILY_ROOT}/child_state/partner`;
/** 🎪 이벤트 설정·상태 — 기존 규칙(child_state/{docId} = 가족 읽기 · 부모 쓰기)을 그대로 씁니다 */
export const EVENT_CENTER_PATH = `${FAMILY_ROOT}/child_state/event_center`;
/** 🏫 오늘 학교(급식·시간표) — 같은 child_state 규칙(가족 읽기 · 부모 쓰기)을 씁니다 */
export const SCHOOL_PATH = `${FAMILY_ROOT}/child_state/today_school`;
/** ⏰ 맞춤 알람 — 같은 child_state 규칙(가족 읽기 · 부모 쓰기)을 씁니다 */
export const ALARM_PATH = `${FAMILY_ROOT}/child_state/custom_alarms`;
export const PARENT_CONFIG_PATH = `${FAMILY_ROOT}/private/parent_config`;
export const FAMILY_PATH = FAMILY_ROOT;
/** Firestore 는 빈 필드명('')을 허용하지 않습니다. 공용 미션 몫(byMember[''])은 '_shared' 로 저장합니다. */
export const SHARED_KEY = '_shared';
export const bmKey = (member) => (member === '' || member == null ? SHARED_KEY : String(member));
export const bmMember = (key) => (key === SHARED_KEY ? '' : key);
function decodeBm(map) {
  const out = {};
  Object.keys(map || {}).forEach((k) => { out[bmMember(k)] = intOf(map[k]); });
  return out;
}
/** DocumentSnapshot.exists 는 SDK 마다 함수/불리언이 섞여 있습니다 */
const snapExists = (snap) => !!(snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists));

/** 로그 이외의 컬렉션 — 문서 id = 앱 항목의 id */
export const PLAIN_COLLECTIONS = ['members', 'events', 'missions', 'wishlist', 'shopping', 'letters', 'wiki', 'links', 'pointUses'];
/** 앱 localStorage 배열 전체 (동기화 대상) */
export const SYNC_COLLECTIONS = ['members', 'events', 'missions', 'letters', 'shopping', 'wiki', 'links', 'logs', 'pointUses', 'wishlist'];

/** 문서에 넣는 서버 시각 필드 — 백업/복원 시 serverTimestamp() 로 되돌립니다 */
const TS_FIELDS = ['createdAt', 'settledAt', 'updatedAt'];
/** 한 청크(백업 조각) 최대 크기 — Firestore 문서 1MiB 한도보다 여유를 둡니다 */
export const MAX_CHUNK_BYTES = 900 * 1024;

/* ────────────────────────────── 시간 도우미 ────────────────────────────── */
export const pad2 = (n) => String(n).padStart(2, '0');

/** 서버/기기 시각을 KST 달력 값으로 */
export function kstParts(d = new Date()) {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}
export const kstTodayStr = (d = new Date()) => { const p = kstParts(d); return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`; };
export const kstHhmm = (d = new Date()) => { const p = kstParts(d); return `${pad2(p.h)}:${pad2(p.mi)}`; };
export const kstMonthStart = (d = new Date()) => { const p = kstParts(d); return `${p.y}-${pad2(p.mo)}-01`; };
export const monthOf = (dateStr) => String(dateStr || '').slice(0, 7);
export const toMin = (s) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const isHhmm = (s) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(s || ''));
export const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const intOf = (v) => Math.max(0, Math.round(+v || 0));

function timestampMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch (e) { return NaN; }
  }
  if (value && typeof value.toDate === 'function') {
    try { return value.toDate().getTime(); } catch (e) { return NaN; }
  }
  if (value && typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

/** Pending successful mission logs only; stamps count completions, not their point values. */
export function advanceStampBoard({ progress = 0, completed = 0, logs = [], startAt = STAMP_START_AT } = {}) {
  let nextProgress = Math.min(STAMPS_PER_BOARD - 1, intOf(progress));
  let nextCompleted = intOf(completed);
  const seen = new Set();
  const cutoff = Date.parse(startAt);
  const eligible = (Array.isArray(logs) ? logs : [])
    .filter((log) => {
      if (!log || log.settled !== false || log.kind === 'bonus') return false;
      const createdAt = timestampMillis(log.createdAt);
      if (!Number.isFinite(createdAt) || createdAt < cutoff) return false;
      const source = String(log.mid || log.id || '');
      return !/^(?:bonus|combo|dbl|surprise|secret|stamp)_/i.test(source);
    })
    .filter((log) => {
      const id = String(log.id || `${log.date}_${log.mid}_${log.member || KID_ID}`);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => {
      const left = `${a.date || ''}|${a.at || ''}|${a.id || ''}`;
      const right = `${b.date || ''}|${b.at || ''}|${b.id || ''}`;
      return left < right ? -1 : (left > right ? 1 : 0);
    });
  const bonusByMonth = {};
  const bonusByDate = {};
  let boardsAwarded = 0;
  eligible.forEach((log) => {
    nextProgress += 1;
    if (nextProgress < STAMPS_PER_BOARD) return;
    nextProgress = 0;
    nextCompleted += 1;
    boardsAwarded += 1;
    const month = monthOf(log.date);
    const date = String(log.date || '');
    if (month) bonusByMonth[month] = intOf(bonusByMonth[month]) + STAMP_BONUS_POINTS;
    if (date) bonusByDate[date] = intOf(bonusByDate[date]) + STAMP_BONUS_POINTS;
  });
  return {
    progress: nextProgress,
    completed: nextCompleted,
    boardsAwarded,
    bonusPoints: boardsAwarded * STAMP_BONUS_POINTS,
    counted: eligible.length,
    bonusByMonth,
    bonusByDate,
  };
}

/* ────────────────────────────── 진화 단계 ────────────────────────────── */
/** 앱(app.js buildLine)과 같은 규칙: 1단계 [0], 2단계 [0,60], 3단계 [0,40,90] + 200(이로치) */
export function stageMins(lineCount) {
  const base = { 1: [0], 2: [0, 60], 3: [0, 40, 90] }[Math.min(3, Math.max(1, lineCount))] || [0, 40, 90];
  return base.concat([FINAL_P]);
}
export function stageIndexOf(xp, mins) {
  let idx = 0;
  mins.forEach((v, i) => { if (xp >= v) idx = i; });
  return idx;
}

/* ────────────────────────────── 문서 모양 ────────────────────────────── */
/** 로그 문서 ID = `{date}_{mid}_{member}` — 같은 날 같은 미션(같은 완료자)의 중복 생성을 서버가 막습니다 */
export const logDocId = (log) => `${log.date}_${log.mid}_${log.member || KID_ID}`;

/**
 * 🎪 이벤트 센터 문서 모양 — Firestore 는 undefined/빈 필드명을 거부하므로
 * 화면이 보내온 값에서 허용한 키만 골라 JSON 으로 한 번 정리합니다.
 */
export function eventCenterDoc(data = {}) {
  const pick = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : null);
  const doc = {
    combo: pick(data.combo),
    doubleDays: Array.isArray(data.doubleDays) ? pick(data.doubleDays.slice(0, 40)) : [],
    secret: pick(data.secret),
    stamps: pick(data.stamps),
    gacha: pick(data.gacha),
  };
  Object.keys(doc).forEach((k) => { if (doc[k] == null) delete doc[k]; });
  if (doc.gacha && Array.isArray(doc.gacha.draws)) doc.gacha.draws = doc.gacha.draws.slice(-300);
  return doc;
}

/** 미션 문서 — '정의'만 저장합니다. 오늘 완료 여부는 logs 에서 계산합니다. */
export function missionDocOf(m, { stamp } = {}) {
  const doc = {
    id: m.id,
    title: String(m.title || ''),
    points: intOf(m.points),
    due: isHhmm(m.due) ? m.due : '',
    bonus: isHhmm(m.due) ? intOf(m.bonus) : 0,
    member: (m.member === 'm1' || m.member === 'm2' || m.member === KID_ID) ? m.member : '',
    days: Array.isArray(m.days) ? m.days.filter((n) => n >= 0 && n <= 6) : [],
  };
  if (stamp) doc.updatedAt = stamp;
  return doc;
}

/* ────────────────────────────── 🏫 오늘 학교(급식·시간표) ────────────────────────────── */
/**
 * 급식·시간표 문서 모양 — 날짜(YYYY-MM-DD)별로 담아 두면 대시보드의 '오늘 학교' 카드가
 * 그날 몫을 그대로 읽습니다. 학교 이름·반도 이 비공개 문서에만 저장합니다.
 * 빈 날짜도 남겨 두어, 부모가 지운 값이 다른 기기까지 지워지게 합니다.
 */
export function schoolDocOf(data = {}) {
  const src = (data && data.byDate && typeof data.byDate === 'object') ? data.byDate : {};
  const byDate = {};
  Object.keys(src).filter(isDateStr).sort().slice(-45).forEach((d) => {
    const v = src[d] || {};
    byDate[d] = {
      meal: String(v.meal || '').slice(0, 600),
      timetable: String(v.timetable || '').slice(0, 600),
    };
  });
  return {
    name: String((data && data.name) || '').trim().slice(0, 40),
    cls: String((data && data.cls) || '').trim().slice(0, 20),
    byDate,
  };
}

/* ─────────────────────── 📅 구글 캘린더(읽기 전용) 도우미 ───────────────────────
   OAuth 액세스 토큰은 화면(탭 세션) 메모리에만 두고 Firestore·저장 파일에는 남기지 않습니다.
   여기서는 받아온 events 배열을 앱의 일정 모양으로 바꾸는 계산만 합니다. */
export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/** ISO 시각 → KST 달력 날짜/시각 */
function kstFromIso(iso) {
  const t = new Date(String(iso || ''));
  if (isNaN(t.getTime())) return null;
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  return {
    date: `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`,
    time: `${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`,
  };
}

/** 구글 캘린더 이벤트 1건 → 대시보드 일정 (종일 일정은 time:'') */
export function gcalEventToApp(item = {}, calendarId = 'primary') {
  if (!item || item.status === 'cancelled') return null;
  const start = item.start || {};
  let date = '';
  let time = '';
  if (isDateStr(start.date)) {
    date = start.date;                       // 종일 일정
  } else {
    const p = kstFromIso(start.dateTime);
    if (!p) return null;
    date = p.date; time = p.time;
  }
  const title = String(item.summary || '').trim();
  if (!title) return null;
  return {
    id: `gcal:${calendarId}:${item.id || `${date}_${time}_${title}`}`,
    date, time, title: title.slice(0, 80), member: '', done: false,
    source: 'gcal', cal: calendarId, allDay: !start.dateTime,
  };
}

/** 여러 캘린더의 이벤트 목록을 한 배열로 (중복 id 제거) */
export function gcalEventsToApp(items = [], calendarId = 'primary') {
  const out = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((it) => {
    const e = gcalEventToApp(it, calendarId);
    if (!e || seen.has(e.id)) return;
    seen.add(e.id);
    out.push(e);
  });
  return out;
}

/** calendarList 응답 → 읽을 캘린더 목록(전부 읽기 전용) */
export function gcalCalendars(list = []) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && c.id && !c.deleted)
    .map((c) => ({ id: String(c.id), name: String(c.summaryOverride || c.summary || c.id), primary: !!c.primary }))
    .slice(0, 15);
}

/** 조회 창 — 오늘 기준 앞뒤 날짜(YYYY-MM-DD) */
export function gcalWindow(dateStr, { back = 3, ahead = 35 } = {}) {
  const day = isDateStr(dateStr) ? dateStr : kstTodayStr();
  const shift = (ds, n) => {
    const t = new Date(`${ds}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
  };
  return { from: shift(day, -back), to: shift(day, ahead) };
}

/** 날짜 → Calendar API timeMin/timeMax (KST 경계) */
export const gcalBoundaryIso = (dateStr, end = false) => `${dateStr}T${end ? '23:59:59' : '00:00:00'}+09:00`;

/** 오늘의 미션 완료 상태를 해당 구성원의 로그에서 복원합니다. */
export function reconcileMissionCompletions(missions, logs, date, kidId = KID_ID) {
  const entries = Array.isArray(logs) ? logs : [];
  (missions || []).forEach((mission) => {
    const member = ['m1', 'm2', kidId].includes(mission.member) ? mission.member : kidId;
    const log = entries.find((item) => item.mid === mission.id && item.date === date && (item.member || kidId) === member);
    if (log) {
      mission.doneOn = date;
      mission.doneAt = log.at;
      mission.earned = Math.max(0, Math.round(+log.earned || 0));
      mission.goalMet = !!log.goalMet;
    } else if (mission.doneOn === date) {
      mission.doneOn = null;
      mission.doneAt = '';
      mission.earned = 0;
      mission.goalMet = false;
    }
  });
  return missions;
}

/** 기존 앱 로그 1건 → Firestore 로그 문서 (이미 지난 기록이므로 settled:true) */
export function logDocOf(l, { uid, stamp }) {
  const member = (l.member === 'm1' || l.member === 'm2' || l.member === KID_ID) ? l.member : '';
  return {
    id: String(l.id || `${l.date}-${l.mid}`),
    date: l.date,
    at: isHhmm(l.at) ? l.at : '00:00',
    mid: String(l.mid || ''),
    title: String(l.title || ''),
    member,
    base: intOf(l.base),
    bonus: intOf(l.bonus),
    earned: intOf(l.earned),
    due: isHhmm(l.due) ? l.due : '',
    goalMet: !!l.goalMet,
    settled: true,                 // 이관 시점에 이미 화면 합계에 반영된 기록
    createdAt: stamp,
    createdBy: uid || 'migration',
    settledAt: stamp,
    settledBy: uid || 'migration',
  };
}

export function wishDocOf(w, { uid, createdAt, wasParent = true }) {
  return {
    id: String(w.id),
    title: String(w.title || ''),
    need: intOf(w.need),
    cat: ['toy', 'supply', 'book', 'etc'].includes(w.cat) ? w.cat : 'etc',
    at: isDateStr(w.at) ? w.at : '',
    by: String(w.by || KID_ID),
    boughtAt: isDateStr(w.boughtAt) ? w.boughtAt : '',
    createdBy: uid,
    createdAt,
    __parent: wasParent,           // (내부 플래그 · 저장 전 제거)
  };
}
export function shoppingDocOf(s, { uid, createdAt }) {
  return {
    id: String(s.id),
    cat: s.cat === 'fridge' ? 'fridge' : 'buy',
    text: String(s.text || ''),
    done: !!s.done,
    createdBy: uid,
    createdAt,
  };
}
export function letterDocOf(l, { uid, createdAt }) {
  return {
    id: String(l.id),
    img: String(l.img || ''),
    author: String(l.author || '').slice(0, 20),
    when: String(l.when || '').slice(0, 20),
    createdBy: uid,
    createdAt,
  };
}

/* ────────────────────────────── 1) 기존 JSON → Firestore 변환 ────────────────────────────── */
/**
 * `family-dashboard:v1` localStorage JSON 을 Firestore 문서 묶음으로 변환합니다.
 * 순수 함수 — 네트워크를 타지 않으므로 테스트에서 그대로 검증합니다.
 *
 * @returns {{
 *   family: object, collections: Record<string, object[]>,
 *   summary: object, partner: object, privateConfig: object,
 *   report: { counts: object, xpBaseline: number, logEarnSum: number, drift: number,
 *             warnings: string[], skipped: object[] }
 * }}
 */
export function migrateFromLegacyJson(legacy, opts = {}) {
  const uid = opts.uid || 'migration';
  const stamp = opts.stamp || null;                    // serverTimestamp() (테스트에서는 생략 가능)
  const src = (legacy && typeof legacy === 'object') ? legacy : {};
  const warnings = [];
  const skipped = [];
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

  /* ---- 구성원·일정·위키·링크: 필드 이름 그대로 ---- */
  const members = arr(src.members).map((m) => ({ id: String(m.id), name: String(m.name || ''), color: String(m.color || '#9aa4bd') }));
  const events = arr(src.events).map((e) => ({
    id: String(e.id), date: isDateStr(e.date) ? e.date : '', time: isHhmm(e.time) ? e.time : '',
    title: String(e.title || ''), member: String(e.member || ''), done: !!e.done,
  }));
  const wiki = arr(src.wiki).map((w) => ({ id: String(w.id), group: String(w.group || ''), key: String(w.key || ''), val: String(w.val || '') }));
  const links = arr(src.links).map((l) => ({ id: String(l.id), title: String(l.title || ''), url: String(l.url || '') }));
  const pointUses = arr(src.pointUses).map((u) => ({
    id: String(u.id || `u-${u.date || ''}-${intOf(u.amount)}`), date: isDateStr(u.date) ? u.date : '',
    at: isHhmm(u.at) ? u.at : '', title: String(u.title || ''), amount: intOf(u.amount),
  }));

  /* ---- 미션: 정의만 (오늘 완료 상태는 logs 로 옮깁니다) ---- */
  const missions = arr(src.missions).map((m) => {
    const doc = missionDocOf(m, { stamp });
    if (m.due && !isHhmm(m.due)) warnings.push(`미션 "${m.title}" 마감 시각 ${m.due} → 실제 시각(00:00~23:59)이 아니어서 '마감 없음'으로 바꿨습니다`);
    if (m.doneOn && isDateStr(m.doneOn) && !arr(src.logs).some((l) => l.mid === m.id && l.date === m.doneOn)) {
      warnings.push(`미션 "${m.title}" 의 완료 표시(${m.doneOn})에 해당하는 로그가 없습니다 — 포인트를 만들어 내지 않고 경고만 남깁니다`);
    }
    return doc;
  });

  /* ---- 로그: 문서 ID = {date}_{mid}_{member} ---- */
  const logs = [];
  const seenLogIds = new Set();
  arr(src.logs).forEach((l) => {
    if (!isDateStr(l.date) || !l.mid) { skipped.push({ type: 'logs', reason: '날짜·미션 없음', item: l }); return; }
    const doc = logDocOf(l, { uid, stamp });
    const id = logDocId(doc);
    if (seenLogIds.has(id)) { skipped.push({ type: 'logs', reason: `중복 문서 ID(${id})`, item: l }); return; }
    seenLogIds.add(id);
    logs.push({ ...doc, __docId: id });
  });

  /* ---- 위시·장보기·편지 ---- */
  const wishlist = [];
  arr(src.wishlist).forEach((w) => {
    const doc = wishDocOf(w, { uid, createdAt: stamp });
    delete doc.__parent;
    wishlist.push(doc);
  });
  const shopping = arr(src.shopping).map((s) => shoppingDocOf(s, { uid, createdAt: stamp }));
  const letters = [];
  arr(src.letters).forEach((l) => {
    const doc = letterDocOf(l, { uid, createdAt: stamp });
    // 규칙(letterCreate)과 같은 한도: 그림 32byte 초과 ~ 700,000byte 이하
    if (doc.img.length <= 32) { skipped.push({ type: 'letters', reason: '그림 데이터가 비어 있음', item: { id: l.id } }); return; }
    if (doc.img.length > 700000) { skipped.push({ type: 'letters', reason: '그림이 700,000자(문서 한도)를 넘음', item: { id: l.id } }); return; }
    letters.push(doc);
  });

  /* ---- 포인트 → 확정 합계(stats/summary) ---- */
  const byMember = {};
  const rawBy = (src.points && src.points.byMember) || {};
  Object.keys(rawBy).forEach((k) => { byMember[bmKey(k)] = intOf(rawBy[k]); });
  const kidBaseline = intOf(byMember[KID_ID]);   // 아이 누적 포인트          // 형식 3 이후 경험치 = 아이 누적 포인트
  const monthly = {};
  const counts = { members: members.length, events: events.length, missions: missions.length, logs: logs.length, wishlist: wishlist.length, shopping: shopping.length, letters: letters.length, wiki: wiki.length, links: links.length, pointUses: pointUses.length };
  let kidLogSum = 0;
  logs.forEach((l) => {
    const mk = monthOf(l.date);
    const cur = monthly[mk] || { total: 0, count: 0, byMember: {} };
    const bm = { ...(cur.byMember || {}) };
    bm[bmKey(l.member)] = intOf(bm[bmKey(l.member)]) + intOf(l.earned);
    void 0;
    monthly[mk] = { total: cur.total + intOf(l.earned), count: cur.count + 1, byMember: bm };
    if (l.member === KID_ID) kidLogSum += intOf(l.earned);
  });

  const summary = {
    totalXp: kidBaseline,                               // 아이 누적 = 파트너 경험치 기준
    settledCount: logs.length,
    monthly,
    byMember,
    updatedAt: stamp,
  };

  /* ---- 파트너(child_state/partner) — 진화 게이지 기준점 ---- */
  const pk = (src.pokemon && typeof src.pokemon === 'object') ? src.pokemon : {};
  const partner = {
    partnerKey: String(pk.key || 'pikachu').toLowerCase().slice(0, 40),
    sinceXp: 0,                                          // 이관 시점부터 새로 200P를 쌓는 기준
    updatedAt: stamp,
  };

  /* ---- 가족 문서 · 부모 전용 설정 ---- */
  const family = {
    v: 3,
    name: '우리 가족',
    dashboardTitle: String(src.dashboardTitle || ''),
    showAdultMissions: src.showAdultMissions === true,
    location: (src.location && typeof src.location === 'object') ? { lat: +src.location.lat || 0, lon: +src.location.lon || 0, name: String(src.location.name || '') } : null,
    updatedAt: stamp,
  };
  const privateConfig = {
    parentPin: /^\d{4,12}$/.test(String(src.parentPin || '')) ? String(src.parentPin) : '0000',
    quiet: src.quiet === true,
    theme: src.theme === 'dark' ? 'dark' : 'light',
    backup: { lastAt: null, autoParentOnly: true },
    updatedAt: stamp,
  };

  const report = {
    counts,
    xpBaseline: kidBaseline,
    logEarnSum: kidLogSum,
    drift: kidBaseline - kidLogSum,                      // 0 이 아니면 "화면 포인트와 로그 합계"가 원래부터 어긋나 있던 것
    warnings,
    skipped,
    collections: {
      members: members.length, events: events.length, missions: missions.length, wishlist: wishlist.length,
      shopping: shopping.length, letters: letters.length, wiki: wiki.length, links: links.length,
      pointUses: pointUses.length, logs: logs.length,
    },
  };

  return {
    family,
    collections: { members, events, missions, wishlist, shopping, letters, wiki, links, pointUses },
    logs,                       // {docId, ...}
    summary,
    partner,
    privateConfig,
    report,
  };
}

/* ────────────────────────────── 2) 화면 계산 (저장하지 않음) ────────────────────────────── */
/**
 * 확정 합계(summary) + 아직 정산되지 않은 로그 + 포인트 사용 내역으로
 * 화면에 보여 줄 포인트·경험치·월간 합계를 계산합니다.
 * "정산 직후 화면이 튀지 않게" 미정산 로그를 더해서 보여 줍니다.
 */
export function computeScreenStats({ summary = {}, logs = [], pointUses = [], partner = {}, kidId = KID_ID, now = new Date(), stageCount = 4 } = {}) {
  const byMember = decodeBm(summary.byMember);
  const monthly = {};
  Object.keys(summary.monthly || {}).forEach((mk) => {
    const v = summary.monthly[mk] || {};
    monthly[mk] = { total: intOf(v.total), count: intOf(v.count), byMember: decodeBm(v.byMember) };
  });
  const today = kstTodayStr(now);
  let todayXp = 0, todayCount = 0;
  const pendingLogs = logs.filter((l) => l && l.settled === false);

  pendingLogs.forEach((l) => {
    const earned = intOf(l.earned);
    const key = l.member || '';
    byMember[key] = intOf(byMember[key]) + earned;
    const mk = monthOf(l.date);
    const cur = monthly[mk] || { total: 0, count: 0, byMember: {} };
    const bm = { ...(cur.byMember || {}) };
    bm[key] = intOf(bm[key]) + earned;
    monthly[mk] = { total: intOf(cur.total) + earned, count: intOf(cur.count) + 1, byMember: bm };
    if (l.date === today) { todayXp += earned; todayCount += 1; }
  });

  const stampBoard = advanceStampBoard({
    progress: summary.stampProgress,
    completed: summary.stampBoardsCompleted,
    logs: pendingLogs,
  });
  const pendingKidEarned = pendingLogs.filter((l) => l.member === kidId).reduce((sum, l) => sum + intOf(l.earned), 0);
  const kidMissionXp = Math.max(intOf(byMember[kidId]), intOf(summary.totalXp) + pendingKidEarned);
  byMember[kidId] = kidMissionXp + stampBoard.bonusPoints;
  Object.entries(stampBoard.bonusByMonth).forEach(([mk, bonus]) => {
    const cur = monthly[mk] || { total: 0, count: 0, byMember: {} };
    const bm = { ...(cur.byMember || {}) };
    bm[kidId] = intOf(bm[kidId]) + bonus;
    monthly[mk] = { total: intOf(cur.total) + bonus, count: intOf(cur.count), byMember: bm };
  });
  const bonusToday = intOf(stampBoard.bonusByDate[today]);
  todayXp += bonusToday;

  const totalXp = intOf(byMember[kidId]);
  const spent = pointUses.reduce((s, u) => s + intOf(u.amount), 0);
  const balance = Math.max(0, totalXp - spent);
  const sinceXp = intOf(partner.sinceXp);
  const partnerXp = clamp(totalXp - sinceXp, 0, FINAL_P);
  const mins = stageMins(stageCount);
  const stage = stageIndexOf(partnerXp, mins);

  const kidsToday = pendingLogs.filter((l) => l.date === today && (l.member === kidId || l.member === ''));
  return {
    totalXp,                         // 아이 누적 포인트 = 경험치
    spent, balance,
    partnerXp, stage, stageMins: mins,
    byMember,
    monthly,
    todayXp: kidsToday.reduce((s, l) => s + intOf(l.earned), 0) + bonusToday,
    todayCount: kidsToday.length,
    todayXpAll: todayXp, todayCountAll: todayCount,
    pendingCount: pendingLogs.length,
    stampProgress: stampBoard.progress,
    stampBoardsCompleted: stampBoard.completed,
    stampBonusPending: stampBoard.bonusPoints,
    stampBonusPoints: stampBoard.completed * STAMP_BONUS_POINTS,
    atFinal: partnerXp >= FINAL_P,
  };
}

/* ────────────────────────────── 3) 역할 게이트 ────────────────────────────── */
/** claims.role 만 신뢰합니다. 없거나 다른 값이면 '' — 즉시 차단 */
export function resolveRole(claims) {
  const r = claims && claims.role;
  return r === 'parent' || r === 'child' ? r : '';
}

/* ────────────────────────────── 4) 오류 분류 (오프라인·자정 거절 UX) ────────────────────────────── */
/**
 * Firestore 오류를 아이 화면에 보여 줄 안내로 바꿉니다.
 * ctx: { date, today, at, now, settled }
 */
export function classifyFirestoreError(err, ctx = {}) {
  const raw = String((err && (err.code || err.name)) || err || '');
  const code = raw.replace('firestore/', '').replace('auth/', '');
  const today = ctx.today || kstTodayStr();
  if (code === 'permission-denied') {
    if (ctx.settled === true) {
      return { code, kind: 'settled', title: '이미 정산된 기록이에요', message: '보호자가 확인한 기록은 아이가 지울 수 없어요. 보호자에게 알려 주세요.', retryable: false };
    }
    if (ctx.date && ctx.date !== today) {
      return { code, kind: 'midnight', title: '날짜가 바뀌었어요', message: '어제 미션은 보호자 확인이 필요해요. 보호자 기기에서 기록해 주세요.', retryable: false };
    }
    if (ctx.at && toMin(ctx.at) != null && ctx.nowMin != null && ctx.nowMin - toMin(ctx.at) > 15) {
      return { code, kind: 'time-drift', title: '인터넷이 늦게 연결됐어요', message: '기록 시각이 15분 넘게 지나 확인할 수 없어요. 지금 시각으로 다시 시도할게요.', retryable: true };
    }
    return { code, kind: 'permission', title: '확인이 필요해요', message: '보호자만 바꿀 수 있는 항목이에요. 보호자에게 알려 주세요.', retryable: false };
  }
  if (['unavailable', 'deadline-exceeded', 'aborted', 'cancelled', 'internal'].includes(code)) {
    return { code, kind: 'offline', title: '연결이 잠시 끊겼어요', message: '인터넷이 돌아오면 자동으로 다시 보낼게요. 화면은 그대로 두셔도 돼요.', retryable: true };
  }
  if (code === 'not-found') return { code, kind: 'missing', title: '자료를 찾지 못했어요', message: '보호자 기기에서 다시 확인해 주세요.', retryable: false };
  return { code, kind: 'unknown', title: '보내지 못했어요', message: '잠시 뒤 다시 시도해 주세요. 계속되면 보호자에게 알려 주세요.', retryable: true };
}

/* ────────────────────────────── 5) 백업 분할 ────────────────────────────── */
const bytesOf = (v) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length;

/** Timestamp → ISO 문자열 등, JSON 으로 안전하게 저장할 수 있는 모양으로 */
export function toPlain(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return { __ts: value.toDate().toISOString() };
    const out = {};
    Object.keys(value).sort().forEach((k) => { out[k] = toPlain(value[k]); });
    return out;
  }
  return value;
}
/** 복원용: __ts / 서버시각 필드는 serverTimestamp() 로 되돌립니다 */
export function fromPlain(value, sdk) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => fromPlain(v, sdk));
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '__ts')) return sdk.serverTimestamp();
    const out = {};
    Object.keys(value).forEach((k) => {
      if (TS_FIELDS.includes(k) && sdk && sdk.serverTimestamp) { out[k] = sdk.serverTimestamp(); return; }
      out[k] = fromPlain(value[k], sdk);
    });
    return out;
  }
  return value;
}

/**
 * 기록 목록을 1MiB 미만 조각으로 나눕니다. (Firestore 문서 한도는 1,048,576 byte)
 * @param {{path:string, data:object}[]} records
 * @param {number} maxBytes
 */
export function chunkRecords(records, maxBytes = MAX_CHUNK_BYTES) {
  const chunks = [];
  let cur = { index: chunks.length, bytes: 2, records: [] };
  for (const rec of records) {
    const size = bytesOf(rec) + 1;
    if (cur.records.length && cur.bytes + size > maxBytes) { chunks.push(cur); cur = { index: chunks.length, bytes: 2, records: [] }; }
    cur.records.push(rec);
    cur.bytes += size;
  }
  if (cur.records.length) chunks.push(cur);
  return chunks.map((c, i) => ({ index: i, bytes: bytesOf(c.records) + 2, count: c.records.length, records: c.records }));
}

/** 아주 단순한 체크섬(FNV-1a) — 백업이 그대로인지 비교용. 비밀번호·인증 용도가 아닙니다. */
export function checksumOf(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(toPlain(v));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* ────────────────────────────── 6) 연동 본체 (Firestore) ────────────────────────────── */
/**
 * @param {object} deps
 * @param {object} deps.sdk    firebase/firestore 모듈 함수 묶음
 * @param {object} [deps.auth] firebase/auth 인스턴스 (브라우저)
 * @param {object} deps.db     firestore 인스턴스
 * @param {(role_path:string, data:object)=>void} [deps.onData]
 * @param {(info:object)=>void} [deps.onError]
 */
export function createFamilySync(deps = {}) {
  const sdk = deps.sdk;
  if (!sdk) throw new Error('Firebase SDK 함수 묶음(sdk)이 필요합니다');
  const db = deps.db;
  const auth = deps.auth || null;
  const root = deps.root || FAMILY_ROOT;
  const kidId = deps.kidId || KID_ID;
  const nowFn = deps.now || (() => new Date());

  let unsubs = [];
  let role = '';
  let uid = '';
  let listening = false;
  let authGeneration = 0;

  const pathOf = (sub) => `${root}/${sub}`;
  const colRef = (name) => sdk.collection(db, pathOf(name));
  const docRef = (p) => sdk.doc(db, p);
  const sessionIsCurrent = (generation, expectedRole, expectedUid) =>
    generation === authGeneration && role === expectedRole && uid === expectedUid
      && (!auth || !!(auth.currentUser && auth.currentUser.uid === expectedUid));
  const activeSession = ({ by = uid, r = role } = {}) => {
    const expectedUid = String(by || '');
    const generation = authGeneration;
    return sessionIsCurrent(generation, r, expectedUid)
      ? { generation, role: r, uid: expectedUid }
      : null;
  };
  const sessionChanged = () => ({ kind: 'session-changed', title: '로그인 상태가 바뀌었어요', message: '다시 로그인한 뒤 시도해 주세요.', retryable: false });

  /* ---- 역할 판별 + 차단 ---- */
  async function applyAuthUser(user) {
    const generation = ++authGeneration;
    stopAll(); role = ''; uid = '';
    if (!user) return { state: 'signed-out', role: '' };
    let claims = {};
    try {
      const tok = await user.getIdTokenResult();
      claims = (tok && tok.claims) || {};
    } catch (e) {
      claims = {};
    }
    if (generation !== authGeneration || (auth && (!auth.currentUser || auth.currentUser.uid !== user.uid))) {
      return { state: 'stale', role: '' };
    }
    const r = resolveRole(claims);
    if (!r) {
      // 규칙이 role 을 요구하므로, role 이 없으면 아무것도 읽을 수 없습니다.
      // 즉시 로그아웃 + 모든 onSnapshot 리스너 해제 (요구사항: 안내 화면 차단)
      const info = { state: 'denied', reason: 'no-role', message: '이 계정에는 가족 권한(role)이 없어요. 보호자에게 권한 설정을 요청해 주세요.' };
      if (deps.onError) deps.onError(info);
      try { await sdk.signOut(auth); } catch (e) { /* 이미 로그아웃 */ }
      return info;
    }
    if (generation !== authGeneration) return { state: 'stale', role: '' };
    role = r; uid = user.uid || '';
    return { state: 'ready', role, uid, displayName: user.displayName || '', email: user.email || '' };
  }

  /* ---- 실시간 구독 ---- */
  function startSubscriptions(handlers = {}) {
    const onData = handlers.onData || deps.onData || (() => {});
    const onError = handlers.onError || deps.onError || (() => {});
    if (!role) return { error: 'no-role' };
    const generation = authGeneration;
    const subscribedRole = role;
    const subscribedUid = uid;
    stopAll();
    const push = (key) => (snap) => {
      if (!sessionIsCurrent(generation, subscribedRole, subscribedUid)) return;
      const docs = snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : (snapExists(snap) ? [{ id: snap.id, ...snap.data() }] : []);
      onData({ key, docs });
    };
    const fail = (key) => (err) => {
      if (sessionIsCurrent(generation, subscribedRole, subscribedUid)) onError({ ...classifyFirestoreError(err), path: key });
    };
    PLAIN_COLLECTIONS.forEach((name) => {
      unsubs.push(sdk.onSnapshot(colRef(name), push(name), fail(name)));
    });
    // 이번 달 로그(화면용) + 미정산 로그(합계 계산용)
    const monthStart = kstMonthStart(nowFn());
    unsubs.push(sdk.onSnapshot(
      sdk.query(colRef('logs'), sdk.where('date', '>=', monthStart)),
      push('logs'), fail('logs')));
    unsubs.push(sdk.onSnapshot(
      sdk.query(colRef('logs'), sdk.where('settled', '==', false)),
      push('pendingLogs'), fail('pendingLogs')));
    unsubs.push(sdk.onSnapshot(docRef(pathOf('stats/summary')), push('summary'), fail('summary')));
    unsubs.push(sdk.onSnapshot(docRef(pathOf('child_state/partner')), push('partner'), fail('partner')));
    // 🎪 이벤트 센터 — 가족 모두 읽고(부모만 씀) 아이 화면에도 비밀 상자·도장판이 보입니다
    unsubs.push(sdk.onSnapshot(docRef(pathOf('child_state/event_center')), push('eventCenter'), fail('eventCenter')));
    // 🏫 오늘 학교 — 부모가 고치면 아이 기기·태블릿이 그대로 읽어 갑니다
    unsubs.push(sdk.onSnapshot(docRef(pathOf('child_state/today_school')), push('school'), fail('school')));
    // ⏰ 맞춤 알람 — 부모가 만들고 고치며, 아이 기기·태블릿은 읽어서 그대로 울립니다
    unsubs.push(sdk.onSnapshot(docRef(pathOf('child_state/custom_alarms')), push('alarms'), fail('alarms')));
    // PIN은 비공개 문서이며, 부모 세션에만 구독을 열어 부모 기기끼리 맞춥니다.
    if (role === 'parent') {
      unsubs.push(sdk.onSnapshot(docRef(pathOf('private/parent_config')), push('parentConfig'), fail('parentConfig')));
    }
    listening = true;
    return { ok: true, listeners: unsubs.length };
  }

  function stopAll() {
    unsubs.forEach((u) => { try { u(); } catch (e) { /* noop */ } });
    unsubs = [];
    listening = false;
  }

  /* ---- 로그 payload (아이 기기) ---- */
  function buildLogPayload(mission, { at, date, by, member } = {}) {
    const when = at || kstHhmm(nowFn());
    const day = date || kstTodayStr(nowFn());
    const base = intOf(mission.points);
    const due = isHhmm(mission.due) ? mission.due : '';
    const goalMet = !!(due && toMin(when) != null && toMin(when) <= toMin(due));
    const bonus = goalMet ? intOf(mission.bonus) : 0;
    const who = (member === 'm1' || member === 'm2' || member === kidId || member === '') ? member : kidId;
    return {
      id: `${day}_${mission.id}_${who}`,
      date: day, at: when, mid: mission.id, title: String(mission.title || ''),
      member: who, base, bonus, earned: base + bonus, due, goalMet,
      settled: false,
      createdAt: sdk.serverTimestamp(),
      createdBy: by || '',
    };
  }

  /** 아이 체크 → 로그 쓰기. 자정/지연 거절이면 안내용 분류를 돌려주고, 재시도로 살아납니다. */
  async function writeLog(mission, { at, date, by, member, retries = 1 } = {}) {
    const session = activeSession({ by, r: role });
    if (!session || (session.role !== 'child' && session.role !== 'parent')) return { ok: false, cancelled: true, error: sessionChanged() };
    const today = kstTodayStr(nowFn());
    let attempt = 0;
    let lastErr = null;
    while (attempt <= retries) {
      const payload = buildLogPayload(mission, { at: attempt === 0 ? at : undefined, date, by, member });
      try {
        if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged(), payload, attempts: attempt + 1 };
        await sdk.setDoc(docRef(pathOf(`logs/${logDocId(payload)}`)), payload);
        return { ok: true, id: logDocId(payload), payload, attempts: attempt + 1 };
      } catch (e) {
        if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged(), payload, attempts: attempt + 1 };
        lastErr = e;
        const info = classifyFirestoreError(e, { date: payload.date, today, at: payload.at, nowMin: toMin(kstHhmm(nowFn())) });
        if (info.kind === 'time-drift' && attempt < retries) { attempt += 1; continue; }
        return { ok: false, error: info, payload, attempts: attempt + 1 };
      }
    }
    return { ok: false, error: classifyFirestoreError(lastErr), attempts: attempt + 1 };
  }

  async function deleteLog(log) {
    const session = activeSession();
    if (!session) return { ok: false, cancelled: true, error: sessionChanged() };
    try {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.deleteDoc(docRef(pathOf(`logs/${logDocId(log)}`)));
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e, { date: log.date, settled: log.settled === true }) };
    }
  }

  /* ---- 🎪 이벤트 센터 저장 (부모 기기) ----
     경로: households/main/child_state/event_center
     규칙: match /households/{hh}/child_state/{docId} → read: isFamily(), write: isParent()
     → 부모는 setDoc 가능, 아이 기기는 읽기만 (쓰기는 보내기 전에 막고 이유를 돌려줍니다) */
  async function pushEventCenter(data = {}) {
    const session = activeSession({ r: 'parent' });
    if (!session || role !== 'parent') {
      return { ok: false, cancelled: true, denied: [{ collection: 'child_state', id: 'event_center', reason: '이벤트 설정은 보호자 기기에서만 저장할 수 있어요' }] };
    }
    try {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.setDoc(docRef(pathOf('child_state/event_center')), { ...eventCenterDoc(data), updatedAt: sdk.serverTimestamp() });
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  /* ---- 🏫 오늘 학교 저장 (부모 기기) ----
     경로: households/main/child_state/today_school
     규칙: child_state/{docId} = 가족 읽기 / 부모 쓰기 → 아이 기기는 읽기만 합니다. */
  async function pushSchool(data = {}) {
    const session = activeSession({ r: 'parent' });
    if (!session || role !== 'parent') {
      return { ok: false, cancelled: true, denied: [{ collection: 'child_state', id: 'today_school', reason: '학교 급식·시간표는 보호자 기기에서만 저장할 수 있어요' }] };
    }
    try {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      const doc = schoolDocOf(data);
      await sdk.setDoc(docRef(pathOf('child_state/today_school')), { ...doc, updatedAt: sdk.serverTimestamp() });
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  /* ---- ⏰ 맞춤 알람 저장 (부모 기기) ----
     경로: households/main/child_state/custom_alarms
     규칙: child_state/{docId} = 가족 읽기 / 부모 쓰기 → 아이 기기·태블릿은 읽기만 합니다. */
  async function pushAlarms(data = {}) {
    const session = activeSession({ r: 'parent' });
    if (!session || role !== 'parent') {
      return { ok: false, cancelled: true, denied: [{ collection: 'child_state', id: 'custom_alarms', reason: '맞춤 알람은 보호자 기기에서만 저장할 수 있어요' }] };
    }
    try {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.setDoc(docRef(pathOf('child_state/custom_alarms')), { ...customAlarmDoc(data), updatedAt: sdk.serverTimestamp() });
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  /* ---- 🎁 이벤트 보너스 포인트 → logs 문서 (정산에 함께 합산) ----
     부모 create 는 규칙에서 모양 검사를 더하지 않습니다(아이 create 만 교차 검증).
     문서 ID = {date}_{mid}_m3 → 같은 날 같은 보너스가 두 번 들어가지 않습니다. */
  async function writeBonusLog({ date, at, mid, title, points } = {}) {
    const session = activeSession();
    if (!session || (session.role !== 'parent' && session.role !== 'child')) return { ok: false, cancelled: true, error: sessionChanged() };
    if (session.role !== 'parent') {
      return { ok: false, denied: [{ collection: 'logs', reason: '보너스 포인트는 보호자 기기에서 넣을 수 있어요' }] };
    }
    const day = isDateStr(date) ? date : kstTodayStr(nowFn());
    const when = isHhmm(at) ? at : kstHhmm(nowFn());
    const pts = intOf(points);
    if (!pts) return { ok: false, error: { kind: 'validation', title: '포인트 없음', message: '보너스 포인트가 0이에요.' } };
    const id = String(mid || `bonus_${day}`).slice(0, 60);
    const payload = {
      id, date: day, at: when, mid: id, title: String(title || '보너스').slice(0, 60),
      kind: 'bonus', member: kidId, base: pts, bonus: 0, earned: pts, due: '', goalMet: false,
      settled: false, createdAt: sdk.serverTimestamp(), createdBy: session.uid,
    };
    try {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.setDoc(docRef(pathOf(`logs/${logDocId(payload)}`)), payload);
      return { ok: true, id: logDocId(payload) };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  /* ---- 정산 트랜잭션 (부모 기기) ---- */
  async function settleUnsettled({ by = uid, chunkSize = 100 } = {}) {
    const session = activeSession({ by, r: 'parent' });
    if (!session) return { ok: false, cancelled: true, ...sessionChanged() };
    try {
      const pendingSnap = await sdk.getDocs(sdk.query(colRef('logs'), sdk.where('settled', '==', false)));
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, ...sessionChanged() };
      const refs = pendingSnap.docs.map((d) => d.ref);
      let total = 0, count = 0, rounds = 0, bonusPoints = 0, boardsCompleted = 0;
      for (let i = 0; i < refs.length; i += chunkSize) {
        if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, ...sessionChanged() };
        const slice = refs.slice(i, i + chunkSize);
        const res = await sdk.runTransaction(db, async (tx) => {
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { total: 0, count: 0, cancelled: true };
          const summRef = docRef(pathOf('stats/summary'));
          const summSnap = await tx.get(summRef);
          const before = snapExists(summSnap) ? summSnap.data() : { totalXp: 0, settledCount: 0, monthly: {}, byMember: {} };
          const targets = [];
          for (const ref of slice) {                       // 읽기를 모두 끝낸 뒤에 씁니다
            const s = await tx.get(ref);
            if (!s.exists || s.data().settled !== false) continue;
            targets.push({ ref, log: s.data() });
          }
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { total: 0, count: 0, cancelled: true };
          if (!targets.length) return { total: 0, count: 0 };
          const stampBoard = advanceStampBoard({
            progress: before.stampProgress,
            completed: before.stampBoardsCompleted,
            logs: targets.map(({ log }) => log),
          });
          const monthly = JSON.parse(JSON.stringify(before.monthly || {}));
          const byMember = { ...(before.byMember || {}) };
          let t = 0, kidT = 0, c = 0;
          targets.forEach(({ ref, log }) => {
            tx.update(ref, { settled: true, settledAt: sdk.serverTimestamp(), settledBy: by });
            const earned = intOf(log.earned);
            const key = bmKey(log.member);
            t += earned; c += 1;
            if (log.member === kidId) kidT += earned;
            byMember[key] = intOf(byMember[key]) + earned;
            const mk = monthOf(log.date);
            const cur = monthly[mk] || { total: 0, count: 0, byMember: {} };
            const bm = { ...(cur.byMember || {}) };
            bm[key] = intOf(bm[key]) + earned;
            monthly[mk] = { total: intOf(cur.total) + earned, count: intOf(cur.count) + 1, byMember: bm };
          });
          Object.entries(stampBoard.bonusByMonth).forEach(([mk, bonus]) => {
            const cur = monthly[mk] || { total: 0, count: 0, byMember: {} };
            const bm = { ...(cur.byMember || {}) };
            bm[kidId] = intOf(bm[kidId]) + bonus;
            monthly[mk] = { total: intOf(cur.total) + bonus, count: intOf(cur.count), byMember: bm };
            byMember[kidId] = intOf(byMember[kidId]) + bonus;
            kidT += bonus;
          });
          const payload = {
            totalXp: intOf(before.totalXp) + kidT,
            settledCount: intOf(before.settledCount) + c,
            stampProgress: stampBoard.progress,
            stampBoardsCompleted: stampBoard.completed,
            monthly, byMember,
            updatedAt: sdk.serverTimestamp(),
          };
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { total: 0, count: 0, cancelled: true };
          if (snapExists(summSnap)) tx.update(summRef, payload); else tx.set(summRef, payload);
          return { total: t, count: c, bonusPoints: stampBoard.bonusPoints, boardsCompleted: stampBoard.boardsAwarded };
        });
        if (!sessionIsCurrent(session.generation, 'parent', session.uid) || res.cancelled) return { ok: false, cancelled: true, ...sessionChanged() };
        total += res.total; count += res.count; rounds += 1;
        bonusPoints += intOf(res.bonusPoints); boardsCompleted += intOf(res.boardsCompleted);
        if (!res.count) break;
      }
      return { ok: true, total, count, rounds, bonusPoints, boardsCompleted };
    } catch (e) {
      return { ok: false, ...classifyFirestoreError(e) };
    }
  }

  /* ---- 파트너 입양 (아이가 쓸 수 있는 유일한 상태 문서) ---- */
  async function adoptPartner({ key, sinceXp = 0 }) {
    const session = activeSession();
    if (!session) return { ok: false, cancelled: true, error: sessionChanged() };
    try {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.setDoc(docRef(pathOf('child_state/partner')), {
        partnerKey: String(key || '').toLowerCase(),
        sinceXp: intOf(sinceXp),
        updatedAt: sdk.serverTimestamp(),
      });
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  /* ---- 변경분 push (앱 save() → 여기) ---- */
  function diffById(prevArr, nextArr) {
    const prev = new Map((prevArr || []).map((x) => [String(x.id), x]));
    const next = new Map((nextArr || []).map((x) => [String(x.id), x]));
    const added = [], updated = [], removed = [];
    next.forEach((v, k) => { const p = prev.get(k); if (!p) added.push(v); else if (JSON.stringify(p) !== JSON.stringify(v)) updated.push({ before: p, after: v }); });
    prev.forEach((v, k) => { if (!next.has(k)) removed.push(v); });
    return { added, updated, removed };
  }

  const CHILD_WRITABLE = ['wishlist', 'shopping', 'letters'];
  const CHILD_UPDATABLE = ['shopping', 'letters'];

  /**
   * 로컬 상태의 변경분을 Firestore 에 반영합니다.
   * 아이 역할에서 쓸 수 없는 컬렉션은 **보내기 전에 막고** 이유를 돌려줍니다(불필요한 permission-denied 방지).
   */
  async function pushPatch({ prev = {}, next = {}, by = uid, r = role, skipLogs = false } = {}) {
    const written = [];
    const denied = [];
    const errors = [];
    const session = activeSession({ by, r });
    if (!session) return { ok: false, cancelled: true, written, denied, errors, role: r };
    const stamp = sdk.serverTimestamp();
    const batchOps = [];
    const pushOp = (fn) => batchOps.push(fn);

    for (const name of PLAIN_COLLECTIONS) {
      // 미션은 '정의'만 비교합니다 — 오늘 완료 표시(doneOn·earned)는 logs 의 몫입니다
      const prevArr = name === 'missions' ? (prev[name] || []).map((m) => missionDocOf(m)) : prev[name];
      const nextArr = name === 'missions' ? (next[name] || []).map((m) => missionDocOf(m)) : next[name];
      const d = diffById(prevArr, nextArr);
      if (!d.added.length && !d.updated.length && !d.removed.length) continue;
      if (r !== 'parent' && !(r === 'child' && CHILD_WRITABLE.includes(name))) {
        denied.push({ collection: name, reason: '아이 기기는 이 항목을 바꿀 수 없어요', counts: { added: d.added.length, updated: d.updated.length, removed: d.removed.length } });
        continue;
      }

      d.added.forEach((item) => {
        let data;
        if (name === 'missions') data = missionDocOf(item);
        else if (name === 'wishlist') {
          data = wishDocOf(item, { uid: by, createdAt: stamp });
          if (r === 'child') { data.by = kidId; data.boughtAt = ''; }
        }
        else if (name === 'shopping') data = shoppingDocOf(item, { uid: by, createdAt: stamp });
        else if (name === 'letters') data = letterDocOf(item, { uid: by, createdAt: stamp });
        else data = { ...item };
        delete data.__parent;
        pushOp(async () => sdk.setDoc(docRef(pathOf(`${name}/${item.id}`)), data));
        written.push({ collection: name, id: item.id, op: 'create' });
      });
      d.updated.forEach(({ before, after }) => {
        if (r === 'child' && (!CHILD_UPDATABLE.includes(name) || before.createdBy !== by)) {
          denied.push({ collection: name, id: after.id, reason: '아이 기기는 직접 만든 장보기·편지만 수정할 수 있어요' });
          return;
        }
        let data;
        if (name === 'missions') data = missionDocOf(after);
        else if (name === 'wishlist') { data = wishDocOf(after, { uid: by, createdAt: stamp }); delete data.createdBy; delete data.createdAt; delete data.__parent; }
        else if (name === 'shopping') { data = shoppingDocOf(after, { uid: by, createdAt: stamp }); delete data.createdBy; delete data.createdAt; }
        else if (name === 'letters') { data = letterDocOf(after, { uid: by, createdAt: stamp }); delete data.createdBy; delete data.createdAt; }
        else data = { ...after };
        pushOp(async () => sdk.updateDoc(docRef(pathOf(`${name}/${after.id}`)), data));
        written.push({ collection: name, id: after.id, op: 'update' });
      });
      d.removed.forEach((item) => {
        if (r === 'child' && item.createdBy !== by) {
          denied.push({ collection: name, id: item.id, reason: '아이 기기는 직접 만든 항목만 지울 수 있어요' });
          return;
        }
        pushOp(async () => sdk.deleteDoc(docRef(pathOf(`${name}/${item.id}`))));
        written.push({ collection: name, id: item.id, op: 'delete' });
      });
    }

    /* ---- 로그: 문서 ID 규칙 + 아이 권한 ----
       skipLogs=true 이면 로그는 앱이 writeLog()/deleteLog() 로 '한 건씩' 직접 다룹니다
       (체크 직후 바로 취소해도 서버에 유령 기록이 남지 않게) */
    if (skipLogs) return await finish();
    const logDiff = diffById((prev.logs || []).map((l) => ({ ...l, id: logDocId(l) })), (next.logs || []).map((l) => ({ ...l, id: logDocId(l) })));
    const today = kstTodayStr(nowFn());
    logDiff.added.forEach((l) => {
      // 아이 기기가 만드는 로그의 member 는 항상 아이(m3) — 서버 규칙과 같은 기준으로 '오늘'만 확인합니다
      if (r !== 'parent' && l.date !== today) {
        denied.push({ collection: 'logs', id: logDocId(l), reason: '아이는 오늘 기록만 만들 수 있어요' });
        return;
      }
      const data = r === 'parent'
        ? { ...l, id: l.id, member: l.member || kidId, settled: l.settled === true, createdBy: by, createdAt: stamp }
        : { ...buildLogPayload({ id: l.mid, title: l.title, points: l.base, due: l.due, bonus: bonusOfLog(l) }, { at: l.at, date: l.date, by }) };
      pushOp(async () => sdk.setDoc(docRef(pathOf(`logs/${logDocId(l)}`)), data));
      written.push({ collection: 'logs', id: logDocId(l), op: 'create' });
    });
    logDiff.removed.forEach((l) => {
      if (r !== 'parent' && (l.date !== today || l.settled === true)) {
        denied.push({ collection: 'logs', id: logDocId(l), reason: '오늘·정산 전 본인 기록만 취소할 수 있어요' });
        return;
      }
      pushOp(async () => sdk.deleteDoc(docRef(pathOf(`logs/${logDocId(l)}`))));
      written.push({ collection: 'logs', id: logDocId(l), op: 'delete' });
    });
    if (logDiff.updated.length) denied.push({ collection: 'logs', reason: '기록 수정은 보호자만 할 수 있어요(정산 조작 방지)', counts: { updated: logDiff.updated.length } });

    async function finish() {
      let failed = null;
      if (batchOps.length) {
        try {
          for (const op of batchOps) {
            if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, written, denied, errors, role: r };
            await op();
          }
        }
        catch (e) { failed = classifyFirestoreError(e); errors.push(failed); }
      }
      return { ok: !failed, written, denied, errors, role: r };
    }

    let failed = null;
    if (batchOps.length) {
      try {
        for (const op of batchOps) {
          if (!sessionIsCurrent(session.generation, session.role, session.uid)) return { ok: false, cancelled: true, written, denied, errors, role: r };
          await op();                                  // 한 건씩 — 실패한 항목을 정확히 알기 위해
        }
      } catch (e) {
        failed = classifyFirestoreError(e);
        errors.push(failed);
      }
    }
    return { ok: !failed, written, denied, errors, role: r };
  }

  const bonusOfLog = (l) => (l.goalMet ? intOf(l.bonus) : 0);

  /* ---- 백업 (부모 기기 전용) · 복원 ---- */
  async function readAllRecords(session = activeSession({ r: 'parent' })) {
    if (!session || session.role !== 'parent') throw Object.assign(new Error('Parent session required'), { code: 'auth/session-changed' });
    const records = [];
    for (const name of PLAIN_COLLECTIONS) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) throw Object.assign(new Error('Session changed'), { code: 'auth/session-changed' });
      const snap = await sdk.getDocs(colRef(name));
      snap.docs.forEach((d) => records.push({ path: pathOf(`${name}/${d.id}`), data: toPlain(d.data()) }));
    }
    if (!sessionIsCurrent(session.generation, 'parent', session.uid)) throw Object.assign(new Error('Session changed'), { code: 'auth/session-changed' });
    const logsSnap = await sdk.getDocs(colRef('logs'));
    logsSnap.docs.forEach((d) => records.push({ path: pathOf(`logs/${d.id}`), data: toPlain(d.data()) }));
    if (!sessionIsCurrent(session.generation, 'parent', session.uid)) throw Object.assign(new Error('Session changed'), { code: 'auth/session-changed' });
    const familySnap = await sdk.getDoc(docRef(root));
    if (snapExists(familySnap)) records.push({ path: root, data: toPlain(familySnap.data()) });
    for (const sub of ['stats/summary', 'child_state/partner', 'private/parent_config']) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) throw Object.assign(new Error('Session changed'), { code: 'auth/session-changed' });
      const path = pathOf(sub);
      const s = await sdk.getDoc(docRef(path));
      if (snapExists(s)) records.push({ path, data: toPlain(s.data()) });
    }
    // 결정적 정렬(체크섬이 매번 같도록)
    records.sort((a, b) => a.path.localeCompare(b.path));
    return records;
  }

  /**
   * 부모 기기에서만 백업을 만듭니다. 아이 기기는 읽지도 않고 즉시 건너뜁니다.
   * @returns {{skipped:boolean, reason?:string, chunks:object[], docCount:number, totalBytes:number, checksum:string}}
   */
  async function createBackup({ r = role } = {}) {
    if (r !== 'parent') return { skipped: true, reason: 'child-device', chunks: [], docCount: 0, totalBytes: 0, checksum: checksumOf([]), message: '자동 백업은 보호자 기기에서만 실행돼요' };
    const session = activeSession({ r });
    if (!session) return { skipped: true, reason: 'session-changed', chunks: [], docCount: 0, totalBytes: 0, checksum: checksumOf([]) };
    try {
      const records = await readAllRecords(session);
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { skipped: true, reason: 'session-changed', chunks: [], docCount: 0, totalBytes: 0, checksum: checksumOf([]) };
      const chunks = chunkRecords(records);
      const oversize = chunks.filter((c) => c.bytes >= 1024 * 1024);
      return {
        skipped: false,
        createdAt: nowFn().toISOString(),
        chunks: chunks.map((c) => ({ index: c.index, bytes: c.bytes, count: c.count, records: c.records })),
        docCount: records.length,
        totalBytes: chunks.reduce((s, c) => s + c.bytes, 0),
        maxChunkBytes: chunks.reduce((m, c) => Math.max(m, c.bytes), 0),
        oversize: oversize.length,
        checksum: checksumOf(records),
      };
    } catch (e) {
      if (e && e.code === 'auth/session-changed') return { skipped: true, reason: 'session-changed', chunks: [], docCount: 0, totalBytes: 0, checksum: checksumOf([]) };
      return { skipped: true, reason: 'error', error: classifyFirestoreError(e), chunks: [], docCount: 0, totalBytes: 0 };
    }
  }

  /**
   * 백업 복원 — 부모만. 각 조각을 그대로 덮어쓰고, 쓴 뒤 다시 읽어 비교합니다.
   * @returns {{ok:boolean, written:number, verified:{matched:number, mismatched:object[]}}}
   */
  async function restoreBackup(backup, { r = role, verify = true, by = uid } = {}) {
    if (r !== 'parent') return { ok: false, reason: 'not-parent', written: 0, verified: { matched: 0, mismatched: [] } };
    if (!backup || !Array.isArray(backup.chunks)) return { ok: false, reason: 'bad-backup', written: 0, verified: { matched: 0, mismatched: [] } };
    const session = activeSession({ by, r: 'parent' });
    if (!session) return { ok: false, cancelled: true, reason: 'session-changed', written: 0, verified: { matched: 0, mismatched: [] } };
    let written = 0;
    let currentPath = '';
    try {
      for (const chunk of backup.chunks) {
        for (const rec of chunk.records) {
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, reason: 'session-changed', written, verified: { matched: 0, mismatched: [] } };
          currentPath = rec.path;
          const target = docRef(rec.path);
          let data = fromPlain(rec.data, sdk);
          // 이미 있는 문서를 덮어쓸 때는 '만든 시각'을 그대로 둡니다
          // (shopping·letters 규칙이 createdBy·createdAt 불변을 요구하기 때문)
          const existing = await sdk.getDoc(target);
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, reason: 'session-changed', written, verified: { matched: 0, mismatched: [] } };
          const prev = snapExists(existing) ? existing.data() : null;
          if (prev && prev.createdAt) data = { ...data, createdAt: prev.createdAt };
          if (prev && prev.createdBy) data = { ...data, createdBy: prev.createdBy };
          await sdk.setDoc(target, data);
          written += 1;
        }
      }
      if (!verify) return { ok: true, written, verified: { matched: 0, mismatched: [] } };
      const mismatched = [];
      let matched = 0;
      for (const chunk of backup.chunks) {
        for (const rec of chunk.records) {
          if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, reason: 'session-changed', written, verified: { matched, mismatched } };
          const s = await sdk.getDoc(docRef(rec.path));
          const got = toPlain(snapExists(s) ? s.data() : null);
          const want = toPlain(rec.data);
          // 서버 시각 필드는 복원 시 새로 찍히므로 비교에서 뺍니다
          const strip = (o) => { const c = { ...(o || {}) }; TS_FIELDS.forEach((f) => { if (f in c) delete c[f]; }); return c; };
          if (JSON.stringify(strip(got)) === JSON.stringify(strip(want))) matched += 1;
          else mismatched.push({ path: rec.path, got: strip(got), want: strip(want) });
        }
      }
      return { ok: mismatched.length === 0, written, verified: { matched, mismatched } };
    } catch (e) {
      return { ok: false, reason: 'write-failed', error: { ...classifyFirestoreError(e), path: currentPath }, written, verified: { matched: 0, mismatched: [] } };
    }
  }

  /* ---- 이관 실행 (부모 1회) ---- */
  /** migrateFromLegacyJson 의 결과를 실제 Firestore 에 씁니다. */
  async function applyMigration(plan, { by = uid, r = role, dryRun = false } = {}) {
    if (r !== 'parent') return { ok: false, reason: 'not-parent', written: 0 };
    const session = activeSession({ by, r: 'parent' });
    if (!session) return { ok: false, cancelled: true, reason: 'session-changed', written: 0 };
    const stamp = sdk.serverTimestamp();
    const ops = [];
    ops.push(async () => sdk.setDoc(docRef(root), { ...plan.family, updatedAt: stamp }));
    for (const [name, docs] of Object.entries(plan.collections)) {
      const shapeExtra = (name === 'shopping' || name === 'wishlist' || name === 'letters') ? { createdBy: by, createdAt: stamp } : {};
      docs.forEach((d) => { ops.push(async () => sdk.setDoc(docRef(pathOf(`${name}/${d.id}`)), { ...d, ...shapeExtra })); });
    }
    plan.logs.forEach((l) => {
      const { __docId, ...data } = l;
      ops.push(async () => sdk.setDoc(docRef(pathOf(`logs/${__docId}`)), { ...data, createdAt: stamp, settledAt: stamp, createdBy: by, settledBy: by }));
    });
    ops.push(async () => sdk.setDoc(docRef(pathOf('stats/summary')), { ...plan.summary, updatedAt: stamp }));
    ops.push(async () => sdk.setDoc(docRef(pathOf('child_state/partner')), { ...plan.partner, updatedAt: stamp }));
    ops.push(async () => sdk.setDoc(docRef(pathOf('private/parent_config')), { ...plan.privateConfig, updatedAt: stamp }));
    if (dryRun) return { ok: true, dryRun: true, planned: ops.length, written: 0 };
    let written = 0;
    try {
      for (const op of ops) {
        if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, reason: 'session-changed', written, planned: ops.length };
        await op(); written += 1;
      }
      return { ok: true, written, planned: ops.length };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, reason: 'session-changed', written, planned: ops.length };
      return { ok: false, error: { ...classifyFirestoreError(e), detail: String((e && e.message) || '') }, written, planned: ops.length };
    }
  }

  async function saveParentPin({ pin, by = uid } = {}) {
    const session = activeSession({ by, r: 'parent' });
    if (!session) return { ok: false, cancelled: true, error: sessionChanged() };
    const value = String(pin || '');
    if (!/^\d{4}$/.test(value)) return { ok: false, error: { kind: 'validation', message: 'PIN은 숫자 4자리여야 해요.' } };
    try {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      await sdk.setDoc(docRef(pathOf('private/parent_config')), { parentPin: value, updatedAt: sdk.serverTimestamp() }, { merge: true });
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: true };
    } catch (e) {
      if (!sessionIsCurrent(session.generation, 'parent', session.uid)) return { ok: false, cancelled: true, error: sessionChanged() };
      return { ok: false, error: classifyFirestoreError(e) };
    }
  }

  async function signOut() {
    authGeneration += 1;
    stopAll(); role = ''; uid = '';
    try { await sdk.signOut(auth); }
    catch (e) {
      const user = auth && auth.currentUser;
      if (user) await applyAuthUser(user);
      throw e;
    }
  }

  function watchAuthState(cb) {
    if (!auth) return () => {};
    return sdk.onAuthStateChanged(auth, (user) => {
      if (!user) { authGeneration += 1; stopAll(); role = ''; uid = ''; }
      cb(user);
    });
  }

  return {
    // 상태
    get role() { return role; },
    get uid() { return uid; },
    get listening() { return listening; },
    // 인증
    applyAuthUser, watchAuthState,
    signInWithRedirect: (provider) => sdk.signInWithRedirect(auth, provider),
    getRedirectResult: () => (auth ? sdk.getRedirectResult(auth) : Promise.resolve(null)),
    signOut,
    // 실시간
    startSubscriptions, stopAll,
    // 쓰기
    buildLogPayload, writeLog, deleteLog, settleUnsettled, adoptPartner, saveParentPin, pushPatch,
    pushEventCenter, pushSchool, pushAlarms, writeBonusLog,
    // 백업
    createBackup, restoreBackup, readAllRecords,
    // 이관
    applyMigration,
    // 내부 헬퍼(테스트용)
    _diffById: diffById,
  };
}

/* ────────────────────────────── ⏰ 맞춤 알람 ────────────────────────────── */
/**
 * 맞춤 알람 문서 모양 — households/main/child_state/custom_alarms
 * 규칙(child_state/{docId} = 가족 읽기 · 부모 쓰기)을 그대로 쓰므로 firestore.rules 는 그대로입니다.
 * 시각(HH:MM)이 아니거나 제목이 빈 항목은 버리고, 40개까지만 보냅니다.
 */
export function customAlarmDoc(data = {}) {
  const list = (Array.isArray(data && data.alarms) ? data.alarms : []).slice(0, 40).map((a, i) => {
    const time = isHhmm(a && a.time) ? String(a.time) : '';
    const title = String((a && a.title) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!time || !title) return null;
    const id = /^[A-Za-z0-9_-]{1,24}$/.test(String((a && a.id) || '')) ? String(a.id) : `a${i + 1}`;
    return {
      id,
      time,
      title,
      days: (Array.isArray(a && a.days) ? a.days : []).map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6).slice(0, 7),
      on: (a && a.on) !== false,
    };
  }).filter(Boolean);
  return { alarms: list };
}

/* ────────────────────────────── 7) 앱 상태 ↔ 문서 묶음 ────────────────────────────── */
/** onSnapshot 으로 받은 문서들을 앱의 S 배열 모양으로 되돌립니다. */
export function docsToState({ collections = {}, summary = null, partner = null, todayLogs = [], pendingLogs = [] } = {}) {
  const out = {};
  Object.keys(collections).forEach((k) => {
    const docs = collections[k] || [];
    out[k] = docs.map((d) => {
      const { id: docId, ...rest } = d;
      return { ...rest, id: rest.id || docId };
    });
  });
  if (summary) {
    const by = decodeBm(summary.byMember);
    out.points = { total: Object.values(by).reduce((s, v) => s + intOf(v), 0), byMember: by };
  }
  if (partner) out.partner = { key: partner.partnerKey || 'pikachu', sinceXp: intOf(partner.sinceXp) };
  const all = [...todayLogs, ...pendingLogs];
  const seen = new Set();
  out.logs = all.filter((l) => { const k = l.id || logDocId(l); if (seen.has(k)) return false; seen.add(k); return true; });
  return out;
}
