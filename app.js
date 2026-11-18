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
  const won = (n) => Number(n || 0).toLocaleString('ko-KR');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------- data model */
  const KEY = 'family-dashboard:v1';
  const WKEY = 'family-dashboard:weather';

  const DEFAULT_STATE = () => ({
    v: 1,
    theme: 'light',
    quiet: false,
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
      { id: uid(), title: '아침 먹기', points: 5, member: 'm3', doneOn: null },
      { id: uid(), title: '씻기 · 양치하기', points: 3, member: 'm3', doneOn: null },
      { id: uid(), title: '옷 입기', points: 3, member: 'm3', doneOn: null },
      { id: uid(), title: '가방 챙기기', points: 4, member: 'm3', doneOn: null },
      { id: uid(), title: '분리수거 내놓기', points: 3, member: 'm1', doneOn: null },
      { id: uid(), title: '설거지하기', points: 3, member: 'm2', doneOn: null },
    ],
    points: { total: 0, byMember: {} },
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
    budget: {
      goal: 2500000,
      fixed: [
        { id: uid(), label: '주거비', amount: 800000 },
        { id: uid(), label: '통신·구독', amount: 120000 },
      ],
      variable: [
        { id: uid(), label: '식비', amount: 600000 },
        { id: uid(), label: '생활용품', amount: 150000 },
      ],
    },
    links: [
      { id: uid(), title: '유튜브 뮤직 — 가족 플레이리스트', url: 'https://music.youtube.com/' },
    ],
  });

  function mergeState(raw) {
    const base = DEFAULT_STATE();
    if (!raw || typeof raw !== 'object') return base;
    const out = Object.assign({}, base, raw);
    // 배열/객체 타입 보정
    ['members', 'events', 'missions', 'letters', 'shopping', 'wiki', 'links'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = base[k];
    });
    if (!out.points || typeof out.points !== 'object') out.points = { total: 0, byMember: {} };
    out.points.total = Math.max(0, Math.round(+out.points.total || 0));
    if (!out.points.byMember || typeof out.points.byMember !== 'object') out.points.byMember = {};
    // 예전 데이터(할 일 · 스티커)가 있으면 한 번만 미션/포인트로 옮김
    if (Array.isArray(raw.chores) && !Array.isArray(raw.missions)) {
      out.missions = raw.chores.map((c) => ({ id: c.id || 'x' + Math.random().toString(36).slice(2, 9), title: c.title || '', points: 3, member: '', doneOn: c.doneOn || null }));
      const legacyPts = Math.max(0, Math.round(+raw.stickers || 0)) * 3;
      out.points = { total: legacyPts, byMember: legacyPts ? { '': legacyPts } : {} };
    }
    out.missions.forEach((m) => {
      m.points = Math.max(0, Math.round(+m.points || 0));
      m.member = m.member || '';
    });
    if (!out.budget || typeof out.budget !== 'object') out.budget = base.budget;
    if (!Array.isArray(out.budget.fixed)) out.budget.fixed = [];
    if (!Array.isArray(out.budget.variable)) out.budget.variable = [];
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
  const LEVELS = [
    { min: 0, name: '알', next: '아기 공룡' },
    { min: 30, name: '아기 공룡', next: '씩씩한 어린이' },
    { min: 90, name: '씩씩한 어린이', next: '히어로 공룡' },
    { min: 200, name: '히어로 공룡', next: '전설의 용' },
    { min: 400, name: '전설의 용', next: null },
  ];
  const levelIndex = (n) => {
    let idx = 0;
    LEVELS.forEach((l, i) => { if (n >= l.min) idx = i; });
    return idx;
  };

  function charSVG(level) {
    const shadow = '<ellipse cx="100" cy="176" rx="52" ry="11" fill="#5b6ba8" opacity=".13"/>';
    if (level === 0) {
      return `<svg viewBox="0 0 200 200" role="img" aria-label="알">
      ${shadow}
      <g class="char-bob">
        <ellipse cx="100" cy="114" rx="46" ry="56" fill="#fffdf6" stroke="#f1dcc4" stroke-width="2.5"/>
        <ellipse cx="100" cy="114" rx="46" ry="56" fill="url(#eggShade)"/>
        <path d="M86 58 l7 11 l-9 8 l9 9" fill="none" stroke="#f1dcc4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="85" cy="112" r="5" fill="#463a33"/><circle cx="115" cy="112" r="5" fill="#463a33"/>
        <path d="M92 128 q8 7 16 0" fill="none" stroke="#463a33" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="72" cy="124" r="7" fill="#ffb3b3" opacity=".7"/>
        <circle cx="128" cy="124" r="7" fill="#ffb3b3" opacity=".7"/>
      </g>
      <defs><linearGradient id="eggShade" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffe6cf" stop-opacity=".55"/>
      </linearGradient></defs>
      </svg>`;
    }
    if (level === 1) {
      return `<svg viewBox="0 0 200 200" role="img" aria-label="아기 공룡">
      ${shadow}
      <g class="char-bob">
        <path d="M58 152 q-28 8 -34 -12 q24 6 36 -6z" fill="#6fd0ac"/>
        <ellipse cx="100" cy="140" rx="41" ry="33" fill="#9fe8cc"/>
        <ellipse cx="100" cy="148" rx="23" ry="18" fill="#eafbf4" opacity=".9"/>
        <circle cx="100" cy="94" r="39" fill="#9fe8cc"/>
        <path d="M72 62 l7 -16 l8 13 l8 -18 l8 16 l9 -13 l6 19z" fill="#4fc39c"/>
        <circle cx="87" cy="93" r="6.4" fill="#2f3b4d"/><circle cx="113" cy="93" r="6.4" fill="#2f3b4d"/>
        <circle cx="89" cy="90" r="2.1" fill="#fff"/><circle cx="115" cy="90" r="2.1" fill="#fff"/>
        <path d="M92 109 q8 8 16 0" fill="none" stroke="#2f3b4d" stroke-width="3.4" stroke-linecap="round"/>
        <ellipse cx="73" cy="104" rx="6" ry="4.4" fill="#ffb3b3" opacity=".8"/>
        <ellipse cx="127" cy="104" rx="6" ry="4.4" fill="#ffb3b3" opacity=".8"/>
        <ellipse cx="80" cy="172" rx="10" ry="5" fill="#6fd0ac"/><ellipse cx="120" cy="172" rx="10" ry="5" fill="#6fd0ac"/>
      </g></svg>`;
    }
    if (level === 2) {
      return `<svg viewBox="0 0 200 200" role="img" aria-label="씩씩한 어린이 공룡">
      ${shadow}
      <g class="char-bob">
        <path d="M52 148 q-30 10 -36 -10 q22 4 34 -8z" fill="#3bbd94"/>
        <ellipse cx="100" cy="136" rx="44" ry="39" fill="#63ddb4"/>
        <ellipse cx="100" cy="144" rx="25" ry="22" fill="#e9fbf4" opacity=".92"/>
        <ellipse cx="56" cy="128" rx="9" ry="13" fill="#4ccfa4" transform="rotate(-20 56 128)"/>
        <ellipse cx="144" cy="128" rx="9" ry="13" fill="#4ccfa4" transform="rotate(20 144 128)"/>
        <circle cx="100" cy="86" r="37" fill="#63ddb4"/>
        <path d="M74 56 l6 -15 l8 12 l8 -17 l8 15 l9 -12 l5 18z" fill="#33b18a"/>
        <circle cx="87" cy="85" r="7.5" fill="#243044"/><circle cx="113" cy="85" r="7.5" fill="#243044"/>
        <circle cx="89.4" cy="82" r="2.6" fill="#fff"/><circle cx="115.4" cy="82" r="2.6" fill="#fff"/>
        <path d="M90 102 q10 9 20 0" fill="none" stroke="#243044" stroke-width="3.6" stroke-linecap="round"/>
        <ellipse cx="70" cy="97" rx="6.5" ry="4.6" fill="#ffb3b3" opacity=".85"/>
        <ellipse cx="130" cy="97" rx="6.5" ry="4.6" fill="#ffb3b3" opacity=".85"/>
        <path d="M100 133 l3.6 7.6 8.4 1.1 -6.1 5.9 1.5 8.4 -7.4 -4 -7.4 4 1.5 -8.4 -6.1 -5.9 8.4 -1.1z" fill="#ffc14d"/>
        <ellipse cx="78" cy="170" rx="11" ry="5.4" fill="#3bbd94"/><ellipse cx="122" cy="170" rx="11" ry="5.4" fill="#3bbd94"/>
      </g></svg>`;
    }
    if (level === 3) {
      return `<svg viewBox="0 0 200 200" role="img" aria-label="히어로 공룡">
      ${shadow}
      <g class="char-bob">
        <path d="M64 108 q-46 4 -50 44 q26 -18 56 -14z" fill="#ff7a6b"/>
        <path d="M60 146 q-24 12 -40 32 q30 -10 48 -12z" fill="#ff9d7f"/>
        <path d="M52 148 q-30 10 -36 -10 q22 4 34 -8z" fill="#2f9e8e"/>
        <ellipse cx="100" cy="136" rx="44" ry="39" fill="#5bb8ff"/>
        <ellipse cx="100" cy="144" rx="26" ry="23" fill="#eaf4ff" opacity=".95"/>
        <ellipse cx="56" cy="126" rx="9" ry="13" fill="#3f9fe8" transform="rotate(-25 56 126)"/>
        <ellipse cx="144" cy="126" rx="9" ry="13" fill="#3f9fe8" transform="rotate(25 144 126)"/>
        <circle cx="100" cy="86" r="37" fill="#5bb8ff"/>
        <path d="M74 56 l6 -15 l8 12 l8 -17 l8 15 l9 -12 l5 18z" fill="#2e8fd6"/>
        <path d="M66 78 q34 -14 68 0 l0 10 q-34 -12 -68 0z" fill="#22304a"/>
        <circle cx="87" cy="88" r="6.6" fill="#fff"/><circle cx="113" cy="88" r="6.6" fill="#fff"/>
        <circle cx="87.6" cy="89" r="3.4" fill="#22304a"/><circle cx="113.6" cy="89" r="3.4" fill="#22304a"/>
        <path d="M90 105 q10 9 20 0" fill="none" stroke="#22304a" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M100 130 l4.2 8.8 9.8 1.3 -7.1 6.9 1.7 9.8 -8.6 -4.7 -8.6 4.7 1.7 -9.8 -7.1 -6.9 9.8 -1.3z" fill="#ffd166" stroke="#f0b429" stroke-width="1.2"/>
        <ellipse cx="78" cy="170" rx="11" ry="5.4" fill="#2f9e8e"/><ellipse cx="122" cy="170" rx="11" ry="5.4" fill="#2f9e8e"/>
      </g></svg>`;
    }
    return `<svg viewBox="0 0 200 200" role="img" aria-label="전설의 용">
      ${shadow}
      <g class="char-bob">
        <path d="M150 60 q34 -34 30 6 q-2 30 -34 26z" fill="#b79bff" opacity=".85"/>
        <path d="M50 60 q-34 -34 -30 6 q2 30 34 26z" fill="#b79bff" opacity=".85"/>
        <path d="M64 112 q-50 2 -56 44 q28 -16 60 -12z" fill="#9b7bf0"/>
        <path d="M52 150 q-30 10 -36 -10 q22 4 34 -8z" fill="#6c4fd0"/>
        <ellipse cx="100" cy="138" rx="46" ry="40" fill="#c0a6ff"/>
        <ellipse cx="100" cy="146" rx="27" ry="24" fill="#f6f1ff" opacity=".95"/>
        <ellipse cx="55" cy="126" rx="9" ry="13" fill="#a98af5" transform="rotate(-25 55 126)"/>
        <ellipse cx="145" cy="126" rx="9" ry="13" fill="#a98af5" transform="rotate(25 145 126)"/>
        <circle cx="100" cy="86" r="38" fill="#c0a6ff"/>
        <path d="M74 56 l6 -15 l8 12 l8 -17 l8 15 l9 -12 l5 18z" fill="#9b7bf0"/>
        <path d="M82 44 l-6 -20 l12 8 l4 -16 l8 14 l10 -12 l2 20z" fill="#ffd166" stroke="#f0b429" stroke-width="1.4" stroke-linejoin="round"/>
        <circle cx="87" cy="86" r="7" fill="#fff"/><circle cx="113" cy="86" r="7" fill="#fff"/>
        <circle cx="88" cy="87" r="3.7" fill="#2b2150"/><circle cx="114" cy="87" r="3.7" fill="#2b2150"/>
        <path d="M90 104 q10 9 20 0" fill="none" stroke="#2b2150" stroke-width="3.6" stroke-linecap="round"/>
        <ellipse cx="70" cy="98" rx="6.6" ry="4.8" fill="#ffb3b3" opacity=".9"/>
        <ellipse cx="130" cy="98" rx="6.6" ry="4.8" fill="#ffb3b3" opacity=".9"/>
        <path d="M100 132 l4.6 9.6 10.6 1.4 -7.7 7.5 1.8 10.6 -9.3 -5.1 -9.3 5.1 1.8 -10.6 -7.7 -7.5 10.6 -1.4z" fill="#ffe08a" stroke="#f0b429" stroke-width="1.2"/>
        <ellipse cx="78" cy="172" rx="11" ry="5.4" fill="#8f6fe0"/><ellipse cx="122" cy="172" rx="11" ry="5.4" fill="#8f6fe0"/>
        <g fill="#ffe08a"><path d="M158 96 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M44 88 l2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4 -6.4 -6.4 -2.4 6.4 -2.4z"/></g>
      </g></svg>`;
  }

  function renderMissions() {
    const t = todayStr();
    const total = Math.max(0, Math.round((S.points && S.points.total) || 0));
    const lv = levelIndex(total);
    $('#charStage').innerHTML = charSVG(lv);
    $('#charLevel').textContent = LEVELS[lv].name;
    const doneList = S.missions.filter((x) => x.doneOn === t);
    const ptsToday = doneList.reduce((s, x) => s + (+x.points || 0), 0);
    $('#charCount').innerHTML = `누적 <b>${total}P</b>`;
    $('#charToday').textContent = `오늘 +${ptsToday}P`;
    $('#choreSub').textContent = `오늘 ${doneList.length}개 완료 · 미션 ${S.missions.length}개`;
    const cur = LEVELS[lv];
    const nxt = LEVELS[lv + 1];
    if (nxt) {
      const span = nxt.min - cur.min;
      const got = total - cur.min;
      $('#charBar').style.width = clamp((got / span) * 100, 0, 100) + '%';
      $('#charNext').textContent = `${cur.next}까지 ${Math.max(0, nxt.min - total)}P 남았어요`;
    } else {
      $('#charBar').style.width = '100%';
      $('#charNext').textContent = '최고 단계예요! 대단해요 🎉';
    }

    // 구성원별 오늘 완료·오늘 포인트·누적 포인트
    const stats = memberStats();
    $('#memberStats').innerHTML = stats.map((s) => `<div class="mstat" style="--c:${esc(s.m.color)}">
        <span class="mdot" style="background:${esc(s.m.color)}"></span>
        <span class="mstat-name">${esc(s.m.name)}</span>
        <span class="mstat-today">오늘 ${s.today}개</span>
        <span class="mstat-pts">${s.ptsToday ? '+' + s.ptsToday + 'P' : '0P'}</span>
        <span class="mstat-total">누적 ${s.total}P</span>
      </div>`).join('');

    // 미션 목록
    const order = {};
    S.members.forEach((m, i) => { order[m.id] = i; });
    order[''] = 99;
    const list = S.missions.slice().sort((a, b) => (order[a.member] ?? 50) - (order[b.member] ?? 50));
    $('#choreList').innerHTML = list.length
      ? list.map((c) => {
          const done = c.doneOn === t;
          const m = memberById(c.member);
          return `<div class="chore ${done ? 'done' : ''}">
            <button class="chore-check" data-act="chore-toggle" data-id="${c.id}" aria-label="${esc(c.title)} 완료">${done ? '✓' : '○'}</button>
            <div class="chore-main">
              <div class="chore-title">${esc(c.title)}</div>
              <div class="chore-meta"><span class="mdot" style="background:${m ? esc(m.color) : '#9aa4bd'}"></span>${esc(m ? m.name : '공용')}</div>
            </div>
            <span class="pts">+${Math.max(0, Math.round(+c.points || 0))}P</span>
            <div class="chore-tools">
              <button class="btn icon sm ghost" data-act="chore-edit" data-id="${c.id}" aria-label="수정">✎</button>
              <button class="btn icon sm ghost" data-act="chore-del" data-id="${c.id}" aria-label="삭제">✕</button>
            </div>
          </div>`;
        }).join('')
      : `<div class="shop-empty">미션을 추가해 보세요</div>`;

    // 10P마다 별 하나
    const stars = Math.min(Math.floor(total / 10), 24);
    let row = '';
    for (let i = 0; i < stars; i++) row += '<span>⭐</span>';
    if (total >= 10 && total > stars * 10) row += `<span style="font-size:11px;font-weight:800;color:var(--text-3);align-self:center">${total - stars * 10}P</span>`;
    if (!stars) row = '<span style="font-size:11.5px;font-weight:700;color:var(--text-3)">미션을 끝내면 10P마다 ⭐ 하나씩 쌓여요</span>';
    $('#stickerRow').innerHTML = row;
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
        ptsToday: done.reduce((s, x) => s + (+x.points || 0), 0),
        total: Math.max(0, Math.round(+bym[m.id] || 0)),
      };
    });
    const shared = S.missions.filter((x) => !x.member);
    if (shared.length) {
      const done = shared.filter((x) => x.doneOn === t);
      rows.push({
        m: { id: '', name: '공용', color: '#9aa4bd' },
        today: done.length,
        ptsToday: done.reduce((s, x) => s + (+x.points || 0), 0),
        total: Math.max(0, Math.round(+bym[''] || 0)),
      });
    }
    return rows;
  }

  function toggleMission(id) {
    const c = S.missions.find((x) => x.id === id);
    if (!c) return;
    const t = todayStr();
    const p = Math.max(0, Math.round(+c.points || 0));
    if (!S.points) S.points = { total: 0, byMember: {} };
    if (!S.points.byMember) S.points.byMember = {};
    const key = c.member || '';
    const before = levelIndex(Math.max(0, Math.round(S.points.total || 0)));
    const wasDone = c.doneOn === t;
    if (wasDone) {
      c.doneOn = null;
      S.points.total = Math.max(0, (S.points.total || 0) - p);
      S.points.byMember[key] = Math.max(0, (S.points.byMember[key] || 0) - p);
    } else {
      c.doneOn = t;
      S.points.total = (S.points.total || 0) + p;
      S.points.byMember[key] = (S.points.byMember[key] || 0) + p;
    }
    const after = levelIndex(Math.max(0, Math.round(S.points.total || 0)));
    save();
    renderMissions();
    if (after > before) {
      confetti(90);
      beep('up');
      showLevelUp(after);
    } else if (wasDone) {
      toast('완료를 취소했어요', '', 1400);
    } else {
      toast(`+${p}P ⭐ 잘했어요!`, 'mint', 1500);
    }
  }

  function showLevelUp(lv) {
    const el = $('#levelup');
    el.innerHTML = `<div class="levelup-card">
      <div class="lv-emoji">🎉</div>
      <h4>${esc(LEVELS[lv].name)} 로 성장했어요!</h4>
      <p>누적 ${Math.round(S.points.total)}P · 정말 대단해요</p>
      <div style="width:130px;height:130px;margin:6px auto 0">${charSVG(lv)}</div>
    </div>`;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 2600);
  }

  function missionMemberOptions() {
    return S.members.map((m) => ({ value: m.id, label: m.name })).concat([{ value: '', label: '공용(모두)' }]);
  }

  async function addMission() {
    const r = await askModal({
      title: '미션 추가',
      hint: '끝내면 정한 만큼 포인트가 쌓입니다. 아이든 어른이든 같은 방식으로 쓸 수 있어요.',
      fields: [
        { name: 'title', label: '미션', placeholder: '예: 신발 정리하기' },
        { name: 'points', label: '포인트 (P)', type: 'number', value: 3 },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: (S.members[S.members.length - 1] || {}).id || '' },
      ],
      okText: '추가',
    });
    if (!r || !r.title.trim()) return;
    S.missions.push({ id: uid(), title: r.title.trim(), points: Math.max(0, Math.round(+r.points || 0)), member: r.member || '', doneOn: null });
    save(); renderMissions(); toast('미션을 추가했어요', 'mint');
  }

  async function editMission(id) {
    const c = S.missions.find((x) => x.id === id);
    if (!c) return;
    const r = await askModal({
      title: '미션 수정',
      fields: [
        { name: 'title', label: '미션', value: c.title },
        { name: 'points', label: '포인트 (P)', type: 'number', value: Math.max(0, Math.round(+c.points || 0)) },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: c.member || '' },
      ],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') { S.missions = S.missions.filter((x) => x.id !== id); save(); renderMissions(); return; }
    if (!r || !r.title.trim()) return;
    const oldPts = Math.max(0, Math.round(+c.points || 0));
    const newPts = Math.max(0, Math.round(+r.points || 0));
    // 오늘 이미 완료한 미션의 포인트를 바꾸면 누적 포인트도 차이만큼 맞춰 준다
    if (c.doneOn === todayStr() && newPts !== oldPts) {
      const delta = newPts - oldPts;
      if (!S.points.byMember) S.points.byMember = {};
      const key = c.member || '';
      S.points.total = Math.max(0, (S.points.total || 0) + delta);
      S.points.byMember[key] = Math.max(0, (S.points.byMember[key] || 0) + delta);
    }
    c.title = r.title.trim();
    c.points = newPts;
    c.member = r.member || '';
    save(); renderMissions(); toast('미션을 저장했어요', 'mint');
  }

  async function resetPoints() {
    const r = await askModal({
      title: '포인트 초기화',
      hint: '누적 포인트와 오늘 완료 표시를 0으로 되돌립니다. 미션 목록은 그대로 남습니다.',
      fields: [{ name: 'ok', label: '계속하려면 "초기화"를 입력하세요', placeholder: '초기화' }],
      okText: '초기화',
    });
    if (!r) return;
    if ((r.ok || '').trim() !== '초기화') { toast('입력이 맞지 않아 취소했어요'); return; }
    const t = todayStr();
    S.points = { total: 0, byMember: {} };
    S.missions.forEach((m) => { if (m.doneOn === t) m.doneOn = null; });
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

  /* ---------------------------------------------------------------- wiki/budget */
  const WIKI_GROUPS = ['생신·기념일', '예방접종', '집안 메모', '연락처·와이파이'];

  function renderWiki() {
    const box = $('#wikiList');
    if (!S.wiki.length) { box.innerHTML = '<div class="shop-empty">항목을 추가해 우리 집 정보를 모아 두세요</div>'; return; }
    const groups = [];
    S.wiki.forEach((w) => { if (!groups.includes(w.group)) groups.push(w.group); });
    box.innerHTML = groups.map((g) => {
      const items = S.wiki.filter((w) => w.group === g);
      return `<div class="wiki-group">${esc(g)}</div>` + items.map((w) => `
        <div class="wiki-item">
          <div class="wiki-key">${esc(w.key)}</div>
          <div class="wiki-val">${esc(w.val)}</div>
          <div class="wiki-tools">
            <button class="btn icon sm ghost" data-act="wiki-edit" data-id="${w.id}" aria-label="수정">✎</button>
            <button class="btn icon sm ghost" data-act="wiki-del" data-id="${w.id}" aria-label="삭제">✕</button>
          </div>
        </div>`).join('');
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

  function budgetTotals() {
    const f = S.budget.fixed.reduce((s, x) => s + (+x.amount || 0), 0);
    const v = S.budget.variable.reduce((s, x) => s + (+x.amount || 0), 0);
    const goal = +S.budget.goal || 0;
    return { f, v, goal, used: f + v, left: goal - (f + v) };
  }

  function renderBudget() {
    const { f, v, goal, used, left } = budgetTotals();
    const pct = goal > 0 ? clamp((used / goal) * 100, 0, 100) : (used > 0 ? 100 : 0);
    const cls = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : '';
    $('#budgetSub').textContent = `예산 ${won(goal)}원 · 쓴 돈 ${won(used)}원`;
    const rows = (list, kind) => list.length
      ? list.map((x) => `<div class="budget-line">
          <span>${esc(x.label)}</span>
          <button class="del" data-act="budget-del" data-kind="${kind}" data-id="${x.id}" aria-label="삭제">✕</button>
          <b>${won(x.amount)}</b>
        </div>`).join('')
      : `<div class="budget-line" style="color:var(--text-3)">항목 없음</div>`;
    $('#budgetBody').innerHTML = `
      <div class="budget-top">
        <div>
          <div class="budget-left-label">${left >= 0 ? '남은 예산' : '초과 금액'}</div>
          <div class="budget-left" style="${left < 0 ? 'color:var(--coral)' : ''}">${won(Math.abs(left))}<small>원</small></div>
        </div>
        <div class="budget-pct">${Math.round(pct)}% 사용</div>
      </div>
      <div class="gauge ${cls}"><i style="width:${pct}%"></i></div>
      <div class="budget-rows" style="margin-top:4px">
        <div class="budget-box">
          <h4>고정비 <span>${won(f)}원</span></h4>
          ${rows(S.budget.fixed, 'fixed')}
          <button class="btn sm ghost block" data-act="budget-add" data-kind="fixed" style="margin-top:4px">＋ 고정비 추가</button>
        </div>
        <div class="budget-box">
          <h4>변동비 <span>${won(v)}원</span></h4>
          ${rows(S.budget.variable, 'variable')}
          <button class="btn sm ghost block" data-act="budget-add" data-kind="variable" style="margin-top:4px">＋ 변동비 추가</button>
        </div>
      </div>`;
  }

  async function editBudgetGoal() {
    const r = await askModal({
      title: '이번 달 예산',
      hint: '한 달 목표 예산을 정하면 남은 금액 게이지가 채워집니다.',
      fields: [{ name: 'goal', label: '목표 예산 (원)', type: 'number', value: S.budget.goal || 0 }],
      okText: '저장',
    });
    if (!r) return;
    S.budget.goal = Math.max(0, Math.round(+r.goal || 0));
    save(); renderBudget(); toast('예산을 저장했어요', 'mint');
  }

  async function addBudgetItem(kind) {
    const r = await askModal({
      title: kind === 'fixed' ? '고정비 추가' : '변동비 추가',
      hint: '고정비: 매달 나가는 돈 · 변동비: 이번 달에 쓴 돈',
      fields: [
        { name: 'label', label: '항목', placeholder: '예: 관리비' },
        { name: 'amount', label: '금액 (원)', type: 'number', value: 0 },
      ],
      okText: '추가',
    });
    if (!r || !r.label.trim()) return;
    S.budget[kind].push({ id: uid(), label: r.label.trim(), amount: Math.max(0, Math.round(+r.amount || 0)) });
    save(); renderBudget();
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
        return `<label class="field">${esc(f.label)}<input type="${f.type || 'text'}" name="${esc(f.name)}" id="${id}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"${f.type === 'number' ? ' inputmode="numeric"' : ''}></label>`;
      }).join('');

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
    try {
      const bytes = new Blob([JSON.stringify(S)]).size;
      $('#storageNote').textContent = `지금 저장된 데이터 약 ${(bytes / 1024).toFixed(0)}KB · 브라우저 한도 약 5MB`;
    } catch (e) { $('#storageNote').textContent = ''; }
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
        box.innerHTML = '<div class="settings-note">검색 결과가 없어요. 다른 이름으로 찾아보세요. (예: 기흥, 수원시)</div>';
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
    renderBudget();
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
        S.missions = S.missions.filter((x) => x.id !== id); save(); renderMissions();
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
      } else if (act === 'budget-add') {
        addBudgetItem(t.dataset.kind);
      } else if (act === 'budget-del') {
        const kind = t.dataset.kind;
        S.budget[kind] = S.budget[kind].filter((x) => x.id !== id);
        save(); renderBudget();
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
  $('#wikiAddBtn').addEventListener('click', () => editWiki(null));
  $('#budgetEditBtn').addEventListener('click', editBudgetGoal);
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
      hint: '일정·할 일·편지·장보기·위키·가계부 기록이 모두 사라집니다. 되돌릴 수 없으니 먼저 백업해 두세요.',
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

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['#modal', '#letterModal', '#settingsModal', '#helpModal'].forEach((sel) => {
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
  loadWeatherCache();
  applyTheme();
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

  // 테스트·디버그용 (개인정보 없음)
  window.FamilyDashboard = { get state() { return S; }, version: '1.0.0' };
})();
