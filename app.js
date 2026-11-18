/* ==========================================================================
   우리 가족 대시보드 — app.js
   순수 바닐라 JS. 모든 기록은 이 브라우저(localStorage)에만 저장되며,
   네트워크로는 날씨(Open-Meteo)만 조회합니다.
   기본 데이터에는 개인정보가 들어 있지 않습니다 — 전부 예시값입니다.
   ========================================================================== */
(() => {
  'use strict';

  /* ---------------------------------------------------------------- helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => fmtDate(new Date());
  const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmtMD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? `${+m[2]}/${+m[3]}` : ''; };

  /* 아이 역할 구성원과 포켓몬 성장 기준 */
  const KID_ID = 'm3';        // 아이 역할 — 이름은 설정에서 바꿀 수 있고, id는 그대로 씁니다
  const FINAL_P = 200;        // 최종 진화 기준 경험치(현재 파트너)

  /* ------------------------------------------------------------- data model */
  const KEY = 'family-dashboard:v1';
  const WKEY = 'family-dashboard:weather';

  // 파트너 포켓몬 진화 라인 키 — 저장된 데이터를 읽을 때 이 목록으로 검증합니다
  const POKE_KEYS = ['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'eevee', 'riolu', 'froakie', 'dratini', 'gastly', 'piplup', 'chimchar', 'turtwig'];

  const DEFAULT_STATE = () => ({
    v: 3,
    theme: 'light',
    quiet: false,
    pokemon: { key: 'pikachu', xp: 0, dex: [] },   // 현재 파트너 라인 · 현재 파트너 경험치 · 수집 완료 도감
    location: null,             // { lat, lon, name } — 사용자가 정한 경우에만 저장
    members: [
      { id: 'm1', name: '성인 1', color: '#ff7a6b' },
      { id: 'm2', name: '성인 2', color: '#21c39a' },
      { id: 'm3', name: '아이', color: '#4f95ff' },
    ],
    events: [
      { id: uid(), date: todayStr(), time: '08:00', title: '가족 아침 식사', member: 'm1', done: false },
      { id: uid(), date: todayStr(), time: '19:30', title: '가족 회의 — 이번 주 계획', member: 'm2', done: false },
      { id: uid(), date: fmtDate(addDays(new Date(), 1)), time: '16:30', title: '도서관 들르기', member: 'm1', done: false },
      { id: uid(), date: fmtDate(addDays(new Date(), 2)), time: '17:00', title: '영어 학원', member: 'm1', done: false },
      { id: uid(), date: fmtDate(addDays(new Date(), 3)), time: '10:00', title: '주말 나들이', member: '', done: false },
    ],
    missions: [
      { id: uid(), title: '아침 먹기', points: 5, due: '08:00', bonus: 3, member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false },
      { id: uid(), title: '씻기 · 양치하기', points: 3, due: '08:10', bonus: 2, member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false },
      { id: uid(), title: '옷 입기', points: 3, due: '07:50', bonus: 2, member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false },
      { id: uid(), title: '가방 챙기기', points: 4, due: '08:20', bonus: 3, member: 'm3', doneOn: null, doneAt: '', earned: 0, goalMet: false },
      { id: uid(), title: '분리수거 내놓기', points: 3, due: '21:00', bonus: 2, member: 'm1', doneOn: null, doneAt: '', earned: 0, goalMet: false },
      { id: uid(), title: '설거지하기', points: 3, due: '', bonus: 0, member: 'm2', doneOn: null, doneAt: '', earned: 0, goalMet: false },
    ],
    logs: [],
    points: { total: 0, byMember: {} },
    pointUses: [],              // 포인트 사용 내역 { id, date, at, title, amount }
    letters: [],
    shopping: [
      { id: uid(), cat: 'buy', text: '우유', done: false },
      { id: uid(), cat: 'buy', text: '계란', done: false },
      { id: uid(), cat: 'buy', text: '사과', done: false },
      { id: uid(), cat: 'buy', text: '휴지', done: true },
      { id: uid(), cat: 'fridge', text: '김치 — 이번 주 안에 먹기', done: false },
      { id: uid(), cat: 'fridge', text: '된장 반 통 남음', done: false },
    ],
    wiki: [
      { id: uid(), group: '생신·기념일', key: '가족 생일', val: '예) 1월 12일 · 5월 3일' },
      { id: uid(), group: '생신·기념일', key: '결혼기념일', val: '예) 10월 20일' },
      { id: uid(), group: '예방접종', key: '독감 접종', val: '예) 매년 10~11월' },
      { id: uid(), group: '예방접종', key: '정기 검진', val: '예) 3월 · 9월' },
      { id: uid(), group: '집안 메모', key: '분리수거', val: '예) 화·금 저녁' },
      { id: uid(), group: '연락처·와이파이', key: 'Wi-Fi', val: '예) 와이파이 이름 / 비밀번호' },
      { id: uid(), group: '연락처·와이파이', key: '관리사무소', val: '예) 관리사무소 번호' },
    ],
    links: [
      { id: uid(), title: '유튜브 뮤직 — 가족 플레이리스트', url: 'https://music.youtube.com/' },
    ],
  });

  function mergeState(raw) {
    const base = DEFAULT_STATE();
    if (!raw || typeof raw !== 'object') return base;
    const out = Object.assign({}, base, raw);
    // 배열/객체 타입 보정
    ['members', 'events', 'missions', 'letters', 'shopping', 'wiki', 'links', 'logs', 'pointUses'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = base[k];
    });
    out.v = 3;                     // 데이터 형식 3: 아이 포인트 기준 진화 + 경험치/잔액 분리 + 도감
    const prevV = Math.max(0, Math.round(+raw.v || 0));
    if (!out.points || typeof out.points !== 'object') out.points = { total: 0, byMember: {} };
    out.points.total = Math.max(0, Math.round(+out.points.total || 0));
    if (!out.points.byMember || typeof out.points.byMember !== 'object') out.points.byMember = {};
    // 예전 데이터(할 일 · 스티커)가 있으면 한 번만 미션/포인트로 옮김
    if (Array.isArray(raw.chores) && !Array.isArray(raw.missions)) {
      out.missions = raw.chores.map((c) => ({ id: c.id || 'x' + Math.random().toString(36).slice(2, 9), title: c.title || '', points: 3, due: '', bonus: 0, member: '', doneOn: c.doneOn || null }));
      const legacyPts = Math.max(0, Math.round(+raw.stickers || 0)) * 3;
      out.points = { total: legacyPts, byMember: legacyPts ? { '': legacyPts } : {} };
    }
    // 미션 형식 보정: 목표 시간·보너스·오늘 완료 시각/획득 포인트
    out.missions.forEach((m) => {
      m.points = Math.max(0, Math.round(+m.points || 0));
      m.member = m.member || '';
      m.due = /^\d{1,2}:\d{2}$/.test(String(m.due || '')) ? pad(+String(m.due).split(':')[0]) + ':' + String(m.due).split(':')[1] : '';
      m.bonus = m.due ? Math.max(0, Math.round(+m.bonus || 0)) : 0;
      m.doneOn = m.doneOn || null;
      m.doneAt = typeof m.doneAt === 'string' ? m.doneAt : '';
      if (m.doneOn && typeof m.earned !== 'number') m.earned = m.points;   // 예전 기록은 기본 포인트만 받은 것으로 본다
      m.earned = Math.max(0, Math.round(+m.earned || 0));
      m.goalMet = !!m.goalMet;
    });
    out.logs = out.logs.filter((l) => l && typeof l === 'object' && l.date && l.at);
    out.logs.forEach((l) => {
      ['base', 'bonus', 'earned'].forEach((k) => { l[k] = Math.max(0, Math.round(+l[k] || 0)); });
      l.member = l.member || '';
      l.title = l.title || '';
      l.due = l.due || '';
      l.goalMet = !!l.goalMet;
    });
    // ---- 포켓몬 파트너/도감 (형식 2 → 3 마이그레이션 포함) ----
    const pkRaw = (raw.pokemon && typeof raw.pokemon === 'object') ? raw.pokemon : null;
    const pk = {
      key: (pkRaw && pkRaw.key) || raw.partner || base.pokemon.key,
      xp: 0,
      dex: (pkRaw && Array.isArray(pkRaw.dex)) ? pkRaw.dex : [],
    };
    if (!POKE_KEYS.includes(pk.key)) pk.key = base.pokemon.key;
    if (prevV < 3) {
      // 형식 2까지는 '가족 전체 누적 포인트'로 진화했습니다.
      // 형식 3부터는 아이(m3) 누적 포인트를 경험치로 삼으므로, 지금까지 아이가 모은 포인트를 현재 파트너 경험치로 옮겨 옵니다.
      pk.xp = Math.min(FINAL_P, Math.max(0, Math.round(+out.points.byMember[KID_ID] || 0)));
    } else if (pkRaw) {
      pk.xp = Math.max(0, Math.round(+pkRaw.xp || 0));
    }
    pk.xp = clamp(pk.xp, 0, FINAL_P);
    pk.dex = pk.dex.filter((d) => d && typeof d === 'object' && POKE_KEYS.includes(d.key)).map((d) => ({
      key: d.key,
      label: String(d.label || ''),
      finalName: String(d.finalName || ''),
      finalId: Math.max(0, Math.round(+d.finalId || 0)),
      tint: String(d.tint || ''),
      at: /^\d{4}-\d{2}-\d{2}$/.test(String(d.at || '')) ? d.at : '',
      times: Math.max(1, Math.round(+d.times || 1)),
    }));
    out.pokemon = pk;
    delete out.partner;
    delete out.budget;          // 가계부 카드는 더 이상 쓰지 않습니다 (예전 백업은 무시)

    // ---- 포인트 사용 내역 ----
    out.pointUses = out.pointUses.filter((u) => u && typeof u === 'object').map((u) => ({
      id: u.id || 'u' + Math.random().toString(36).slice(2, 9),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(u.date || '')) ? u.date : todayStr(),
      at: String(u.at || ''),
      title: String(u.title || ''),
      amount: Math.max(0, Math.round(+u.amount || 0)),
    }));

    if (typeof out.stickers !== 'number' || !isFinite(out.stickers)) out.stickers = 0;

    if (!out.members.length) out.members = base.members;
    return out;
  }

  let S;
  try {
    const raw = localStorage.getItem(KEY);
    S = mergeState(raw ? JSON.parse(raw) : null);
  } catch (e) {
    S = mergeState(null);
  }

  let saveTimer = null;
  let saveWarned = false;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
      } catch (e) {
        if (!saveWarned) {
          saveWarned = true;
          toast('저장 공간이 가득 찼어요. 편지 몇 장을 지우거나 백업 후 정리해 주세요.', 'coral', 5200);
        }
      }
      syncLocalChanged();
    }, 120);
  }

  /* ------------------------------------------------------------------- toast */
  const toastWrap = $('#toastWrap');
  function toast(msg, kind = '', ms = 2600) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  /* ------------------------------------------------------------------ confetti */
  function confetti(count = 70) {
    if (S.quiet) return;
    const layer = $('#confetti');
    const colors = ['#ff7a6b', '#ffc14d', '#21c39a', '#4f95ff', '#9b7bf0', '#ff7fb2'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      p.style.animationDelay = (Math.random() * 0.35) + 's';
      p.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      p.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      if (Math.random() > 0.5) { p.style.width = '8px'; p.style.height = '8px'; p.style.borderRadius = '50%'; }
      layer.appendChild(p);
      setTimeout(() => p.remove(), 3400);
    }
  }

  /* ============================================================ 가족 동기화
     태블릿·폰이 같은 기록을 보도록, 비공개 구글 시트(Apps Script 웹 앱)와
     '변경분(patch)'만 주고받습니다. 동기화 주소와 가족 PIN 은 이 기기에만
     저장되고, 공개 저장소 코드에는 들어가지 않습니다. */
  const SYNCKEY = 'family-dashboard:sync';
  const SYNC_POLL_MS = 30000;          // 화면이 보이는 동안 30초마다 확인
  const SYNC_ARRAYS = ['members', 'events', 'missions', 'letters', 'shopping', 'wiki', 'links', 'logs', 'pointUses'];
  const SYNC_VALUES = ['v', 'theme', 'quiet', 'location', 'pokemon', 'points', 'stickers'];

  const SY = {
    cfg: null,        // { url, pin, device, rev, lastAt, id }
    status: 'off',    // off | synced | error
    snapshot: null,   // 마지막으로 서버와 맞춘 상태 지문
    timer: null,
    pushTimer: null,
    busy: false,
    dirty: false,
    lastErr: '',
  };

  function snapOf(state) {
    const o = {};
    SYNC_ARRAYS.forEach((k) => {
      const m = {};
      (state && Array.isArray(state[k]) ? state[k] : []).forEach((it) => { if (it && it.id) m[it.id] = JSON.stringify(it); });
      o['a:' + k] = m;
    });
    SYNC_VALUES.forEach((k) => { o['v:' + k] = JSON.stringify(state ? (state[k] === undefined ? null : state[k]) : null); });
    return o;
  }

  function buildPatch(prev, state) {
    const next = snapOf(state);
    const patch = { values: {}, arrays: {} };
    let n = 0;
    SYNC_VALUES.forEach((k) => {
      if (!prev || prev['v:' + k] !== next['v:' + k]) { try { patch.values[k] = JSON.parse(next['v:' + k]); } catch (e) { /* noop */ } n++; }
    });
    SYNC_ARRAYS.forEach((k) => {
      const p = (prev && prev['a:' + k]) || {};
      const c = next['a:' + k];
      const ops = [];
      Object.keys(c).forEach((id) => { if (p[id] !== c[id]) ops.push({ op: 'set', item: JSON.parse(c[id]) }); });
      Object.keys(p).forEach((id) => { if (!(id in c)) ops.push({ op: 'del', id }); });
      if (ops.length) { patch.arrays[k] = ops; n += ops.length; }
    });
    return { patch, nextSnap: next, empty: n === 0 };
  }

  function syncDeviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return '태블릿';
    if (/Android|iPhone|Mobile/i.test(ua)) return '휴대폰';
    return 'PC';
  }

  function loadSync() {
    try {
      const raw = localStorage.getItem(SYNCKEY);
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.url || !c.pin) return false;
      SY.cfg = {
        url: String(c.url), pin: String(c.pin),
        device: String(c.device || syncDeviceLabel()),
        rev: Math.max(0, Math.round(+c.rev || 0)),
        lastAt: Math.max(0, +c.lastAt || 0),
        id: String(c.id || uid()),
      };
      SY.status = 'synced';
      return true;
    } catch (e) { SY.cfg = null; return false; }
  }

  function saveSync() {
    try { if (SY.cfg) localStorage.setItem(SYNCKEY, JSON.stringify(SY.cfg)); } catch (e) { /* noop */ }
  }

  function syncStateWord() {
    if (!SY.cfg) return '로컬 전용';
    if (SY.busy) return '동기화 중';
    if (SY.status === 'error') return '연결 확인';
    return '동기화됨';
  }
  function syncStateIcon() {
    if (!SY.cfg) return '📴';
    if (SY.busy) return '🔄';
    if (SY.status === 'error') return '⚠️';
    return '☁️';
  }
  function syncTimeText() {
    if (!SY.cfg || !SY.cfg.lastAt) return '';
    const d = new Date(SY.cfg.lastAt);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function syncNoteText() {
    if (!SY.cfg) return '아직 연결하지 않았어요. 지금은 이 기기에만 기록됩니다.';
    if (SY.status === 'error') return `동기화하지 못했어요 — ${SY.lastErr || '연결을 확인해 주세요.'}`;
    const t = syncTimeText();
    return `☁️ ${SY.cfg.device}로 연결됨 · 마지막 동기화 ${t || '—'} · 기록 번호 ${SY.cfg.rev || 0}`;
  }

  function renderSyncBadge() {
    const el = $('#syncBadge');
    if (el) {
      const st = !SY.cfg ? 'off' : (SY.busy ? 'busy' : (SY.status === 'error' ? 'err' : 'ok'));
      el.dataset.state = st;
      el.innerHTML = `<span aria-hidden="true">${syncStateIcon()}</span><span class="sync-word">${esc(syncStateWord())}</span>`;
      el.title = SY.cfg ? `${SY.cfg.device} · ${syncNoteText()}` : '가족 실시간 동기화를 켜려면 눌러 주세요';
    }
    const note = $('#syncNote');
    if (note) note.textContent = syncNoteText();
    const dot = $('#syncDot');
    if (dot) dot.dataset.state = !SY.cfg ? 'off' : (SY.status === 'error' ? 'err' : 'ok');
  }

  function setSyncStatus(st, msg) {
    SY.status = st;
    if (msg !== undefined) SY.lastErr = msg;
    renderSyncBadge();
  }

  function syncGet(qs, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) { /* noop */ } }, timeoutMs || 20000) : null;
    const opts = { cache: 'no-store', redirect: 'follow' };
    if (ctl) opts.signal = ctl.signal;
    return fetch(SY.cfg.url + qs, opts).then((r) => r.text().then((txt) => {
      if (t) clearTimeout(t);
      let data = null;
      try { data = JSON.parse(txt); } catch (e) { data = null; }
      if (!data) throw new Error('서버 응답을 읽지 못했어요');
      return data;
    })).catch((e) => { if (t) clearTimeout(t); throw e; });
  }

  // 쓰기는 '단순 요청'(text/plain, no-cors)으로 보내고, 결과는 이어지는 조회로 확인합니다.
  function syncPost(payload) {
    return fetch(SY.cfg.url, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).catch(() => null);
  }

  function applyRemote(remote, quiet) {
    if (!remote || typeof remote !== 'object') return;
    const merged = mergeState(remote);
    const same = JSON.stringify(snapOf(merged)) === JSON.stringify(snapOf(S));
    S = merged;
    SY.snapshot = snapOf(S);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
    if (!same) {
      applyTheme();
      syncDex();
      renderAll();
      renderSettings();
      if (!quiet) toast('다른 기기에서 바뀐 내용을 가져왔어요 ☁️', 'mint', 1900);
    }
    renderSyncBadge();
  }

  async function syncPushNow() {
    if (!SY.cfg || SY.busy) return false;
    const { patch, nextSnap, empty } = buildPatch(SY.snapshot || {}, S);
    if (empty) { SY.dirty = false; renderSyncBadge(); return true; }
    SY.busy = true; renderSyncBadge();
    const baseRev = Math.round(+SY.cfg.rev || 0);
    try {
      await syncPost({ pin: SY.cfg.pin, baseRev, patch, device: SY.cfg.device });
      const res = await syncGet('?pin=' + encodeURIComponent(SY.cfg.pin) + '&rev=' + baseRev);
      if (!res || !res.ok) throw new Error(res && res.error === 'pin' ? '가족 PIN이 맞지 않아요' : '서버가 요청을 받지 못했어요');
      if (res.unchanged) throw new Error('서버에 반영되지 않았어요. 잠시 뒤 다시 시도합니다');
      SY.cfg.rev = Math.max(0, Math.round(+res.rev || 0));
      SY.cfg.lastAt = Date.now();
      saveSync();
      if (res.state) applyRemote(res.state, true);
      else SY.snapshot = nextSnap;
      SY.dirty = false;
      setSyncStatus('synced', '');
      return true;
    } catch (e) {
      SY.dirty = true;
      setSyncStatus('error', (e && e.message) || '연결 오류');
      return false;
    } finally {
      SY.busy = false; renderSyncBadge();
    }
  }

  async function syncPullNow() {
    if (!SY.cfg || SY.busy) return false;
    if (SY.dirty) return syncPushNow();
    SY.busy = true; renderSyncBadge();
    const rev = Math.round(+SY.cfg.rev || 0);
    try {
      const res = await syncGet('?pin=' + encodeURIComponent(SY.cfg.pin) + '&rev=' + rev);
      if (!res || !res.ok) throw new Error(res && res.error === 'pin' ? '가족 PIN이 맞지 않아요' : '서버가 응답하지 않아요');
      SY.cfg.lastAt = Date.now();
      if (!res.unchanged) {
        SY.cfg.rev = Math.max(0, Math.round(+res.rev || 0));
        if (res.state) applyRemote(res.state); else SY.snapshot = snapOf(S);
      }
      saveSync();
      setSyncStatus('synced', '');
      return true;
    } catch (e) {
      setSyncStatus('error', (e && e.message) || '연결 오류');
      return false;
    } finally {
      SY.busy = false; renderSyncBadge();
    }
  }

  function syncTick() {
    if (!SY.cfg) return;
    if (SY.dirty) syncPushNow(); else syncPullNow();
  }

  function syncLocalChanged() {
    if (!SY.cfg) return;
    SY.dirty = true;
    clearTimeout(SY.pushTimer);
    SY.pushTimer = setTimeout(() => { syncPushNow(); }, 1500);
  }

  function startSyncLoop() {
    clearInterval(SY.timer);
    if (!SY.cfg) return;
    SY.timer = setInterval(() => { if (!document.hidden) syncTick(); }, SYNC_POLL_MS);
  }

  // 창을 닫거나 앱을 바꾸는 순간에도 마지막 변경분을 보내 두기 (응답은 다음에 조회로 확인)
  function syncFlushBeacon() {
    if (!SY.cfg || !SY.dirty) return;
    const { patch, empty } = buildPatch(SY.snapshot || {}, S);
    if (empty) return;
    const body = JSON.stringify({ pin: SY.cfg.pin, baseRev: SY.cfg.rev || 0, patch, device: SY.cfg.device });
    try {
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      if (navigator.sendBeacon && navigator.sendBeacon(SY.cfg.url, blob)) { SY.dirty = false; return; }
    } catch (e) { /* noop */ }
    try {
      fetch(SY.cfg.url, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body,
      });
    } catch (e) { /* noop */ }
  }

  function syncServerUrl(raw) {
    const s = String(raw || '').trim().replace(/[?#].*$/, '');
    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(s)) return s;
    return '';
  }

  async function syncConnect(urlRaw, pinRaw) {
    const url = syncServerUrl(urlRaw);
    const pin = String(pinRaw || '').trim();
    if (!url) return { ok: false, msg: '동기화 주소가 올바르지 않아요. https://script.google.com/macros/s/…/exec 형식이어야 합니다.' };
    if (!/^\d{4,12}$/.test(pin)) return { ok: false, msg: '가족 PIN은 숫자 4~12자리로 입력해 주세요.' };
    const keep = SY.cfg;
    SY.cfg = { url, pin, device: syncDeviceLabel(), rev: 0, lastAt: 0, id: uid() };
    SY.status = 'synced';
    renderSyncBadge();
    let res = null;
    try { res = await syncGet('?pin=' + encodeURIComponent(pin)); } catch (e) {
      SY.cfg = keep; renderSyncBadge();
      return { ok: false, msg: '서버에 연결하지 못했어요. 주소와 인터넷 연결을 확인해 주세요.' };
    }
    if (!res || !res.ok) {
      SY.cfg = keep; renderSyncBadge();
      return { ok: false, msg: res && res.error === 'pin' ? '가족 PIN이 맞지 않아요. 설정에 적힌 값을 확인해 주세요.' : '서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.' };
    }
    SY.cfg.rev = Math.max(0, Math.round(+res.rev || 0));
    if (res.empty || !res.state) {
      // 서버가 비어 있으면 이 기기 기록을 첫 기록으로 올립니다
      await syncPost({ pin, mode: 'replace', state: S, device: SY.cfg.device });
      const chk = await syncGet('?pin=' + encodeURIComponent(pin)).catch(() => null);
      if (chk && chk.ok) { SY.cfg.rev = Math.max(0, Math.round(+chk.rev || 0)); if (chk.state) applyRemote(chk.state, true); }
      SY.cfg.lastAt = Date.now(); saveSync(); startSyncLoop(); renderSyncBadge();
      return { ok: true, seeded: true };
    }
    return { ok: true, hasRemote: true, rev: SY.cfg.rev, state: res.state };
  }

  async function syncAdopt() {
    const res = await syncGet('?pin=' + encodeURIComponent(SY.cfg.pin)).catch(() => null);
    if (!res || !res.ok) { setSyncStatus('error', '가져오지 못했어요'); return false; }
    SY.cfg.rev = Math.max(0, Math.round(+res.rev || 0));
    SY.cfg.lastAt = Date.now();
    SY.dirty = false;
    saveSync();
    if (res.state) applyRemote(res.state, true);
    startSyncLoop();
    setSyncStatus('synced', '');
    return true;
  }

  async function syncReplaceAll() {
    const res0 = await syncGet('?pin=' + encodeURIComponent(SY.cfg.pin)).catch(() => null);
    SY.cfg.rev = Math.max(0, Math.round(+(res0 && res0.rev) || 0));
    await syncPost({ pin: SY.cfg.pin, mode: 'replace', state: S, baseRev: SY.cfg.rev, device: SY.cfg.device });
    const chk = await syncGet('?pin=' + encodeURIComponent(SY.cfg.pin)).catch(() => null);
    if (chk && chk.ok) {
      SY.cfg.rev = Math.max(0, Math.round(+chk.rev || 0));
      if (chk.state) applyRemote(chk.state, true); else SY.snapshot = snapOf(S);
    }
    SY.cfg.lastAt = Date.now(); SY.dirty = false;
    saveSync(); startSyncLoop(); setSyncStatus('synced', '');
    return true;
  }

  function syncDisconnect() {
    SY.cfg = null;
    SY.dirty = false;
    clearTimeout(SY.pushTimer);
    clearInterval(SY.timer);
    try { localStorage.removeItem(SYNCKEY); } catch (e) { /* noop */ }
    setSyncStatus('off', '');
  }

  // 설정 링크(#sync=...)로 한 번에 연결하기
  function syncReadLinkHash() {
    const m = /(?:^|[#&])sync=([A-Za-z0-9_\-+/=]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');;
      const txt = decodeURIComponent(escape(atob(b64)));
      const o = JSON.parse(txt);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* noop */ }
      if (!o || !o.url || !o.pin) return null;
      return { url: String(o.url), pin: String(o.pin) };
    } catch (e) { return null; }
  }

  /* -------------------------------------------------------------------- beep */
  let audioCtx = null;
  function ensureAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function beep(kind = 'alarm') {
    const ctx = ensureAudio();
    if (!ctx) return;
    const seq = kind === 'up' ? [660, 880, 1174] : [880, 1046, 1318];
    const t0 = ctx.currentTime + 0.02;
    seq.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.26;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.26);
    });
  }

  /* -------------------------------------------------------------------- clock */
  function renderClock() {
    const now = new Date();
    $('#clockTime').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    $('#clockDate').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}요일`;
    const h = now.getHours();
    $('#brandSub').textContent = h < 6 ? '늦은 밤이에요 🌙' : h < 11 ? '좋은 아침이에요 ☀️' : h < 17 ? '좋은 오후예요 🌤️' : h < 21 ? '좋은 저녁이에요 🌆' : '편안한 밤 되세요 🌙';
  }

  /* ------------------------------------------------------------------ weather */
  const WMO = {
    0: ['☀️', '맑음'], 1: ['🌤️', '대체로 맑음'], 2: ['⛅', '구름 조금'], 3: ['☁️', '흐림'],
    45: ['🌫️', '안개'], 48: ['🌫️', '서리 안개'],
    51: ['🌦️', '약한 이슬비'], 53: ['🌦️', '이슬비'], 55: ['🌦️', '짙은 이슬비'],
    56: ['🌧️', '어는 이슬비'], 57: ['🌧️', '어는 이슬비'],
    61: ['🌦️', '약한 비'], 63: ['🌧️', '비'], 65: ['🌧️', '강한 비'],
    66: ['🌨️', '어는 비'], 67: ['🌨️', '어는 비'],
    71: ['🌨️', '약한 눈'], 73: ['🌨️', '눈'], 75: ['❄️', '많은 눈'], 77: ['❄️', '눈 알갱이'],
    80: ['🌦️', '소나기'], 81: ['🌧️', '소나기'], 82: ['⛈️', '강한 소나기'],
    85: ['🌨️', '소나기 눈'], 86: ['❄️', '소나기 눈'],
    95: ['⛈️', '천둥번개'], 96: ['⛈️', '우박 동반'], 99: ['⛈️', '우박 동반'],
  };
  const wmo = (c) => WMO[c] || ['🌡️', '날씨 정보'];
  function pm10Grade(v) {
    if (v == null) return null;
    if (v <= 30) return ['좋음', 'good'];
    if (v <= 80) return ['보통', 'normal'];
    if (v <= 150) return ['나쁨', 'bad'];
    return ['매우 나쁨', 'worst'];
  }
  function pm25Grade(v) {
    if (v == null) return null;
    if (v <= 15) return ['좋음', 'good'];
    if (v <= 35) return ['보통', 'normal'];
    if (v <= 75) return ['나쁨', 'bad'];
    return ['매우 나쁨', 'worst'];
  }

  let W = null;              // { now, daily, air, at, locName }
  let weatherBusy = false;
  const FALLBACK_LOC = { lat: 37.5665, lon: 126.978, name: '기본 위치(서울)' };

  function loadWeatherCache() {
    try {
      const raw = localStorage.getItem(WKEY);
      if (raw) W = JSON.parse(raw);
    } catch (e) { /* noop */ }
  }
  function saveWeatherCache() {
    try { localStorage.setItem(WKEY, JSON.stringify(W)); } catch (e) { /* noop */ }
  }

  function currentLoc() {
    return S.location || FALLBACK_LOC;
  }

  async function refreshWeather(showToast = false) {
    if (weatherBusy) return;
    weatherBusy = true;
    const loc = currentLoc();
    const wURL = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&hourly=temperature_2m,precipitation_probability&timezone=auto&forecast_days=7';
    const aURL = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + loc.lat +
      '&longitude=' + loc.lon + '&current=pm10,pm2_5,european_aqi&timezone=auto';
    try {
      const [wr, ar] = await Promise.allSettled([
        fetch(wURL, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); }),
        fetch(aURL, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('air ' + r.status); return r.json(); }),
      ]);
      if (wr.status !== 'fulfilled') throw new Error('weather request failed');
      const w = wr.value;
      let air = ar.status === 'fulfilled' ? ar.value.current : null;
      // 미세먼지 API가 첫 호출에서 가끔 늦거나 빈 응답을 주므로 한 번 더 시도
      if (!air) {
        try {
          const r2 = await fetch(aURL, { cache: 'no-store' });
          if (r2.ok) air = (await r2.json()).current;
        } catch (e2) { /* noop */ }
      }
      W = {
        at: Date.now(),
        locName: loc.name,
        now: w.current,
        daily: (w.daily && w.daily.time || []).map((t, i) => ({
          date: t,
          code: w.daily.weather_code[i],
          max: w.daily.temperature_2m_max[i],
          min: w.daily.temperature_2m_min[i],
          pop: w.daily.precipitation_probability_max ? w.daily.precipitation_probability_max[i] : null,
        })),
        air: air ? { pm10: air.pm10, pm25: air.pm2_5 } : null,
      };
      saveWeatherCache();
      renderWeather();
      renderSchedule();
      if (showToast) toast('날씨를 새로 고쳤어요', 'mint', 1600);
    } catch (e) {
      if (showToast) toast('날씨를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', 'coral', 3600);
      else if (!W) {
        $('#wDesc').textContent = '날씨 정보 없음';
        $('#wPlace').textContent = '인터넷 연결을 확인해 주세요';
      }
    } finally {
      weatherBusy = false;
    }
  }

  function renderWeather() {
    const loc = currentLoc();
    $('#wPlace').textContent = '📍 ' + (W && W.locName ? W.locName : loc.name);
    if (!W || !W.now) return;
    const [icon, desc] = wmo(W.now.weather_code);
    $('#wIcon').textContent = icon;
    $('#wTemp').innerHTML = Math.round(W.now.temperature_2m) + '<small>°</small>';
    $('#wDesc').textContent = desc;
    const d0 = W.daily && W.daily[0];
    const chips = [];
    if (d0) {
      chips.push(`<span class="wchip">최고 <b>${Math.round(d0.max)}°</b> · 최저 <b>${Math.round(d0.min)}°</b></span>`);
      chips.push(`<span class="wchip">일교차 <b>${Math.round(d0.max - d0.min)}°</b></span>`);
      if (d0.pop != null) chips.push(`<span class="wchip">☔ 강수 <b>${Math.round(d0.pop)}%</b></span>`);
    }
    if (W.air) {
      const g1 = pm10Grade(W.air.pm10);
      const g2 = pm25Grade(W.air.pm25);
      if (g1) chips.push(`<span class="wchip ${g1[1]}">미세먼지 <b>${g1[0]}</b> ${Math.round(W.air.pm10)}</span>`);
      if (g2) chips.push(`<span class="wchip ${g2[1]}">초미세먼지 <b>${g2[0]}</b> ${Math.round(W.air.pm25)}</span>`);
    }
    if (W.now.apparent_temperature != null) chips.push(`<span class="wchip">체감 <b>${Math.round(W.now.apparent_temperature)}°</b></span>`);
    $('#wChips').innerHTML = chips.join('');
  }

  function requestGeo() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const done = (v) => resolve(v);
      try {
        navigator.geolocation.getCurrentPosition(
          (p) => done({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: '현재 위치' }),
          () => done(null),
          { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
        );
      } catch (e) { done(null); }
    });
  }

  async function bootstrapLocation() {
    if (S.location) return;
    const got = await requestGeo();
    if (got) {
      S.location = got;
      save();
      $('#locPill') && ($('#locPill').textContent = got.name);
      await refreshWeather();
      renderWeather();
    }
  }

  /* ----------------------------------------------------------------- schedule */
  function memberById(id) { return S.members.find((m) => m.id === id) || null; }
  function eventsOn(dateStr) {
    return S.events.filter((e) => e.date === dateStr)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }

  function renderSchedule() {
    const t = todayStr();
    const list = eventsOn(t);
    const box = $('#todayEvents');
    $('#scheduleSub').textContent = list.length
      ? `오늘 ${list.length}개 일정 · ${list.filter((e) => e.done).length}개 완료`
      : '오늘은 일정이 없어요';

    box.innerHTML = list.length
      ? list.map((e) => {
          const m = memberById(e.member);
          return `<div class="event" data-id="${e.id}">
            <button class="check ${e.done ? 'on' : ''}" data-act="ev-toggle" data-id="${e.id}" aria-label="완료 표시">✓</button>
            <div class="event-time">${esc(e.time || '종일')}</div>
            <div class="event-main">
              <div class="event-title ${e.done ? 'done' : ''}">${esc(e.title)}</div>
              <div class="event-sub">
                ${m ? `<span class="mdot" style="background:${esc(m.color)}"></span>${esc(m.name)}` : '가족 모두'}
              </div>
            </div>
            <button class="btn icon sm ghost" data-act="ev-del" data-id="${e.id}" aria-label="일정 삭제">✕</button>
          </div>`;
        }).join('')
      : `<div class="shop-empty">오늘 일정이 없어요 · 위 <b>＋</b> 로 추가</div>`;

    // 주간 스트립
    const start = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    $('#weekStrip').innerHTML = days.map((d, i) => {
      const ds = fmtDate(d);
      const evs = eventsOn(ds);
      const fc = W && W.daily && W.daily.find((x) => x.date === ds);
      const ico = fc ? wmo(fc.code)[0] : '';
      const dow = d.getDay();
      const cls = 'wday' + (i === 0 ? ' today' : '') + (dow === 0 ? ' sun' : '') + (dow === 6 ? ' sat' : '');
      const label = i === 0 ? '오늘' : i === 1 ? '내일' : DAYS[dow];
      const evHtml = evs.slice(0, 2).map((e) => {
        const m = memberById(e.member);
        return `<div class="wd-ev" style="border-left-color:${m ? m.color : 'var(--coral)'}">${esc(e.title)}</div>`;
      }).join('');
      const more = evs.length > 2 ? `<div class="wd-more">+${evs.length - 2}</div>` : '';
      return `<div class="${cls}" data-act="wd-click" data-date="${ds}" title="${esc(ds)} 일정 추가">
        <div class="wd-name">${label}</div>
        <div class="wd-date">${d.getDate()}</div>
        <div class="wd-ico">${ico}</div>
        ${evHtml}${more}
      </div>`;
    }).join('');

    // 다가오는 일정 (내일~14일)
    const upcoming = S.events
      .filter((e) => e.date > t && e.date <= fmtDate(addDays(new Date(), 14)))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 4);
    $('#upcomingEvents').innerHTML = upcoming.length
      ? `<div class="wiki-group" style="margin-top:6px">다가오는 일정</div>` + upcoming.map((e) => {
          const d = new Date(e.date + 'T00:00:00');
          const m = memberById(e.member);
          return `<div class="event" style="padding:6px 4px">
            <div class="event-time" style="background:var(--lilac-soft);color:var(--lilac)">${d.getMonth() + 1}/${d.getDate()} ${esc(DAYS[d.getDay()])}</div>
            <div class="event-main">
              <div class="event-title">${esc(e.title)}</div>
              <div class="event-sub">${esc(e.time || '종일')}${m ? ' · <span class="mdot" style="background:' + esc(m.color) + '"></span>' + esc(m.name) : ''}</div>
            </div>
            <button class="btn icon sm ghost" data-act="ev-del" data-id="${e.id}" aria-label="일정 삭제">✕</button>
          </div>`;
        }).join('')
      : '';
  }

  async function addEvent(defaults = {}) {
    const memberOpts = [{ value: '', label: '가족 모두' }].concat(S.members.map((m) => ({ value: m.id, label: m.name })));
    const r = await askModal({
      title: '일정 추가',
      hint: '날짜·시간·내용을 입력하면 오늘/이번 주 목록에 바로 나타납니다.',
      fields: [
        { name: 'title', label: '무엇을 하나요?', placeholder: '예: 병원 예약' },
        { name: 'date', label: '날짜', type: 'date', value: defaults.date || todayStr() },
        { name: 'time', label: '시간 (비우면 종일)', type: 'time', value: defaults.time || '' },
        { name: 'member', label: '누구 일정인가요?', type: 'select', options: memberOpts, value: defaults.member || '' },
      ],
      okText: '추가',
    });
    if (!r || !r.title.trim()) return;
    S.events.push({ id: uid(), title: r.title.trim(), date: r.date || todayStr(), time: r.time || '', member: r.member || '', done: false });
    save();
    renderSchedule();
    toast('일정을 추가했어요', 'mint');
  }

  async function editEvent(id) {
    const e = S.events.find((x) => x.id === id);
    if (!e) return;
    const memberOpts = [{ value: '', label: '가족 모두' }].concat(S.members.map((m) => ({ value: m.id, label: m.name })));
    const r = await askModal({
      title: '일정 수정',
      fields: [
        { name: 'title', label: '내용', value: e.title },
        { name: 'date', label: '날짜', type: 'date', value: e.date },
        { name: 'time', label: '시간', type: 'time', value: e.time || '' },
        { name: 'member', label: '누구', type: 'select', options: memberOpts, value: e.member || '' },
      ],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') {
      S.events = S.events.filter((x) => x.id !== id);
      save(); renderSchedule(); toast('일정을 삭제했어요');
      return;
    }
    if (!r) return;
    e.title = r.title.trim() || e.title;
    e.date = r.date || e.date;
    e.time = r.time || '';
    e.member = r.member || '';
    save(); renderSchedule(); toast('일정을 저장했어요', 'mint');
  }

  /* ------------------------------------------------------ missions/character */
  /* 파트너 포켓몬 진화 라인
     - 그림은 PokeAPI 공식 일러스트(official-artwork) CDN에서 받아 옵니다.
     - CDN이 느리거나 막히면 로컬에서 만든 SVG로 자동 대체되어 깨진 그림이 남지 않습니다. */
  const POKE_ART = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

  const PARTNERS = [
    {
      key: 'pikachu', label: '피카츄', tint: '#f2c53d',
      stages: [
        { id: 172, name: '피츄', min: 0 },
        { id: 25, name: '피카츄', min: 30 },
        { id: 26, name: '라이츄', min: 90 },
        { id: 25, name: '캡틴 피카츄', min: 200, crown: true },
      ],
    },
    {
      key: 'charmander', label: '파이리', tint: '#f0803c',
      stages: [
        { id: 4, name: '파이리', min: 0 },
        { id: 5, name: '리자드', min: 30 },
        { id: 6, name: '리자몽', min: 90 },
        { id: 10034, name: '메가리자몽 X', min: 200, crown: true },
      ],
    },
    {
      key: 'squirtle', label: '꼬부기', tint: '#5aa9e6',
      stages: [
        { id: 7, name: '꼬부기', min: 0 },
        { id: 8, name: '어니부기', min: 30 },
        { id: 9, name: '거북왕', min: 90 },
        { id: 10036, name: '메가거북왕', min: 200, crown: true },
      ],
    },
    {
      key: 'bulbasaur', label: '이상해씨', tint: '#63b489',
      stages: [
        { id: 1, name: '이상해씨', min: 0 },
        { id: 2, name: '이상해풀', min: 30 },
        { id: 3, name: '이상해꽃', min: 90 },
        { id: 10033, name: '메가이상해꽃', min: 200, crown: true },
      ],
    },
    {
      key: 'eevee', label: '이브이 (님피아·블래키)', tint: '#c8a06a',
      stages: [
        { id: 133, name: '이브이', min: 0 },
        { id: 700, name: '님피아', min: 100 },
        { id: 197, name: '블래키', min: 200, crown: true },
      ],
    },
    {
      key: 'riolu', label: '리오르', tint: '#4f7fd6',
      stages: [
        { id: 447, name: '리오르', min: 0 },
        { id: 448, name: '루카리오', min: 70 },
        { id: 10059, name: '메가루카리오', min: 200, crown: true },
      ],
    },
    {
      key: 'froakie', label: '개구마르', tint: '#4f95ff',
      stages: [
        { id: 656, name: '개구마르', min: 0 },
        { id: 657, name: '개굴반장', min: 60 },
        { id: 658, name: '개굴닌자', min: 200, crown: true },
      ],
    },
    {
      key: 'dratini', label: '미뇽', tint: '#7fb3e8',
      stages: [
        { id: 147, name: '미뇽', min: 0 },
        { id: 148, name: '신뇽', min: 60 },
        { id: 149, name: '망나뇽', min: 200, crown: true },
      ],
    },
    {
      key: 'gastly', label: '고오스', tint: '#8f7bd0',
      stages: [
        { id: 92, name: '고오스', min: 0 },
        { id: 93, name: '고우스트', min: 40 },
        { id: 94, name: '팬텀', min: 110 },
        { id: 10038, name: '메가팬텀', min: 200, crown: true },
      ],
    },
    {
      key: 'piplup', label: '팽도리', tint: '#4aa3d8',
      stages: [
        { id: 393, name: '팽도리', min: 0 },
        { id: 394, name: '팽태자', min: 70 },
        { id: 395, name: '엠페르트', min: 200, crown: true },
      ],
    },
    {
      key: 'chimchar', label: '불꽃숭이', tint: '#f4883c',
      stages: [
        { id: 390, name: '불꽃숭이', min: 0 },
        { id: 391, name: '파이숭이', min: 70 },
        { id: 392, name: '초염몽', min: 200, crown: true },
      ],
    },
    {
      key: 'turtwig', label: '모부기', tint: '#7cbf5a',
      stages: [
        { id: 387, name: '모부기', min: 0 },
        { id: 388, name: '수풀부기', min: 70 },
        { id: 389, name: '토대부기', min: 200, crown: true },
      ],
    },
  ];

  const partnerOf = (key) => PARTNERS.find((p) => p.key === key) || PARTNERS[0];
  const stagesOf = () => partnerOf(S.pokemon.key).stages;
  const finalStageOf = (p) => p.stages[p.stages.length - 1];
  function stageIndex(n) {
    const st = stagesOf();
    let idx = 0;
    st.forEach((s, i) => { if (n >= s.min) idx = i; });
    return idx;
  }

  // CDN 그림을 못 받았을 때 쓰는 로컬 SVG (외부 요청 없이 항상 그려짐)
  function pokeFallback(stage, tint) {
    const crown = stage.crown
      ? '<path d="M100 16 l9 15 17 3 -12 12 3 17 -17 -8 -17 8 3 -17 -12 -12 17 -3z" fill="#ffd166" stroke="#e0a92b" stroke-width="3" stroke-linejoin="round"/>'
      : '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
      + '<circle cx="100" cy="106" r="78" fill="' + tint + '" opacity=".16"/>'
      + crown
      + '<path d="M54 100 q-12 -36 6 -50 q15 11 14 32z" fill="' + tint + '" opacity=".92"/>'
      + '<path d="M146 100 q12 -36 -6 -50 q-15 11 -14 32z" fill="' + tint + '" opacity=".92"/>'
      + '<ellipse cx="100" cy="142" rx="46" ry="37" fill="' + tint + '"/>'
      + '<ellipse cx="100" cy="150" rx="27" ry="21" fill="#fffdf8" opacity=".6"/>'
      + '<circle cx="100" cy="94" r="42" fill="' + tint + '"/>'
      + '<circle cx="84" cy="92" r="7" fill="#22304a"/><circle cx="116" cy="92" r="7" fill="#22304a"/>'
      + '<circle cx="86.4" cy="89" r="2.6" fill="#fff"/><circle cx="118.4" cy="89" r="2.6" fill="#fff"/>'
      + '<path d="M90 110 q10 9 20 0" fill="none" stroke="#22304a" stroke-width="4" stroke-linecap="round"/>'
      + '<ellipse cx="68" cy="104" rx="7" ry="5" fill="#ff9b9b" opacity=".85"/>'
      + '<ellipse cx="132" cy="104" rx="7" ry="5" fill="#ff9b9b" opacity=".85"/>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function pokeImg(stage, cls, tint) {
    return `<img class="${cls}" src="${POKE_ART(stage.id)}" alt="${esc(stage.name)}" data-poke="${stage.id}" data-poke-name="${esc(stage.name)}" data-fallback="${esc(pokeFallback(stage, tint))}" loading="eager" decoding="async" draggable="false">`;
  }

  // 그림 로딩 실패 → 로컬 SVG로 교체
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset && img.dataset.fallback && !img.dataset.fb) {
      img.dataset.fb = '1';
      img.src = img.dataset.fallback;
    }
  }, true);

  function checkPokeImages() {
    $$('img[data-poke]').forEach((img) => {
      if (!img.dataset.fb && img.complete && img.naturalWidth === 0) {
        img.dataset.fb = '1';
        img.src = img.dataset.fallback;
      }
    });
  }

  /* ---- 시간 계산 ---- */
  const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const minOf = (hm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  function durText(mins) {
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (!h) return `${mm}분`;
    return mm ? `${h}시간 ${mm}분` : `${h}시간`;
  }
  function dueInfo(due, nowMin) {
    const d = minOf(due);
    const n = nowMin == null ? minOf(hhmm()) : nowMin;
    if (d == null || n == null) return null;
    const left = d - n;
    if (left > 0) return { cls: left <= 15 ? 'soon' : 'ok', text: `${due}까지 · ${durText(left)} 남음` };
    if (left === 0) return { cls: 'soon', text: `${due}까지 · 지금 마감!` };
    return { cls: 'late', text: `${due} 마감 · ${durText(-left)} 지났어요` };
  }

  /* ---- 포인트 ---- */
  function ptsInit() {
    if (!S.points || typeof S.points !== 'object') S.points = { total: 0, byMember: {} };
    if (!S.points.byMember || typeof S.points.byMember !== 'object') S.points.byMember = {};
  }
  function addPoints(key, delta) {
    if (!delta) return;
    ptsInit();
    const k = key || '';
    S.points.total = Math.max(0, Math.round((+S.points.total || 0) + delta));
    S.points.byMember[k] = Math.max(0, Math.round((+S.points.byMember[k] || 0) + delta));
  }
  const basePtsOf = (c) => Math.max(0, Math.round(+c.points || 0));
  const bonusPtsOf = (c) => (c.due ? Math.max(0, Math.round(+c.bonus || 0)) : 0);
  const earnOf = (c) => Math.max(0, Math.round(typeof c.earned === 'number' ? c.earned : basePtsOf(c)));
  function missionEarn(c, atHM) {
    const base = basePtsOf(c);
    const bonus = bonusPtsOf(c);
    const a = minOf(atHM);
    const d = minOf(c.due);
    const goalMet = !!(c.due && a != null && d != null && a <= d);
    return { base, bonus, goalMet, earned: base + (goalMet ? bonus : 0) };
  }

  /* ---- 아이 포인트: 누적 경험치 · 사용 가능 포인트(잔액) · 사용 내역 ---- */
  const kidMember = () => S.members.find((m) => m.id === KID_ID) || null;
  // 아이가 지금까지 모은 포인트 총합 = 총 누적 경험치. 포인트를 써도 줄지 않습니다.
  function kidTotalPts() { ptsInit(); return Math.max(0, Math.round(+S.points.byMember[KID_ID] || 0)); }
  function spentPts() {
    if (!Array.isArray(S.pointUses)) S.pointUses = [];
    return S.pointUses.reduce((s, u) => s + Math.max(0, Math.round(+u.amount || 0)), 0);
  }
  // 사용 가능 포인트(잔액) = 모은 포인트 − 사용한 포인트. 경험치·진화와는 완전히 별개입니다.
  function balancePts() { return Math.max(0, kidTotalPts() - spentPts()); }
  function kidTodayPts() {
    const t = todayStr();
    return S.missions.filter((x) => x.member === KID_ID && x.doneOn === t).reduce((s, x) => s + earnOf(x), 0);
  }

  /* ---- 도감 ---- */
  const dexEntryOf = (key) => (S.pokemon.dex || []).find((d) => d.key === key) || null;
  function registerDex(bump = false, key = S.pokemon.key) {
    const p = partnerOf(key);
    const fin = finalStageOf(p);
    const ex = dexEntryOf(key);
    if (ex) {
      if (bump) { ex.at = todayStr(); ex.times = Math.max(1, Math.round(+ex.times || 1)) + 1; }
      return false;
    }
    S.pokemon.dex.push({ key, label: p.label, finalName: fin.name, finalId: fin.id, tint: p.tint, at: todayStr(), times: 1 });
    return true;
  }
  // 이미 최종 진화 상태(예: 형식 2에서 옮겨 온 데이터)라면 도감에 빠지지 않게 한 번 채워 넣습니다.
  function syncDex() {
    if (S.pokemon && S.pokemon.xp >= FINAL_P && !dexEntryOf(S.pokemon.key)) registerDex(false);
  }

  /* ---- 오늘 완료 이력 ---- */
  function addLog(c, r, at) {
    if (!Array.isArray(S.logs)) S.logs = [];
    const t = todayStr();
    S.logs = S.logs.filter((l) => !(l.mid === c.id && l.date === t));
    S.logs.unshift({
      id: uid(), date: t, at: at || hhmm(), mid: c.id, title: c.title, member: c.member || '',
      base: r.base || 0, bonus: r.goalMet ? (r.bonus || 0) : 0, earned: r.earned || 0,
      due: c.due || '', goalMet: !!r.goalMet,
    });
    if (S.logs.length > 200) S.logs.length = 200;
  }
  function dropLog(mid) {
    const t = todayStr();
    S.logs = (S.logs || []).filter((l) => !(l.mid === mid && l.date === t));
  }

  function doneBadge(c) {
    const at = esc(c.doneAt || '');
    if (!c.due) return `<span class="done-badge plain">${at ? at + ' 완료' : '완료'}</span>`;
    if (c.goalMet) return `<span class="done-badge goal">${at} 완료 · ⏰ 목표 시간 달성!</span>`;
    return `<span class="done-badge late">${at} 완료 · ⏱️ 목표 시간 초과</span>`;
  }

  function renderLog() {
    const box = $('#todayLog');
    if (!box) return { count: 0, met: 0 };
    const t = todayStr();
    const rows = (S.logs || []).filter((l) => l.date === t)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const met = rows.filter((r) => r.goalMet).length;
    if ($('#logCount')) $('#logCount').textContent = rows.length ? `${rows.length}건 · 목표 달성 ${met}` : '아직 없어요';
    box.innerHTML = rows.length
      ? rows.map((l) => `<div class="log-row">
          <span class="log-time">${esc(l.at)}</span>
          <span class="log-title">${esc(l.title)}</span>
          ${l.goalMet ? '<span class="log-badge goal">⏰ 목표 달성</span>' : (l.due ? '<span class="log-badge late">⏱️ 초과</span>' : '<span class="log-badge plain">완료</span>')}
          <b class="log-pts">+${Math.max(0, Math.round(+l.earned || 0))}P</b>
        </div>`).join('')
      : '<div class="shop-empty" style="padding:8px 4px">오늘 끝낸 미션이 완료 시각과 함께 이곳에 쌓여요</div>';
    return { count: rows.length, met };
  }

  function renderMissions() {
    const t = todayStr();
    const p = partnerOf(S.pokemon.key);
    const st = p.stages;
    const xp = clamp(Math.round(+S.pokemon.xp || 0), 0, FINAL_P);
    const lv = stageIndex(xp);
    const stage = st[lv];
    const totalXp = kidTotalPts();
    const bal = balancePts();
    const done = xp >= FINAL_P;

    $('#charStage').innerHTML = pokeImg(stage, 'poke-img', p.tint) + (stage.crown ? '<span class="poke-crown" aria-hidden="true">👑</span>' : '');
    $('#charLevel').textContent = stage.name;

    const doneList = S.missions.filter((x) => x.doneOn === t);
    $('#charCount').innerHTML = `누적 경험치 <b>${totalXp}P</b>`;
    $('#charToday').textContent = `아이 오늘 +${kidTodayPts()}P`;
    if ($('#charBalance')) $('#charBalance').innerHTML = `사용 가능 <b>${bal}P</b>`;
    const tick = $('#charTick');
    if (tick) tick.textContent = `현재 파트너 ${xp}P / ${FINAL_P}P`;
    const log = renderLog();
    $('#choreSub').textContent = `오늘 ${doneList.length}개 완료 · 목표 달성 ${log.met} · 미션 ${S.missions.length}개`;

    const nxt = st[lv + 1];
    if (nxt) {
      const span = Math.max(1, nxt.min - stage.min);
      const got = xp - stage.min;
      $('#charBar').style.width = clamp((got / span) * 100, 0, 100) + '%';
      $('#charNext').textContent = `${nxt.name}까지 ${Math.max(0, nxt.min - xp)}P 남았어요`;
    } else {
      $('#charBar').style.width = '100%';
      $('#charNext').textContent = done ? '최종 진화 완료! 🏆 도감에 저장됐어요' : '최종 단계예요';
    }

    $('#charEvo').innerHTML = st.map((s, i) =>
      `<span class="evo${i === lv ? ' on' : ''}${i > lv ? ' lock' : ''}" title="${esc(s.name)} · ${s.min}P">${pokeImg(s, 'evo-img', p.tint)}</span>`
    ).join('');
    if ($('#partnerPill')) $('#partnerPill').textContent = `${p.label} 계열`;

    const adoptBtn = $('#adoptBtn');
    if (adoptBtn) {
      adoptBtn.disabled = !done;
      adoptBtn.classList.toggle('on', done);
      adoptBtn.textContent = done ? '✨ 새 포켓몬 입양하기' : `🔒 새 포켓몬 입양 (${FINAL_P}P)`;
      adoptBtn.title = done
        ? '지금 포켓몬은 도감에 저장되고, 새 포켓몬을 0P부터 다시 키울 수 있어요'
        : `현재 파트너가 ${FINAL_P}P에 도달하면 새 포켓몬을 입양할 수 있어요`;
    }

    // 구성원별 오늘 완료·오늘 포인트·누적 포인트
    const stats = memberStats();
    $('#memberStats').innerHTML = stats.map((s) => `<div class="mstat" style="--c:${esc(s.m.color)}">
        <span class="mdot" style="background:${esc(s.m.color)}"></span>
        <span class="mstat-name">${esc(s.m.name)}${s.m.id === KID_ID ? ' 🧒' : ''}</span>
        <span class="mstat-today">오늘 ${s.today}개</span>
        <span class="mstat-pts">${s.ptsToday ? '+' + s.ptsToday + 'P' : '0P'}</span>
        <span class="mstat-total">누적 ${s.total}P</span>
      </div>`).join('');

    // 미션 목록
    const order = {};
    S.members.forEach((m, i) => { order[m.id] = i; });
    order[''] = 99;
    const nowMin = minOf(hhmm());
    const list = S.missions.slice().sort((a, b) => (order[a.member] ?? 50) - (order[b.member] ?? 50));
    $('#choreList').innerHTML = list.length
      ? list.map((c) => {
          const done = c.doneOn === t;
          const m = memberById(c.member);
          const base = basePtsOf(c);
          const bonus = bonusPtsOf(c);
          const di = done ? null : dueInfo(c.due, nowMin);
          const chip = done
            ? doneBadge(c)
            : (di ? `<span class="due-chip ${di.cls}" data-duechip data-due="${esc(c.due)}">⏰ ${esc(di.text)}</span>` : '');
          const pts = done ? earnOf(c) : base;
          return `<div class="chore ${done ? 'done' : ''}" data-id="${c.id}">
            <button class="chore-check" data-act="chore-toggle" data-id="${c.id}" aria-label="${esc(c.title)} 완료">${done ? '✓' : '○'}</button>
            <div class="chore-main">
              <div class="chore-top">
                <span class="chore-title">${esc(c.title)}</span>
                <span class="pts${done && c.goalMet ? ' goal' : ''}">+${pts}P${done && c.goalMet && bonus ? ' ⚡' : ''}</span>
              </div>
              <div class="chore-meta">
                <span class="mem"><span class="mdot" style="background:${m ? esc(m.color) : '#9aa4bd'}"></span>${esc(m ? m.name : '공용')}</span>
                ${chip}
              </div>
            </div>
            <div class="chore-tools">
              <button class="btn icon sm ghost" data-act="chore-edit" data-id="${c.id}" aria-label="수정">✎</button>
              <button class="btn icon sm ghost" data-act="chore-del" data-id="${c.id}" aria-label="삭제">✕</button>
            </div>
          </div>`;
        }).join('')
      : `<div class="shop-empty">미션을 추가해 보세요</div>`;

    // 10P마다 별 하나 (아이 누적 경험치 기준)
    const stars = Math.min(Math.floor(totalXp / 10), 24);
    let row = '';
    for (let i = 0; i < stars; i++) row += '<span>⭐</span>';
    if (totalXp >= 10 && totalXp > stars * 10) row += `<span style="font-size:11px;font-weight:800;color:var(--text-3);align-self:center">${totalXp - stars * 10}P</span>`;
    if (!stars) row = '<span style="font-size:11.5px;font-weight:700;color:var(--text-3)">미션을 끝내면 10P마다 ⭐ 하나씩 쌓여요</span>';
    $('#stickerRow').innerHTML = row;

    renderDex();
    renderPointUses();
    checkPokeImages();
  }

  /* ---- 포켓몬 도감(수집 완료) ---- */
  function renderDex() {
    const box = $('#dexRow');
    if (!box) return;
    const dex = S.pokemon.dex || [];
    if ($('#dexCount')) $('#dexCount').textContent = `${dex.length}마리`;
    box.innerHTML = dex.length
      ? dex.map((d) => {
          const p = partnerOf(d.key);
          const fin = finalStageOf(p);
          return `<button type="button" class="dex-card" data-act="dex-open" data-key="${esc(d.key)}" title="${esc(d.label)} 계열 · ${esc(d.at || '')} 완성">
            <span class="dex-img-frame">${pokeImg(fin, 'dex-art', p.tint)}</span>
            <span class="dex-name">${esc(d.finalName || fin.name)}</span>
            <span class="dex-when">${esc(fmtMD(d.at))} 완성${d.times > 1 ? ` · ${d.times}회` : ''}</span>
          </button>`;
        }).join('')
      : '<div class="shop-empty" style="padding:8px 4px">최종 진화(200P)를 마치면 그 포켓몬이 이곳에 영구히 쌓여요</div>';
    checkPokeImages();
  }

  function openDexEntry(key) {
    const d = dexEntryOf(key);
    if (!d) return;
    const p = partnerOf(d.key);
    const fin = finalStageOf(p);
    $('#dexTitle').textContent = `🏆 ${p.label} 계열`;
    $('#dexMeta').textContent = `${d.finalName || fin.name} · ${d.at || ''} 완성${d.times > 1 ? ` · ${d.times}회 완성` : ''}`;
    $('#dexDetail').innerHTML = `<div class="dex-detail-img">${pokeImg(fin, 'poke-img', p.tint)}</div>
      <div class="dex-line">${p.stages.map((s) => `<span class="pstage">${pokeImg(s, 'pstage-img', p.tint)}</span>`).join('<i class="pstage-arrow">›</i>')}</div>
      <div class="dex-legend">${p.stages.map((s) => `${esc(s.name)} ${s.min}P`).join(' · ')}</div>`;
    $('#dexModal').hidden = false;
    checkPokeImages();
  }

  /* ---- 포인트 사용 내역 ---- */
  function renderPointUses() {
    const box = $('#useList');
    if (!box) return;
    const uses = (S.pointUses || []).slice();
    const total = uses.reduce((s, u) => s + Math.max(0, Math.round(+u.amount || 0)), 0);
    if ($('#useCount')) $('#useCount').textContent = uses.length ? `${uses.length}건 · ${total}P` : '아직 없어요';
    box.innerHTML = uses.length
      ? uses.map((u) => `<div class="use-row">
          <span class="use-date" title="${esc(u.date || '')} ${esc(u.at || '')}">${esc(fmtMD(u.date))}</span>
          <span class="use-title">${esc(u.title || '포인트 사용')}</span>
          <b class="use-amt">-${Math.max(0, Math.round(+u.amount || 0))}P</b>
          <button class="btn icon sm ghost" data-act="use-del" data-id="${u.id}" aria-label="사용 내역 되돌리기">✕</button>
        </div>`).join('')
      : '<div class="shop-empty" style="padding:8px 4px">포인트를 사용하면 내역이 이곳에 남아요</div>';
  }

  async function usePoints() {
    const kid = kidMember();
    if (!kid) { toast('아이 구성원(m3)이 없어 포인트를 쓸 수 없어요', 'coral', 3200); return; }
    const bal = balancePts();
    if (bal <= 0) { toast(`사용 가능한 포인트가 없어요 (지금 ${bal}P)`, '', 2600); return; }
    const r = await askModal({
      title: '🎁 포인트 사용',
      hint: `${kid.name} 님의 사용 가능 포인트는 ${bal}P입니다. 사용한 만큼만 잔액이 줄고, 포켓몬 경험치와 진화 단계는 그대로 유지돼요.`,
      fields: [
        { name: 'title', label: '무엇을 사줬나요?', placeholder: '예: 포켓몬 카드 팩' },
        { name: 'amount', label: '사용 포인트 (P)', type: 'number', value: Math.min(bal, 10) },
      ],
      okText: '사용',
    });
    if (!r) return;
    const title = String(r.title || '').trim();
    const amount = Math.round(+r.amount || 0);
    if (!title) { toast('사용 내용을 적어 주세요', 'coral', 2800); return; }
    if (!(amount > 0)) { toast('사용 포인트를 1P 이상 적어 주세요', 'coral', 2800); return; }
    const nowBal = balancePts();
    if (amount > nowBal) { toast(`사용 가능 포인트가 ${nowBal}P뿐이에요`, 'coral', 3200); return; }
    S.pointUses.unshift({ id: uid(), date: todayStr(), at: hhmm(), title, amount });
    save();
    renderMissions();
    toast(`${amount}P 사용 · 남은 포인트 ${balancePts()}P · 포켓몬 경험치는 그대로예요`, 'mint', 3400);
  }

  async function deletePointUse(id) {
    const u = (S.pointUses || []).find((x) => x.id === id);
    if (!u) return;
    const r = await askModal({
      title: '사용 내역 되돌리기',
      hint: `'${u.title || '포인트 사용'}' ${Math.round(+u.amount || 0)}P 내역을 지우면 사용 가능 포인트로 다시 돌아옵니다.`,
      fields: [],
      okText: '되돌리기',
    });
    if (!r) return;
    S.pointUses = S.pointUses.filter((x) => x.id !== id);
    save(); renderMissions();
    toast(`${Math.round(+u.amount || 0)}P를 되돌렸어요`, 'mint', 2400);
  }

  function memberStats() {
    const t = todayStr();
    const bym = (S.points && S.points.byMember) || {};
    const rows = S.members.map((m) => {
      const list = S.missions.filter((x) => x.member === m.id);
      const done = list.filter((x) => x.doneOn === t);
      return {
        m,
        today: done.length,
        ptsToday: done.reduce((s, x) => s + earnOf(x), 0),
        total: Math.max(0, Math.round(+bym[m.id] || 0)),
      };
    });
    const shared = S.missions.filter((x) => !x.member);
    if (shared.length) {
      const done = shared.filter((x) => x.doneOn === t);
      rows.push({
        m: { id: '', name: '공용', color: '#9aa4bd' },
        today: done.length,
        ptsToday: done.reduce((s, x) => s + earnOf(x), 0),
        total: Math.max(0, Math.round(+bym[''] || 0)),
      });
    }
    return rows;
  }

  function toggleMission(id) {
    const c = S.missions.find((x) => x.id === id);
    if (!c) return;
    const t = todayStr();
    ptsInit();
    const key = c.member || '';
    const isKid = key === KID_ID;
    const beforeXp = clamp(Math.round(+S.pokemon.xp || 0), 0, FINAL_P);
    const before = stageIndex(beforeXp);

    if (c.doneOn === t) {
      const undo = earnOf(c);
      addPoints(key, -undo);
      // 아이 미션 체크를 취소했을 때만 파트너 경험치도 되돌아갑니다 (포인트 사용으로는 절대 줄지 않음)
      if (isKid) S.pokemon.xp = clamp(beforeXp - undo, 0, FINAL_P);
      c.doneOn = null; c.doneAt = ''; c.earned = 0; c.goalMet = false;
      dropLog(c.id);
      save(); renderMissions();
      toast(isKid ? `완료를 취소했어요 · 파트너 경험치 -${undo}P` : '완료를 취소했어요', '', 1600);
      return;
    }

    const at = hhmm();
    const r = missionEarn(c, at);
    c.doneOn = t;
    c.doneAt = at;
    c.earned = r.earned;
    c.goalMet = r.goalMet;
    addPoints(key, r.earned);
    // 파트너 경험치는 '아이(m3)'의 미션에서만 오릅니다. 성인 미션은 자기 통계에만 쌓여요.
    if (isKid) S.pokemon.xp = clamp(beforeXp + r.earned, 0, FINAL_P);
    addLog(c, r, at);

    const afterXp = clamp(Math.round(+S.pokemon.xp || 0), 0, FINAL_P);
    const after = stageIndex(afterXp);
    const justFinal = isKid && beforeXp < FINAL_P && afterXp >= FINAL_P;
    if (justFinal) registerDex(true);
    syncDex();
    save();
    renderMissions();

    if (justFinal) {
      confetti(130);
      beep('up');
      showFinalDone();
    } else if (after > before) {
      confetti(90);
      beep('up');
      showLevelUp(after);
    } else if (r.goalMet && r.bonus) {
      confetti(40);
      beep('up');
      toast(`+${r.earned}P · ⏰ 목표 시간 달성! (보너스 +${r.bonus}P)`, 'mint', 2600);
    } else if (c.due) {
      toast(`+${r.earned}P · ⏱️ 목표 시간은 지났지만 끝냈어요`, '', 2600);
    } else {
      toast(`+${r.earned}P ⭐ 잘했어요!`, 'mint', 1600);
    }
  }

  function showLevelUp(lv) {
    const el = $('#levelup');
    const st = stagesOf();
    const p = partnerOf(S.pokemon.key);
    const stage = st[lv] || st[st.length - 1];
    el.innerHTML = `<div class="levelup-card">
      <div class="lv-emoji">🎉</div>
      <h4>${esc(stage.name)} 진화 완료!</h4>
      <p>파트너 경험치 ${Math.round(S.pokemon.xp)}P · 누적 ${kidTotalPts()}P</p>
      <div class="levelup-poke">${pokeImg(stage, 'poke-img', p.tint)}</div>
    </div>`;
    el.hidden = false;
    checkPokeImages();
    setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 2800);
  }

  function showFinalDone() {
    const el = $('#levelup');
    const p = partnerOf(S.pokemon.key);
    const fin = finalStageOf(p);
    el.innerHTML = `<div class="levelup-card dex">
      <div class="lv-emoji">🏆</div>
      <h4>${esc(fin.name)} 완성!</h4>
      <p>도감에 영구 저장했어요 · ✨ 새 포켓몬을 입양할 수 있어요</p>
      <div class="levelup-poke">${pokeImg(fin, 'poke-img', p.tint)}</div>
    </div>`;
    el.hidden = false;
    checkPokeImages();
    setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 3800);
  }

  /* ---- 파트너 고르기 ---- */
  function updateDueChips() {
    const nowMin = minOf(hhmm());
    $$('[data-duechip]').forEach((el) => {
      const di = dueInfo(el.dataset.due, nowMin);
      if (!di) return;
      el.className = 'due-chip ' + di.cls;
      el.textContent = '⏰ ' + di.text;
    });
  }

  function renderPartnerGrid() {
    const grid = $('#partnerGrid');
    if (!grid) return;
    grid.innerHTML = PARTNERS.map((p) => {
      const on = p.key === S.pokemon.key;
      const got = !!dexEntryOf(p.key);
      return `<button type="button" class="partner-card${on ? ' on' : ''}" data-partner="${p.key}" aria-pressed="${on}">
        <div class="partner-line">${p.stages.map((s) => `<span class="pstage">${pokeImg(s, 'pstage-img', p.tint)}</span>`).join('<i class="pstage-arrow">›</i>')}</div>
        <div class="partner-name">${esc(p.label)} 계열${on ? ' <b>사용 중</b>' : ''}${got ? ' <b class="got">🏆 도감</b>' : ''}</div>
        <div class="partner-stages">${p.stages.map((s) => `${esc(s.name)} ${s.min}P`).join(' · ')}</div>
      </button>`;
    }).join('');
    checkPokeImages();
  }

  let partnerMode = 'change';   // 'change' = 파트너 바꾸기 · 'adopt' = 새 포켓몬 입양

  function partnerHintText() {
    const p = partnerOf(S.pokemon.key);
    const cur = p.stages[stageIndex(S.pokemon.xp)];
    if (partnerMode === 'adopt') {
      return `지금 파트너 ${cur.name}는 도감에 그대로 남고, 새 포켓몬은 현재 파트너 경험치만 0P부터 다시 시작해요. 누적 경험치(${kidTotalPts()}P)와 사용 가능 포인트(${balancePts()}P)는 그대로 유지됩니다.`;
    }
    return `지금은 ${p.label} 계열 ${cur.name}(파트너 경험치 ${S.pokemon.xp}P)을(를) 키우는 중이에요. 아이 미션으로만 경험치가 쌓이고, 언제든 바꿀 수 있습니다.`;
  }

  function openPartnerPicker(mode = 'change') {
    partnerMode = mode === 'adopt' ? 'adopt' : 'change';
    $('#partnerTitle').textContent = partnerMode === 'adopt' ? '✨ 새 포켓몬 입양하기' : '🐾 파트너 포켓몬 고르기';
    $('#partnerHint').textContent = partnerHintText();
    renderPartnerGrid();
    $('#partnerModal').hidden = false;
  }

  function pickPartner(key) {
    if (!POKE_KEYS.includes(key)) return;
    const p = partnerOf(key);

    if (partnerMode === 'adopt') {
      if (S.pokemon.xp < FINAL_P) { toast('최종 진화(200P)를 마치면 새 포켓몬을 입양할 수 있어요', '', 2600); return; }
      syncDex();                      // 보호: 지금 완성한 포켓몬은 먼저 도감에 넣어 두고 시작
      S.pokemon.key = key;
      S.pokemon.xp = 0;               // 현재 파트너 경험치만 0P부터 (누적 경험치·잔액은 유지)
      save();
      renderMissions();
      renderSettings();
      $('#partnerModal').hidden = true;
      confetti(60);
      beep('up');
      toast(`✨ ${p.label} 계열 새 파트너와 0P부터 다시 시작해요`, 'mint', 3200);
      return;
    }

    if (S.pokemon.key === key) { $('#partnerModal').hidden = true; return; }
    if (S.pokemon.xp >= FINAL_P) {
      // 최종 진화를 마친 파트너는 바꾸는 대신 '입양'으로 안내해요
      partnerMode = 'adopt';
      $('#partnerTitle').textContent = '✨ 새 포켓몬 입양하기';
      $('#partnerHint').textContent = partnerHintText();
      renderPartnerGrid();
      toast('최종 진화를 마쳤어요 · 새 포켓몬은 0P부터 키워요', '', 2800);
      return;
    }
    S.pokemon.key = key;
    save();
    renderMissions();
    renderSettings();
    checkPokeImages();
    toast(`파트너를 ${p.label} 계열로 바꿨어요`, 'mint', 2200);
    $('#partnerModal').hidden = true;
  }

  // 목표 시간 빠른 선택 (태블릿에서 두 번 탭으로 지정)
  const TIME_QUICK = ['없음', '07:30', '08:00', '08:30', '09:00', '17:00', '18:00', '20:00', '21:00', '22:00'];

  function missionMemberOptions() {
    return S.members.map((m) => ({ value: m.id, label: m.name })).concat([{ value: '', label: '공용(모두)' }]);
  }

  async function addMission() {
    const r = await askModal({
      title: '미션 추가',
      hint: '목표 시간을 비우거나 [없음]을 고르면 시간 보너스 없이 기본 포인트만 쌓여요.',
      fields: [
        { name: 'title', label: '미션', placeholder: '예: 신발 정리하기' },
        { name: 'points', label: '기본 포인트 (P)', type: 'number', value: 3 },
        { name: 'due', label: '목표 시간 (마감 시각)', type: 'time', value: '', quick: TIME_QUICK },
        { name: 'bonus', label: '시간 내 완료 보너스 (P)', type: 'number', value: 3 },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: (S.members[S.members.length - 1] || {}).id || '' },
      ],
      okText: '추가',
    });
    if (!r || !r.title.trim()) return;
    S.missions.push({
      id: uid(),
      title: r.title.trim(),
      points: Math.max(0, Math.round(+r.points || 0)),
      due: r.due || '',
      bonus: r.due ? Math.max(0, Math.round(+r.bonus || 0)) : 0,
      member: r.member || '',
      doneOn: null, doneAt: '', earned: 0, goalMet: false,
    });
    save(); renderMissions();
    toast(r.due ? `미션을 추가했어요 · ${r.due}까지 +${Math.max(0, Math.round(+r.bonus || 0))}P 보너스` : '미션을 추가했어요', 'mint');
  }

  async function editMission(id) {
    const c = S.missions.find((x) => x.id === id);
    if (!c) return;
    const r = await askModal({
      title: '미션 수정',
      hint: '목표 시간과 보너스 포인트를 바꾸면 오늘 완료 기록도 새 기준으로 다시 계산됩니다.',
      fields: [
        { name: 'title', label: '미션', value: c.title },
        { name: 'points', label: '기본 포인트 (P)', type: 'number', value: basePtsOf(c) },
        { name: 'due', label: '목표 시간 (마감 시각)', type: 'time', value: c.due || '', quick: TIME_QUICK },
        { name: 'bonus', label: '시간 내 완료 보너스 (P)', type: 'number', value: bonusPtsOf(c) || 3 },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: c.member || '' },
      ],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') {
      if (c.doneOn === todayStr()) {
        addPoints(c.member || '', -earnOf(c));
        if ((c.member || '') === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp - earnOf(c), 0, FINAL_P);
        dropLog(c.id);
      }
      S.missions = S.missions.filter((x) => x.id !== id);
      save(); renderMissions();
      return;
    }
    if (!r || !r.title.trim()) return;

    const t = todayStr();
    const wasDone = c.doneOn === t;
    const oldKey = c.member || '';
    const oldEarned = earnOf(c);

    c.title = r.title.trim();
    c.points = Math.max(0, Math.round(+r.points || 0));
    c.due = r.due || '';
    c.bonus = c.due ? Math.max(0, Math.round(+r.bonus || 0)) : 0;
    c.member = r.member || '';

    // 오늘 이미 끝낸 미션이면 실제 완료 시각을 새 목표 시간과 다시 비교해 포인트를 맞춰 준다
    if (wasDone) {
      const rr = missionEarn(c, c.doneAt || hhmm());
      const delta = rr.earned - oldEarned;
      if (oldKey !== c.member) {
        addPoints(oldKey, -oldEarned);
        addPoints(c.member, rr.earned);
      } else if (delta) {
        addPoints(c.member, delta);
      }
      // 파트너 경험치도 주인(아이)이 바뀜에 따라 함께 옮겨 줍니다
      if (oldKey === KID_ID && c.member !== KID_ID) S.pokemon.xp = clamp(S.pokemon.xp - oldEarned, 0, FINAL_P);
      else if (oldKey !== KID_ID && c.member === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp + rr.earned, 0, FINAL_P);
      else if (oldKey === KID_ID && c.member === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp + delta, 0, FINAL_P);
      c.earned = rr.earned;
      c.goalMet = rr.goalMet;
      addLog(c, rr, c.doneAt || hhmm());
    }
    syncDex();
    save(); renderMissions();
    toast('미션을 저장했어요', 'mint');
  }

  async function resetPoints() {
    const r = await askModal({
      title: '포인트 초기화',
      hint: '누적 포인트·아이 파트너 경험치·도감·포인트 사용 내역·오늘 완료 이력을 모두 0으로 되돌립니다. 미션 목록은 그대로 남습니다.',
      fields: [{ name: 'ok', label: '계속하려면 "초기화"를 입력하세요', placeholder: '초기화' }],
      okText: '초기화',
    });
    if (!r) return;
    if ((r.ok || '').trim() !== '초기화') { toast('입력이 맞지 않아 취소했어요'); return; }
    const t = todayStr();
    S.points = { total: 0, byMember: {} };
    S.pointUses = [];
    S.pokemon.xp = 0;
    S.pokemon.dex = [];
    S.missions.forEach((m) => {
      if (m.doneOn === t) { m.doneOn = null; m.doneAt = ''; m.earned = 0; m.goalMet = false; }
    });
    S.logs = (S.logs || []).filter((l) => l.date !== t);
    save(); renderMissions(); toast('포인트를 0으로 되돌렸어요');
  }

  /* ----------------------------------------------------------------- shopping */
  let shopTab = 'buy';
  function renderShopping() {
    $$('[data-shoptab]').forEach((b) => {
      const on = b.dataset.shoptab === shopTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const items = S.shopping.filter((x) => x.cat === shopTab);
    const box = $('#shopList');
    box.innerHTML = items.length
      ? items.map((x) => `<div class="shop-item ${x.done ? 'done' : ''}">
          <button class="check ${x.done ? 'on' : ''}" data-act="shop-toggle" data-id="${x.id}" aria-label="구매 완료">✓</button>
          <div class="shop-text">${esc(x.text)}</div>
          <button class="btn icon sm ghost" data-act="shop-del" data-id="${x.id}" aria-label="삭제">✕</button>
        </div>`).join('')
      : `<div class="shop-empty">${shopTab === 'buy' ? '살 것이 없어요. 위에서 추가해 보세요.' : '냉장고 메모가 비어 있어요.'}</div>`;
    const left = S.shopping.filter((x) => x.cat === 'buy' && !x.done).length;
    $('#shopSub').textContent = left ? `장볼 것 ${left}개 남았어요` : '장보기 목록이 비었어요';
  }

  function addShopItem() {
    const inp = $('#shopInput');
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    S.shopping.unshift({ id: uid(), cat: shopTab, text: v, done: false });
    inp.value = '';
    save(); renderShopping();
  }

  /* ------------------------------------------------------------------ letters */
  const LETTER_MAX = 30;
  const LETTER_W = 1000;
  const LETTER_H = 400;

  const canvas = $('#letterCanvas');
  const ctx = canvas.getContext('2d');
  const pen = { color: '#2b3a55', width: 8, eraser: false, emoji: null };
  let drawing = false;
  let lastPt = null;
  let undoStack = [];
  let canvasDirty = false;

  const PEN_COLORS = ['#2b3a55', '#e5484d', '#f5a623', '#21a179', '#4f95ff', '#9b7bf0'];
  const PEN_WIDTHS = [4, 8, 14];
  const EMOJIS = ['⭐', '❤️', '🌸', '🌈', '🐻', '🎈', '🍀', '☀️', '🎉', '🐣'];

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }
  function applyPen() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = pen.eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = pen.color;
    ctx.fillStyle = pen.color;
    ctx.lineWidth = pen.width * (pen.eraser ? 2.2 : 1);
  }
  function setDirty(v) {
    canvasDirty = v;
    $('#canvasHint').classList.toggle('hide', canvasDirty || undoStack.length > 0);
  }
  function pushUndo() {
    try {
      undoStack.push(canvas.toDataURL('image/png'));
      if (undoStack.length > 14) undoStack.shift();
    } catch (e) { /* noop */ }
    setDirty(true);
  }
  function stampEmoji(p) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pen.emoji, p.x, p.y);
    setDirty(true);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const p = canvasPoint(e);
    if (pen.emoji) { stampEmoji(p); pushUndo(); return; }
    drawing = true;
    lastPt = p;
    applyPen();
    ctx.beginPath();
    ctx.arc(p.x, p.y, (pen.width * (pen.eraser ? 2.2 : 1)) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDirty(true);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = canvasPoint(e);
    applyPen();
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt = p;
  });

  const endStroke = () => {
    if (!drawing) return;
    drawing = false;
    lastPt = null;
    ctx.globalCompositeOperation = 'source-over';
    pushUndo();
    renderLetterCount();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', (e) => { if (drawing && e.buttons === 0) endStroke(); });

  function clearCanvas() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    undoStack = [];
    setDirty(false);
    renderLetterCount();
  }

  function undoCanvas() {
    if (!undoStack.length) { toast('되돌릴 내용이 없어요'); return; }
    const snap = undoStack.pop();
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      setDirty(undoStack.length > 0);
      if (!undoStack.length) renderLetterCount();
    };
    img.src = snap;
  }

  function renderPenTools() {
    $('#swatches').innerHTML = PEN_COLORS.map((c) =>
      `<button class="sw ${!pen.eraser && pen.color === c ? 'on' : ''}" style="color:${c}" data-pen="${c}" aria-label="펜 색 ${c}"></button>`
    ).join('');
    $('#widths').innerHTML = PEN_WIDTHS.map((w, i) =>
      `<button class="wbtn ${pen.width === w ? 'on' : ''}" data-width="${w}" aria-label="굵기 ${i + 1}"><i style="width:${6 + i * 6}px;height:${6 + i * 6}px"></i></button>`
    ).join('');
    $('#eraserBtn').classList.toggle('primary', pen.eraser);
    $('#emojiBar').innerHTML = EMOJIS.map((e) =>
      `<button class="emo ${pen.emoji === e ? 'on' : ''}" data-emoji="${e}" aria-label="스티커 ${e}">${e}</button>`
    ).join('');
  }

  function renderLetterCount() {
    const n = S.letters.length;
    $('#letterCount').textContent = `저장된 편지 ${n}장`;
  }

  function renderLetters() {
    const box = $('#gallery');
    box.innerHTML = S.letters.length
      ? S.letters.map((l) => `<div class="letter-card">
          <img src="${l.img}" alt="손글씨 편지" data-act="letter-open" data-id="${l.id}" loading="lazy" />
          <div class="letter-meta">
            <span class="letter-who">${esc(l.author || '가족')}</span>
            <span class="letter-when">${esc(l.when || '')}</span>
          </div>
          <div class="letter-tools">
            <button class="btn sm ghost grow" data-act="letter-open" data-id="${l.id}">보기</button>
            <button class="btn sm ghost" data-act="letter-del" data-id="${l.id}" aria-label="삭제">🗑️</button>
          </div>
        </div>`).join('')
      : `<div class="shop-empty" style="grid-column:1/-1">아직 편지가 없어요. 첫 편지를 남겨 보세요 💌</div>`;
    renderLetterCount();
    // 작성자 목록
    const sel = $('#letterAuthor');
    const cur = sel.value;
    const opts = S.members.map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('') +
      '<option value="가족 모두">가족 모두</option>';
    sel.innerHTML = opts;
    if (cur) sel.value = cur;
  }

  function exportCanvas() {
    const out = document.createElement('canvas');
    const w = 760;
    const h = Math.round(w * LETTER_H / LETTER_W);
    out.width = w; out.height = h;
    const c = out.getContext('2d');
    c.fillStyle = '#fffdf8';
    c.fillRect(0, 0, w, h);
    c.drawImage(canvas, 0, 0, w, h);
    return out.toDataURL('image/jpeg', 0.82);
  }

  function sendLetter() {
    if (!canvasDirty && !undoStack.length) { toast('먼저 편지를 그려 주세요 ✍️'); return; }
    const img = exportCanvas();
    const author = $('#letterAuthor').value || (S.members[0] && S.members[0].name) || '가족';
    const now = new Date();
    S.letters.unshift({
      id: uid(),
      img,
      author,
      when: `${now.getMonth() + 1}/${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
    while (S.letters.length > LETTER_MAX) S.letters.pop();
    save();
    clearCanvas();
    renderLetters();
    cssConfettiBurst();
    toast('편지함에 넣었어요 💌', 'mint');
  }
  function cssConfettiBurst() { confetti(28); }

  function openLetter(id) {
    const l = S.letters.find((x) => x.id === id);
    if (!l) return;
    $('#letterModalImg').src = l.img;
    $('#letterModalMeta').textContent = `${l.author || '가족'} · ${l.when || ''}`;
    $('#letterModal').hidden = false;
    $('#letterModal').dataset.id = id;
  }

  /* ---------------------------------------------------------------------- wiki */
  const WIKI_GROUPS = ['생신·기념일', '예방접종', '집안 메모', '연락처·와이파이'];

  function renderWiki() {
    const box = $('#wikiList');
    if (!S.wiki.length) { box.innerHTML = '<div class="shop-empty">항목을 추가해 우리 집 정보를 모아 두세요</div>'; return; }
    const groups = [];
    S.wiki.forEach((w) => { if (!groups.includes(w.group)) groups.push(w.group); });
    box.innerHTML = groups.map((g) => {
      const items = S.wiki.filter((w) => w.group === g);
      return `<div class="wiki-col"><div class="wiki-group">${esc(g)}</div>` + items.map((w) => `
        <div class="wiki-item">
          <div class="wiki-key">${esc(w.key)}</div>
          <div class="wiki-val">${esc(w.val)}</div>
          <div class="wiki-tools">
            <button class="btn icon sm ghost" data-act="wiki-edit" data-id="${w.id}" aria-label="수정">✎</button>
            <button class="btn icon sm ghost" data-act="wiki-del" data-id="${w.id}" aria-label="삭제">✕</button>
          </div>
        </div>`).join('') + '</div>';
    }).join('');
  }

  async function editWiki(id) {
    const w = id ? S.wiki.find((x) => x.id === id) : null;
    const groupOpts = WIKI_GROUPS.concat(S.wiki.map((x) => x.group).filter((g) => !WIKI_GROUPS.includes(g)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((g) => ({ value: g, label: g }));
    const r = await askModal({
      title: w ? '위키 항목 수정' : '위키 항목 추가',
      hint: '예: 생일, 예방접종 시기, 와이파이 이름, 관리사무소 번호처럼 자주 찾는 정보',
      fields: [
        { name: 'group', label: '분류', type: 'select', options: groupOpts, value: w ? w.group : WIKI_GROUPS[0] },
        { name: 'key', label: '제목', value: w ? w.key : '', placeholder: '예: 둘째 생일' },
        { name: 'val', label: '내용', type: 'textarea', value: w ? w.val : '', placeholder: '예: 5월 3일 (음력 4월 초)' },
      ],
      okText: w ? '저장' : '추가',
      extraAction: w ? { label: '삭제', act: 'del' } : null,
    });
    if (r === 'del') { S.wiki = S.wiki.filter((x) => x.id !== id); save(); renderWiki(); return; }
    if (!r || !r.key.trim()) return;
    if (w) { w.group = r.group; w.key = r.key.trim(); w.val = r.val; }
    else S.wiki.push({ id: uid(), group: r.group, key: r.key.trim(), val: r.val });
    save(); renderWiki(); toast('저장했어요', 'mint');
  }

  /* -------------------------------------------------------------- timer & links */
  const PRESETS = [5, 10, 15, 25, 30, 45, 60];
  const timer = { minutes: 15, endAt: 0, remain: 15 * 60 * 1000, running: false };

  function renderTimer() {
    $('#presets').innerHTML = PRESETS.map((m) =>
      `<button class="preset ${timer.minutes === m ? 'on' : ''}" data-preset="${m}">${m}분</button>`
    ).join('');
    paintTimer();
  }
  function paintTimer() {
    const ms = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remain;
    const total = timer.minutes * 60000 || 1;
    const mm = Math.floor(ms / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    $('#timerDigits').textContent = `${pad(mm)}:${pad(ss)}`;
    $('#timerRing').style.setProperty('--p', String(clamp(100 - (ms / total) * 100, 0, 100)));
    $('#timerState').textContent = timer.running ? '진행 중' : (ms <= 0 ? '끝!' : (ms === total ? '준비' : '멈춤'));
    $('#timerStartBtn').textContent = timer.running ? '⏸ 멈춤' : (ms > 0 && ms < total ? '▶ 계속' : '▶ 시작');
  }
  function setPreset(m) {
    timer.minutes = m;
    timer.remain = m * 60000;
    timer.running = false;
    renderTimer();
  }
  function startPauseTimer() {
    if (timer.running) {
      timer.remain = Math.max(0, timer.endAt - Date.now());
      timer.running = false;
    } else {
      ensureAudio();
      if (timer.remain <= 0) timer.remain = timer.minutes * 60000;
      timer.endAt = Date.now() + timer.remain;
      timer.running = true;
    }
    paintTimer();
  }
  function resetTimer() {
    timer.running = false;
    timer.remain = timer.minutes * 60000;
    paintTimer();
  }
  setInterval(() => {
    if (!timer.running) return;
    const left = timer.endAt - Date.now();
    if (left <= 0) {
      timer.running = false;
      timer.remain = 0;
      paintTimer();
      beep('alarm');
      toast('⏰ 시간이 다 됐어요!', 'coral', 6000);
      if (navigator.vibrate) { try { navigator.vibrate([200, 120, 200]); } catch (e) { /* noop */ } }
      $('#timerState').textContent = '끝!';
    } else {
      paintTimer();
    }
  }, 250);

  function renderLinks() {
    $('#linkList').innerHTML = S.links.length
      ? S.links.map((l) => `<div class="link-item">
          <span class="link-dot"></span>
          <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a>
          <button class="btn icon sm ghost" data-act="link-edit" data-id="${l.id}" aria-label="수정">✎</button>
          <button class="btn icon sm ghost" data-act="link-del" data-id="${l.id}" aria-label="삭제">✕</button>
        </div>`).join('')
      : '<div class="shop-empty">음악·영상 링크를 추가해 보세요</div>';
  }

  async function editLink(id) {
    const l = id ? S.links.find((x) => x.id === id) : null;
    const r = await askModal({
      title: l ? '링크 수정' : '링크 추가',
      hint: '유튜브·유튜브 뮤직·멜론 등 원하는 주소를 붙여 넣으세요.',
      fields: [
        { name: 'title', label: '이름', value: l ? l.title : '', placeholder: '예: 가족 플레이리스트' },
        { name: 'url', label: '주소', type: 'url', value: l ? l.url : '', placeholder: 'https://...' },
      ],
      okText: l ? '저장' : '추가',
      extraAction: l ? { label: '삭제', act: 'del' } : null,
    });
    if (r === 'del') { S.links = S.links.filter((x) => x.id !== id); save(); renderLinks(); return; }
    if (!r || !r.title.trim()) return;
    let url = (r.url || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (l) { l.title = r.title.trim(); l.url = url || l.url; }
    else S.links.push({ id: uid(), title: r.title.trim(), url });
    save(); renderLinks(); toast('저장했어요', 'mint');
  }

  /* ---------------------------------------------------------------- modal utils */
  let modalResolve = null;

  function askModal({ title, hint = '', fields = [], okText = '확인', extraAction = null }) {
    return new Promise((resolve) => {
      const modal = $('#modal');
      $('#modalTitle').textContent = title;
      $('#modalHint').textContent = hint;
      $('#modalHint').hidden = !hint;
      $('#modalFields').innerHTML = fields.map((f) => {
        const id = 'mf_' + f.name;
        if (f.type === 'select') {
          return `<label class="field">${esc(f.label)}<select name="${esc(f.name)}" id="${id}">${
            f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')
          }</select></label>`;
        }
        if (f.type === 'textarea') {
          return `<label class="field">${esc(f.label)}<textarea name="${esc(f.name)}" id="${id}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(f.value ?? '')}</textarea></label>`;
        }
        return `<label class="field">${esc(f.label)}<input type="${f.type || 'text'}" name="${esc(f.name)}" id="${id}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"${f.type === 'number' ? ' inputmode="numeric"' : ''}>${f.quick && f.quick.length
          ? `<span class="quick-row">${f.quick.map((v) => `<button type="button" class="qchip" data-quick="${esc(f.name)}" data-val="${esc(v)}">${esc(v)}</button>`).join('')}</span>`
          : ''}</label>`;
      }).join('');

      // 빠른 선택 버튼(예: 목표 시간 칩)은 입력간을 그대로 채웁니다.
      $$('[data-quick]', modal).forEach((b) => {
        b.onclick = (ev) => {
          ev.preventDefault();
          const el = $('#mf_' + b.dataset.quick);
          if (!el) return;
          el.value = b.dataset.val === '없음' ? '' : b.dataset.val;
          $$('[data-quick]', modal).forEach((o) => o.classList.toggle('on', o === b));
        };
      });

      const actions = $('.modal-actions', modal);
      actions.innerHTML = (extraAction ? `<button class="btn" type="button" data-extra style="margin-right:auto;color:var(--coral)">${esc(extraAction.label)}</button>` : '') +
        `<button class="btn" type="button" data-modal-cancel>취소</button>
         <button class="btn primary" type="button" data-modal-ok>${esc(okText)}</button>`;

      const finish = (val) => {
        modal.hidden = true;
        modalResolve = null;
        resolve(val);
      };
      modalResolve = finish;

      $('[data-modal-ok]', actions).onclick = () => {
        const out = {};
        fields.forEach((f) => {
          const el = $('#mf_' + f.name);
          out[f.name] = el ? el.value : '';
        });
        finish(out);
      };
      $('[data-modal-cancel]', actions).onclick = () => finish(null);
      if (extraAction) $('[data-extra]', actions).onclick = () => finish(extraAction.act);

      modal.hidden = false;
      const first = $('#modalFields').querySelector('input,select,textarea');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
    });
  }

  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && modalResolve) modalResolve(null);
  });
  $('#modalFields').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      $('#modal [data-modal-ok]').click();
    }
  });

  /* ------------------------------------------------------------------ settings */
  const MEMBER_COLORS = ['#ff7a6b', '#21c39a', '#4f95ff', '#9b7bf0', '#f5a623', '#ff7fb2'];

  function renderSettings() {
    $('#locPill').textContent = S.location ? `📍 ${S.location.name}` : '기본 위치(서울)';
    $('#latInput').value = S.location ? S.location.lat : '';
    $('#lonInput').value = S.location ? S.location.lon : '';
    $('#memberList').innerHTML = S.members.map((m) => `<span class="member-chip">
        <span class="mdot" style="background:${esc(m.color)}"></span>${esc(m.name)}
        <button class="btn icon sm ghost" data-act="member-edit" data-id="${m.id}" aria-label="이름 변경">✎</button>
      </span>`).join('');
    $('#quietToggle').checked = !!S.quiet;
    if ($('#partnerPill')) $('#partnerPill').textContent = `${partnerOf(S.pokemon.key).label} 계열`;
    try {
      const bytes = new Blob([JSON.stringify(S)]).size;
      $('#storageNote').textContent = `지금 저장된 데이터 약 ${(bytes / 1024).toFixed(0)}KB · 브라우저 한도 약 5MB`;
    } catch (e) { $('#storageNote').textContent = ''; }
    renderSyncBadge();
  }

  async function addMember() {
    const r = await askModal({ title: '구성원 추가', fields: [{ name: 'name', label: '이름', placeholder: '예: 할머니' }], okText: '추가' });
    if (!r || !r.name.trim()) return;
    const color = MEMBER_COLORS[S.members.length % MEMBER_COLORS.length];
    S.members.push({ id: uid(), name: r.name.trim(), color });
    save(); renderSettings(); renderLetters(); renderSchedule();
  }
  async function editMember(id) {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    const r = await askModal({
      title: '구성원',
      fields: [{ name: 'name', label: '이름', value: m.name }],
      okText: '저장',
      extraAction: S.members.length > 1 ? { label: '삭제', act: 'del' } : null,
    });
    if (r === 'del') {
      S.members = S.members.filter((x) => x.id !== id);
      S.events.forEach((e) => { if (e.member === id) e.member = ''; });
      save(); renderSettings(); renderSchedule(); renderLetters();
      return;
    }
    if (!r || !r.name.trim()) return;
    m.name = r.name.trim();
    save(); renderSettings(); renderSchedule(); renderLetters();
  }

  async function searchCity() {
    const q = $('#cityInput').value.trim();
    if (!q) return;
    const box = $('#cityResults');
    box.innerHTML = '<div class="settings-note">찾는 중…</div>';
    try {
      const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=ko&format=json');
      const data = await res.json();
      if (!data.results || !data.results.length) {
        box.innerHTML = '<div class="settings-note">검색 결과가 없어요. 다른 이름으로 찾아보세요. (예: 강남, 수원시)</div>';
        return;
      }
      box.innerHTML = data.results.map((r) => `<button data-city="${esc(r.latitude)},${esc(r.longitude)},${esc(r.name)}">
        ${esc(r.name)}${r.admin1 ? ' · ' + esc(r.admin1) : ''}${r.country ? ' · ' + esc(r.country) : ''}
      </button>`).join('');
    } catch (e) {
      box.innerHTML = '<div class="settings-note">검색에 실패했어요. 인터넷 연결을 확인해 주세요.</div>';
    }
  }

  async function setLocation(lat, lon, name) {
    S.location = { lat, lon, name };
    save();
    $('#locPill').textContent = '📍 ' + name;
    renderSettings();
    await refreshWeather();
    renderSchedule();
    toast('날씨 위치를 ' + name + '(으)로 바꿨어요', 'mint');
  }

  /* -------------------------------------------------------------------- export */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `family-dashboard-backup-${fmtDate(d)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('백업 파일을 내려받았어요', 'mint');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== 'object') throw new Error('bad');
        S = mergeState(data);
        syncDex();
        save();
        applyTheme();
        renderAll();
        renderSettings();
        toast('백업을 불러왔어요', 'mint');
      } catch (e) {
        toast('백업 파일을 읽지 못했어요', 'coral', 3600);
      }
    };
    reader.readAsText(file);
  }

  /* --------------------------------------------------------------------- theme */
  function applyTheme() {
    document.documentElement.dataset.theme = S.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.quiet = S.quiet ? '1' : '0';
    $('#nightBtn').textContent = S.theme === 'dark' ? '☀️' : '🌙';
    $('#nightBtn').title = S.theme === 'dark' ? '낮 모드로' : '야간 모드로';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.theme === 'dark' ? '#0d1220' : '#f4f7ff');
  }

  /* -------------------------------------------------------------------- render */
  function renderAll() {
    renderSchedule();
    renderMissions();
    renderShopping();
    renderLetters();
    renderWiki();
    renderTimer();
    renderLinks();
  }

  /* -------------------------------------------------------------------- events */
  // 전역 클릭 위임
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (t) {
      const act = t.dataset.act;
      const id = t.dataset.id;
      if (act === 'ev-toggle') {
        const ev = S.events.find((x) => x.id === id);
        if (ev) { ev.done = !ev.done; save(); renderSchedule(); }
      } else if (act === 'ev-del') {
        S.events = S.events.filter((x) => x.id !== id); save(); renderSchedule(); toast('일정을 삭제했어요');
      } else if (act === 'ev-edit') {
        editEvent(id);
      } else if (act === 'wd-click' && !t.closest('[data-act="wd-click"]').dataset.ignore) {
        addEvent({ date: t.dataset.date });
      } else if (act === 'chore-toggle') {
        toggleMission(id);
      } else if (act === 'chore-edit') {
        editMission(id);
      } else if (act === 'chore-del') {
        const m = S.missions.find((x) => x.id === id);
        if (m && m.doneOn === todayStr()) {
          addPoints(m.member || '', -earnOf(m));
          if ((m.member || '') === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp - earnOf(m), 0, FINAL_P);
          dropLog(m.id);
        }
        S.missions = S.missions.filter((x) => x.id !== id); save(); renderMissions();
      } else if (act === 'dex-open') {
        openDexEntry(t.dataset.key);
      } else if (act === 'use-del') {
        deletePointUse(id);
      } else if (act === 'shop-toggle') {
        const it = S.shopping.find((x) => x.id === id);
        if (it) { it.done = !it.done; save(); renderShopping(); }
      } else if (act === 'shop-del') {
        S.shopping = S.shopping.filter((x) => x.id !== id); save(); renderShopping();
      } else if (act === 'letter-open') {
        openLetter(id);
      } else if (act === 'letter-del') {
        S.letters = S.letters.filter((x) => x.id !== id); save(); renderLetters();
      } else if (act === 'wiki-edit') {
        editWiki(id);
      } else if (act === 'wiki-del') {
        S.wiki = S.wiki.filter((x) => x.id !== id); save(); renderWiki();
      } else if (act === 'link-edit') {
        editLink(id);
      } else if (act === 'link-del') {
        S.links = S.links.filter((x) => x.id !== id); save(); renderLinks();
      } else if (act === 'member-edit') {
        editMember(id);
      }
      return;
    }
    // 날씨 새로고침
    if (e.target.closest('#weather')) refreshWeather(true);
  });

  $('#eventAddBtn').addEventListener('click', () => addEvent());
  $('#choreAddBtn').addEventListener('click', addMission);
  $('#stickerResetBtn').addEventListener('click', resetPoints);
  $('#pointUseBtn').addEventListener('click', usePoints);
  $('#adoptBtn').addEventListener('click', () => {
    if (S.pokemon.xp < FINAL_P) { toast(`최종 진화(${FINAL_P}P)를 마치면 새 포켓몬을 입양할 수 있어요`, '', 2600); return; }
    openPartnerPicker('adopt');
  });
  $('#dexClose').addEventListener('click', () => { $('#dexModal').hidden = true; });
  $('#dexModal').addEventListener('click', (e) => { if (e.target.id === 'dexModal') $('#dexModal').hidden = true; });
  $('#wikiAddBtn').addEventListener('click', () => editWiki(null));
  $('#linkAddBtn').addEventListener('click', () => editLink(null));

  $('#shopAddBtn').addEventListener('click', addShopItem);
  $('#shopInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addShopItem(); } });
  $$('[data-shoptab]').forEach((b) => b.addEventListener('click', () => { shopTab = b.dataset.shoptab; renderShopping(); }));

  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pen]');
    if (!b) return;
    pen.color = b.dataset.pen; pen.eraser = false; pen.emoji = null; renderPenTools();
  });
  $('#widths').addEventListener('click', (e) => {
    const b = e.target.closest('[data-width]');
    if (!b) return;
    pen.width = +b.dataset.width; renderPenTools();
  });
  $('#emojiBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (!b) return;
    pen.emoji = pen.emoji === b.dataset.emoji ? null : b.dataset.emoji;
    if (pen.emoji) { pen.eraser = false; toast('이모지를 캔버스에 톡 누르세요', '', 1800); }
    renderPenTools();
  });
  $('#eraserBtn').addEventListener('click', () => {
    pen.eraser = !pen.eraser; pen.emoji = null; renderPenTools();
    toast(pen.eraser ? '지우개 모드' : '펜 모드', '', 1200);
  });
  $('#letterUndoBtn').addEventListener('click', undoCanvas);
  $('#letterClearBtn').addEventListener('click', () => { clearCanvas(); toast('캔버스를 지웠어요'); });
  $('#letterSendBtn').addEventListener('click', sendLetter);

  $('#letterModalClose').addEventListener('click', () => { $('#letterModal').hidden = true; });
  $('#letterModal').addEventListener('click', (e) => { if (e.target.id === 'letterModal') $('#letterModal').hidden = true; });
  $('#letterModalDelete').addEventListener('click', () => {
    const id = $('#letterModal').dataset.id;
    S.letters = S.letters.filter((x) => x.id !== id);
    save(); renderLetters(); $('#letterModal').hidden = true; toast('편지를 삭제했어요');
  });
  $('#letterModalDownload').addEventListener('click', () => {
    const id = $('#letterModal').dataset.id;
    const l = S.letters.find((x) => x.id === id);
    if (!l) return;
    const a = document.createElement('a');
    a.href = l.img;
    a.download = `letter-${id}.jpg`;
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
  });

  $('#nightBtn').addEventListener('click', () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme();
  });

  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) setPreset(+b.dataset.preset);
  });
  $('#timerStartBtn').addEventListener('click', startPauseTimer);
  $('#timerResetBtn').addEventListener('click', resetTimer);

  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });

  $('#settingsBtn').addEventListener('click', () => { renderSettings(); $('#settingsModal').hidden = false; });
  $('#settingsClose').addEventListener('click', () => { $('#settingsModal').hidden = true; });
  $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') $('#settingsModal').hidden = true; });
  $('#helpBtn').addEventListener('click', () => { $('#helpModal').hidden = false; });
  $('#helpClose').addEventListener('click', () => { $('#helpModal').hidden = true; });
  $('#helpModal').addEventListener('click', (e) => { if (e.target.id === 'helpModal') $('#helpModal').hidden = true; });

  // 파트너 포켓몬 고르기
  $('#partnerBtn').addEventListener('click', () => openPartnerPicker('change'));
  $('#partnerBtn2').addEventListener('click', () => openPartnerPicker('change'));
  $('#partnerClose').addEventListener('click', () => { $('#partnerModal').hidden = true; });
  $('#partnerModal').addEventListener('click', (e) => { if (e.target.id === 'partnerModal') $('#partnerModal').hidden = true; });
  $('#partnerGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-partner]');
    if (b) pickPartner(b.dataset.partner);
  });

  $('#geoBtn').addEventListener('click', async () => {
    $('#locPill').textContent = '위치 확인 중…';
    const got = await requestGeo();
    if (!got) { toast('위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.', 'coral', 4000); renderSettings(); return; }
    setLocation(got.lat, got.lon, '현재 위치');
  });
  $('#citySearchBtn').addEventListener('click', searchCity);
  $('#cityInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchCity(); } });
  $('#cityResults').addEventListener('click', (e) => {
    const b = e.target.closest('[data-city]');
    if (!b) return;
    const [lat, lon, name] = b.dataset.city.split(',');
    setLocation(+lat, +lon, name);
    $('#cityResults').innerHTML = '';
    $('#cityInput').value = '';
  });
  $('#coordBtn').addEventListener('click', () => {
    const lat = +$('#latInput').value;
    const lon = +$('#lonInput').value;
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      toast('위도·경도를 확인해 주세요', 'coral');
      return;
    }
    setLocation(lat, lon, '내가 정한 위치');
  });
  $('#memberAddBtn').addEventListener('click', addMember);
  $('#themeLight').addEventListener('click', () => { S.theme = 'light'; save(); applyTheme(); });
  $('#themeDark').addEventListener('click', () => { S.theme = 'dark'; save(); applyTheme(); });
  $('#quietToggle').addEventListener('change', (e) => { S.quiet = e.target.checked; save(); applyTheme(); });
  $('#exportBtn2').addEventListener('click', exportJSON);
  $('#importBtn2').addEventListener('click', () => $('#importFile').click());
  $('#resetAllBtn').addEventListener('click', async () => {
    const r = await askModal({
      title: '모두 지우기',
      hint: '일정·미션·포인트·도감·편지·장보기·위키 기록이 모두 사라집니다. ☁️ 동기화 중이면 다른 기기 기록도 함께 지워지니 먼저 백업해 두세요.',
      fields: [{ name: 'ok', label: '계속하려면 "지우기"를 입력하세요', placeholder: '지우기' }],
      okText: '모두 지우기',
    });
    if (!r) return;
    if ((r.ok || '').trim() !== '지우기') { toast('입력이 맞지 않아 취소했어요'); return; }
    localStorage.removeItem(KEY);
    localStorage.removeItem(WKEY);
    S = mergeState(null);
    S.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    save(); applyTheme(); renderAll(); renderSettings();
    toast('처음 상태로 되돌렸어요');
  });

  /* ------------------------------------------------------- 동기화 설정 화면 */
  function fillSyncInputs() {
    if ($('#syncUrlInput')) $('#syncUrlInput').value = SY.cfg ? SY.cfg.url : '';
    if ($('#syncPinInput')) $('#syncPinInput').value = SY.cfg ? SY.cfg.pin : '';
    renderSyncBadge();
  }

  async function syncConnectFlow(auto) {
    const btn = $('#syncConnectBtn');
    if (btn) btn.disabled = true;
    try {
      const out = await syncConnect($('#syncUrlInput').value, $('#syncPinInput').value);
      if (!out.ok) { $('#syncNote').textContent = out.msg; toast(out.msg, 'coral', 4600); return; }
      if (out.seeded) { toast('이 기기 기록을 서버에 올렸어요 ☁️', 'mint', 3200); fillSyncInputs(); return; }
      if (auto) {
        await syncAdopt();
        fillSyncInputs();
        toast('가족 기록을 가져왔어요 ☁️', 'mint', 3200);
        return;
      }
      // 서버에 이미 기록이 있으면 어떻게 맞출지 물어봅니다
      const r = await askModal({
        title: '☁️ 가족 실시간 동기화',
        hint: '서버에 이미 가족 기록이 있어요. 이 기기 기록과 어떻게 맞출까요?',
        fields: [{
          name: 'mode', label: '맞추는 방법', type: 'select', value: 'pull',
          options: [
            { value: 'pull', label: '저장된 가족 기록 가져오기 (추천)' },
            { value: 'push', label: '이 기기 기록을 서버에 올리기 (서버 기록 덮어씀)' },
          ],
        }],
        okText: '연결',
      });
      if (!r) { syncDisconnect(); fillSyncInputs(); toast('연결을 취소했어요'); return; }
      if (r.mode === 'push') await syncReplaceAll(); else await syncAdopt();
      fillSyncInputs();
      toast('동기화를 시작했어요 ☁️', 'mint', 3000);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  if ($('#syncBadge')) {
    $('#syncBadge').addEventListener('click', () => {
      renderSettings();
      $('#settingsModal').hidden = false;
      fillSyncInputs();
      const sec = $('#syncSection');
      if (sec && sec.scrollIntoView) setTimeout(() => sec.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    });
  }
  if ($('#syncConnectBtn')) $('#syncConnectBtn').addEventListener('click', syncConnectFlow);
  if ($('#syncNowBtn')) $('#syncNowBtn').addEventListener('click', async () => {
    if (!SY.cfg) { toast('먼저 동기화 주소와 가족 PIN을 넣어 주세요'); return; }
    const ok = SY.dirty ? await syncPushNow() : await syncPullNow();
    renderSyncBadge();
    toast(ok ? '지금 동기화했어요 ☁️' : ('동기화하지 못했어요 — ' + (SY.lastErr || '연결 확인')), ok ? 'mint' : 'coral', 3200);
  });
  if ($('#syncOffBtn')) $('#syncOffBtn').addEventListener('click', async () => {
    if (!SY.cfg) { toast('지금은 로컬 전용이에요'); return; }
    const r = await askModal({
      title: '동기화 연결 해제',
      hint: '이 기기의 기록은 그대로 두고, 더 이상 서버와 주고받지 않습니다. 나중에 다시 연결할 수 있어요.',
      okText: '연결 해제',
    });
    if (!r) return;
    syncDisconnect();
    fillSyncInputs();
    toast('이 기기만 쓰도록 바꿨어요');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['#modal', '#letterModal', '#settingsModal', '#helpModal', '#partnerModal', '#dexModal'].forEach((sel) => {
      const m = $(sel);
      if (m && !m.hidden) {
        if (sel === '#modal' && modalResolve) { modalResolve(null); return; }
        m.hidden = true;
      }
    });
  });

  // 앱으로 열기: 100vh 문제 회피용
  function setVH() {
    document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
  }
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 250));
  setVH();

  // 자동 저장(창 닫기 전)
  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
  });

  /* ---------------------------------------------------------------------- init */
  const syncLinked = syncReadLinkHash();     // #sync=… 한 번 누르면 설정이 채워집니다
  if (syncLinked) {
    if ($('#syncUrlInput')) $('#syncUrlInput').value = syncLinked.url;
    if ($('#syncPinInput')) $('#syncPinInput').value = syncLinked.pin;
  }
  const hadSync = loadSync();
  const firstRunHere = !localStorage.getItem(KEY);
  loadWeatherCache();
  applyTheme();
  syncDex();                 // 형식 2에서 옮겨 온 데이터가 이미 최종 진화 상태면 도감에 채워 둡니다
  renderClock();
  setInterval(renderClock, 15000);
  renderAll();
  renderPenTools();
  renderWeather();
  if (W && Date.now() - (W.at || 0) > 10 * 60 * 1000) refreshWeather();
  else if (!W) refreshWeather();
  // 위치가 아직 없으면 한 번만 물어봄
  setTimeout(() => { bootstrapLocation(); }, 1400);
  setInterval(() => { if (!weatherBusy) refreshWeather(); }, 15 * 60 * 1000);
  // 목표 시간까지 남은 시간 표시를 20초마다 갱신
  setInterval(() => { if (!document.hidden) updateDueChips(); }, 20000);

  // ☁️ 가족 실시간 동기화 시작
  renderSyncBadge();
  if (hadSync) {
    startSyncLoop();
    setTimeout(() => { syncTick(); }, 1500);
  }
  if (syncLinked && !(SY.cfg && SY.cfg.url === syncLinked.url && SY.cfg.pin === syncLinked.pin)) {
    setTimeout(() => { syncConnectFlow(firstRunHere); }, 900);
  } else if (syncLinked) {
    toast('이 기기는 이미 가족 동기화에 연결돼 있어요 ☁️', 'mint', 2600);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (SY.cfg) syncFlushBeacon(); return; }
    if (SY.cfg) setTimeout(() => { syncTick(); }, 400);
  });
  window.addEventListener('pagehide', () => { if (SY.cfg) syncFlushBeacon(); });
  window.addEventListener('focus', () => { if (SY.cfg) syncTick(); });
  window.addEventListener('online', () => { if (SY.cfg) syncTick(); });

  window.FamilyDashboard = {
    get state() { return S; },
    version: '3.0.0',
    now: () => hhmm(),
    kid: () => ({ id: KID_ID, name: (kidMember() || {}).name || '' }),
    pokemon: () => ({
      key: S.pokemon.key,
      xp: Math.round(S.pokemon.xp),
      stage: stagesOf()[stageIndex(S.pokemon.xp)].name,
      totalXp: kidTotalPts(),
      balance: balancePts(),
      spent: spentPts(),
      dex: (S.pokemon.dex || []).map((d) => ({ key: d.key, finalName: d.finalName, at: d.at, times: d.times })),
    }),
    pokemonStatus: () => $$('img[data-poke]').map((i) => ({
      name: i.dataset.pokeName || i.alt, id: i.dataset.poke,
      ok: i.naturalWidth > 0, width: i.naturalWidth,
      fallbackUsed: i.dataset.fb === '1',
    })),
  };
})();
