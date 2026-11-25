/* ==========================================================================
   우리 가족 대시보드 — app.js
   기본은 이 브라우저(localStorage)에 저장합니다. Google 로그인 후에는
   Firebase 연동 모듈이 허용된 가족 기록을 Firestore와 동기화합니다.
   기본 데이터에는 개인정보가 들어 있지 않습니다 — 전부 예시값입니다.
   ========================================================================== */
(() => {
  'use strict';

  // 앱 버전은 여기 한 곳에서만 정합니다. 화면 표시(#appVersion)와 window.FamilyDashboard.version이 이 값을 읽습니다.
  const APP_VERSION = '3.2.0';
  { const vEl = document.getElementById('appVersion'); if (vEl) vEl.textContent = 'v ' + APP_VERSION; }

  /* ---------------------------------------------------------------- helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // 화면에 보여 주는 순서(월~일), 값은 0=일 … 6=토
  /* 미션 요일 반복 — days: [] = 매일, [0..6] = 그 요일에만 (0=일, 1=월 … 6=토) */
  function normDays(v) {
    if (!Array.isArray(v)) return [];
    const set = [];
    v.forEach((n) => { const d = parseInt(n, 10); if (d >= 0 && d <= 6 && set.indexOf(d) < 0) set.push(d); });
    set.sort((a, b) => a - b);
    return set.length >= 7 ? [] : set;          // 7일을 다 고르면 '매일'과 같습니다
  }
  const daysOf = (m) => normDays(m && m.days);
  function parseDays(v) {
    if (Array.isArray(v)) return normDays(v);
    return normDays(String(v == null ? '' : v).split(',').map((x) => parseInt(x, 10)).filter((n) => n >= 0 && n <= 6));
  }
  const sameDays = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  const missionOnDay = (m, dow) => { const d = daysOf(m); return !d.length || d.indexOf(dow) >= 0; };
  const missionAvailableToday = (m, date = todayStr()) => !m || m.special !== true || !m.specialDate || m.specialDate === date;
  const isSpecialMissionToday = (m, date = todayStr()) => !!m && m.special === true && (!m.specialDate || m.specialDate === date);
  function daysLabel(v) {
    const d = normDays(Array.isArray(v) ? v : parseDays(v));
    if (!d.length) return '매일';
    if (sameDays(d, [1, 2, 3, 4, 5])) return '월~금';
    if (sameDays(d, [0, 6])) return '주말';
    const runs = [];
    d.forEach((n) => {
      const last = runs[runs.length - 1];
      if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
    });
    return runs.map(([a, b]) => (a === b ? DAYS[a] : (b - a === 1 ? `${DAYS[a]}·${DAYS[b]}` : `${DAYS[a]}~${DAYS[b]}`))).join('·');
  }
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => fmtDate(new Date());
  const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  /* ⏰ 알람 판단 도우미(alarm-core.js) — 미션·일정·맞춤 알람 중 '지금 울릴 것'을 고르는 계산만 담당합니다 */
  const ALARM = window.FamilyAlarmCore || null;
  const fmtMD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? `${+m[2]}/${+m[3]}` : ''; };
  const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  // 완료 이력 보존: 오래된 기록은 잘라내되 최소 400일은 그대로 남깁니다 (동기화 patch에도 그대로 반영)
  function keepLogs(arr) {
    const cutoff = fmtDate(addDays(new Date(), -(LOG_KEEP_DAYS - 1)));
    const kept = (Array.isArray(arr) ? arr : []).filter((l) => l && typeof l === 'object' && isDateStr(l.date));
    const recent = kept.filter((l) => l.date >= cutoff);
    return recent.length > 8000 ? recent.slice(0, 8000) : recent; // 안전 상한(하루 20건 × 400일)
  }

  /* 아이 역할 구성원과 포켓몬 성장 기준 */
  const KID_ID = 'm3';        // 아이 역할 — 이름은 설정에서 바꿀 수 있고, id는 그대로 씁니다
  const FINAL_P = 200;        // 최종 진화 기준 경험치(현재 파트너)
  const LOG_KEEP_DAYS = 400;  // 완료 이력은 400일(1년 이상) 보존 — 월간·연간 달성 현황 조회용

  /* ------------------------------------------------------ missions/character */
  /* 1세대 포켓몬 151종 — 이름·타입
     PokeAPI 의 한국어 이름과 타입을 그대로 옮겨 적었습니다 (No.001 이상해씨 ~ No.151 뮤).
     "번호|이름|타입" 한 줄씩. 두 번째 타입은 쉼표로 이어 붙입니다. */
  const GEN1_TABLE = `
1|이상해씨|풀,독
2|이상해풀|풀,독
3|이상해꽃|풀,독
4|파이리|불꽃
5|리자드|불꽃
6|리자몽|불꽃,비행
7|꼬부기|물
8|어니부기|물
9|거북왕|물
10|캐터피|벌레
11|단데기|벌레
12|버터플|벌레,비행
13|뿔충이|벌레,독
14|딱충이|벌레,독
15|독침붕|벌레,독
16|구구|노말,비행
17|피죤|노말,비행
18|피죤투|노말,비행
19|꼬렛|노말
20|레트라|노말
21|깨비참|노말,비행
22|깨비드릴조|노말,비행
23|아보|독
24|아보크|독
25|피카츄|전기
26|라이츄|전기
27|모래두지|땅
28|고지|땅
29|니드런♀|독
30|니드리나|독
31|니드퀸|독,땅
32|니드런♂|독
33|니드리노|독
34|니드킹|독,땅
35|삐삐|페어리
36|픽시|페어리
37|식스테일|불꽃
38|나인테일|불꽃
39|푸린|노말,페어리
40|푸크린|노말,페어리
41|주뱃|독,비행
42|골뱃|독,비행
43|뚜벅쵸|풀,독
44|냄새꼬|풀,독
45|라플레시아|풀,독
46|파라스|벌레,풀
47|파라섹트|벌레,풀
48|콘팡|벌레,독
49|도나리|벌레,독
50|디그다|땅
51|닥트리오|땅
52|나옹|노말
53|페르시온|노말
54|고라파덕|물
55|골덕|물
56|망키|격투
57|성원숭|격투
58|가디|불꽃
59|윈디|불꽃
60|발챙이|물
61|슈륙챙이|물
62|강챙이|물,격투
63|캐이시|에스퍼
64|윤겔라|에스퍼
65|후딘|에스퍼
66|알통몬|격투
67|근육몬|격투
68|괴력몬|격투
69|모다피|풀,독
70|우츠동|풀,독
71|우츠보트|풀,독
72|왕눈해|물,독
73|독파리|물,독
74|꼬마돌|바위,땅
75|데구리|바위,땅
76|딱구리|바위,땅
77|포니타|불꽃
78|날쌩마|불꽃
79|야돈|물,에스퍼
80|야도란|물,에스퍼
81|코일|전기,강철
82|레어코일|전기,강철
83|파오리|노말,비행
84|두두|노말,비행
85|두트리오|노말,비행
86|쥬쥬|물
87|쥬레곤|물,얼음
88|질퍽이|독
89|질뻐기|독
90|셀러|물
91|파르셀|물,얼음
92|고오스|고스트,독
93|고우스트|고스트,독
94|팬텀|고스트,독
95|롱스톤|바위,땅
96|슬리프|에스퍼
97|슬리퍼|에스퍼
98|크랩|물
99|킹크랩|물
100|찌리리공|전기
101|붐볼|전기
102|아라리|풀,에스퍼
103|나시|풀,에스퍼
104|탕구리|땅
105|텅구리|땅
106|시라소몬|격투
107|홍수몬|격투
108|내루미|노말
109|또가스|독
110|또도가스|독
111|뿔카노|땅,바위
112|코뿌리|땅,바위
113|럭키|노말
114|덩쿠리|풀
115|캥카|노말
116|쏘드라|물
117|시드라|물
118|콘치|물
119|왕콘치|물
120|별가사리|물
121|아쿠스타|물,에스퍼
122|마임맨|에스퍼,페어리
123|스라크|벌레,비행
124|루주라|얼음,에스퍼
125|에레브|전기
126|마그마|불꽃
127|쁘사이저|벌레
128|켄타로스|노말
129|잉어킹|물
130|갸라도스|물,비행
131|라프라스|물,얼음
132|메타몽|노말
133|이브이|노말
134|샤미드|물
135|쥬피썬더|전기
136|부스터|불꽃
137|폴리곤|노말
138|암나이트|바위,물
139|암스타|바위,물
140|투구|바위,물
141|투구푸스|바위,물
142|프테라|바위,비행
143|잠만보|노말
144|프리져|얼음,비행
145|썬더|전기,비행
146|파이어|불꽃,비행
147|미뇽|드래곤
148|신뇽|드래곤
149|망나뇽|드래곤,비행
150|뮤츠|에스퍼
151|뮤|에스퍼
`;

  const POKE_INFO = {};
  const POKE_NOS = [];
  GEN1_TABLE.trim().split('\n').forEach((row) => {
    const parts = row.split('|');
    const id = +parts[0];
    if (!(id > 0)) return;
    POKE_INFO[id] = {
      id,
      name: String(parts[1] || '').trim(),
      types: String(parts[2] || '').split(',').map((s) => s.trim()).filter(Boolean),
    };
    POKE_NOS.push(id);
  });
  // 피츄(No.172)는 2세대 유아 진화지만 피카츄 계열의 첫 단계라 데이터에만 함께 담았습니다 (151 도감 번호에는 넣지 않음)
  POKE_INFO[172] = { id: 172, name: '피츄', types: ['전기'] };

  const POKE_TYPE_TINT = {
    '풀': '#5fae7f', '독': '#a26bd6', '불꽃': '#f0803c', '비행': '#8f9ee0', '물': '#4f9fdf',
    '벌레': '#94b93c', '노말': '#b0a999', '전기': '#e5b52b', '땅': '#c9964f', '페어리': '#eb9bc9',
    '격투': '#d4553f', '에스퍼': '#ef6f9c', '바위': '#b59a55', '얼음': '#6fc9d8', '고스트': '#8a76cc',
    '드래곤': '#6b7ce8', '강철': '#93a1bd', '악': '#77675c',
  };
  const pokeInfo = (id) => POKE_INFO[id] || { id, name: `No.${id}`, types: [] };
  const pokeName = (id) => pokeInfo(id).name;
  const pokeTint = (id) => POKE_TYPE_TINT[pokeInfo(id).types[0]] || '#9aa4bd';
  const pokeNoText = (id) => (id <= 151 ? `No.${pad(id)}` : '');

  /* 진화 계열 — 한 줄이 파트너가 함께 자라는 한 계열입니다.
     PokeAPI evolution-chain 을 1세대 종만 남겨 정리했고, 갈라지는 계열(이브이)은 줄마다 따로 두었습니다. */
  const GEN1_LINES = [
    [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18],
    [19, 20], [21, 22], [23, 24], [172, 25, 26], [27, 28], [29, 30, 31],
    [32, 33, 34], [35, 36], [37, 38], [39, 40], [41, 42], [43, 44, 45],
    [46, 47], [48, 49], [50, 51], [52, 53], [54, 55], [56, 57],
    [58, 59], [60, 61, 62], [63, 64, 65], [66, 67, 68], [69, 70, 71], [72, 73],
    [74, 75, 76], [77, 78], [79, 80], [81, 82], [83], [84, 85],
    [86, 87], [88, 89], [90, 91], [92, 93, 94], [95], [96, 97],
    [98, 99], [100, 101], [102, 103], [104, 105], [106], [107],
    [108], [109, 110], [111, 112], [113], [114], [115],
    [116, 117], [118, 119], [120, 121], [122], [123], [124],
    [125], [126], [127], [128], [129, 130], [131],
    [132], [133, 134], [133, 135], [133, 136], [137], [138, 139],
    [140, 141], [142], [143], [144], [145], [146],
    [147, 148, 149], [150], [151],
  ];

  /* 단계별 기준 경험치 — 한 계열을 0P부터 200P까지 고르게 나눕니다.
     200P에 닿으면 마지막 모습의 '이로치'가 되어 도감에 영구 저장됩니다. */
  const STAGE_MINS = { 1: [0], 2: [0, 60], 3: [0, 40, 90] };

  function buildLine(ids) {
    const mins = STAGE_MINS[Math.min(3, ids.length)] || [0, 40, 90];
    const stages = ids.map((id, i) => ({
      id,
      name: pokeName(id),
      min: mins[Math.min(i, mins.length - 1)],
      tint: pokeTint(id),
    }));
    const fin = stages[stages.length - 1];
    stages.push({ id: fin.id, name: `이로치 ${fin.name}`, min: FINAL_P, crown: true, shiny: true, tint: fin.tint });
    const base = pokeName(ids[0]);
    return {
      key: 'L' + ids.join('-'),
      label: ids[0] === 133 ? `${base} → ${fin.name}` : base,
      tint: pokeTint(ids[0]),
      stages,
      members: ids.slice(),
      finalId: fin.id,
      finalBase: fin.name,
    };
  }

  /* 예전에 쓰던 다른 세대 계열 — 이미 기르던 파트너가 갑자기 바뀌지 않도록 그대로 남겨 둡니다 */
  const EXTRA_LINES = [
    { key: 'riolu', label: '리오르', tint: '#4f7fd6', finalBase: '루카리오', members: [447, 448],
      stages: [
        { id: 447, name: '리오르', min: 0, tint: '#4f7fd6' },
        { id: 448, name: '루카리오', min: 70, tint: '#4f7fd6' },
        { id: 10059, name: '메가루카리오', min: FINAL_P, crown: true, tint: '#4f7fd6' },
      ] },
    { key: 'froakie', label: '개구마르', tint: '#4f95ff', finalBase: '개굴닌자', members: [656, 657, 658],
      stages: [
        { id: 656, name: '개구마르', min: 0, tint: '#4f95ff' },
        { id: 657, name: '개굴반장', min: 60, tint: '#4f95ff' },
        { id: 658, name: '개굴닌자', min: FINAL_P, crown: true, tint: '#4f95ff' },
      ] },
    { key: 'piplup', label: '팽도리', tint: '#4aa3d8', finalBase: '엠페르트', members: [393, 394, 395],
      stages: [
        { id: 393, name: '팽도리', min: 0, tint: '#4aa3d8' },
        { id: 394, name: '팽태자', min: 70, tint: '#4aa3d8' },
        { id: 395, name: '엠페르트', min: FINAL_P, crown: true, tint: '#4aa3d8' },
      ] },
    { key: 'chimchar', label: '불꽃숭이', tint: '#f4883c', finalBase: '초염몽', members: [390, 391, 392],
      stages: [
        { id: 390, name: '불꽃숭이', min: 0, tint: '#f4883c' },
        { id: 391, name: '파이숭이', min: 70, tint: '#f4883c' },
        { id: 392, name: '초염몽', min: FINAL_P, crown: true, tint: '#f4883c' },
      ] },
    { key: 'turtwig', label: '모부기', tint: '#7cbf5a', finalBase: '토대부기', members: [387, 388, 389],
      stages: [
        { id: 387, name: '모부기', min: 0, tint: '#7cbf5a' },
        { id: 388, name: '수풀부기', min: 70, tint: '#7cbf5a' },
        { id: 389, name: '토대부기', min: FINAL_P, crown: true, tint: '#7cbf5a' },
      ] },
  ];

  const LINES = GEN1_LINES.map(buildLine).concat(EXTRA_LINES);
  const LINE_BY_KEY = {};
  LINES.forEach((l) => { LINE_BY_KEY[l.key] = l; });

  // 예전 저장값(계열 이름 키)을 새 계열 키로 이어 줍니다
  const LEGACY_KEYS = {
    pikachu: 'L172-25-26', charmander: 'L4-5-6', squirtle: 'L7-8-9', bulbasaur: 'L1-2-3',
    eevee: 'L133-134', dratini: 'L147-148-149', gastly: 'L92-93-94',
  };
  const DEFAULT_PARTNER = 'L' + GEN1_LINES[0].join('-');
  const POKE_KEYS = Object.keys(LINE_BY_KEY);

  function resolvePartnerKey(k) {
    const key = String(k || '');
    if (LINE_BY_KEY[key]) return key;
    // 서버(Firestore)는 계열 키를 소문자로 보관합니다 → 대소문자 차이만으로 기본 파트너로
    // 되돌아가지 않도록 대소문자를 무시하고 한 번 더 찾습니다.
    const ci = POKE_KEYS.find((x) => x.toLowerCase() === key.toLowerCase());
    if (ci) return ci;
    if (LEGACY_KEYS[key] && LINE_BY_KEY[LEGACY_KEYS[key]]) return LEGACY_KEYS[key];
    return LINE_BY_KEY[DEFAULT_PARTNER] ? DEFAULT_PARTNER : POKE_KEYS[0];
  }

  const partnerOf = (key) => LINE_BY_KEY[resolvePartnerKey(key)] || LINES[0];
  const stagesOf = () => partnerOf(S.pokemon.key).stages;
  const finalStageOf = (p) => p.stages[p.stages.length - 1];
  function stageIndex(n) {
    const st = stagesOf();
    let idx = 0;
    st.forEach((s, i) => { if (n >= s.min) idx = i; });
    return idx;
  }
  // 이 종이 들어 있는 계열(이브이처럼 갈라지는 계열은 여러 줄)
  const linesForSpecies = (id) => LINES.filter((l) => l.members.indexOf(+id) >= 0);
  const lineForSpecies = (id) => linesForSpecies(id)[0] || null;

  /* 그림 — PokeAPI/sprites 의 공식 일러스트(official-artwork, 475×475)를 씁니다.
     큼직하게 키워도 화질이 그대로라, 움직임은 CSS 애니메이션(숨쉬기·둥실둥실·점프)으로 살립니다.
     그림을 못 받으면 로컬 SVG로 자동 대체됩니다. */
  const SPRITE_ROOT = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const POKE_ART = (id) => `${SPRITE_ROOT}/other/official-artwork/${id}.png`;
  const POKE_ART_SHINY = (id) => `${SPRITE_ROOT}/other/official-artwork/shiny/${id}.png`;

  // CDN 그림을 못 받았을 때 쓰는 로컬 SVG (외부 요청 없이 항상 그려짐)
  function pokeFallback(stage, tint) {
    const color = tint || stage.tint || '#9aa4bd';
    const crown = stage.crown
      ? '<path d="M100 16 l9 15 17 3 -12 12 3 17 -17 -8 -17 8 3 -17 -12 -12 17 -3z" fill="#ffd166" stroke="#e0a92b" stroke-width="3" stroke-linejoin="round"/>'
      : '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
      + '<circle cx="100" cy="106" r="78" fill="' + color + '" opacity=".16"/>'
      + crown
      + '<path d="M54 100 q-12 -36 6 -50 q15 11 14 32z" fill="' + color + '" opacity=".92"/>'
      + '<path d="M146 100 q12 -36 -6 -50 q-15 11 -14 32z" fill="' + color + '" opacity=".92"/>'
      + '<ellipse cx="100" cy="142" rx="46" ry="37" fill="' + color + '"/>'
      + '<ellipse cx="100" cy="150" rx="27" ry="21" fill="#fffdf8" opacity=".6"/>'
      + '<circle cx="100" cy="94" r="42" fill="' + color + '"/>'
      + '<circle cx="84" cy="92" r="7" fill="#22304a"/><circle cx="116" cy="92" r="7" fill="#22304a"/>'
      + '<circle cx="86.4" cy="89" r="2.6" fill="#fff"/><circle cx="118.4" cy="89" r="2.6" fill="#fff"/>'
      + '<path d="M90 110 q10 9 20 0" fill="none" stroke="#22304a" stroke-width="4" stroke-linecap="round"/>'
      + '<ellipse cx="68" cy="104" rx="7" ry="5" fill="#ff9b9b" opacity=".85"/>'
      + '<ellipse cx="132" cy="104" rx="7" ry="5" fill="#ff9b9b" opacity=".85"/>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* 공식 일러스트 한 장으로 파트너·대기화면·도감을 모두 채맵니다 (화질 통일).
     opts: { shiny } 이로치 · { eager } 바로 불러오기 · { mini } 작은 칸(지연 로딩) */
  function pokeImg(stage, cls, tint, opts = {}) {
    const color = tint || stage.tint || pokeTint(stage.id);
    const shiny = !!(opts.shiny || stage.shiny);
    const src = shiny ? POKE_ART_SHINY(stage.id) : POKE_ART(stage.id);
    return `<img class="${cls}" src="${src}" alt="${esc(stage.name)}" data-poke="${stage.id}" data-poke-name="${esc(stage.name)}"`
      + ` data-fallback="${esc(POKE_ART(stage.id))}" data-fallback2="${esc(pokeFallback(stage, color))}"`
      + ` loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" draggable="false">`;
  }

  // 그림 로딩 실패 → 공식 일러스트 → 로컬 SVG (깨진 그림이 남지 않습니다)
  function swapPokeFallback(img) {
    if (!img || !img.dataset) return false;
    const lvl = img.dataset.fb || '0';
    if (lvl === '0' && img.dataset.fallback) { img.dataset.fb = '1'; img.src = img.dataset.fallback; return true; }
    if (lvl !== '2' && img.dataset.fallback2) { img.dataset.fb = '2'; img.src = img.dataset.fallback2; return true; }
    return false;
  }
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset && img.dataset.poke) swapPokeFallback(img);
  }, true);

  function checkPokeImages() {
    $$('img[data-poke]').forEach((img) => {
      if (!img.dataset.fb && img.complete && img.naturalWidth === 0) swapPokeFallback(img);
    });
  }

  /* ---- 도감: 만난 종 남기기 ---- */
  const caughtMap = () => (S.pokemon && S.pokemon.caught && typeof S.pokemon.caught === 'object') ? S.pokemon.caught : {};
  const caughtOf = (id) => caughtMap()[String(id)] || '';
  function markCaught(ids, date) {
    if (!S.pokemon.caught || typeof S.pokemon.caught !== 'object') S.pokemon.caught = {};
    let changed = false;
    (ids || []).forEach((id) => {
      const k = String(id);
      if (!(+id > 0) || S.pokemon.caught[k]) return;
      S.pokemon.caught[k] = date || todayStr();
      changed = true;
    });
    return changed;
  }
  // 지금 파트너가 지나온 단계는 모두 '만난 종'으로 도감에 남습니다
  function syncCaught() {
    const st = stagesOf();
    const idx = stageIndex(S.pokemon.xp);
    if (window.PartnerGrowthCore && PartnerGrowthCore.isEgg(S.pokemon.growth, S.pokemon.xp)) return false;
    return markCaught(st.slice(0, idx + 1).map((s) => s.id));
  }
  const caughtCount = () => POKE_NOS.filter((id) => caughtOf(id)).length;

  /* ------------------------------------------------------------- data model */
  const KEY = 'family-dashboard:v1';
  const WKEY = 'family-dashboard:weather';

  /* 🎁 사고 싶은 것 분류 태그 */
  const WISH_CATS = [
    { key: 'toy', label: '장난감', ico: '🧸' },
    { key: 'supply', label: '준비물', ico: '🎒' },
    { key: 'book', label: '책', ico: '📚' },
    { key: 'etc', label: '기타', ico: '📦' },
  ];
  const WISH_CAT_KEYS = WISH_CATS.map((c) => c.key);
  const wishCatOf = (key) => WISH_CATS.find((c) => c.key === key) || WISH_CATS[WISH_CATS.length - 1];

  /* ⏰ 기본 맞춤 알람 — 평일 아침 두 가지(아이 등교 준비). 보호자가 설정에서 고치거나 지울 수 있습니다.
     id 를 고정해 두어 기기마다 같은 알람으로 인식되고, Firestore 에도 한 번만 생깁니다. */
  function defaultAlarms() {
    return [
      { id: 'def-morning-done', time: '07:15', title: '밥 먹기 끝', days: [1, 2, 3, 4, 5], on: true },
      { id: 'def-ready-done', time: '08:05', title: '준비 끝', days: [1, 2, 3, 4, 5], on: true },
    ];
  }

  const DEFAULT_STATE = () => ({
    v: 3,
    theme: 'light',
    quiet: false,
    dashboardTitle: '',          // 헤더·탭 제목 — 비우면 '우리 가족 대시보드'
    showAdultMissions: false,    // false = 아이(KID_ID) 미션만 보기 (성인 미션은 지우지 않고 숨김)
    parentPin: '0000',           // 부모 모드 기본 PIN — 실제 PIN은 비공개 동기화 DB에서만 내려옵니다
    wishlist: [],                // 사고 싶은 것 { id, title, need, cat, at, by, boughtAt }
    pokemon: { key: 'pikachu', xp: 0, dex: [], caught: {} },   // 현재 파트너 계열(기본: 피카츄 계열) · 경험치 · 완성 트로피 · 만난 종
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
      { id: uid(), title: '아침 먹기', points: 5, due: '08:00', bonus: 0, member: 'm3', days: [1, 2, 3, 4, 5], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
      { id: uid(), title: '씻기 · 양치하기', points: 3, due: '08:10', bonus: 0, member: 'm3', days: [1, 2, 3, 4, 5], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
      { id: uid(), title: '옷 입기', points: 3, due: '07:50', bonus: 0, member: 'm3', days: [1, 2, 3, 4, 5], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
      { id: uid(), title: '가방 챙기기', points: 4, due: '08:20', bonus: 0, member: 'm3', days: [1, 2, 3, 4, 5], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
      { id: uid(), title: '분리수거 내놓기', points: 3, due: '21:00', bonus: 0, member: 'm1', days: [], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
      { id: uid(), title: '설거지하기', points: 3, due: '', bonus: 0, member: 'm2', days: [1, 3, 5], doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0 },
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
    // 🎪 가족 이벤트 설정 — 이 기기에 저장하고 부모 기기에서 child_state/event_center 로 동기화
    event7: event7Default(),
    // 🏫 학교 급식·시간표 — 학교 이름을 코드에 넣지 않고 이 기기 설정값으로만 그립니다
    school: { name: '', cls: '', byDate: {} },
    // ⏰ 맞춤 알람 — 보호자가 정한 고정 알람 { id, time:'HH:MM', title, days:[], on }
    //    (미션 마감·가족 일정 알람은 저장하지 않고 그때그때 계산합니다)
    //    처음 쓰는 기기에는 평일 기본 알람 2개가 들어 있습니다 — 보호자가 켜고 끌거나 고칠 수 있어요.
    alarms: defaultAlarms(),
  });

  function mergeState(raw) {
    const base = DEFAULT_STATE();
    if (!raw || typeof raw !== 'object') raw = {};   // 처음 열었을 때도 기본값을 같은 규칙으로 정리합니다
    const out = Object.assign({}, base, raw);
    // 배열/객체 타입 보정
    ['members', 'events', 'missions', 'letters', 'shopping', 'wiki', 'links', 'logs', 'pointUses'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = base[k];
    });
    // 🏫 학교 카드 데이터(이 기기 설정값) — 형식이 깨져 있어도 조용히 기본값으로 돌립니다
    if (!out.school || typeof out.school !== 'object' || Array.isArray(out.school)) out.school = { name: '', cls: '', byDate: {} };
    out.school.name = typeof out.school.name === 'string' ? out.school.name : '';
    out.school.cls = typeof out.school.cls === 'string' ? out.school.cls : '';
    if (!out.school.byDate || typeof out.school.byDate !== 'object' || Array.isArray(out.school.byDate)) out.school.byDate = {};
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
    // 구형 bonus 값은 호환을 위해 보존하지만 새 보상 계산에는 사용하지 않습니다.
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
      m.earlyBonusEarned = Math.max(0, Math.round(+m.earlyBonusEarned || 0));
      m.days = normDays(m.days);      // 요일 정보가 없던 예전 기록은 '매일([])'로 그대로 동작합니다
    });
    out.logs = out.logs.filter((l) => l && typeof l === 'object' && l.date && l.at);
    out.logs = keepLogs(out.logs);
    out.logs.forEach((l) => {
      ['base', 'bonus', 'earned'].forEach((k) => { l[k] = Math.max(0, Math.round(+l[k] || 0)); });
      l.earlyBonus = Math.max(0, Math.round(+l.earlyBonus || 0));
      l.member = l.member || '';
      l.title = l.title || '';
      l.due = l.due || '';
      l.goalMet = !!l.goalMet;
    });
    // ---- 포켓몬 파트너/도감 (형식 2 → 3 마이그레이션 포함) ----
    const pkRaw = (raw.pokemon && typeof raw.pokemon === 'object') ? raw.pokemon : null;
    const pk = {
      key: resolvePartnerKey((pkRaw && pkRaw.key) || raw.partner || base.pokemon.key),
      xp: 0,
      dex: (pkRaw && Array.isArray(pkRaw.dex)) ? pkRaw.dex : [],
      caught: {},
      growth: window.PartnerGrowthCore ? window.PartnerGrowthCore.normalized(pkRaw && pkRaw.growth) : null,
    };
    if (prevV < 3) {
      // 형식 2까지는 '가족 전체 누적 포인트'로 진화했습니다.
      // 형식 3부터는 아이(m3) 누적 포인트를 경험치로 삼으므로, 지금까지 아이가 모은 포인트를 현재 파트너 경험치로 옮겨 옵니다.
      pk.xp = Math.min(FINAL_P, Math.max(0, Math.round(+out.points.byMember[KID_ID] || 0)));
    } else if (pkRaw) {
      pk.xp = Math.max(0, Math.round(+pkRaw.xp || 0));
    }
    pk.xp = clamp(pk.xp, 0, FINAL_P);
    pk.dex = pk.dex.map((d) => {
      if (!d || typeof d !== 'object') return null;
      const rawKey = String(d.key || '');
      const key = LINE_BY_KEY[rawKey] ? rawKey : (LEGACY_KEYS[rawKey] || '');
      if (!key) return null;
      return {
        key,
        label: String(d.label || ''),
        finalName: String(d.finalName || ''),
        finalId: Math.max(0, Math.round(+d.finalId || 0)),
        tint: String(d.tint || ''),
        at: /^\d{4}-\d{2}-\d{2}$/.test(String(d.at || '')) ? d.at : '',
        times: Math.max(1, Math.round(+d.times || 1)),
      };
    }).filter(Boolean);
    // ---- 도감: 만난 종(caught) — { '25': '2026-11-18' } ----
    const caughtRaw = (pkRaw && pkRaw.caught && typeof pkRaw.caught === 'object') ? pkRaw.caught : {};
    Object.keys(caughtRaw).forEach((k) => {
      const id = parseInt(k, 10);
      if (!(id > 0) || id > 99999) return;
      pk.caught[String(id)] = isDateStr(caughtRaw[k]) ? caughtRaw[k] : todayStr();
    });
    // 예전 계열 완성 기록도 '만난 종'으로 옮겨 둡니다
    pk.dex.forEach((d) => {
      if (d.finalId > 0 && !pk.caught[String(d.finalId)]) pk.caught[String(d.finalId)] = d.at || todayStr();
    });
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

    // ---- 제목 · 아이 전용 미션 보기 · 부모 PIN · 사고 싶은 것(위시리스트) ----
    out.dashboardTitle = String(out.dashboardTitle == null ? '' : out.dashboardTitle).trim().slice(0, 40);
    out.showAdultMissions = out.showAdultMissions === true || out.showAdultMissions === 'true';
    out.parentPin = /^\d{4,12}$/.test(String(out.parentPin == null ? '' : out.parentPin)) ? String(out.parentPin) : base.parentPin;
    out.wishlist = (Array.isArray(out.wishlist) ? out.wishlist : [])
      .filter((w) => w && typeof w === 'object')
      .slice(0, 60)
      .map((w) => ({
        id: w.id || 'w' + Math.random().toString(36).slice(2, 9),
        title: String(w.title || '').slice(0, 40),
        need: Math.max(0, Math.round(+w.need || 0)),
        cat: WISH_CAT_KEYS.indexOf(String(w.cat || '')) >= 0 ? String(w.cat) : 'etc',
        at: isDateStr(w.at) ? w.at : '',
        by: String(w.by || KID_ID),
        boughtAt: isDateStr(w.boughtAt) ? w.boughtAt : '',
      }))
      .filter((w) => w.title);

    if (!out.members.length) out.members = base.members;
    // ⏰ 맞춤 알람 — 처음 쓰는 기기(저장된 목록이 아예 없는 경우)에만 기본 알람 2개를 넣고,
    //    시각·제목이 깨진 값은 버리며 개수는 40개까지만 남깁니다.
    //    보호자가 지우면 빈 목록도 그대로 존중합니다(배열이 있으면 그 값을 씁니다).
    const rawAlarms = raw.alarms === undefined ? defaultAlarms() : raw.alarms;
    out.alarms = ALARM ? ALARM.normalizeAlarms(rawAlarms) : (Array.isArray(rawAlarms) ? rawAlarms : []);
    // 🎪 이벤트 설정/상태 — 깨진 값은 기본값으로 조용히 돌립니다
    out.event7 = normalizeEvent7(out.event7);
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
      fbLocalChanged();          // 🔥 Firebase 연결 중이면 변경분만 Firestore 로 보냅니다 (연동 초안)
      evtSyncMaybe();            // 🎪 이벤트 설정·상태 → child_state/event_center (부모 기기만)
      schoolSyncMaybe();         // 🏫 급식·시간표 → child_state/today_school (부모 기기만)
      alarmSyncMaybe();          // ⏰ 맞춤 알람 → child_state/custom_alarms (부모 기기만)
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

  /* Firebase is the only supported remote sync. Saved legacy credentials stay
     untouched until the user explicitly clears them in settings. */
  const LEGACY_SYNC = window.FamilyLegacySync || { hasSavedConfig: () => false, disable: () => false };

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

  /* ==================================================== 🔔 알람 (미션·일정·맞춤)
     서버 푸시나 브라우저 알림 권한 없이, 화면이 켜져 있는 동안 스스로 울리는 알람입니다.
       · 미션 : 오늘 할 미션 중 아직 끝내지 않은 것 → 마감 5분 전과 정각
       · 일정 : 오늘 가족 일정·구글 캘린더 일정(시각이 있는 것) → 10분 전과 정각
       · 맞춤 : 보호자가 정한 고정 알람(시간·제목·요일) → 정각
     소리는 파일 없이 Web Audio 로 그 자리에서 만든 차임벨입니다.
     브라우저는 '사용자가 한 번 터치한 뒤'에만 소리를 내 주므로, 첫 터치에서
     AudioContext 를 깨우고 그때까지는 헤더 🔔 버튼에 '1번 터치' 배지를 보여 줍니다. */
  const ALARM_SOUND_KEY = 'family-dashboard:alarm-sound';
  const ALARM_FIRED_KEY = 'family-dashboard:alarm-fired';
  const ALARM_TICK_MS = 10000;        // 10초마다 '지금 울릴 알람'이 있는지 봅니다
  const ALARM_GRACE_MIN = 2;          // 화면이 잠깐 멈췄다 돌아와도 2분 안이면 한 번은 울립니다
  const ALARM_MAX = ALARM ? ALARM.MAX_ALARMS : 40;
  const ALARM_TIME_QUICK = ['07:00', '07:15', '08:00', '08:25', '20:00', '21:30'];
  let alarmSoundPref = true;          // 소리 켜기/끄기 — 기기에 기억합니다(localStorage)
  let alarmAudioLive = false;         // 브라우저가 실제로 소리를 낼 수 있게 풀렸는지
  let alarmFiredDate = '';
  let alarmFiredKeys = new Set();
  let alarmPopKeys = [];              // 지금 떠 있는 알람 창에 들어 있는 항목
  let alarmClockOn = false;
  let alarmUnlockedAt = 0;            // 마지막으로 소리가 풀린 시각 — 첫 터치와 토글을 구분하려고
  try { alarmSoundPref = localStorage.getItem(ALARM_SOUND_KEY) !== 'off'; } catch (e) { /* 저장소를 못 써도 소리는 켜 둡니다 */ }

  let alarmSoundSig = '';
  function renderAlarmSoundBtn() {
    const b = $('#alarmSoundBtn');
    if (!b) return;
    const on = alarmSoundPref;
    const live = on && alarmAudioLive;
    const state = !on ? 'off' : (live ? 'on' : 'locked');
    const sig = `${state}|${on ? 'on' : 'off'}`;
    if (sig === alarmSoundSig && b.dataset.state === state) return;   // 바뀐 게 없으면 그대로 둡니다
    alarmSoundSig = sig;
    b.dataset.state = state;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = `<span aria-hidden="true">${on ? '🔔' : '🔕'}</span>`
      + `<span class="alarm-word">${on ? '알람 소리' : '소리 꺼짐'}</span>`
      + (on && !alarmAudioLive ? '<span class="alarm-tap">1번 터치</span>' : '');
    b.title = !on ? '알람 소리가 꺼져 있어요 · 눌러서 켜기'
      : live ? '알람 소리 켜짐 · 누르면 끄기'
        : '눌러서 알람 소리를 켜세요 (브라우저가 처음 한 번의 터치를 기다려요)';
  }

  /* 첫 터치·키 입력에서 AudioContext 를 깨웁니다 — 그 전에는 소리가 나지 않습니다 */
  function unlockAlarmAudio() {
    const ctx = ensureAudio();
    if (!ctx) { renderAlarmSoundBtn(); return false; }
    const mark = () => {
      if (ctx.state === 'running') alarmAudioLive = true;
      renderAlarmSoundBtn();
    };
    try {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') p.then(mark).catch(() => {});
    } catch (e) { /* noop */ }
    mark();
    return alarmAudioLive;
  }

  /* 부드러운 3음 차임벨 — 배음을 조금 섞어 '딩동' 느낌을 냅니다(파일 없음) */
  function chimeAlarm(volume = 1) {
    const ctx = ensureAudio();
    if (!ctx) return false;
    if (ctx.state !== 'running') unlockAlarmAudio();
    if (ctx.state !== 'running') return false;
    const vol = clamp(+volume || 1, 0.15, 1);
    const t0 = ctx.currentTime + 0.04;
    const ring = (freq, at, dur, gain) => {
      [1, 2.01, 2.99].forEach((mult, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq * mult;
        const peak = gain * (i === 0 ? 1 : i === 1 ? 0.26 : 0.09);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(peak, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(g).connect(ctx.destination);
        o.start(at);
        o.stop(at + dur + 0.05);
      });
    };
    const notes = [784.0, 987.77, 1318.51];        // 솔5 · 시5 · 미6
    notes.forEach((f, i) => ring(f, t0 + i * 0.24, 1.15, 0.13 * vol));
    notes.forEach((f, i) => ring(f, t0 + 1.05 + i * 0.2, 0.95, 0.08 * vol));   // 한 번 더 은은하게
    alarmAudioLive = true;
    renderAlarmSoundBtn();
    return true;
  }

  function setAlarmSound(on, { quiet = false } = {}) {
    alarmSoundPref = !!on;
    try { localStorage.setItem(ALARM_SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* noop */ }
    if (on) unlockAlarmAudio();
    renderAlarmSoundBtn();
    if (typeof renderAlarmSettings === 'function') renderAlarmSettings();
    if (quiet) return;
    if (on) {
      chimeAlarm(0.7);
      toast(alarmAudioLive ? '🔔 알람 소리를 켰어요' : '🔔 알람 소리를 켰어요 · 화면을 한 번 더 터치하면 들려요', 'mint', 2600);
    } else {
      toast('🔕 알람 소리를 껐어요 · 화면 알람은 그대로 떠요', '', 2600);
    }
  }
  /* 처음 한 번의 터치로 소리를 풀어 줍니다(헤더 버튼을 누르지 않아도) */
  let alarmUnlockTriedAt = 0;
  function alarmFirstTouch() {
    if (!alarmSoundPref || alarmAudioLive) return;
    if (Date.now() - alarmUnlockTriedAt < 1200) return;   // 터치마다 다시 시도하지 않습니다
    alarmUnlockTriedAt = Date.now();
    unlockAlarmAudio();
    if (alarmAudioLive) alarmUnlockedAt = Date.now();
  }
  /* 헤더 🔔 · 설정 버튼 — 방금 터치로 소리가 풀렸을 때는 끄지 않고 그대로 켜 둡니다 */
  function toggleAlarmSoundByUser() {
    if (!alarmSoundPref) { setAlarmSound(true); return; }
    if (alarmAudioLive && Date.now() - alarmUnlockedAt < 900) { chimeAlarm(0.6); return; }
    setAlarmSound(false);
  }
  ['pointerdown', 'keydown'].forEach((type) => {
    window.addEventListener(type, alarmFirstTouch, { passive: true, capture: true });
  });

  /* ---- 오늘 울릴 수 있는 알람 ---- */
  function alarmItemsOn(date = todayStr()) {
    if (!ALARM) return [];
    return ALARM.collectItems({
      missions: S.missions || [],
      events: (S.events || []).concat(GCAL.on ? GCAL.events : []),
      alarms: S.alarms || [],
      date,
      dow: new Date().getDay(),
      includeAdults: !!S.showAdultMissions,
      kidId: KID_ID,
    });
  }

  /* ---- 같은 날·같은 항목·같은 시점은 한 번만 (새로 고쳐도 다시 울리지 않게 기기에 기록) ---- */
  function alarmFiredSet(date) {
    if (alarmFiredDate === date) return alarmFiredKeys;
    alarmFiredDate = date;
    alarmFiredKeys = new Set();
    try {
      const raw = JSON.parse(localStorage.getItem(ALARM_FIRED_KEY) || 'null');
      if (raw && raw.date === date && Array.isArray(raw.keys)) raw.keys.forEach((k) => alarmFiredKeys.add(String(k)));
    } catch (e) { /* noop */ }
    return alarmFiredKeys;
  }
  function markAlarmFired(date, key) {
    const set = alarmFiredSet(date);
    set.add(key);
    try { localStorage.setItem(ALARM_FIRED_KEY, JSON.stringify({ date, keys: Array.from(set).slice(-200) })); } catch (e) { /* noop */ }
  }

  function checkAlarms() {
    if (!ALARM || !S) return [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const date = todayStr();
    const hits = ALARM.targetsAt(alarmItemsOn(date), nowMin, { grace: ALARM_GRACE_MIN });
    if (!hits.length) return [];
    const fired = alarmFiredSet(date);
    const due = hits.filter((h) => !fired.has(ALARM.fireKeyOf(date, h, h.slot)));
    due.forEach((h) => markAlarmFired(date, ALARM.fireKeyOf(date, h, h.slot)));
    if (due.length) ringAlarms(due);
    return due;
  }

  function ringAlarms(hits) {
    if (alarmSoundPref) chimeAlarm(1);
    showAlarmPop(hits);
  }

  /* ---- 화면 가운데 알람 창 — 대기화면(🖼️) 위에도 그대로 뜨고, 한 번에 여러 개를 모아 보여 줍니다 ---- */
  function showAlarmPop(hits) {
    const box = $('#alarmPop');
    const list = $('#alarmPopMsgs');
    if (!box || !list || !ALARM || !Array.isArray(hits) || !hits.length) return;
    if (box.hidden) { list.innerHTML = ''; alarmPopKeys = []; }
    hits.forEach((h) => {
      const key = ALARM.fireKeyOf(todayStr(), h, h.slot);
      if (alarmPopKeys.indexOf(key) >= 0) return;
      alarmPopKeys.push(key);
      const msg = ALARM.alarmMessage(h);
      const li = document.createElement('li');
      li.className = 'alarm-msg ' + (h.kind || 'custom');
      li.innerHTML = `<span class="am-ico" aria-hidden="true">${h.kind === 'mission' ? '🎯' : h.kind === 'event' ? '📅' : '⏰'}</span>`
        + `<span class="am-body"><b>${esc(msg.title)}</b><span>${esc(msg.sub)}</span></span>`;
      list.appendChild(li);
    });
    const at = $('#alarmPopTime');
    if (at) at.textContent = hhmm();
    const titleEl = $('#alarmPopTitle');
    if (titleEl) titleEl.textContent = list.children.length > 1 ? `알람 ${list.children.length}개` : '알람';
    const hint = $('#alarmPopHint');
    if (hint) {
      let text = '';
      if (!alarmSoundPref) text = '🔕 소리는 꺼져 있어요 · 헤더의 🔔 알람 소리를 누르면 켜져요';
      else if (!alarmAudioLive) text = '🔔 소리를 들으려면 화면을 한 번 터치하거나 헤더의 🔔를 눌러 주세요';
      hint.textContent = text;
      hint.hidden = !text;
    }
    box.hidden = false;
    const ok = $('#alarmPopOk');
    if (ok) { try { ok.focus({ preventScroll: true }); } catch (e) { try { ok.focus(); } catch (e2) { /* noop */ } } }
  }
  function closeAlarmPop() {
    const box = $('#alarmPop');
    if (box) box.hidden = true;
    const list = $('#alarmPopMsgs');
    if (list) list.innerHTML = '';
    alarmPopKeys = [];
  }

  /* ---- 소리·알람 창 미리 보기 (설정에서 씁니다) ---- */
  function previewAlarm() {
    if (!ALARM) return;
    unlockAlarmAudio();
    if (alarmSoundPref) chimeAlarm(0.9);
    showAlarmPop([{ key: 'preview', kind: 'custom', title: '알람 미리 보기', time: hhmm(), slot: 'now' }]);
    toast(alarmAudioLive ? '🔔 알람이 울릴 때 이 소리와 화면이 나와요' : '🔔 화면은 이렇게 떠요 · 소리는 화면을 한 번 터치하면 들려요', '', 2800);
  }

  function startAlarmClock() {
    if (alarmClockOn) return;
    alarmClockOn = true;
    renderAlarmSoundBtn();
    setTimeout(checkAlarms, 1500);          // 화면이 다 그려진 뒤 한 번
    setInterval(checkAlarms, ALARM_TICK_MS);
  }

  /* ---- ⏰ 맞춤 알람 관리 (설정 · 보호자 전용) ---- */
  function renderAlarmSettings() {
    const b2 = $('#alarmSoundBtn2');
    if (b2) {
      b2.textContent = alarmSoundPref ? '🔔 알람 소리 켜짐' : '🔕 알람 소리 꺼짐';
      b2.dataset.state = alarmSoundPref ? 'on' : 'off';
    }
    const note = $('#alarmSoundNote');
    if (note) {
      note.textContent = !alarmSoundPref
        ? '지금은 소리 없이 화면 알람만 떠요. 위 버튼을 누르면 소리가 켜져요.'
        : alarmAudioLive
          ? '소리 준비됨 · 알람이 울리면 차임벨과 함께 화면 가운데 알람 창이 떠요.'
          : '처음 한 번은 화면(또는 위 버튼)을 터치해야 브라우저가 소리를 허락해요.';
    }
    const today = $('#alarmToday');
    if (today) {
      if (!ALARM) today.innerHTML = '';
      else {
        const now = new Date();
        const rows = ALARM.upcoming(alarmItemsOn(todayStr()), now.getHours() * 60 + now.getMinutes(), 3);
        today.innerHTML = '<b>⏭ 다음 알람</b>' + (rows.length
          ? rows.map((r) => `<span class="at-row"><b>${esc(ALARM.minToHhmm(r.at))}</b> ${esc(r.title)}<i>${r.slot === 'pre' ? (r.kind === 'mission' ? '마감 5분 전' : '10분 전') : '정각'}</i></span>`).join('')
          : '<span class="at-row">오늘 남은 알람이 없어요</span>');
      }
    }
    const box = $('#alarmList');
    if (!box) return;
    const list = Array.isArray(S.alarms) ? S.alarms : [];
    box.innerHTML = list.length
      ? list.map((a) => `<div class="alarm-row${a.on ? '' : ' off'}">
          <b class="ar-time">${esc(a.time)}</b>
          <span class="ar-title">${esc(a.title)}</span>
          <span class="ar-days">${esc(daysLabel(a.days))}</span>
          <button class="btn icon sm ghost" type="button" data-act="alarm-on" data-id="${esc(a.id)}" title="${a.on ? '이 알람 끄기' : '이 알람 켜기'}" aria-label="${a.on ? '알람 끄기' : '알람 켜기'}">${a.on ? '🔔' : '🔕'}</button>
          <button class="btn icon sm ghost" type="button" data-act="alarm-edit" data-id="${esc(a.id)}" aria-label="알람 수정">✎</button>
          <button class="btn icon sm ghost" type="button" data-act="alarm-del" data-id="${esc(a.id)}" aria-label="알람 삭제">✕</button>
        </div>`).join('')
      : '<p class="settings-note">맞춤 알람이 아직 없어요. 아래 <b>＋ 맞춤 알람 추가</b>로 ‘등교 출발’ 같은 알람을 만들어 보세요.</p>';
  }

  async function addAlarm() {
    if ((S.alarms || []).length >= ALARM_MAX) { toast(`맞춤 알람은 ${ALARM_MAX}개까지 만들 수 있어요`, '', 2600); return; }
    const r = await askModal({
      title: '⏰ 맞춤 알람 추가',
      hint: '정한 시각에 화면 알람과 차임벨이 울려요. 미션·일정 알람은 저절로 울립니다.',
      fields: [
        { name: 'title', label: '알람 제목', placeholder: '예: 등교 출발', maxlength: 30 },
        { name: 'time', label: '시각', type: 'time', value: '08:25', quick: ALARM_TIME_QUICK },
        { name: 'days', label: '요일', type: 'days', value: [] },
      ],
      okText: '추가',
    });
    if (!r) return;
    const title = String(r.title || '').trim().slice(0, 30);
    const time = String(r.time || '');
    if (!title) { toast('알람 제목을 적어 주세요', '', 2400); return; }
    if (!ALARM || !ALARM.isHhmm(time)) { toast('시각을 골라 주세요', '', 2400); return; }
    S.alarms.push({ id: uid(), time, title, days: parseDays(r.days), on: true });
    save(); renderAlarmSettings();
    toast(`⏰ ${time} ${title} 알람을 만들었어요`, 'mint', 2800);
  }

  async function editAlarm(id) {
    const a = (S.alarms || []).find((x) => x.id === id);
    if (!a) return;
    const r = await askModal({
      title: '⏰ 맞춤 알람 고치기',
      fields: [
        { name: 'title', label: '알람 제목', value: a.title, maxlength: 30 },
        { name: 'time', label: '시각', type: 'time', value: a.time, quick: ALARM_TIME_QUICK },
        { name: 'days', label: '요일', type: 'days', value: a.days || [] },
      ],
      okText: '저장',
      extraAction: { label: '이 알람 삭제', act: 'del' },
    });
    if (!r) return;
    if (r === 'del') { deleteAlarm(id); return; }
    const title = String(r.title || '').trim().slice(0, 30);
    const time = String(r.time || '');
    if (!title || !ALARM || !ALARM.isHhmm(time)) { toast('제목과 시각을 다시 확인해 주세요', '', 2400); return; }
    a.title = title; a.time = time; a.days = parseDays(r.days);
    save(); renderAlarmSettings();
    toast('⏰ 알람을 고쳤어요', 'mint');
  }

  function deleteAlarm(id) {
    const a = (S.alarms || []).find((x) => x.id === id);
    if (!a) return;
    S.alarms = S.alarms.filter((x) => x.id !== id);
    save(); renderAlarmSettings();
    toast(`⏰ ${a.time} ${a.title} 알람을 지웠어요`, '', 2400);
  }

  function toggleAlarm(id) {
    const a = (S.alarms || []).find((x) => x.id === id);
    if (!a) return;
    a.on = !a.on;
    save(); renderAlarmSettings();
    toast(a.on ? `🔔 ${a.time} ${a.title} 알람을 켰어요` : `🔕 ${a.time} ${a.title} 알람을 껐어요`, '', 2200);
  }

  /* ---- ⏰ 맞춤 알람 → Firestore child_state/custom_alarms (가족 읽기 · 부모 쓰기) ----
     규칙의 child_state/{docId} 한 칸을 그대로 쓰므로 firestore.rules 를 고치지 않습니다.
     아이 기기·태블릿은 읽기만 하고, 맞춤 알람을 만들고 지우는 것은 보호자만 합니다. */
  var alarmSyncTimer = null;
  var alarmSyncedSig = '';
  function alarmDocPayload() {
    return {
      alarms: (S.alarms || []).map((a) => ({ id: a.id, time: a.time, title: a.title, days: (a.days || []).slice(), on: a.on !== false })),
    };
  }
  function alarmSigOf(d) {
    const list = (d && Array.isArray(d.alarms)) ? d.alarms : [];
    return JSON.stringify(list.map((a) => [String((a && a.id) || ''), String((a && a.time) || ''), String((a && a.title) || ''), (a && Array.isArray(a.days)) ? a.days.join(',') : '', a && a.on !== false]));
  }
  function alarmSyncMaybe(force) {
    const fb = fbReady();
    if (!fb || !fb.on || fb.role !== 'parent' || !fb.sync || typeof fb.sync.pushAlarms !== 'function') return;
    if (!fb.readyData) return;                 // 서버 문서를 받기 전에 빈 값으로 덮어쓰지 않습니다
    const payload = alarmDocPayload();
    const sig = alarmSigOf(payload);
    if (!force && sig === alarmSyncedSig) return;
    alarmSyncedSig = sig;
    clearTimeout(alarmSyncTimer);
    alarmSyncTimer = setTimeout(() => {
      fb.sync.pushAlarms(payload).then((r) => {
        if (r && !r.ok && !r.cancelled) toast('맞춤 알람을 서버에 못 보냈어요 (이 기기에는 남아 있어요)', '', 3600);
      }).catch(() => {});
    }, 600);
  }
  function applyAlarmDoc(doc) {
    if (!doc || typeof doc !== 'object' || !ALARM) return;
    const next = ALARM.normalizeAlarms(doc.alarms);
    const sig = alarmSigOf({ alarms: next });
    if (sig === alarmSyncedSig) return;
    alarmSyncedSig = sig;                      // 서버에서 받은 값은 다시 보내지 않습니다
    S.alarms = next;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
    renderAlarmSettings();
  }

  /* -------------------------------------------------------------------- clock */
  function renderClock() {
    const now = new Date();
    const displayNow = new Date(now.getTime() + 5 * 60 * 1000);
    $('#clockTime').textContent = `${pad(displayNow.getHours())}:${pad(displayNow.getMinutes())}`;
    $('#clockDate').textContent = `${displayNow.getMonth() + 1}월 ${displayNow.getDate()}일 ${DAYS[displayNow.getDay()]}요일`;
    const h = now.getHours();
    $('#brandSub').textContent = h < 6 ? '늦은 밤이에요 🌙' : h < 11 ? '좋은 아침이에요 ☀️' : h < 17 ? '좋은 오후예요 🌤️' : h < 21 ? '좋은 저녁이에요 🌆' : '편안한 밤 되세요 🌙';
    renderFreeDay(now);
  }

  /* ---- 일요일은 아이의 '자유의 날' (숙제 없음) — 미션·일정 카드 위에 자동 배너 ----
     이름은 코드에 박지 않고 구성원(id m3) 이름을 그대로 읽어 씁니다(기본값 '아이'). */
  function renderFreeDay(now = new Date()) {
    const isFreeDay = now.getDay() === 0;
    const kid = kidMember();
    const name = (kid && String(kid.name || '').trim()) || '아이';
    $$('.free-day-banner').forEach((el) => {
      el.hidden = !isFreeDay;
      if (!isFreeDay) return;
      const t = el.querySelector('.fd-title');
      if (t) t.textContent = `오늘은 ${name} 자유의 날!`;
      el.title = `${name} 미션은 일요일에 쉬어요`;
    });
    $$('[data-freeday-kid]').forEach((el) => { el.textContent = name; });
  }

  /* -------------------------------------------- 대시보드 이름 (집마다 바꿔 쓰는 제목) */
  const DEFAULT_TITLE = '우리 가족 대시보드';
  const appTitle = () => String(S.dashboardTitle || '').trim() || DEFAULT_TITLE;

  function applyTitle() {
    const t = appTitle();
    $$('.brand-title').forEach((el) => { if (el.textContent !== t) el.textContent = t; });
    if (document.title !== t) document.title = t;
  }

  /* ---------------------------------------------- 🔒 부모 모드 잠금 (4자리 PIN)
     잠금이 기본입니다. 아이는 미션 체크·도감·편지 쓰기·사고 싶은 것 적기·타이머·달성 현황을 그대로 쓰고,
     보호자 일(미션/일정/장보기/위키 고치기, 포인트 사용, 설정)은 PIN을 넣어야 열립니다.
     PIN은 코드에 박지 않고 상태(state.parentPin)에서만 읽습니다 — 기본값 '0000'. */
  const PARENT_MS = 5 * 60 * 1000;      // 부모 모드 유지 시간 — 5분 뒤 자동 잠금
  const parentSession = { unlockedAt: 0 };
  let parentSynced = null;              // Firebase 쪽에서 채우는 후크(부모 모드 변화 → 설정 화면 갱신)

  const parentPinOf = () => (/^\d{4,12}$/.test(String(S.parentPin || '')) ? String(S.parentPin) : '0000');
  const parentUnlocked = () => !!parentSession.unlockedAt && (Date.now() - parentSession.unlockedAt) < PARENT_MS;
  const parentLeftText = () => `${Math.max(1, Math.ceil((PARENT_MS - (Date.now() - parentSession.unlockedAt)) / 60000))}분`;

  function renderParentBtn() {
    const b = $('#parentBtn');
    const on = parentUnlocked();
    document.body.dataset.parent = on ? 'on' : 'off';
    if (parentSynced) parentSynced();      // Firebase 준비 뒤에만 연결되는 후크(정산 버튼 표시)
    if (typeof renderEventBadge === 'function') renderEventBadge();   // 🎪 깜짝 이벤트 버튼은 부모 모드에서만 늘 보입니다
    if (!b) return;
    b.dataset.state = on ? 'on' : 'off';
    b.innerHTML = `<span class="parent-word">${on ? '부모 열림' : '부모 잠금'}</span>`;
    b.title = on ? `부모 모드 열림 · ${parentLeftText()} 뒤 자동 잠금 (누르면 바로 잠금)` : '부모 전용 기능을 쓰려면 눌러서 PIN을 넣으세요';
    b.setAttribute('aria-label', on ? '부모 모드 열림 — 눌러서 잠그기' : '부모 잠금 — 눌러서 열기');
  }

  function lockParent(quiet) {
    if (!parentUnlocked()) return;
    parentSession.unlockedAt = 0;
    renderParentBtn();
    if (!quiet) toast('🔒 부모 모드로 잠갔어요', '', 1800);
  }

  // 4자리 PIN 확인 — 맞으면 true (3번까지 다시 넣을 수 있음)
  async function askParentPin(reason) {
    if (!window.FamilyParentSessionGuard.canPromptForPin({ firebaseOn: FB.on, role: FB.role })) {
      toast('아이 계정에서는 부모 모드를 열 수 없어요.', 'coral', 3000);
      return false;
    }
    if (FB.on && FB.role === 'parent' && !FB.parentPinReady) {
      toast('가족 PIN을 확인 중이에요. 잠시 뒤 다시 눌러 주세요.', '', 2600);
      return false;
    }
    let msg = reason || '보호자만 바꿀 수 있어요. 4자리 PIN을 넣어 주세요.';
    for (let i = 0; i < 3; i++) {
      const r = await askModal({
        title: '🔒 부모 모드',
        hint: msg,
        fields: [{ name: 'pin', label: 'PIN (4자리)', type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: '숫자 4자리' }],
        okText: '열기',
      });
      if (!r) return false;
      const got = String(r.pin || '').replace(/\D/g, '');
      if (!got) { msg = 'PIN을 넣어 주세요.'; continue; }
      if (got === parentPinOf()) return true;
      msg = 'PIN이 맞지 않아요. 다시 넣어 주세요.';
    }
    toast('PIN을 3번 틀렸어요. 잠시 뒤 다시 해 보세요.', 'coral', 3400);
    return false;
  }

  // 부모 전용 동작 감싸개 — 잠겨 있으면 PIN을 받고, 맞으면 이어서 실행
  async function asParent(reason, run) {
    if (parentUnlocked()) {
      parentSession.unlockedAt = Date.now();          // 부모 모드가 열려 있으면 5분을 새로 셉니다
      renderParentBtn();
      await run();
      return;
    }
    const ok = await askParentPin(reason);
    if (!ok) return;
    parentSession.unlockedAt = Date.now();
    renderParentBtn();
    toast('🔓 부모 모드 열림 · 5분 뒤 자동으로 잠겨요', 'mint', 2800);
    await run();
  }

  // 부모 모드 자동 잠금 감시
  setInterval(() => {
    if (parentUnlocked()) { renderParentBtn(); return; }
    if (parentSession.unlockedAt) { parentSession.unlockedAt = 0; renderParentBtn(); toast('🔒 5분이 지나 부모 모드가 자동으로 잠겼어요', '', 2400); }
  }, 15000);

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
    if (!W || !W.now) {
      $('#wDesc').textContent = '날씨 정보를 기다리고 있어요';
      if ($('#wTempCard')) $('#wTempCard').innerHTML = '—<small>°</small>';
      if ($('#weatherTodaySummary')) $('#weatherTodaySummary').textContent = '오늘 날씨와 주간 예보를 불러오는 중';
      renderWeekForecast();
      outfitGuide();
      return;
    }
    const [icon, desc] = wmo(W.now.weather_code);
    $('#wIcon').textContent = icon;
    const currentTemp = Math.round(W.now.temperature_2m);
    $('#wTemp').innerHTML = currentTemp + '<small>°</small>';
    if ($('#wIconCard')) $('#wIconCard').textContent = icon;
    if ($('#wTempCard')) $('#wTempCard').innerHTML = currentTemp + '<small>°</small>';
    $('#wDesc').textContent = desc;
    if ($('#weatherTodaySummary')) {
      const feel = W.now.apparent_temperature;
      $('#weatherTodaySummary').textContent = feel == null ? '오늘 날씨 · 주간 예보' : `체감 ${Math.round(feel)}° · 옷차림 참고`;
    }
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
    renderWeekForecast();
    outfitGuide();
    if (standbyOn) renderStandby();
  }

  function renderWeekForecast() {
    const box = $('#weatherWeek');
    if (!box) return;
    const days = W && Array.isArray(W.daily) ? W.daily.slice(0, 7) : [];
    if (!days.length) {
      box.innerHTML = '<span class="weather-week-empty">예보를 불러오는 중이에요</span>';
      return;
    }
    box.innerHTML = days.map((d, i) => {
      const day = new Date(`${d.date}T12:00:00`);
      const label = i === 0 ? '오늘' : DAYS[day.getDay()];
      const [icon, desc] = wmo(d.code);
      const hi = d.max == null ? '—' : `${Math.round(d.max)}°`;
      const lo = d.min == null ? '—' : `${Math.round(d.min)}°`;
      return `<span class="weather-week-item" title="${esc(d.date)} · ${esc(desc)} · 최고 ${hi} · 최저 ${lo}"><span class="wf-day">${label}</span><span class="wf-icon" aria-hidden="true">${icon}</span><span class="wf-temp"><b>${hi}</b><span class="wf-sep">/</span><span class="wf-lo">${lo}</span></span></span>`;
    }).join('');
  }

  /* 🧥 아이 눈높이 한 줄 안내 — 기온·비·미세먼지에 따라 문장이 바뀝니다 */
  function outfitGuide() {
    const box = $('#outfitSuggestions');
    if (!box) return;
    const now = W && W.now;
    const d0 = W && W.daily && W.daily[0];
    const feel = now && now.apparent_temperature != null ? now.apparent_temperature
      : (d0 && d0.max != null && d0.min != null ? (d0.max + d0.min) / 2 : null);
    const steps = [[28, '🩳', '반팔'], [23, '👕', '반팔과 얇은 겉옷'], [20, '👔', '긴팔'], [17, '🧥', '얇은 겉옷'], [12, '🧥', '따뜻한 겉옷'], [5, '🧣', '코트'], [-99, '🧤', '두꺼운 외투와 장갑']];
    const pick = feel == null ? null : (steps.find((s) => feel >= s[0]) || steps[steps.length - 1]);
    const wearText = pick ? `${pick[2]}${feel != null ? ` · 체감 ${Math.round(feel)}°` : ''}` : '기온 정보를 확인할 수 없어요';
    const pop = d0 && d0.pop != null ? Math.round(d0.pop) : null;
    const snow = !!(d0 && [71, 73, 75, 77, 85, 86].includes(d0.code));
    const rainText = snow ? '눈 예보가 있어요' : (pop == null ? '강수 정보가 없어요' : (pop >= 50 ? `우산 챙기기 · 강수 ${pop}%` : pop >= 20 ? `우산 여부 확인 · 강수 ${pop}%` : `비 걱정 적어요 · 강수 ${pop}%`));
    const g1 = W && W.air ? pm10Grade(W.air.pm10) : null;
    const g2 = W && W.air ? pm25Grade(W.air.pm25) : null;
    const airText = g1 || g2
      ? `미세먼지 ${g1 ? g1[0] : '정보 없음'} · 초미세 ${g2 ? g2[0] : '정보 없음'}`
      : '공기질 정보를 확인할 수 없어요';
    const badAir = [g1, g2].some((g) => g && (g[1] === 'bad' || g[1] === 'worst'));
    const items = [
      { icon: pick ? pick[1] : '🧥', title: '옷차림', text: wearText },
      { icon: snow ? '❄️' : (pop != null && pop >= 20 ? '☂️' : '🌤️'), title: '우산·날씨', text: rainText },
      { icon: badAir ? '😷' : '🌿', title: '공기질', text: airText },
    ];
    box.innerHTML = items.map((item) => `<div class="outfit-item"><span class="outfit-icon" aria-hidden="true">${item.icon}</span><span><b>${item.title}</b><small>${esc(item.text)}</small></span></div>`).join('');
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
  /* 📅 구글 캘린더에서 읽어 온 일정 — 저장하지 않고 화면에만 합칩니다 */
  const GCAL = { on: false, events: [], calendars: [], at: 0, busy: false, connecting: false, redirectNextAt: 0 };
  function gcalEventsOn(dateStr) {
    if (!GCAL.on || !GCAL.events.length) return [];
    return GCAL.events.filter((e) => e.date === dateStr);
  }
  function allEvents() {
    return S.events.concat(GCAL.on ? GCAL.events : []);
  }
  function eventsOn(dateStr) {
    return allEvents().filter((e) => e.date === dateStr)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }

  /* ---- 한 달 달력 상태 (이 기기에서만 유지) ---- */
  const SCHED_UI = { y: null, m: null, sel: null, tab: 'cal', mode: '1m' };
  function schedEnsure() {
    if (SCHED_UI.sel) return;
    const t = new Date();
    SCHED_UI.y = t.getFullYear();
    SCHED_UI.m = t.getMonth();
    SCHED_UI.sel = todayStr();
  }
  /* ---- 우리 집 위키의 생신·기념일 날짜를 달력에 표시 (예: '1월 12일', '10/20') ---- */
  function wikiMarksOn(ds) {
    const d = new Date(ds + 'T00:00:00');
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const hits = [];
    (S.wiki || []).forEach((w) => {
      const g = String(w.group || '');
      if (!/생신|기념|생일/.test(g)) return;
      const text = String(w.val || '') + ' ' + String(w.key || '');
      let hit = false;
      const re = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
      let m;
      while ((m = re.exec(text))) {
        if (+m[1] === mm && +m[2] === dd) hit = true;
      }
      const re2 = /(?:^|[^\d])(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:[^\d]|$)/g;
      while (!hit && (m = re2.exec(text))) {
        if (+m[1] === mm && +m[2] === dd) hit = true;
      }
      if (hit) hits.push(String(w.key || '기념일'));
    });
    return hits;
  }

  function setSchedTab(tab) {
    SCHED_UI.tab = tab === 'wiki' ? 'wiki' : 'cal';
    const card = $('#cardSchedule');
    if (card) card.dataset.tab = SCHED_UI.tab;
    $$('[data-schedtab]').forEach((b) => {
      const on = b.dataset.schedtab === SCHED_UI.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const cal = $('#schedPaneCal');
    const wiki = $('#schedPaneWiki');
    if (cal) cal.hidden = SCHED_UI.tab !== 'cal';
    if (wiki) wiki.hidden = SCHED_UI.tab !== 'wiki';
    if ($('#eventAddBtn')) $('#eventAddBtn').hidden = SCHED_UI.tab !== 'cal';
    if ($('#wikiAddBtn')) $('#wikiAddBtn').hidden = SCHED_UI.tab !== 'wiki';
    if ($('#scheduleSub') && SCHED_UI.tab === 'wiki') {
      $('#scheduleSub').textContent = '생신 · 예방접종 · 집안 메모 · 연락처';
    } else if (SCHED_UI.tab === 'cal') {
      renderSchedule();
    }
    if (SCHED_UI.tab === 'wiki') renderWiki();
  }
  function schedShowMonth(y, m) {
    const td = new Date(todayStr() + 'T00:00:00');
    SCHED_UI.y = y;
    SCHED_UI.m = m;
    // 그 달에 오늘이 있으면 오늘을, 아니면 1일을 골라 둡니다
    SCHED_UI.sel = fmtDate(td.getFullYear() === y && td.getMonth() === m ? td : new Date(y, m, 1));
    renderSchedule();
  }

  /* ‹ › — 2주 보기에선 한 주씩, 1달 보기에선 한 달씩 */
  function schedShift(dir) {
    schedEnsure();
    if (SCHED_UI.mode !== '1m') {
      const d = addDays(new Date(SCHED_UI.sel + 'T00:00:00'), dir * 7);
      SCHED_UI.sel = fmtDate(d);
      SCHED_UI.y = d.getFullYear();
      SCHED_UI.m = d.getMonth();
      renderSchedule();
      return;
    }
    const m = SCHED_UI.m + dir;
    const y = SCHED_UI.y + Math.floor(m / 12);
    schedShowMonth(y, ((m % 12) + 12) % 12);
  }

  /* [2주] ↔ [1달] — 기본은 한 달 전체, 2주 보기에서는 이번 주 일~다음 주 토 */
  function setCalMode(mode) {
    schedEnsure();
    SCHED_UI.mode = mode === '1m' ? '1m' : '2w';
    $$('#calMode .cmb').forEach((b) => {
      const on = b.dataset.calmode === SCHED_UI.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderSchedule();
  }

  function renderSchedule() {
    schedEnsure();
    const t = todayStr();
    const sel = SCHED_UI.sel || t;
    const todayList = eventsOn(t);
    const selList = eventsOn(sel);

    // 카드 부제 — 오늘 기준 요약
    const sub = $('#scheduleSub');
    if (sub) {
      sub.textContent = todayList.length
        ? `📅 ${todayList.length} · ✅ ${todayList.filter((e) => e.done).length}`
        : '📅 오늘 없음';
    }

    // ① 달력 그리드 — 기본 한 달 전체 · [2주]/[1달] 전환
    const two = SCHED_UI.mode !== '1m';
    const selD = new Date(sel + 'T00:00:00');
    const days = [];
    if (two) {
      const start = addDays(selD, -selD.getDay());          // 그 주 일요일부터
      for (let i = 0; i < 14; i++) days.push(addDays(start, i));
    } else {
      const pad0 = new Date(SCHED_UI.y, SCHED_UI.m, 1).getDay();
      const lastDay = new Date(SCHED_UI.y, SCHED_UI.m + 1, 0).getDate();
      const total = Math.ceil((pad0 + lastDay) / 7) * 7;
      for (let i = 0; i < total; i++) days.push(new Date(SCHED_UI.y, SCHED_UI.m, 1 - pad0 + i));
    }
    const label = $('#calLabel');
    if (label) {
      if (two) {
        const a = days[0];
        const b = days[days.length - 1];
        const y = a.getFullYear() !== b.getFullYear() ? `${a.getFullYear()}년 ` : '';
        const mo = a.getMonth() === b.getMonth() ? '' : `${b.getMonth() + 1}월 `;
        label.textContent = `${y}${a.getMonth() + 1}.${a.getDate()} ~ ${mo}${b.getMonth() + 1}.${b.getDate()}`;
      } else {
        label.textContent = `${SCHED_UI.y}년 ${SCHED_UI.m + 1}월`;
      }
    }
    const grid = $('#calGrid');
    if (grid) {
      grid.classList.toggle('two', two);
      grid.style.setProperty('--calendar-weeks', String(Math.ceil(days.length / 7)));
      const cells = [];
      for (const d of days) {
        const ds = fmtDate(d);
        const evs = eventsOn(ds);
        const wm = wikiMarksOn(ds);
        const dow = d.getDay();
        const cls = ['cal-cell',
          (!two && d.getMonth() !== SCHED_UI.m) ? 'out' : '',
          ds === t ? 'today' : '',
          ds === sel ? 'sel' : '',
          dow === 0 ? 'sun' : '', dow === 6 ? 'sat' : '',
          evs.length ? 'has' : '',
          wm.length ? 'wiki' : ''].filter(Boolean).join(' ');
        const bars = evs.slice(0, 3).map((e) => {
          if (e.source === 'gcal') return '<i style="background:#5b8cff"></i>';
          const m = memberById(e.member);
          return `<i style="background:${m ? esc(m.color) : 'var(--coral)'}"></i>`;
        }).join('');
        cells.push(`<button type="button" class="${cls}" data-act="cal-day" data-date="${ds}"
            aria-label="${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[dow]}요일 · 일정 ${evs.length}개${wm.length ? ' · ' + esc(wm.join(', ')) : ''}"
            ${wm.length ? `title="${esc(wm.join(', '))}"` : ''}
            ${ds === sel ? 'aria-pressed="true"' : ''}>
            <span class="cal-num">${d.getDate()}${wm.length ? '<em class="cal-cake" aria-hidden="true">🎂</em>' : ''}</span>
            <span class="cal-bars">${bars}</span>
            ${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3}</span>` : ''}
          </button>`);
      }
      grid.innerHTML = cells.join('');
    }

    // ② 고른 날짜의 일정 — 확인 + 그 날 추가(＋)
    const dayBox = $('#calDay');
    if (dayBox) {
      const d = new Date(sel + 'T00:00:00');
      const isToday = sel === t;
      const dayLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`;
      const selMarks = wikiMarksOn(sel);
      const rows = selList.length
        ? selList.map((e) => {
            if (e.source === 'gcal') {
              return `<div class="event gcal" data-id="${esc(e.id)}">
                <div class="event-time">${esc(e.time || '종일')}</div>
                <div class="event-main">
                  <div class="event-title">${esc(e.title)}</div>
                  <div class="event-sub">📅 구글 캘린더</div>
                </div>
              </div>`;
            }
            const m = memberById(e.member);
            return `<div class="event" data-id="${e.id}">
              <button class="check ${e.done ? 'on' : ''}" data-act="ev-toggle" data-id="${e.id}" aria-label="완료 표시">✓</button>
              <div class="event-time">${esc(e.time || '종일')}</div>
              <div class="event-main">
                <div class="event-title ${e.done ? 'done' : ''}">${esc(e.title)}</div>
                <div class="event-sub">${m ? `<span class="mdot" style="background:${esc(m.color)}"></span>${esc(m.name)}` : '가족 모두'}</div>
              </div>
              <button class="btn icon sm ghost parent-only" data-act="ev-del" data-id="${e.id}" aria-label="일정 삭제">✕</button>
            </div>`;
          }).join('')
        : `<div class="shop-empty cal-empty">${isToday ? '오늘은 일정이 없어요' : '이 날은 일정이 없어요'} · <b>＋</b> 로 추가</div>`;
      dayBox.innerHTML = `<div class="cal-day-head">
          <b class="cal-day-date">${dayLabel}</b>
          ${isToday ? '<span class="pill cal-today-pill">오늘</span>' : ''}
          <span class="cal-day-count">${selList.length ? selList.length + '개' : ''}</span>
          <button class="btn sm primary cal-add parent-only" data-act="cal-add" data-date="${sel}" title="${esc(dayLabel)}에 일정 추가">＋ 일정</button>
        </div>
        ${selMarks.length ? `<button type="button" class="cal-wiki-row" data-act="sched-wiki" title="우리 집 위키에서 보기">🎂 ${esc(selMarks.join(' · '))}<span class="cwr-go">📗</span></button>` : ''}
        <div class="cal-day-list">${rows}</div>`;
    }

    // ③ 다가오는 일정 (내일 ~ 2주)
    const upcoming = allEvents()
      .filter((e) => e.date > t && e.date <= fmtDate(addDays(new Date(), 14)))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 3);
    const upBox = $('#upcomingEvents');
    if (upBox) {
      upBox.innerHTML = upcoming.length
        ? `<div class="cal-up-label">다가오는 일정</div>` + upcoming.map((e) => {
            const d = new Date(e.date + 'T00:00:00');
            const m = memberById(e.member);
            return `<button type="button" class="up-item" data-act="cal-day" data-date="${e.date}" title="${esc(e.date)} ${esc(e.title)}">
              <span class="up-date"${m ? ` style="color:${esc(m.color)}"` : ''}>${d.getMonth() + 1}/${d.getDate()} ${DAYS[d.getDay()]}</span>
              <span class="up-title">${esc(e.title)}</span>
            </button>`;
          }).join('')
        : '';
    }
  }

  /* ------------------------------------------------- 📅 구글 캘린더 (읽기 전용)
     로그인한 Google 계정의 calendarList 를 읽어, 접근 가능한 캘린더(기본 캘린더·가족 캘린더 등)의
     일정을 '가족 일정' 달력에 합쳐 보여 줍니다. 일정은 저장하지 않고 화면에만 둘며,
     Firestore·깃허브·백업 파일에는 남기지 않습니다. 토큰은 이 탭(sessionStorage)에만 보관합니다. */
  const GCAL_API = 'https://www.googleapis.com/calendar/v3';
  function gcalNote(text, tone) {
    const el = $('#gcalNote');
    if (el) { el.textContent = text || ''; el.dataset.tone = tone || ''; }
    const btn = $('#gcalConnectBtn');
    if (btn) btn.textContent = GCAL.on ? '🔄 구글 캘린더 새로 고침' : '📅 구글 캘린더 연결';
    const off = $('#gcalOffBtn');
    if (off) off.hidden = !GCAL.on;
  }
  function gcalToken() {
    const boot = window.FamilySyncBoot;
    return (boot && boot.calendar && typeof boot.calendar.current === 'function') ? boot.calendar.current() : null;
  }
  async function gcalFetch(url) {
    const cur = gcalToken();
    if (!cur) throw Object.assign(new Error('no-token'), { code: 'gcal/no-token' });
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + cur.token } });
    if (res.status === 401 || res.status === 403) {
      const boot = window.FamilySyncBoot;
      if (boot && boot.calendar) boot.calendar.clear();
      throw Object.assign(new Error('expired'), { code: 'gcal/expired', status: res.status });
    }
    if (!res.ok) throw Object.assign(new Error('http-' + res.status), { code: 'gcal/http', status: res.status });
    return res.json();
  }
  async function gcalLoad({ force = false } = {}) {
    if (GCAL.busy) return false;
    if (!gcalToken()) {
      GCAL.on = false; GCAL.events = [];
      gcalNote('구글 캘린더 연결이 만료됐어요 · 다시 연결해 주세요', 'warn');
      renderSchedule();
      return false;
    }
    if (!force && GCAL.at && Date.now() - GCAL.at < 4 * 60 * 1000) return true;
    const core = window.FamilySync;
    if (!core || typeof core.gcalEventsToApp !== 'function') { gcalNote('캘린더 도우미를 불러오지 못했어요 · 잠시 뒤 다시 시도해 주세요', 'warn'); return false; }
    GCAL.busy = true;
    gcalNote('구글 캘린더 일정을 불러오는 중…');
    try {
      const win = core.gcalWindow(todayStr(), { back: 7, ahead: 40 });
      const list = await gcalFetch(`${GCAL_API}/users/me/calendarList?minAccessRole=reader&maxResults=50`);
      const cals = core.gcalCalendars(list.items).slice(0, 12);
      const out = [];
      for (const c of cals) {
        const q = new URLSearchParams({
          timeMin: core.gcalBoundaryIso(win.from, false),
          timeMax: core.gcalBoundaryIso(win.to, true),
          singleEvents: 'true', orderBy: 'startTime', maxResults: '250', showDeleted: 'false',
        });
        const r = await gcalFetch(`${GCAL_API}/calendars/${encodeURIComponent(c.id)}/events?${q.toString()}`);
        out.push(...core.gcalEventsToApp(r.items || [], c.id));
      }
      GCAL.events = out;
      GCAL.calendars = cals;
      GCAL.at = Date.now();
      GCAL.on = true;
      gcalNote(`구글 캘린더 연결됨 · 캘린더 ${cals.length}개 · 일정 ${out.length}개 (${hhmm()} 갱신) · 읽기 전용`, 'ok');
      renderSchedule();
      return true;
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'gcal/expired' || code === 'gcal/no-token') {
        GCAL.on = false; GCAL.events = [];
        gcalNote('구글 캘린더 연결이 만료됐어요 · ‘다시 연결’을 눌러 주세요', 'warn');
      } else {
        gcalNote('구글 캘린더를 읽지 못했어요 · 잠시 뒤 다시 시도해 주세요', 'warn');
      }
      renderSchedule();
      return false;
    } finally { GCAL.busy = false; }
  }
  /* 팝업이 막힌 기기에서 한 번 더 누르면 이동(redirect) 방식으로 연결합니다 — 화면에는 버튼 하나만 둡니다. */
  const GCAL_REDIRECT_WINDOW_MS = 90 * 1000;
  async function gcalConnect(opts = {}) {
    const boot = window.FamilySyncBoot;
    if (!boot || !boot.calendar || typeof boot.calendar.connect !== 'function') {
      toast('로그인 모듈을 아직 불러오지 못했어요 · 잠시 뒤 다시 눌러 주세요', 'coral', 3200);
      return;
    }
    if (!boot.auth || !boot.auth.currentUser) {
      toast('먼저 Google 계정으로 로그인해 주세요', '', 3000);
      fbSignIn();
      return;
    }
    if (GCAL.connecting) return;
    const retryRedirect = opts.redirect === true || (!!GCAL.redirectNextAt && Date.now() - GCAL.redirectNextAt < GCAL_REDIRECT_WINDOW_MS);
    const direct = !!(boot.calendar && boot.calendar.direct);
    GCAL.connecting = true;
    try {
      gcalNote((direct || retryRedirect) ? 'Google 화면으로 이동합니다 · ‘일정 읽기’를 허용한 뒤 돌아와 주세요…' : 'Google 창에서 ‘일정 읽기’를 허용해 주세요…');
      const r = await (retryRedirect ? boot.calendar.connect({ redirect: true }) : boot.calendar.connect())
        .catch((e) => ({ ok: false, reason: 'error', code: 'exception', message: String((e && e.message) || '') }));
      if (r && r.ok) {
        GCAL.redirectNextAt = 0;
        GCAL.at = 0;
        await gcalLoad({ force: true });
        return;
      }
      const reason = (r && r.reason) || 'error';
      const code = (r && r.code) || '';
      const msg = (r && r.message) || '';
      if (reason === 'cancelled') {
        GCAL.redirectNextAt = 0;
        gcalNote('연결을 취소했어요 · 필요하면 다시 눌러 주세요');
      } else if (reason === 'popup-blocked') {
        GCAL.redirectNextAt = Date.now();
        gcalNote('이 브라우저가 Google 창을 막았어요 · 한 번 더 누르면 Google 화면으로 이동해서 연결합니다', 'warn');
        toast('한 번 더 누르면 이동 방식으로 연결할게요', 'coral', 4200);
      } else if (reason === 'redirected') {
        gcalNote('Google 화면에서 ‘일정 읽기’를 허용하면 자동으로 이어집니다');
      } else if (reason === 'no-token') {
        gcalNote('Google에서 ‘일정 읽기’ 허용이 끝나지 않았어요 · 다시 눌러 주세요', 'warn');
        toast('Google 창에서 ‘허용’까지 눌러야 연결돼요', 'coral', 4800);
      } else if (reason === 'signed-out') {
        gcalNote('먼저 Google 계정으로 로그인해 주세요', 'warn');
      } else if (code === 'auth/unauthorized-domain') {
        gcalNote('이 주소는 Google 로그인이 허용되지 않았어요 · Firebase 인증의 승인된 도메인을 확인해 주세요', 'warn');
      } else {
        gcalNote('구글 캘린더를 연결하지 못했어요 · 잠시 뒤 다시 시도해 주세요', 'warn');
        if (msg) toast('구글 캘린더 연결 실패 — ' + msg.slice(0, 90), 'coral', 4400);
      }
    } finally {
      GCAL.connecting = false;
    }
  }
  function gcalDisconnect(quiet) {
    const boot = window.FamilySyncBoot;
    if (boot && boot.calendar && typeof boot.calendar.clear === 'function') boot.calendar.clear();
    GCAL.on = false; GCAL.events = []; GCAL.calendars = []; GCAL.at = 0;
    gcalNote(quiet ? '로그아웃해서 구글 캘린더 연결도 함께 끊었어요' : '구글 캘린더를 끊었어요 · 다시 연결하면 일정을 읽어 옵니다');
    renderSchedule();
  }
  if ($('#gcalConnectBtn')) $('#gcalConnectBtn').addEventListener('click', () => { gcalConnect(); });
  if ($('#gcalOffBtn')) $('#gcalOffBtn').addEventListener('click', () => { GCAL.redirectNextAt = 0; gcalDisconnect(); });

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
    if (left > 0) return { cls: left <= 15 ? 'soon' : 'ok', short: `${due}까지`, long: `${durText(left)} 남음`, text: `${due}까지 · ${durText(left)} 남음` };
    if (left === 0) return { cls: 'soon', short: '지금 마감!', long: '', text: `${due}까지 · 지금 마감!` };
    return { cls: 'late', short: `${due} 마감`, long: `${durText(-left)} 지났어요`, text: `${due} 마감 · ${durText(-left)} 지났어요` };
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
  const earnOf = (c) => Math.max(0, Math.round(typeof c.earned === 'number' ? c.earned : basePtsOf(c)));
  function missionEarn(c, atHM) {
    return MissionRewards.calculateMissionReward({ ...c, points: basePtsOf(c) }, atHM);
  }

  /* ---- 아이 포인트: 누적 경험치 · 사용 가능 포인트(잔액) · 사용 내역 ---- */
  const kidMember = () => S.members.find((m) => m.id === KID_ID) || null;
  const kidLabel = () => String((kidMember() || {}).name || '').trim() || '아이';
  // 화면에 보여 줄 미션 — '어른 미션도 같이 보기'가 꺼져 있으면 아이(와 공용) 미션만 보입니다. 데이터는 지우지 않아요.
  function visibleMissions() {
    const all = S.missions.filter((m) => missionAvailableToday(m));
    if (S.showAdultMissions) return all;
    return all.filter((m) => !m.member || m.member === KID_ID);
  }
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
  // 오늘 요일에 해당하는 '아이' 미션으로 모을 수 있는 최대 포인트(기본 + 조기 완료 보너스)
  function kidTodayGoal(dow = new Date().getDay()) {
    const list = (S.missions || []).filter((m) => m.member === KID_ID && missionAvailableToday(m) && missionOnDay(m, dow));
    const goal = list.reduce((s, m) => s + basePtsOf(m) + MissionRewards.maximumEarlyBonus(m.due), 0);
    const got = kidTodayPts();
    return { count: list.length, goal, got, left: Math.max(0, goal - got) };
  }

  /* ---- 도감 ---- */
  const dexEntryOf = (key) => (S.pokemon.dex || []).find((d) => d.key === key) || null;
  function registerDex(bump = false, key = S.pokemon.key) {
    const p = partnerOf(key);
    const fin = finalStageOf(p);
    const k = resolvePartnerKey(key);
    const ex = dexEntryOf(k);
    if (ex) {
      if (bump) { ex.at = todayStr(); ex.times = Math.max(1, Math.round(+ex.times || 1)) + 1; }
      return false;
    }
    S.pokemon.dex.push({ key: k, label: p.label, finalName: p.finalBase || fin.name, finalId: fin.id, tint: p.tint, at: todayStr(), times: 1 });
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
      // 로그의 member 는 '완료한 사람'. 공용 미션(member:'')도 이 기기에서 끝냈으면 아이(m3)로 남깁니다.
      // (서버 규칙: 아이 기기가 만드는 로그의 member 는 항상 m3)
      id: uid(), date: t, at: at || hhmm(), mid: c.id, title: c.title, member: c.member || KID_ID,
      base: r.base || 0, bonus: 0, earlyBonus: r.earlyBonus || 0, earned: r.earned || 0,
      due: c.due || '', goalMet: !!r.goalMet,
    });
    S.logs = keepLogs(S.logs);
  }
  function dropLog(mid) {
    const t = todayStr();
    S.logs = (S.logs || []).filter((l) => !(l.mid === mid && l.date === t));
  }

  function doneBadge(c) {
    const at = esc(c.doneAt || '');
    if (!c.due) return `<span class="done-badge plain">${at ? at + ' 완료' : '완료'}</span>`;
    const early = Math.max(0, Math.round(+c.earlyBonusEarned || 0));
    // 마감보다 몇 분 일찍 끝냈는지도 같이 보여 줍니다(점수 계산은 그대로, 표시만 추가)
    const dueM = minOf(c.due), doneM = minOf(c.doneAt);
    const ahead = dueM != null && doneM != null && dueM > doneM ? ` · ${durText(dueM - doneM)} 일찍` : '';
    if (early) return `<span class="done-badge early">${at} 완료${ahead} · ⚡ 조기 +${early}P</span>`;
    if (c.goalMet) return `<span class="done-badge goal">${at} 완료${ahead || ' · 마감 전 완료'}</span>`;
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
    if ($('#logBadge')) $('#logBadge').textContent = String(rows.length);
    box.innerHTML = rows.length
      ? rows.map((l) => l.kind === 'bonus'
        ? `<div class="log-row bonus">
          <span class="log-time">${esc(l.at)}</span>
          <span class="log-title">${esc(l.title)}</span>
          <span class="log-badge bonus">🎁 보너스</span>
          <b class="log-pts">+${Math.max(0, Math.round(+l.earned || 0))}P</b>
        </div>`
        : `<div class="log-row">
          <span class="log-time">${esc(l.at)}</span>
          <span class="log-title">${esc(l.title)}</span>
          ${l.earlyBonus ? `<span class="log-badge early">⚡ 조기 +${Math.max(0, Math.round(+l.earlyBonus || 0))}P</span>` : (l.goalMet ? '<span class="log-badge goal">⏰ 마감 전</span>' : (l.due ? '<span class="log-badge late">⏱️ 초과</span>' : '<span class="log-badge plain">완료</span>'))}
          <b class="log-pts">+${Math.max(0, Math.round(+l.earned || 0))}P</b>
        </div>`).join('')
      : '<div class="shop-empty" style="padding:8px 4px">오늘 끝낸 미션이 완료 시각과 함께 이곳에 쌓여요</div>';
    return { count: rows.length, met };
  }

  /* ============================================================ 월간·연간 달성 현황
     S.logs에 쌓인 완료 기록(400일 보존)을 달력·월별 카드로 되돌아봅니다.
     달성률은 '목표 시간이 있는 미션 중 목표 시간 안에 끝낸 비율'입니다. */
  const HIST = { view: 'month', y: 0, m: 0, member: 'all', day: '' };

  function histAllLogs() {
    // '어른 미션도 같이 보기'가 꺼져 있으면 성인 완료 기록도 통계에서 숨깁니다 (기록은 그대로 보관)
    // 🎁 이벤트 보너스 로그는 '미션 달성' 통계에 넣지 않습니다 (오늘 이력·상장 총점에는 포함)
    return (S.logs || []).filter((l) => l && isDateStr(l.date) && l.kind !== 'bonus'
      && (S.showAdultMissions || !l.member || l.member === KID_ID));
  }
  function histMemberOk(l) {
    return HIST.member === 'all' || String(l.member || '') === HIST.member;
  }
  function histMonthLogs(y, m) {
    const pre = `${y}-${pad(m + 1)}`;
    return histAllLogs().filter((l) => l.date.slice(0, 7) === pre && histMemberOk(l));
  }
  function histYearLogs(y) {
    const pre = String(y);
    return histAllLogs().filter((l) => l.date.slice(0, 4) === pre && histMemberOk(l));
  }
  function histStats(logs) {
    let pts = 0;
    let met = 0;
    let eligible = 0;
    const days = {};
    logs.forEach((l) => {
      pts += Math.max(0, Math.round(+l.earned || 0));
      if (l.due) { eligible++; if (l.goalMet) met++; }
      days[l.date] = 1;
    });
    return {
      count: logs.length,
      pts,
      met,
      eligible,
      rate: eligible ? Math.round((met / eligible) * 100) : null,
      days: Object.keys(days).length,
    };
  }

  function histKpis(items) {
    return `<div class="hist-kpis">${items.map((k, i) => `<div class="hist-kpi k${i + 1}">
        <div class="k">${esc(k.k)}</div>
        <div class="v">${k.v}</div>
        <div class="s">${esc(k.s || '')}</div>
      </div>`).join('')}</div>`;
  }

  function histMemberChip(member) {
    if (!member) return '<span class="hist-who"><i style="background:#9aa4bd"></i>공용</span>';
    const m = memberById(member);
    return `<span class="hist-who"><i style="background:${esc(m ? m.color : '#9aa4bd')}"></i>${esc(m ? m.name : '구성원')}</span>`;
  }

  function renderHistFilter() {
    const box = $('#histFilter');
    if (!box) return;
    const members = S.showAdultMissions ? S.members : S.members.filter((m) => m.id === KID_ID);
    const opts = [{ id: 'all', name: '전체', color: '' }].concat(members.map((m) => ({ id: m.id, name: m.name, color: m.color })));
    if (histAllLogs().some((l) => !l.member)) opts.push({ id: '', name: '공용', color: '#9aa4bd' });
    box.innerHTML = opts.map((o) => `<button type="button" class="hist-chip ${HIST.member === o.id ? 'on' : ''}" data-histmember="${esc(o.id)}">
        ${o.color ? `<i class="mdot" style="background:${esc(o.color)}"></i>` : ''}${esc(o.name)}${o.id === KID_ID ? ' 🧒' : ''}
      </button>`).join('');
  }

  function histShift(dir) {
    if (HIST.view === 'year') {
      HIST.y += dir;
    } else {
      const d = new Date(HIST.y, HIST.m + dir, 1);
      HIST.y = d.getFullYear();
      HIST.m = d.getMonth();
    }
    HIST.day = '';
    renderHistory();
  }

  function histGoToday() {
    const n = new Date();
    HIST.y = n.getFullYear();
    HIST.m = n.getMonth();
    HIST.day = HIST.view === 'month' ? todayStr() : '';
    renderHistory();
  }

  function histDayLabel(ds) {
    const p = String(ds).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return `${p[1]}월 ${p[2]}일 (${DAYS[d.getDay()]})`;
  }

  function histMonthHTML() {
    const y = HIST.y;
    const m = HIST.m;
    const pre = `${y}-${pad(m + 1)}`;
    const dim = new Date(y, m + 1, 0).getDate();
    const logs = histMonthLogs(y, m);
    const st = histStats(logs);
    const byDay = {};
    logs.forEach((l) => { (byDay[l.date] = byDay[l.date] || []).push(l); });
    Object.keys(byDay).forEach((k) => byDay[k].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))));
    const dayKeys = Object.keys(byDay).sort();

    // 고른 날짜가 이 달에 없으면 오늘(기록이 있으면) 또는 기록이 있는 마지막 날로 맞춥니다.
    const todayS = todayStr();
    const thisMonth = todayS.slice(0, 7) === pre;
    if (!HIST.day || HIST.day.slice(0, 7) !== pre) {
      if (thisMonth && byDay[todayS]) HIST.day = todayS;
      else if (dayKeys.length) HIST.day = dayKeys[dayKeys.length - 1];
      else HIST.day = thisMonth ? todayS : '';
    }

    const first = new Date(y, m, 1).getDay();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="hist-cell blank" aria-hidden="true"></span>');
    for (let d = 1; d <= dim; d++) {
      const ds = `${pre}-${pad(d)}`;
      const rows = byDay[ds] || [];
      const met = rows.some((r) => r.goalMet);
      const pts = rows.reduce((s, r) => s + Math.max(0, Math.round(+r.earned || 0)), 0);
      const dow = (first + d - 1) % 7;
      const cls = ['hist-cell'];
      if (rows.length) cls.push(met ? 'goal' : 'has');
      if (ds === todayS) cls.push('is-today');
      if (ds === HIST.day) cls.push('is-sel');
      const label = `${m + 1}월 ${d}일 ${rows.length ? rows.length + '건 완료' + (met ? ' · 목표 달성 포함' : '') : '기록 없음'}`;
      cells.push(`<button type="button" class="${cls.join(' ')}" data-histday="${ds}" aria-label="${esc(label)}"${ds === HIST.day ? ' aria-pressed="true"' : ''}>
          <span class="hc-num${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}">${d}</span>
          ${rows.length ? `<span class="hc-cnt">${rows.length}건</span><span class="hc-pt">+${pts}P</span>` : ''}
          ${met ? '<span class="hc-flag" aria-hidden="true">⏰</span>' : ''}
        </button>`);
    }

    const dRows = HIST.day ? (byDay[HIST.day] || []) : [];
    const dPts = dRows.reduce((s, r) => s + Math.max(0, Math.round(+r.earned || 0)), 0);
    const detail = HIST.day
      ? `<div class="hist-detail">
          <div class="hist-detail-head">
            <b>${esc(histDayLabel(HIST.day))}</b>
            ${dRows.length ? `<span class="pill">${dRows.length}건 · +${dPts}P</span>` : ''}
          </div>
          ${dRows.length ? `<div class="hist-day-list">${dRows.map((l) => `<div class="hist-day-row">
              <span class="t">${esc(l.at || '')}</span>
              <span class="n">${esc(l.title || '미션')}</span>
              ${histMemberChip(l.member)}
              ${l.earlyBonus ? `<span class="log-badge early">⚡ 조기 +${Math.max(0, Math.round(+l.earlyBonus || 0))}P</span>` : (l.goalMet ? '<span class="log-badge goal">⏰ 마감 전</span>' : (l.due ? '<span class="log-badge late">⏱️ 초과</span>' : '<span class="log-badge plain">완료</span>'))}
              <b class="p">+${Math.max(0, Math.round(+l.earned || 0))}P</b>
            </div>`).join('')}</div>` : '<div class="shop-empty" style="padding:8px 4px">이 날은 완료 기록이 없어요</div>'}
        </div>`
      : '<div class="hist-detail"><div class="shop-empty" style="padding:8px 4px">날짜를 누르면 그날 완료한 미션이 이곳에 보여요</div></div>';

    return histKpis([
      { k: '이 달 완료', v: `${st.count}건`, s: `${dim}일 중 ${st.days}일 활동` },
      { k: '목표 시간 달성률', v: st.rate == null ? '—' : `${st.rate}%`, s: st.eligible ? `${st.met}/${st.eligible}건` : '목표 시간 미설정' },
      { k: '이 달 획득 포인트', v: `+${st.pts}P`, s: st.days ? `하루 평균 ${Math.round(st.pts / st.days)}P` : '기록 없음' },
      { k: '활동 일수', v: `${st.days}일`, s: st.days ? `이 달 ${Math.round((st.days / dim) * 100)}%` : '기록 없음' },
    ]) + `<div class="hist-cal">
        <div class="hist-dows">${DAYS.map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('')}</div>
        <div class="hist-grid">${cells.join('')}</div>
      </div>
      <div class="hist-legend">
        <span><i class="lg-goal"></i>목표 시간 달성</span>
        <span><i class="lg-has"></i>완료</span>
        <span><i class="lg-none"></i>기록 없음</span>
      </div>
      ${detail}`;
  }

  function histYearHTML() {
    const y = HIST.y;
    const logs = histYearLogs(y);
    const st = histStats(logs);
    const months = [];
    for (let m = 0; m < 12; m++) months.push(histStats(histMonthLogs(y, m)));
    const maxC = Math.max(1, ...months.map((x) => x.count));
    const now = new Date();
    const cards = months.map((x, m) => {
      const cur = now.getFullYear() === y && now.getMonth() === m;
      return `<button type="button" class="hist-month${x.count ? '' : ' zero'}${cur ? ' cur' : ''}" data-histmonth="${m}" aria-label="${m + 1}월 ${x.count}건 완료 · 월간 보기">
          <span class="mh"><b>${m + 1}월</b>${cur ? '<span>이번 달</span>' : ''}</span>
          <span class="mc">${x.count}<small>건</small></span>
          <span class="ms">달성률 ${x.rate == null ? '—' : x.rate + '%'} · +${x.pts}P</span>
          <span class="ms">활동 ${x.days}일</span>
          <span class="mbar"><i style="width:${Math.round((x.count / maxC) * 100)}%"></i></span>
        </button>`;
    }).join('');
    return histKpis([
      { k: '연간 완료', v: `${st.count}건`, s: `활동 ${st.days}일` },
      { k: '연간 목표 시간 달성률', v: st.rate == null ? '—' : `${st.rate}%`, s: st.eligible ? `${st.met}/${st.eligible}건` : '목표 시간 미설정' },
      { k: '연간 획득 포인트', v: `+${st.pts}P`, s: st.days ? `하루 평균 ${Math.round(st.pts / st.days)}P` : '기록 없음' },
    ]) + `<div class="hist-year-grid">${cards}</div>
      <div class="hist-year-hint">월 카드를 누르면 그 달의 월간 달력으로 바로 이동해요.</div>`;
  }

  function renderHistory() {
    const body = $('#histBody');
    if (!body) return;
    if (!HIST.y) { const n = new Date(); HIST.y = n.getFullYear(); HIST.m = n.getMonth(); }
    $$('.hist-tab').forEach((b) => {
      const on = b.dataset.histview === HIST.view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const list = HIST.view === 'month' ? histMonthLogs(HIST.y, HIST.m) : histYearLogs(HIST.y);
    const st = histStats(list);
    if ($('#histTitleText')) $('#histTitleText').textContent = HIST.view === 'month' ? `${HIST.y}년 ${HIST.m + 1}월` : `${HIST.y}년`;
    if ($('#histSubText')) $('#histSubText').textContent = HIST.view === 'month'
      ? `${st.count}건 완료 · +${st.pts}P`
      : `1년 ${st.count}건 완료 · +${st.pts}P`;
    renderHistFilter();
    body.innerHTML = HIST.view === 'month' ? histMonthHTML() : histYearHTML();
  }

  function openHistory() {
    const n = new Date();
    HIST.view = 'month';
    HIST.y = n.getFullYear();
    HIST.m = n.getMonth();
    HIST.member = 'all';
    HIST.day = todayStr();
    $('#historyModal').hidden = false;
    renderHistory();
  }
  function closeHistory() { const m = $('#historyModal'); if (m) m.hidden = true; }

  // 미션 카드 한 장 — 오늘 차례인 미션과 '오늘 쉬는 미션'이 같은 모양을 씁니다
  function choreCardHtml(c, t, nowMin, offday = false) {
    const done = c.doneOn === t;
    const m = memberById(c.member);
    const base = basePtsOf(c);
    const di = (done || offday) ? null : dueInfo(c.due, nowMin);
    const dueMin = minOf(c.due);
    const minutesLeft = dueMin == null || nowMin == null ? 0 : dueMin - nowMin;
    const overdue = !done && !offday && dueMin != null && nowMin != null && dueMin < nowMin;
    const earlyBonus = Math.max(0, Math.round(+c.earlyBonusEarned || 0));
    const earlyHint = !done && !offday && c.due && minutesLeft >= 5
      ? `<span class="early-chip" data-earlychip data-due="${esc(c.due)}">${minutesLeft >= 10 ? '⚡ 10분+ 전 +2P(총) · 5~9분 전 +1P' : '⚡ 5~9분 전 +1P'}</span>`
      : '';
    const chip = done
      ? doneBadge(c)
      : (di ? `<span class="due-chip ${di.cls}" data-duechip data-due="${esc(c.due)}">⏰ ${esc(di.short)}<i class="dc-long"> · ${esc(di.long)}</i></span>` : '');
    const pts = done ? earnOf(c) : base;
    const dl = daysLabel(c.days);
    // Decorative art only. Stable per existing mission ID, no new stored data or reward rules.
    const missionArtIds = [175, 446, 25, 133, 35, 39, 1, 4, 7, 143, 54, 132];
    const artHash = Array.from(String(c.id || c.title)).reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 0);
    const special = isSpecialMissionToday(c, t);
    const storedArt = Math.round(Number(c.artSpecies || 0));
    const missionArt = special && storedArt > 0 ? storedArt : missionArtIds[artHash % missionArtIds.length];
    return `<div class="chore ${String(c.title||'').length>20 ? 'long-title ' : ''}${done ? 'done' : ''}${offday ? ' offday' : ''}${overdue ? ' overdue' : ''}${special ? ' special-mission-card' : ''}" data-act="chore-toggle" data-id="${c.id}">
            <button class="chore-check" data-act="chore-toggle" data-id="${c.id}" aria-label="${esc(c.title)} 완료">${done ? '✓' : '○'}</button>
            <img class="mission-art" src="${SPRITE_ROOT}/other/official-artwork/${missionArt}.png" alt="" aria-hidden="true" loading="lazy" decoding="async" onerror="this.hidden=true" />
            <div class="chore-main">
              <div class="chore-top">
                ${special ? '<span class="special-tag">✦ 특별 미션</span>' : ''}
                <span class="chore-title">${esc(c.title)}</span>
                <span class="pts${done && c.goalMet ? ' goal' : ''}">+${pts}P${done && earlyBonus ? ' ⚡' : ''}</span>
              </div>
              ${special ? '<span class="special-note">부모가 직접 정해요</span>' : ''}
              <div class="chore-meta">
                <span class="mem"><span class="mdot" style="background:${m ? esc(m.color) : '#9aa4bd'}"></span>${esc(m ? m.name : '공용')}</span>
                <span class="days-chip${dl === '매일' ? ' all' : ''}">${esc(dl)}</span>
                ${chip}
                ${earlyHint}
              </div>
              ${special ? '<span class="special-validity">오늘만 · 1회</span>' : ''}
            </div>
            <div class="chore-tools">
              <button class="btn icon sm ghost parent-only" data-act="chore-edit" data-id="${c.id}" aria-label="수정">✎</button>
              <button class="btn icon sm ghost parent-only" data-act="chore-del" data-id="${c.id}" aria-label="삭제">✕</button>
            </div>
          </div>`;
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

    if (syncCaught()) save();     // 지나온 단계는 도감에 '만난 종'으로 남깁니다
    // 말풍선(#charSay)은 그림을 가리지 않도록 index.html에서 그림 옆(이름 줄)에 따로 둡니다
    $('#charStage').innerHTML = pokeImg(stage, 'poke-img', p.tint, { eager: true })
      + (stage.crown ? '<span class="poke-crown" aria-hidden="true">👑</span>' : '')
      + (stage.shiny ? '<span class="poke-shiny" aria-hidden="true">✨</span>' : '');
    const isEgg = window.PartnerGrowthCore && PartnerGrowthCore.isEgg(S.pokemon.growth, xp);
    if (isEgg) $('#charStage').innerHTML = '<span class="partner-egg" role="img" aria-label="새 파트너 알"></span>';
    $('#charStage').title = isEgg ? '새 파트너 알 · 5XP에 부화해요' : `${stage.name} · 톡톡 누르면 반응해요`;
    $('#charLevel').textContent = isEgg ? '새 파트너 알' : stage.name;
    if ($('#charLevel')) $('#charLevel').classList.toggle('shiny', !!stage.shiny);
    if ($('#tChores')) $('#tChores').textContent = `${kidLabel()} 미션`;   // 집집마다 아이 이름으로 바뀝니다 (기본값 '아이 미션')

    const doneList = visibleMissions().filter((x) => x.doneOn === t);
    const dowToday = new Date().getDay();
    const todayCount = visibleMissions().filter((x) => missionOnDay(x, dowToday)).length;
    $('#charCount').innerHTML = `누적 경험치 <b>${totalXp}P</b>`;
    $('#charToday').textContent = `${kidLabel()} 오늘 +${kidTodayPts()}P`;
    const log = renderLog();
    $('#choreSub').textContent = `오늘 ${todayCount} · 완료 ${doneList.length} · ⏰ ${log.met}`
      + (S.showAdultMissions ? ' · 어른 포함' : '');
    const thisMonth = todayStr().slice(0, 7);
    const monthCount = histAllLogs().filter((l) => l.date.slice(0, 7) === thisMonth).length;
    if ($('#histBtnPill')) $('#histBtnPill').textContent = String(monthCount);

    // ① 진화 게이지 — '다음 진화 목표'를 분모로 하는 진행률 (누적 XP 값 자체는 바꾸지 않습니다)
    const nxt = isEgg ? {name: st[0].name + ' 부화', min: 5} : st[lv + 1];
    const nextMin = nxt ? nxt.min : FINAL_P;
    let evoPct = 100;
    if (nxt) {
      evoPct = clamp(Math.round((xp / Math.max(1, nextMin)) * 100), 0, 100);
      $('#charBar').style.width = evoPct + '%';
      $('#charNext').classList.remove('done');
      $('#charNext').innerHTML = `다음 진화 <b>${esc(nxt.name)}</b>까지 딱 <b>${Math.max(0, nxt.min - xp)}P</b> 남음!`;
    } else {
      $('#charBar').style.width = '100%';
      $('#charNext').classList.add('done');
      $('#charNext').innerHTML = done ? '최종 진화 완료! 🏆 도감에 저장됐어요' : '최종 단계예요';
    }
    if ($('#evoPct')) $('#evoPct').textContent = evoPct + '%';
    if ($('#evoBar')) $('#evoBar').setAttribute('aria-valuenow', String(evoPct));

    // ② 진화 경험치(⚡) vs 선물 코인(🪙) 스탯 카드 — 분모는 다음 진화 목표
    if ($('#statXp')) $('#statXp').textContent = xp;
    if ($('#statXpMax')) $('#statXpMax').textContent = `/${nextMin}P`;
    if ($('#statCoin')) $('#statCoin').textContent = bal;

    // ③ 오늘 달성 바 — 오늘 모은 P / 오늘 목표(오늘 요일 아이 미션 최대 획득) 합계
    const tg = kidTodayGoal(dowToday);
    const todayPct = tg.goal ? clamp(Math.round((tg.got / tg.goal) * 100), 0, 100) : 0;
    if ($('#todayGot')) $('#todayGot').textContent = `${tg.got}P`;
    if ($('#todayGoal')) $('#todayGoal').textContent = `${tg.goal}P`;
    if ($('#todayPct')) $('#todayPct').textContent = todayPct + '%';
    if ($('#todayBar')) $('#todayBar').style.width = todayPct + '%';
    const todayMeter = $('#todayMeter');
    if (todayMeter) todayMeter.classList.toggle('done', tg.goal > 0 && tg.got >= tg.goal);
    if ($('#todayHint')) {
      $('#todayHint').textContent = !tg.count
        ? '오늘은 아이 미션이 없어요 🌴'
        : tg.got >= tg.goal
          ? '🎉 오늘 목표 달성! 최고예요'
          : `${tg.left}P 더 모으면 오늘 목표 달성!`;
    }

    $('#charEvo').innerHTML = st.map((s, i) =>
      `<span class="evo${i === lv ? ' on' : ''}${i > lv ? ' lock' : ''}" title="${esc(s.name)} · ${s.min}P">${pokeImg(s, 'evo-img', p.tint)}</span>`
    ).join('');
    if ($('#partnerPill')) $('#partnerPill').textContent = `${p.label} 계열`;

    const adoptBtn = $('#adoptBtn');
    if (adoptBtn) {
      adoptBtn.disabled = !done;
      adoptBtn.classList.toggle('on', done);
      adoptBtn.textContent = done ? '✨ 입양하기' : `🔒 입양 ${FINAL_P}P`;
      adoptBtn.title = done
        ? '지금 포켓몬은 도감에 저장되고, 새 포켓몬을 0P부터 다시 키울 수 있어요'
        : `현재 파트너가 ${FINAL_P}P에 도달하면 새 포켓몬을 입양할 수 있어요`;
    }

    // 구성원별 오늘 완료·오늘 포인트·누적 포인트 (성인 미션 숨김 모드에서는 아이·공용만)
    const stats = memberStats().filter((s) => S.showAdultMissions || s.m.id === KID_ID || s.m.id === '');
    const streak = streakView();
    $('#memberStats').innerHTML = stats.map((s) => `<div class="mstat" style="--c:${esc(s.m.color)}">
        <span class="mdot" style="background:${esc(s.m.color)}"></span>
        <span class="mstat-name">${esc(s.m.name)}${s.m.id === KID_ID ? ' 🧒' : ''}</span>
        ${s.m.id === KID_ID ? `<button type="button" class="mstat-streak" data-act="streak-info" title="${esc(streak.title)}">🔥 ${esc(streak.text)}</button>` : ''}
        <span class="mstat-today">오늘 ${s.today}개</span>
        <span class="mstat-pts">${s.ptsToday ? '+' + s.ptsToday + 'P' : '0P'}</span>
        <span class="mstat-total">누적 ${s.total}P</span>
      </div>`).join('');

    // 미션 목록 — 오늘 요일에 해당하는 미션만 위에 보이고, 오늘 쉬는 미션은 아래에 접어 둡니다
    const order = {};
    S.members.forEach((m, i) => { order[m.id] = i; });
    order[''] = 99;
    const nowMin = minOf(hhmm());
    const dow = new Date().getDay();
    const list = visibleMissions().sort((a, b) => (order[a.member] ?? 50) - (order[b.member] ?? 50));
    if (!list.length) {
      $('#choreList').innerHTML = `<div class="shop-empty">미션을 추가해 보세요</div>`;
    } else {
      const todayList = list.filter((c) => missionOnDay(c, dow));
      const offList = list.filter((c) => !missionOnDay(c, dow));
      // 끝낸 미션은 목록에서 내리고 아래 '오늘 끝낸 미션' 접힘 줄로 보냅니다(실수로 체크해도 펼쳐서 되돌릴 수 있게)
      const doneListToday = todayList.filter((c) => c.doneOn === t);
      const todoList = todayList.filter((c) => c.doneOn !== t);
      const doneOpen = !!(document.getElementById('choreDone') && document.getElementById('choreDone').open);
      const offOpen = !!(document.getElementById('choreOff') && document.getElementById('choreOff').open);
      const noTodoMsg = todayList.length
        ? '🎉 오늘 미션을 다 끝냈어요! 수고했어요'
        : `${DAYS[dow]}요일은 할 미션이 없어요 — 오늘은 푹 쉬어요 🌴`;
      const todayHtml = todayList.length
        ? todayList.map((c) => choreCardHtml(c, t, nowMin)).join('')
        : `<div class="shop-empty">${noTodoMsg}</div>`;
      const doneHtml = false && doneListToday.length
        ? `<details class="chore-off chore-done" id="choreDone"${doneOpen ? ' open' : ''}>
            <summary>✅ 오늘 끝낸 미션 <span class="pill">${doneListToday.length}개</span></summary>
            <div class="chore-off-list">${doneListToday.map((c) => choreCardHtml(c, t, nowMin)).join('')}</div>
          </details>`
        : '';
      const offHtml = offList.length
        ? `<details class="chore-off" id="choreOff"${offOpen ? ' open' : ''}>
            <summary>😴 오늘은 ${DAYS[dow]}요일이라 쉬는 미션 <span class="pill">${offList.length}개</span></summary>
            <div class="chore-off-list">${offList.map((c) => choreCardHtml(c, t, nowMin, true)).join('')}</div>
          </details>`
        : '';
      $('#choreList').innerHTML = todayHtml + doneHtml + offHtml;
    }

    // 10P마다 별 하나 (아이 누적 경험치 기준)
    const stars = Math.min(Math.floor(totalXp / 10), 24);
    let row = '';
    for (let i = 0; i < stars; i++) row += '<span>⭐</span>';
    if (totalXp >= 10 && totalXp > stars * 10) row += `<span style="font-size:11px;font-weight:800;color:var(--text-3);align-self:center">${totalXp - stars * 10}P</span>`;
    if (!stars) row = '<span style="font-size:11.5px;font-weight:700;color:var(--text-3)">미션을 끝내면 10P마다 ⭐ 하나씩 쌓여요</span>';
    $('#stickerRow').innerHTML = row;

    renderStampBoards();
    renderDex();
    renderPointUses();
    renderWish();
    renderEventBadge();
    checkPokeImages();
    if (standbyOn) renderStandby();
    if ($('#historyModal') && !$('#historyModal').hidden) renderHistory();
  }

  /* ---- 포켓몬 도감: 카드 안의 완성 트로피 + 151종 전체 도감 모달 ---- */
  function renderDex() {
    renderPlayground();   // 🏡 놀이방 — 포인트·파트너가 바뀌면 친구 구성도 따라 바뀝니다
    const box = $('#dexRow');
    if ($('#dexCount')) $('#dexCount').textContent = `${caughtCount()}/151`;
    if (!box) return;
    const dex = S.pokemon.dex || [];
    if ($('#dexTrophyCount')) $('#dexTrophyCount').textContent = dex.length ? `${dex.length}계열 완성` : '아직 없어요';
    box.innerHTML = dex.length
      ? dex.map((d) => {
          const p = partnerOf(d.key);
          const fin = finalStageOf(p);
          return `<button type="button" class="dex-card" data-act="dex-open" data-id="${Math.max(0, d.finalId || fin.id)}" title="${esc(d.label)} 계열 · ${esc(d.at || '')} 완성">
            <span class="dex-img-frame">${pokeImg(fin, 'dex-art', p.tint, { mini: true })}</span>
            <span class="dex-name">${esc(d.label || d.finalName)}</span>
            <span class="dex-when">${esc(fmtMD(d.at))} 완성${d.times > 1 ? ` · ${d.times}회` : ''}</span>
          </button>`;
        }).join('')
      : '<div class="shop-empty" style="padding:8px 4px">최종 진화(200P)를 마치면 그 포켓몬이 이곳에 영구히 쌓여요</div>';
    checkPokeImages();
  }

  /* ---- 🏡 내 포켓몬 놀이방: 도감에 남은 친구와 지금 파트너가 풀밭에서 놀아요 ---- */
  const PLAY_MAX = 8;   // 풀밭이 답답해지지 않게 한 번에 8마리까지
  const PLAY_SAY = ['같이 놀자!', '안녕! 반가워~', '오늘도 신나!', '미션 고마워!', '또 만났네!', '한 번 더 놀자!'];
  let playSayIdx = 0;

  // 놀이방에 나오는 친구: ① 지금 파트너 ② 도감을 마친 최종 진화 ③ 지나오며 만난 종
  function playgroundMons() {
    const out = [];
    const seen = {};
    const add = (id, name, tint) => {
      const n = Math.round(+id || 0);
      if (!(n > 0) || seen[n]) return;
      seen[n] = 1;
      out.push({ id: n, name: name || pokeInfo(n).name, tint: tint || pokeTint(n) });
    };
    const p = partnerOf(S.pokemon.key);
    const st = stagesOf();
    const cur = st[stageIndex(S.pokemon.xp)] || st[0];
    if (cur) add(cur.id, cur.name, p.tint);
    (S.pokemon.dex || []).forEach((d) => {
      const fin = Math.round(+d.finalId || 0) || (finalStageOf(partnerOf(d.key)) || {}).id;
      add(fin, d.finalName, d.tint);
    });
    const caught = caughtMap();
    Object.keys(caught).sort((a, b) => String(caught[b] || '').localeCompare(String(caught[a] || '')))
      .forEach((k) => add(k, '', ''));
    // 좁은 화면(폰)에서는 친구가 답답하지 않게 6마리까지만
    return out.slice(0, (typeof window !== 'undefined' && window.innerWidth < 720) ? 6 : PLAY_MAX);
  }

  function renderPlayground() {
    // 도감 모달 안의 놀이방(#dexPlayYard)과 🐾 포켓몬 놀이방 탭(#tabPlayYard)에 같은 친구를 그립니다
    const yards = ['#dexPlayYard', '#tabPlayYard'].map((sel) => $(sel)).filter(Boolean);
    const mons = playgroundMons();
    const counts = ['#dexPlayCount', '#playTabCount'].map((sel) => $(sel)).filter(Boolean);
    counts.forEach((el) => { el.textContent = `${mons.length}마리`; });
    if (!yards.length) return;
    if (!mons.length) {
      yards.forEach((yard) => {
        yard.innerHTML = '<div class="dp-empty">아직 놀이방이 비었어요 — 미션을 끝내 포켓몬을 만나면 여기서 같이 놀아요 🐾</div>';
      });
      return;
    }
    const n = mons.length;
    const html = mons.map((m, i) => {
      const x = n === 1 ? 50 : 7 + (86 * i) / (n - 1);   // 풀밭 가로로 고르게
      const dur = (5.6 + (i % 4) * 0.8).toFixed(2);      // 걷는 속도는 친구마다 조금씩
      const lift = [0, 5, 2, 7, 1, 4, 6, 3][i % 8];      // 조금씩 앞·뒤로 서서 깊이감
      return `<button type="button" class="dp-mon" data-act="play-poke" data-id="${m.id}" data-name="${esc(m.name)}"
        style="--x:${x.toFixed(1)}%;--dur:${dur}s;--delay:${(-1.7 * i).toFixed(2)}s;--hop:${(1.05 + (i % 3) * 0.22).toFixed(2)}s;--hopdelay:${(-(i * 0.4)).toFixed(2)}s;--lift:${lift}px"
        aria-label="${esc(m.name)} — 콕 누르면 같이 놀아요" title="${esc(m.name)} · 콕 누르면 좋아해요">
        <span class="dp-bubble" aria-hidden="true"></span>
        <span class="dp-hearts" aria-hidden="true"><i>❤️</i><i>💛</i><i>❤️</i></span>
        ${pokeImg(m, 'dp-img', m.tint, { eager: true })}
        <span class="dp-name">${esc(m.name)}</span>
      </button>`;
    }).join('');
    yards.forEach((yard) => { yard.innerHTML = html; });
    checkPokeImages();
  }

  // 콕 누르면 두 번 점프 + 하트 + 말풍선 (상태는 바꾸지 않는 장난감입니다)
  function playWithPoke(el) {
    if (!el) return;
    const b = el.querySelector('.dp-bubble');
    if (b) {
      playSayIdx = (playSayIdx + 1) % PLAY_SAY.length;
      b.textContent = `${el.dataset.name || '친구'}! ${PLAY_SAY[playSayIdx]}`;
    }
    el.classList.remove('jump');
    void el.offsetWidth;                 // 같은 친구를 연달아 눌러도 점프가 처음부터 다시
    el.classList.add('jump');
    clearTimeout(el._playTimer);
    el._playTimer = setTimeout(() => el.classList.remove('jump'), 1500);
  }

  /* ---- 🏆 151 도감 모달: 획득 상태·실루엣·진화 단계 탐색 ---- */
  const DEXUI = { q: '', filter: 'all', sel: 25 };
  const DEX_FILTERS = [
    { key: 'all', label: '전체' },
    { key: 'got', label: '획득' },
    { key: 'miss', label: '미획득' },
  ];

  function dexFilteredIds() {
    const q = DEXUI.q.trim();
    return POKE_NOS.filter((id) => {
      const got = !!caughtOf(id);
      if (DEXUI.filter === 'got' && !got) return false;
      if (DEXUI.filter === 'miss' && got) return false;
      if (!q) return true;
      const info = pokeInfo(id);
      return info.name.indexOf(q) >= 0 || String(id) === q || pad(id) === q || (`no${id}` === q.toLowerCase());
    });
  }

  function renderDexFilters() {
    const box = $('#dexFilter');
    if (!box) return;
    box.innerHTML = DEX_FILTERS.map((f) => {
      const n = f.key === 'got' ? caughtCount() : f.key === 'miss' ? (POKE_NOS.length - caughtCount()) : POKE_NOS.length;
      return `<button type="button" class="dex-fchip${DEXUI.filter === f.key ? ' on' : ''}" data-dexfilter="${f.key}">${f.label} <b>${n}</b></button>`;
    }).join('');
  }

  function renderDexGrid() {
    const box = $('#dexGrid');
    if (!box) return;
    const ids = dexFilteredIds();
    if (!ids.length) {
      box.innerHTML = '<div class="shop-empty" style="padding:16px 6px">찾는 포켓몬이 없어요</div>';
      return;
    }
    const curId = (stagesOf()[stageIndex(S.pokemon.xp)] || {}).id;
    box.innerHTML = ids.map((id) => {
      const info = pokeInfo(id);
      const got = !!caughtOf(id);
      return `<button type="button" class="dex-cell ${got ? 'got' : 'miss'}${DEXUI.sel === id ? ' sel' : ''}${curId === id ? ' cur' : ''}" data-dexid="${id}" aria-pressed="${DEXUI.sel === id}" aria-label="${esc(info.name)} ${got ? '획득' : '미획득'}" title="${esc(info.name)}${got ? ` · ${esc(caughtOf(id))} 만남` : ' · 아직 만나지 못했어요'}">
        <span class="dex-no">${pad(id)}</span>
        <img class="dex-mini" src="${POKE_ART(id)}" alt="" loading="lazy" decoding="async" draggable="false"
          data-fallback="${esc(POKE_ART(id))}" data-fallback2="${esc(pokeFallback({ id, name: info.name }, pokeTint(id)))}">
        <span class="dex-nm">${got ? esc(info.name) : '???'}</span>
        ${curId === id ? '<span class="dex-cur" aria-hidden="true">★</span>' : ''}
      </button>`;
    }).join('');
    checkPokeImages();
  }

  function dexChainHtml(line) {
    const curLine = resolvePartnerKey(S.pokemon.key) === line.key;
    const stages = line.stages.map((s) => {
      const on = s.id === DEXUI.sel;
      const has = !!caughtOf(s.id);
      return `<span class="dx-stage${on ? ' on' : ''}${has ? '' : ' miss'}${curLine ? ' mine' : ''}">
        ${pokeImg(s, 'dx-stage-img', s.tint || line.tint, { mini: true, shiny: !!s.shiny })}
        <em>${esc(s.name)}</em>
        <b>${s.min}P</b>
      </span>`;
    }).join('<i class="pstage-arrow">›</i>');
    return `<div class="dx-chain${curLine ? ' cur' : ''}">
      <div class="dx-chain-row">${stages}</div>
      <div class="dx-chain-foot">
        <span class="dx-chain-note">${curLine ? '🐾 지금 함께 자라는 계열' : ''}</span>
        ${curLine ? '' : `<button type="button" class="btn sm ghost" data-dexpick="${esc(line.key)}">🐾 이 계열 기르기</button>`}
      </div>
    </div>`;
  }

  function renderDexSide() {
    const box = $('#dexSide');
    if (!box) return;
    const id = DEXUI.sel;
    const info = pokeInfo(id);
    const tint = pokeTint(id);
    const got = caughtOf(id);
    const chains = linesForSpecies(id);
    const stageLike = { id, name: info.name, tint };
    box.innerHTML = `
      <div class="dx-hero${got ? '' : ' miss'}">${pokeImg(stageLike, 'dx-hero-img', tint, { eager: true })}</div>
      <div class="dx-title">
        <span class="dx-no">${id <= 151 ? 'No.' + pad(id) : '특별한 친구'}</span>
        <b class="dx-name">${esc(info.name)}</b>
      </div>
      <div class="dx-types">${(info.types.length ? info.types : ['???']).map((t) => `<span class="dx-type" style="--tc:${esc(POKE_TYPE_TINT[t] || '#9aa4bd')}">${esc(t)}</span>`).join('')}</div>
      <div class="dx-state ${got ? 'got' : 'miss'}">
        ${got ? `✅ ${esc(got)}에 만났어요` : '❔ 아직 만나지 못했어요'}
      </div>
      ${got ? '' : '<p class="dx-tip">이 계열을 파트너로 기르면 도감에 차곡차곡 남아요. 미션을 끝낼 때마다 경험치가 쌓여요!</p>'}
      <div id="pokemonEncyclopediaInfo"></div>
      <h4 class="pdx-app-growth-label">이 앱에서 함께 자라는 방법</h4>
      <div class="dx-chains">${chains.length ? chains.map(dexChainHtml).join('') : '<p class="dx-tip">이 친구는 진화하지 않아요. 파트너로 기르면 200P에 이로치로 반짝여요!</p>'}</div>
    `;
    if (window.PokemonEncyclopedia) window.PokemonEncyclopedia.render($('#pokemonEncyclopediaInfo'), id, { name: info.name, types: info.types, art: POKE_ART(id) });
    checkPokeImages();
  }

  function openDex(id) {
    const curLine = partnerOf(S.pokemon.key);
    const curStageId = (curLine.stages[stageIndex(S.pokemon.xp)] || {}).id;
    const firstGen1 = (curLine.members || []).find((n) => POKE_INFO[n] && n <= 151);
    const pick = (+id > 0 && POKE_INFO[+id]) ? +id : (curStageId || firstGen1 || 1);
    DEXUI.sel = POKE_INFO[pick] && pick <= 151 ? pick : (firstGen1 || 1);
    DEXUI.q = '';
    DEXUI.filter = 'all';
    if ($('#dexSearch')) $('#dexSearch').value = '';
    if ($('#dexMeta')) $('#dexMeta').textContent = `1세대 151종 · ${caughtCount()}마리 만남`;
    renderDexFilters();
    renderDexGrid();
    renderDexSide();
    renderDex();   // 🏆 내 포켓몬 도감(획득/미획득)과 🏡 놀이방 — 도감 페이지 안에서 함께 보여 줍니다
    $('#dexModal').hidden = false;
  }

  function selectDex(id) {
    DEXUI.sel = +id;
    $$('#dexGrid .dex-cell').forEach((el) => {
      const on = +el.dataset.dexid === DEXUI.sel;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderDexSide();
  }

  function setDexFilter(key) {
    DEXUI.filter = DEX_FILTERS.some((f) => f.key === key) ? key : 'all';
    renderDexFilters();
    renderDexGrid();
  }

  /* ---- 포인트 사용 내역 ---- */
  function renderPointUses() {
    const box = $('#useList');
    if (!box) return;
    const uses = (S.pointUses || []).slice();
    const total = uses.reduce((s, u) => s + Math.max(0, Math.round(+u.amount || 0)), 0);
    if ($('#useCount')) $('#useCount').textContent = uses.length ? `${uses.length}건 · ${total}P` : '아직 없어요';
    if ($('#useBadge')) $('#useBadge').textContent = String(uses.length);
    box.innerHTML = uses.length
      ? uses.map((u) => `<div class="use-row">
          <span class="use-date" title="${esc(u.date || '')} ${esc(u.at || '')}">${esc(fmtMD(u.date))}</span>
          <span class="use-title">${esc(u.title || '포인트 사용')}</span>
          <b class="use-amt">-${Math.max(0, Math.round(+u.amount || 0))}P</b>
          <button class="btn icon sm ghost parent-only" data-act="use-del" data-id="${u.id}" aria-label="사용 내역 되돌리기">✕</button>
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
    if (c.special === true && !isSpecialMissionToday(c, t)) return;
    ptsInit();
    const key = c.member || '';
    const isKid = key === KID_ID;
    const beforeXp = clamp(Math.round(+S.pokemon.xp || 0), 0, FINAL_P);
    const before = stageIndex(beforeXp);

    if (c.doneOn === t) {
      const undo = earnOf(c);
      if (isKid && window.PartnerGrowthCore) {
        S.pokemon.growth = PartnerGrowthCore.transition(S.pokemon.growth, beforeXp, Math.max(0,beforeXp-undo), 'keep-hatched').state;
      }
      addPoints(key, -undo);
      // 아이 미션 체크를 취소했을 때만 파트너 경험치도 되돌아갑니다 (포인트 사용으로는 절대 줄지 않음)
      if (isKid) S.pokemon.xp = clamp(beforeXp - undo, 0, FINAL_P);
      c.doneOn = null; c.doneAt = ''; c.earned = 0; c.goalMet = false; c.earlyBonusEarned = 0;
      dropLog(c.id);
      save(); renderMissions();
      toast(isKid ? `완료를 취소했어요 · 파트너 경험치 -${undo}P` : '완료를 취소했어요', '', 1600);
      return { earned: undo, isKid, checked: false };
    }

    const at = hhmm();
    const r = missionEarn(c, at);
    c.doneOn = t;
    c.doneAt = at;
    c.earned = r.earned;
    c.goalMet = r.goalMet;
    c.earlyBonusEarned = r.earlyBonus;
    addPoints(key, r.earned);
    // 파트너 경험치는 '아이(m3)'의 미션에서만 오릅니다. 성인 미션은 자기 통계에만 쌓여요.
    if (isKid) S.pokemon.xp = clamp(beforeXp + r.earned, 0, FINAL_P);
    addLog(c, r, at);
    if (isKid) eventAfterCheck(c, r, at);      // 🔥 콤보 · 🎂 2배 데이 보너스 (아이 미션만)

    let hatchEvent = false;
    if (isKid && window.PartnerGrowthCore) { const growth = PartnerGrowthCore.transition(S.pokemon.growth,beforeXp,S.pokemon.xp,'keep-hatched'); S.pokemon.growth = growth.state; hatchEvent = growth.event === 'hatch'; }
    const afterXp = clamp(Math.round(+S.pokemon.xp || 0), 0, FINAL_P);
    const after = stageIndex(afterXp);
    const justFinal = isKid && beforeXp < FINAL_P && afterXp >= FINAL_P;
    if (justFinal) registerDex(true);
    syncDex();
    save();
    renderMissions();

    if (hatchEvent) {
      if (!FB.on && window.PokemonEvolutionEffect) PokemonEvolutionEffect.show({from:{egg:true,name:'새 파트너 알'},to:stagesOf()[after],xp:afterXp,hatch:true});
    } else if (justFinal) {
      confetti(130);
      beep('up');
      showFinalDone(before);
    } else if (after > before) {
      confetti(90);
      beep('up');
      showLevelUp(after, before);
    } else if (r.earlyBonus) {
      confetti(40);
      beep('up');
      toast(`+${r.earned}P · 조기 완료 보너스 +${r.earlyBonus}P`, 'mint', 2600);
    } else if (c.due && r.goalMet) {
      toast(`+${r.earned}P · 마감 시간 안에 완료했어요`, 'mint', 2000);
    } else if (c.due) {
      toast(`+${r.earned}P · 마감 후 완료 · 시간 보너스 없음`, '', 2600);
    } else {
      toast(`+${r.earned}P ⭐ 잘했어요!`, 'mint', 1600);
    }
    return { earned: r.earned, isKid, checked: true };
  }

  /* ---- 미션 체크 순간: 누른 자리에서 '+NP ⚡'가 둥실 떠오름 ---- */
  function floatEarn(rect, pts, isKid) {
    if (!rect || !(pts > 0)) return;
    const el = document.createElement('div');
    el.className = 'earn-float' + (isKid ? '' : ' adult');
    el.textContent = `+${pts}P ⚡`;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // 포인트가 오를 때 게이지·스탯 카드를 한 번 톡 쳐서 눈에 띄게
  function pulseGauges() {
    [$('#evoBar'), $('#todayBarWrap')].forEach((el) => {
      if (!el) return;
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 900);
    });
    [$('#statXpCard'), $('#statCoinCard')].forEach((el) => {
      if (!el) return;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 700);
    });
  }

  function showLevelUp(lv, fromLevel = lv - 1) {
    const el = $('#levelup');
    const st = stagesOf();
    const p = partnerOf(S.pokemon.key);
    const stage = st[lv] || st[st.length - 1];
    if (window.PokemonEvolutionEffect) {
      window.PokemonEvolutionEffect.show({
        from: st[Math.max(0, fromLevel)] || st[0], to: stage,
        xp: Math.round(S.pokemon.xp), final: false,
      });
      return;
    }
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

  function showFinalDone(fromLevel = stagesOf().length - 2) {
    const el = $('#levelup');
    const p = partnerOf(S.pokemon.key);
    const fin = finalStageOf(p);
    if (window.PokemonEvolutionEffect) {
      window.PokemonEvolutionEffect.show({
        from: p.stages[Math.max(0, fromLevel)] || p.stages[0], to: fin,
        xp: Math.round(S.pokemon.xp), final: true,
      });
      return;
    }
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
      el.innerHTML = `⏰ ${esc(di.short)}<i class="dc-long"> · ${esc(di.long)}</i>`;
      // 마감이 지나면 줄 전체의 흐림(.overdue)도 시간이 가며 바로 반영합니다(다시 그리기 없이)
      const row = el.closest('.chore');
      if (row && !row.classList.contains('done') && !row.classList.contains('offday')) row.classList.toggle('overdue', di.cls === 'late');
    });
    $$('[data-earlychip]').forEach((el) => {
      const dueMin = minOf(el.dataset.due);
      const minutesLeft = dueMin == null || nowMin == null ? 0 : dueMin - nowMin;
      el.hidden = minutesLeft < 5;
      if (minutesLeft >= 5) el.textContent = minutesLeft >= 10 ? '⚡ 10분+ 전 +2P(총) · 5~9분 전 +1P' : '⚡ 5~9분 전 +1P';
    });
  }

  let partnerQuery = '';
  function renderPartnerGrid() {
    const grid = $('#partnerGrid');
    if (!grid) return;
    const q = partnerQuery.trim();
    const hit = (l) => !q
      || l.label.indexOf(q) >= 0
      || l.members.some((id) => pokeName(id).indexOf(q) >= 0)
      || String(l.members[0]) === q;
    const gen1 = LINES.filter((l) => l.members.some((id) => id <= 151) && l.key.charAt(0) === 'L' && hit(l));
    const extra = EXTRA_LINES.filter(hit);
    const card = (p) => {
      const on = resolvePartnerKey(S.pokemon.key) === p.key;
      const got = !!dexEntryOf(p.key);
      return `<button type="button" class="partner-card${on ? ' on' : ''}" data-partner="${p.key}" aria-pressed="${on}">
        <div class="partner-line">${p.stages.map((s) => `<span class="pstage">${pokeImg(s, 'pstage-img', s.tint || p.tint, { mini: true, shiny: !!s.shiny })}</span>`).join('<i class="pstage-arrow">›</i>')}</div>
        <div class="partner-name">${esc(p.label)}${on ? ' <b>사용 중</b>' : ''}${got ? ' <b class="got">🏆 도감</b>' : ''}</div>
        <div class="partner-stages">${p.stages.map((s) => `${esc(s.name)} ${s.min}P`).join(' · ')}</div>
      </button>`;
    };
    const total = gen1.length + extra.length;
    grid.innerHTML = (total ? '' : '<div class="shop-empty" style="grid-column:1/-1">찾는 포켓몬이 없어요</div>')
      + (gen1.length ? `<div class="partner-group-label">1세대 151 · ${gen1.length}계열</div>${gen1.map(card).join('')}` : '')
      + (extra.length ? `<div class="partner-group-label">다른 세대 친구 · ${extra.length}계열</div>${extra.map(card).join('')}` : '');
    if ($('#partnerCount')) $('#partnerCount').textContent = `${total}계열`;
    checkPokeImages();
  }

  let partnerMode = 'change';   // 'change' = 파트너 바꾸기 · 'adopt' = 새 포켓몬 입양

  function partnerHintText() {
    const p = partnerOf(S.pokemon.key);
    const cur = p.stages[stageIndex(S.pokemon.xp)];
    if (partnerMode === 'adopt') {
      return `지금 파트너 ${cur.name}는 도감에 그대로 남고, 새 포켓몬은 현재 파트너 경험치만 0P부터 다시 시작해요. 누적 경험치(${kidTotalPts()}P)와 사용 가능 포인트(${balancePts()}P)는 그대로 유지됩니다.`;
    }
    return `지금은 ${p.label} 계열 ${cur.name}(파트너 경험치 ${S.pokemon.xp}P)을(를) 키우는 중이에요. 1세대 151종 어느 계열이든 고를 수 있고, 200P에 닿으면 이로치가 되어 도감에 남아요.`;
  }

  function openPartnerPicker(mode = 'change') {
    partnerMode = mode === 'adopt' ? 'adopt' : 'change';
    partnerQuery = '';
    if ($('#partnerSearch')) $('#partnerSearch').value = '';
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
      S.pokemon.growth = window.PartnerGrowthCore ? PartnerGrowthCore.adopt(window.crypto && crypto.randomUUID ? crypto.randomUUID() : uid()+'-'+Date.now().toString(36)) : null;
      S.pokemon.xp = 0;               // 현재 파트너 경험치만 0P부터 (누적 경험치·잔액은 유지)
      save();
      renderMissions();
      renderSettings();
      $('#partnerModal').hidden = true;
      confetti(60);
      beep('up');
      toast(`🥚 ${p.label} 계열 새 알이에요 · 5XP에 부화해요`, 'mint', 3200);
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
  // 요일 빠른 선택
  const DAY_QUICKS = [
    { key: 'all', label: '매일', days: [] },
    { key: 'weekday', label: '평일(월~금)', days: [1, 2, 3, 4, 5] },
    { key: 'weekend', label: '주말(토·일)', days: [0, 6] },
  ];

  function missionMemberOptions() {
    return S.members.map((m) => ({ value: m.id, label: m.name })).concat([{ value: '', label: '공용(모두)' }]);
  }

  async function addMission(opts = {}) {
    const presetDays = Array.isArray(opts.days) ? normDays(opts.days) : [];
    const r = await askModal({
      title: opts.titleHint ? `미션 추가 · ${opts.titleHint}` : '미션 추가',
      hint: '마감 시간이 있는 미션은 5분 전 완료 시 +1P, 10분 이상 전 완료 시 +2P(총점) 조기 보너스를 받아요. 마감 시간이 없거나 마감 시각에 끝내면 기본 포인트만 쌓입니다.',
      fields: [
        { name: 'title', label: '미션', placeholder: '예: 신발 정리하기', value: opts.title || '' },
        { name: 'points', label: '기본 포인트 (P)', type: 'number', value: 3 },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: (S.members[S.members.length - 1] || {}).id || '' },
        { name: 'days', label: '언제 하는 미션인가요?', type: 'days', value: presetDays },
        { name: 'due', label: '목표 시간 (마감 시각)', type: 'time', value: '', quick: TIME_QUICK },
      ],
      okText: '추가',
    });
    if (!r || !r.title.trim()) return;
    const days = parseDays(r.days);
    S.missions.push({
      id: uid(),
      title: r.title.trim(),
      points: Math.max(0, Math.round(+r.points || 0)),
      due: r.due || '',
      bonus: 0,
      member: r.member || '',
      days,
      doneOn: null, doneAt: '', earned: 0, goalMet: false, earlyBonusEarned: 0,
    });
    save(); renderMissions();
    const dl = daysLabel(days);
    toast((r.due ? `미션을 추가했어요 · ${dl} · ${r.due} 마감 · 5~9분 전 +1P / 10분 이상 전 +2P(총)` : `미션을 추가했어요 · ${dl}`), 'mint');
  }

  function specialMissionWheelPath(index, total) {
    const start = -Math.PI / 2 + (index * Math.PI * 2) / total;
    const end = -Math.PI / 2 + ((index + 1) * Math.PI * 2) / total;
    const x1 = 100 + 94 * Math.cos(start), y1 = 100 + 94 * Math.sin(start);
    const x2 = 100 + 94 * Math.cos(end), y2 = 100 + 94 * Math.sin(end);
    return `M100 100 L${x1.toFixed(2)} ${y1.toFixed(2)} A94 94 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  }

  function specialMissionWheelGraphic() {
    const rewards = window.FamilySpecialMissionCore.POLICY.rewards;
    const colors = ['#fff2b8', '#f8cf55', '#fff8dc', '#efbd38', '#ffe58a'];
    const sectors = rewards.map((reward, i) => {
      const mid = -90 + (i + .5) * (360 / rewards.length);
      const rad = mid * Math.PI / 180;
      const x = 100 + 60 * Math.cos(rad);
      const y = 100 + 60 * Math.sin(rad);
      return `<path d="${specialMissionWheelPath(i, rewards.length)}" fill="${colors[i % colors.length]}" stroke="#a66a12" stroke-width="1.5"></path><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${mid + 90} ${x.toFixed(1)} ${y.toFixed(1)})">${reward.points}P</text>`;
    }).join('');
    return `<svg viewBox="0 0 200 200" aria-label="1P부터 5P까지 같은 크기로 보이는 특별 미션 돌림판">${sectors}</svg>`;
  }

  function specialMissionHash(text) {
    return Array.from(String(text)).reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 0);
  }

  function specialMissionTargetRotation(points) {
    const rewards = window.FamilySpecialMissionCore.POLICY.rewards;
    const index = Math.max(0, rewards.findIndex((reward) => reward.points === points));
    const segment = 360 / rewards.length;
    const targetWithinSegment = segment * (.32 + ((specialMissionHash(String(points) + ':' + Date.now()) % 36) / 100));
    return (360 * 5) + (360 - ((index * segment) + targetWithinSegment));
  }

  function specialMissionWait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function addSpecialMission() {
    const core = window.FamilySpecialMissionCore;
    if (!core || !core.validatePolicy()) {
      toast('특별 미션 정책을 불러오지 못했어요', 'coral', 2600);
      return;
    }
    const old = $('#specialMissionDialog');
    if (old) old.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'specialMissionDialog';
    dlg.className = 'special-mission-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="special-dialog-inner">
        <div class="special-dialog-head">
          <div>
            <div class="special-dialog-eyebrow">오늘의 부모 미션</div>
            <h3>특별 미션 만들기</h3>
          </div>
          <button type="button" class="special-dialog-close" aria-label="닫기">×</button>
        </div>
        <p class="special-dialog-hint">포인트 돌림판을 한 번 돌린 뒤 미션을 주세요. 포켓몬은 자동으로 골라져요.</p>
        <div class="special-field">
          <label for="specialMissionTitle">미션 이름</label>
          <input id="specialMissionTitle" maxlength="24" autocomplete="off" placeholder="예: 신발 정리하기">
        </div>
        <div class="special-wheel-block">
          <div class="special-wheel-frame" aria-hidden="true">
            <div class="special-wheel">${specialMissionWheelGraphic()}</div>
            <div class="special-wheel-hub">?</div>
          </div>
          <div class="special-wheel-status" aria-live="polite">돌림판을 돌려 주세요</div>
        </div>
        <div class="special-dialog-actions">
          <button type="button" class="special-spin-btn">돌림판 돌리기</button>
          <button type="button" class="special-submit-btn" disabled>특별 미션 주기</button>
        </div>
        <p class="special-dialog-note">오늘만 1회 · 기본 미션처럼 포인트와 경험치가 쌓여요</p>
      </form>`;
    document.body.appendChild(dlg);

    const titleInput = dlg.querySelector('#specialMissionTitle');
    const spinBtn = dlg.querySelector('.special-spin-btn');
    const submitBtn = dlg.querySelector('.special-submit-btn');
    const closeBtn = dlg.querySelector('.special-dialog-close');
    const wheel = dlg.querySelector('.special-wheel');
    const hub = dlg.querySelector('.special-wheel-hub');
    const status = dlg.querySelector('.special-wheel-status');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let points = 0;
    let spinning = false;
    const artSpecies = core.pickPokemon();

    closeBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('cancel', () => { spinning = true; });
    spinBtn.addEventListener('click', async () => {
      if (spinning || points) return;
      spinning = true;
      spinBtn.disabled = true;
      spinBtn.textContent = '돌아가는 중…';
      status.textContent = '두근두근… 포인트를 고르고 있어요';
      hub.textContent = '…';
      points = core.pickPoints();
      if (reduced) wheel.classList.add('no-motion');
      wheel.style.transform = `rotate(${specialMissionTargetRotation(points)}deg)`;
      await specialMissionWait(reduced ? 80 : 3350);
      spinning = false;
      hub.textContent = points;
      status.textContent = `+${points}P 특별 미션이에요`;
      submitBtn.disabled = false;
      submitBtn.focus();
    });

    submitBtn.addEventListener('click', () => {
      if (!points || spinning) return;
      const title = String(titleInput.value || '').trim();
      if (!title) {
        status.textContent = '미션 이름을 적어 주세요';
        titleInput.focus();
        return;
      }
      const today = todayStr();
      const mission = {
        id: uid(),
        title,
        points,
        due: '',
        weekendDue: '',
        bonus: 0,
        member: KID_ID,
        days: [new Date().getDay()],
        special: true,
        specialDate: today,
        specialPolicyVersion: core.POLICY_VERSION,
        artSpecies,
        doneOn: null,
        doneAt: '',
        earned: 0,
        goalMet: false,
        earlyBonusEarned: 0,
      };
      S.missions.push(mission);
      save(); renderMissions();
      dlg.close();
      toast(`특별 미션을 줬어요 · +${points}P · 오늘만 1회`, 'mint', 3200);
    });

    dlg.addEventListener('close', () => dlg.remove(), { once: true });
    dlg.showModal();
    setTimeout(() => titleInput.focus(), 0);
  }

  async function editSpecialMission(c) {
    const r = await askModal({
      title: '특별 미션 수정',
      hint: `포인트 ${Math.round(+c.points || 0)}P는 돌림판 결과 그대로 유지돼요. 제목만 고칠 수 있어요.`,
      fields: [{ name: 'title', label: '미션', value: c.title }],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') {
      if (c.doneOn === todayStr()) {
        addPoints(c.member || '', -earnOf(c));
        if ((c.member || '') === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp - earnOf(c), 0, FINAL_P);
        dropLog(c.id);
      }
      S.missions = S.missions.filter((x) => x.id !== c.id);
      save(); renderMissions();
      return;
    }
    if (!r || !r.title.trim()) return;
    c.title = r.title.trim();
    save(); renderMissions();
  }

  async function confirmStreakDeletion(mission) {
    const journal = window.FamilyStreak;
    if (!FB.on || !FB.readyData || !journal || !mission) return true;
    const date = journal.kstDate();
    const impact = journal.deletionImpact(FB.streak, date, mission.id);
    // A completed target whose log is retained is not affected by this delete.
    if (!impact || (impact.done && mission.doneOn !== todayStr())) return true;
    const answer = await askModal({
      title: '오늘 연속 달성 대상 미션이에요',
      hint: '이 미션은 오늘의 연속 달성 대상에 이미 기록됐어요. 삭제해도 오늘 대상에서 빠지지 않아 오늘을 모두 완료한 날로 만들 수 없어요. 이미 완료했다면 오늘 완료 기록도 취소돼요. 오늘 연속 기록을 지키려면 취소해 주세요.',
      fields: [], okText: '영향을 확인하고 삭제',
    });
    return !!answer;
  }

  async function editMission(id) {
    const c = S.missions.find((x) => x.id === id);
    if (!c) return;
    if (c.special === true) { await editSpecialMission(c); return; }
    const r = await askModal({
      title: '미션 수정',
      hint: '요일을 바꾸면 그 요일에만 오늘 미션으로 나옵니다. 마감 시간에 따른 조기 보너스만 적용되며, 예전 미션별 보너스 값은 무시됩니다.',
      fields: [
        { name: 'title', label: '미션', value: c.title },
        { name: 'points', label: '기본 포인트 (P)', type: 'number', value: basePtsOf(c) },
        { name: 'member', label: '누구 미션인가요?', type: 'select', options: missionMemberOptions(), value: c.member || '' },
        { name: 'days', label: '언제 하는 미션인가요?', type: 'days', value: daysOf(c) },
        { name: 'due', label: '목표 시간 (마감 시각)', type: 'time', value: c.due || '', quick: TIME_QUICK },
      ],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') {
      if (!await confirmStreakDeletion(c)) return;
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
    c.member = r.member || '';
    c.days = parseDays(r.days);

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
      c.earlyBonusEarned = rr.earlyBonus;
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
      if (m.doneOn === t) { m.doneOn = null; m.doneAt = ''; m.earned = 0; m.goalMet = false; m.earlyBonusEarned = 0; }
    });
    S.logs = (S.logs || []).filter((l) => l.date !== t);
    save(); renderMissions(); toast('포인트를 0으로 되돌렸어요');
  }

  /* ----------------------------------------------------------------- shopping */
  /* 사고 싶은 것 카드 안의 탭: wish(사고 싶은 것) · buy(장보기) · fridge(냉장고) */
  let shopTab = 'wish';
  function wishHeaderSubtitle(left = S.shopping.filter((x) => x.cat === 'buy' && !x.done).length) {
    const waiting = (S.wishlist || []).filter((w) => !w.boughtAt).length;
    const can = (S.wishlist || []).filter((w) => !w.boughtAt && +w.need > 0 && balancePts() >= +w.need).length;
    if (shopTab === 'wish') return `🪙 ${balancePts()}P · 위시 ${waiting}개${can ? ` · ${can} 가능` : ''}`;
    if (shopTab === 'buy') return left ? `장볼 것 ${left}개 남았어요` : '장보기 목록이 비었어요';
    return '냉장고에 있는 것을 적어 둬요';
  }

  function renderShopping() {
    $$('[data-shoptab]').forEach((b) => {
      const on = b.dataset.shoptab === shopTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const isShop = shopTab === 'buy' || shopTab === 'fridge';
    const wishPane = $('#wishPane');
    const shopPane = $('#shopPane');
    if (wishPane) wishPane.hidden = isShop;
    if (shopPane) shopPane.hidden = !isShop;
    const card = $('#cardWish');
    if (card) card.dataset.tab = shopTab;

    const items = S.shopping.filter((x) => x.cat === shopTab);
    const box = $('#shopList');
    if (box) {
      box.innerHTML = items.length
        ? items.map((x) => `<div class="shop-item ${x.done ? 'done' : ''}">
          <button class="check parent-only ${x.done ? 'on' : ''}" data-act="shop-toggle" data-id="${x.id}" aria-label="구매 완료">✓</button>
          <div class="shop-text">${esc(x.text)}</div>
          <button class="btn icon sm ghost parent-only" data-act="shop-del" data-id="${x.id}" aria-label="삭제">✕</button>
        </div>`).join('')
        : `<div class="shop-empty">${shopTab === 'buy' ? '살 것이 없어요. 위에서 추가해 보세요.' : '냉장고 메모가 비어 있어요.'}</div>`;
    }
    if ($('#shopInput')) {
      $('#shopInput').placeholder = shopTab === 'buy' ? '예: 우유, 계란, 사과' : '예: 김치 — 이번 주 안에 먹기';
    }
    // 카드 부제·배지: 지금 탭에 맞춰 바꿔 줍니다
    const left = S.shopping.filter((x) => x.cat === 'buy' && !x.done).length;
    if ($('#wishBadge')) {
      $('#wishBadge').textContent = left ? `🛒 ${left}` : '';
      $('#wishBadge').hidden = !left;
    }
    if ($('#wishSub')) $('#wishSub').textContent = wishHeaderSubtitle(left);
  }

  function addShopItem() {
    const inp = $('#shopInput');
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    S.shopping.unshift({ id: uid(), cat: shopTab === 'fridge' ? 'fridge' : 'buy', text: v, done: false });
    inp.value = '';
    save(); renderShopping();
  }

  /* ------------------------------------------------- 사고 싶은 것(위시리스트) */
  const wishItems = () => (S.wishlist || []);

  function renderWish() {
    const box = $('#wishList');
    if (!box) return;
    const bal = balancePts();
    // 아직 안 산 것을 위로, 선물 받은 것은 아래로
    const items = wishItems().slice().sort((a, b) => (a.boughtAt ? 1 : 0) - (b.boughtAt ? 1 : 0));
    const card = $('#cardWish');
    if (card) card.classList.toggle('is-empty', items.length === 0);
    if ($('#wishSub')) $('#wishSub').textContent = wishHeaderSubtitle();
    box.innerHTML = items.length
      ? items.map((w) => {
          const need = Math.max(0, Math.round(+w.need || 0));
          const bought = !!w.boughtAt;
          const can = !bought && need > 0 && bal >= need;
          const left = Math.max(0, need - bal);
          const pct = need > 0 ? clamp(Math.round((bal / need) * 100), 0, 100) : 0;
          const state = bought
            ? `🎉 ${esc(fmtMD(w.boughtAt))} 선물 받았어요`
            : (need <= 0
              ? '🪙 필요한 포인트를 적어 주면 얼마나 더 모아야 하는지 알려 줘요'
              : (can ? '✅ 지금 살 수 있어요!' : `🪙 ${left}P 더 모아야 해요`));
          const cat = wishCatOf(w.cat);
          return `<div class="wish-item${can ? ' now' : ''}${bought ? ' bought' : ''}" data-id="${w.id}">
            <div class="wish-main">
              <div class="wish-top">
                <span class="wish-tag ${esc(cat.key)}" title="분류: ${esc(cat.label)}">${cat.ico} ${esc(cat.label)}</span>
                <span class="wish-title">${esc(w.title)}</span>
                <span class="wish-need">${need > 0 ? need + 'P' : '—'}</span>
              </div>
              <div class="wish-state">${state}</div>
              <div class="wish-bar"><i style="width:${pct}%"></i></div>
            </div>
            <div class="wish-tools">
              ${bought ? '' : `<button class="btn sm ghost wish-gift parent-only" data-act="wish-buy" data-id="${w.id}" title="포인트를 써서 선물로 사 주기" aria-label="선물 사주기">🎁</button>`}
              <button class="btn icon sm ghost parent-only" data-act="wish-edit" data-id="${w.id}" aria-label="수정">✎</button>
              <button class="btn icon sm ghost parent-only" data-act="wish-del" data-id="${w.id}" aria-label="목록에서 지우기">✕</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="shop-empty" style="padding:12px 4px">갖고 싶은 것을 <b>＋</b>로 적어 보세요</div>';
  }

  async function addWish() {
    const r = await askModal({
      title: '🎁 사고 싶은 것 적기',
      hint: '갖고 싶은 물건을 적어 두면 지금 선물 코인으로 살 수 있는지 알려 줘요. 분류를 골라 두면 카드에 태그로 붙습니다.',
      fields: [
        { name: 'title', label: '갖고 싶은 것', placeholder: '예: 포켓몬 카드', voice: true, maxlength: 40 },
        { name: 'cat', label: '분류', type: 'select', value: 'etc', options: WISH_CATS.map((c) => ({ value: c.key, label: `${c.ico} ${c.label}` })) },
        { name: 'need', label: '필요한 포인트 (P · 비워도 됨)', type: 'number', value: '' },
      ],
      okText: '적기',
    });
    if (!r) return;
    const title = String(r.title || '').trim();
    if (!title) { toast('무엇을 갖고 싶은지 적어 주세요', 'coral', 2600); return; }
    S.wishlist.unshift({
      id: uid(), title: title.slice(0, 40), need: Math.max(0, Math.round(+r.need || 0)),
      cat: WISH_CAT_KEYS.indexOf(String(r.cat || '')) >= 0 ? String(r.cat) : 'etc',
      at: todayStr(), by: KID_ID, boughtAt: '',
    });
    save(); renderWish();
    toast('사고 싶은 것에 적었어요 🎁', 'mint');
  }

  /* ---- 🎤 사고 싶은 것 카드에서 바로 말로 적기 (모달 없이) ----
     카드 헤더의 🎤 를 누르면 그 자리에서 듣기 시작하고, 끝나면 지금 탭에 바로 넣습니다.
     · 🎁 사고 싶은 것 → 기본 분류(기타) · 필요 포인트 0 (부모가 나중에 채움)
     · 🛒 장보기 · 🧊 냉장고 → 기존 규칙대로 보호자 확인 뒤 추가 */
  let wishMicRec = null;
  function wishVoiceNote(msg, tone) {
    const el = $('#wishVoiceNote');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('on', tone === 'on');
    el.classList.toggle('warn', tone === 'warn');
  }
  function wishMicState(on) {
    const btn = $('#wishMicBtn');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? '듣기 멈추기' : '말로 적기');
    btn.title = on ? '듣기 멈추기' : '말로 적기(음성 입력)';
    btn.textContent = on ? '⏹' : '🎤';
  }
  function addVoiceItem(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (shopTab === 'wish') {
      S.wishlist.unshift({
        id: uid(), title: t.slice(0, 40), need: 0, cat: 'etc',
        at: todayStr(), by: KID_ID, boughtAt: '',
      });
      save(); renderWish(); renderShopping();
      wishVoiceNote(`🎁 “${t.slice(0, 40)}” 적었어요 · 분류·포인트는 ✎ 로 고칠 수 있어요`, 'on');
      toast('사고 싶은 것에 말로 적었어요 🎁', 'mint');
      setTimeout(() => wishVoiceNote(''), 4200);
      return;
    }
    asParent('장보기 목록은 보호자만 바꿀 수 있어요.', () => {
      S.shopping.unshift({ id: uid(), cat: shopTab === 'fridge' ? 'fridge' : 'buy', text: t.slice(0, 80), done: false });
      save(); renderShopping();
      wishVoiceNote(`${shopTab === 'fridge' ? '🧊' : '🛒'} “${t.slice(0, 80)}” 넣었어요`, 'on');
      setTimeout(() => wishVoiceNote(''), 4200);
    });
  }
  function wishVoiceFallback() {
    if (shopTab === 'wish') { addWish(); return; }
    if ($('#shopInput')) $('#shopInput').focus({ preventScroll: true });
  }
  function wishVoiceToggle() {
    if (wishMicRec) { try { wishMicRec.stop(); } catch (e) { /* 이미 끝났으면 넘어갑니다 */ } return; }
    if (!SpeechRec) { wishVoiceNote(VOICE_MSG.unsupported, 'warn'); toast(VOICE_MSG.unsupported, '', 3800); wishVoiceFallback(); return; }
    if (window.isSecureContext === false) { wishVoiceNote(VOICE_MSG.insecure, 'warn'); toast(VOICE_MSG.insecure, '', 3800); return; }
    if (voiceStop) voiceStop();          // 다른 칸이 듣고 있었으면 먼저 멈춥니다
    const rec = new SpeechRec();
    wishMicRec = rec;
    let finalText = '';
    let errored = false;
    const stop = () => { if (wishMicRec === rec) { try { rec.stop(); } catch (e) { /* noop */ } } };
    voiceStop = stop;
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;              // 한 마디 말하면 바로 끝내고 추가합니다
    rec.maxAlternatives = 1;
    rec.onstart = () => { wishMicState(true); wishVoiceNote('🎙️ 듣고 있어요… 말씀해 주세요', 'on'); };
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const now = (finalText + interim).trim();
      if (now) wishVoiceNote(`🎙️ ${now}`, 'on');
    };
    rec.onerror = (ev) => {
      errored = true;
      const msg = VOICE_MSG[ev.error] || '음성 입력을 하지 못했어요. 잠시 뒤 다시 해 주세요.';
      if (msg) { wishVoiceNote(msg, 'warn'); toast(msg, '', 3600); }
    };
    rec.onend = () => {
      wishMicState(false);
      if (wishMicRec === rec) wishMicRec = null;
      if (voiceStop === stop) voiceStop = null;
      const spoken = finalText.trim();
      if (spoken) addVoiceItem(spoken);
      else if (!errored) wishVoiceNote('잘 안 들렸어요. 🎤 를 다시 누르고 또박또박 말해 주세요.', 'warn');
    };
    try { rec.start(); }
    catch (e) {
      wishMicState(false); wishMicRec = null; voiceStop = null;
      wishVoiceNote('음성 입력을 시작하지 못했어요. 잠시 뒤 다시 해 주세요.', 'warn');
    }
  }

  async function editWish(id) {
    const w = wishItems().find((x) => x.id === id);
    if (!w) return;
    const r = await askModal({
      title: '사고 싶은 것 수정',
      hint: '필요한 포인트를 정해 두면 그만큼 모았을 때 "지금 살 수 있어요!"로 바뀝니다. 분류 태그도 여기서 바꿀 수 있어요.',
      fields: [
        { name: 'title', label: '갖고 싶은 것', value: w.title, voice: true, maxlength: 40 },
        { name: 'cat', label: '분류', type: 'select', value: wishCatOf(w.cat).key, options: WISH_CATS.map((c) => ({ value: c.key, label: `${c.ico} ${c.label}` })) },
        { name: 'need', label: '필요한 포인트 (P)', type: 'number', value: w.need || '' },
      ],
      okText: '저장',
      extraAction: { label: '삭제', act: 'del' },
    });
    if (r === 'del') {
      S.wishlist = S.wishlist.filter((x) => x.id !== id);
      save(); renderWish(); toast('목록에서 지웠어요');
      return;
    }
    if (!r || !String(r.title || '').trim()) return;
    w.title = String(r.title).trim().slice(0, 40);
    w.need = Math.max(0, Math.round(+r.need || 0));
    w.cat = WISH_CAT_KEYS.indexOf(String(r.cat || '')) >= 0 ? String(r.cat) : 'etc';
    save(); renderWish(); toast('저장했어요', 'mint');
  }

  async function deleteWish(id) {
    const w = wishItems().find((x) => x.id === id);
    if (!w) return;
    const r = await askModal({ title: '목록에서 지우기', hint: `'${w.title}' 항목을 사고 싶은 것 목록에서 지웁니다.`, okText: '지우기' });
    if (!r) return;
    S.wishlist = S.wishlist.filter((x) => x.id !== id);
    save(); renderWish(); toast('목록에서 지웠어요');
  }

  // 🎁 선물 사주기 — 포인트 사용으로 기록하고 선물 코인을 줄입니다 (경험치·진화는 그대로)
  async function buyWish(id) {
    const w = wishItems().find((x) => x.id === id);
    if (!w) return;
    const bal = balancePts();
    if (bal <= 0) { toast(`사용할 선물 코인이 없어요 (지금 ${bal}P)`, '', 2800); return; }
    const need = Math.max(0, Math.round(+w.need || 0));
    const r = await askModal({
      title: '🎁 선물 사주기',
      hint: `'${w.title}'을(를) 선물해요. 쓴 포인트만큼 선물 코인이 줄고, 포켓몬 경험치와 진화 단계는 그대로예요.`,
      fields: [
        { name: 'title', label: '산 물건 (포인트 사용 내역에 남겨요)', value: w.title },
        { name: 'amount', label: `사용 포인트 (지금 ${bal}P)`, type: 'number', value: need > 0 ? Math.min(bal, need) : bal },
      ],
      okText: '선물하기',
    });
    if (!r) return;
    const amount = Math.round(+r.amount || 0);
    const title = String(r.title || '').trim() || w.title;
    if (!(amount > 0)) { toast('사용 포인트를 1P 이상 적어 주세요', 'coral', 2800); return; }
    if (amount > balancePts()) { toast(`선물 코인이 ${balancePts()}P뿐이에요`, 'coral', 3000); return; }
    S.pointUses.unshift({ id: uid(), date: todayStr(), at: hhmm(), title: `${title} (선물)`, amount });
    w.boughtAt = todayStr();
    save(); renderWish(); renderMissions();
    confetti(60);
    toast(`🎁 선물했어요 · 남은 선물 코인 ${balancePts()}P`, 'mint', 3400);
  }

  /* ------------------------------------------------------------------ letters */
  const LETTER_MAX = 30;
  const LETTER_W = 1000;
  const LETTER_H = 580;

  const canvas = $('#letterCanvas');
  const ctx = canvas.getContext('2d');
  const pen = { color: '#2b3a55', width: 8, eraser: false, emoji: null };
  let drawing = false;
  let lastPt = null;
  let undoStack = [];
  let canvasDirty = false;

  const PEN_COLORS = ['#2b3a55', '#e5484d', '#f5a623', '#21a179', '#4f95ff', '#9b7bf0'];
  const PEN_WIDTHS = [6, 12, 22];
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
    ctx.font = '86px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
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
            <button class="btn sm ghost parent-only" data-act="letter-del" data-id="${l.id}" aria-label="삭제">🗑️</button>
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
    renderTabBadges();
  }

  /* ---- 상단 3탭: 🏠 대시보드 · ✏️ 손글씨 편지 · 🐾 포켓몬 놀이방 ---- */
  const APP_TABS = ['dash', 'letters', 'play', 'game'];
  let appTab = 'dash';
  const LETTERS_SEEN_KEY = 'family-dashboard:letters-seen';
  let lettersSeen = null;

  // 이 기기에서 아직 열어 보지 않은 편지 = 탭 배지 숫자 (앱 상태·Firestore에는 쓰지 않는 기기 메모)
  function lettersSeenIds() {
    if (lettersSeen) return lettersSeen;
    try {
      const raw = localStorage.getItem(LETTERS_SEEN_KEY);
      if (raw == null || raw === '') {
        // 처음 이 기기에서 열 때는 지금 있던 편지를 이미 본 것으로 시작합니다(배지가 갑자기 쏟아지지 않게)
        lettersSeen = new Set((S.letters || []).map((l) => l.id));
        persistLettersSeen();
      } else {
        lettersSeen = new Set(JSON.parse(raw) || []);
      }
    } catch (e) { lettersSeen = new Set((S.letters || []).map((l) => l.id)); }
    return lettersSeen;
  }
  function persistLettersSeen() {
    try { localStorage.setItem(LETTERS_SEEN_KEY, JSON.stringify([...lettersSeen].slice(-240))); } catch (e) { /* noop */ }
  }
  function markLetterSeen(id) {
    if (!id) return;
    const seen = lettersSeenIds();
    if (!seen.has(id)) { seen.add(id); persistLettersSeen(); renderTabBadges(); }
  }
  function markLettersAllSeen() {
    const seen = lettersSeenIds();
    let changed = false;
    (S.letters || []).forEach((l) => { if (!seen.has(l.id)) { seen.add(l.id); changed = true; } });
    if (changed) persistLettersSeen();
    renderTabBadges();
  }
  function renderTabBadges() {
    const badge = $('#tabLettersBadge');
    if (!badge) return;
    const seen = lettersSeenIds();
    const unread = (S.letters || []).filter((l) => !seen.has(l.id)).length;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.setAttribute('aria-label', `새로 온 편지 ${unread}장`);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function setAppTab(name) {
    appTab = APP_TABS.includes(name) ? name : 'dash';
    document.body.dataset.apptab = appTab;
    $$('.apptabs .at').forEach((b) => {
      const on = b.dataset.apptab === appTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const views = { dash: $('#mainGrid'), letters: $('#tabLetters'), play: $('#tabPlay'), game: $('#tabGame') };
    Object.keys(views).forEach((k) => { if (views[k]) views[k].hidden = k !== appTab; });
    if (appTab === 'letters') { renderLetters(); markLettersAllSeen(); }
    else if (appTab === 'play') renderPlayground();
    try { if (appTab !== 'dash') window.scrollTo(0, 0); } catch (e) { /* noop */ }
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
    markLetterSeen(id);
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
            <button class="btn icon sm ghost parent-only" data-act="wiki-edit" data-id="${w.id}" aria-label="수정">✎</button>
            <button class="btn icon sm ghost parent-only" data-act="wiki-del" data-id="${w.id}" aria-label="삭제">✕</button>
          </div>
        </div>`).join('') + '</div>';
    }).join('');
  }

  /* -------------------------------------------------------------------- school */
  function schoolToday() {
    const sc = S.school || {};
    return (sc.byDate && sc.byDate[todayStr()]) || null;
  }
  function listOf(v) {
    // 줄바꿈·쉼표로만 나눕니다 — '자율·자치활동'이나 '수육/쌈장' 같은 이름이 쪼개지지 않게
    return String(v || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  }
  function renderSchool() {
    const box = $('#schoolBody');
    if (!box) return;
    const sc = S.school || {};
    const name = String(sc.name || '').trim();
    const cls = String(sc.cls || '').trim();
    const today = schoolToday();
    const sub = $('#schoolSub');
    if (sub) sub.textContent = [name, cls].filter(Boolean).join(' · ') || '시간표 · 준비물 · 급식';
    const card = $('#cardSchool');
    if (!name && !today) {
      if (card) card.classList.add('is-empty');
      box.innerHTML = '<div class="shop-empty school-empty">학교 설정에서 오늘 시간표·준비물과 급식을 적으면 보여요</div>';
      return;
    }
    const meal = today ? listOf(today.meal) : [];
    const tt = today ? listOf(today.timetable) : [];
    const hasRecords = meal.length > 0 || tt.length > 0;
    if (card) card.classList.toggle('is-empty', !hasRecords);
    if (!hasRecords) {
      box.innerHTML = '<div class="shop-empty school-empty">오늘 시간표와 급식 정보가 아직 없어요</div>';
      return;
    }
    const chips = (arr, empty, extra, label) => {
      if (!arr.length) return `<span class="sch-none">${empty}</span>`;
      return arr.map((x) => `<span class="sch-chip ${extra || ''}" title="${esc(x)}">${esc(x)}</span>`).join('');
    };
    box.innerHTML = `<div class="sch-row">
        <span class="sch-tag meal">🍚 급식</span>
        <div class="sch-chips">${chips(meal, '오늘 급식이 아직 없어요', '', '급식')}</div>
      </div>
      <div class="sch-row">
        <span class="sch-tag time">📚 시간표 · 준비물</span>
        <div class="sch-chips">${chips(tt, '오늘 시간표가 아직 없어요', 'time', '시간표')}</div>
      </div>`;
  }

  function saveSchoolDay(patch) {
    if (!S.school) S.school = { name: '', cls: '', byDate: {} };
    if (!S.school.byDate) S.school.byDate = {};
    const key = todayStr();
    if (!S.school.byDate[key]) S.school.byDate[key] = { meal: '', timetable: '' };
    Object.assign(S.school.byDate[key], patch);
    save();
    renderSchool();
  }

  /* ---- 🏫 오늘 학교 → Firestore child_state/today_school (가족 읽기 · 부모 쓰기) ----
     부모가 급식·시간표를 고쳐 저장하면 아이 기기·태블릿이 그대로 읽어 갑니다.
     값은 비공개 Firestore 에만 들어가고, 공개 코드에는 예시 문구만 둡니다. */
  /* var → 함수 선언보다 먼저 save()가 불려도 안전합니다 */
  var schoolSyncTimer = null;
  var schoolSyncedSig = '';
  function schoolDocPayload() {
    const sc = S.school || {};
    return { name: sc.name || '', cls: sc.cls || '', byDate: sc.byDate || {} };
  }
  function schoolSigOf(d) {
    const byDate = (d && d.byDate) || {};
    return JSON.stringify([
      String((d && d.name) || ''), String((d && d.cls) || ''),
      Object.keys(byDate).sort().map((k) => [k, String((byDate[k] && byDate[k].meal) || ''), String((byDate[k] && byDate[k].timetable) || '')]),
    ]);
  }
  function schoolSyncMaybe(force) {
    const fb = fbReady();
    if (!fb || !fb.on || fb.role !== 'parent' || !fb.sync || typeof fb.sync.pushSchool !== 'function') return;
    // 첫 구독(서버 문서 도착) 전에는 올리지 않습니다 — 빈 값이 서버의 급식·시간표를 덮어쓰는 일을 막습니다
    if (!fb.readyData) return;
    const payload = schoolDocPayload();
    const sig = schoolSigOf(payload);
    if (!force && sig === schoolSyncedSig) return;
    schoolSyncedSig = sig;
    clearTimeout(schoolSyncTimer);
    schoolSyncTimer = setTimeout(() => {
      fb.sync.pushSchool(payload).then((r) => {
        if (r && !r.ok && !r.cancelled) toast('학교 급식·시간표를 서버에 못 보냈어요 (이 기기에는 남아 있어요)', '', 3600);
      }).catch(() => {});
    }, 600);
  }
  function applySchoolDoc(doc) {
    if (!doc || typeof doc !== 'object') return;
    const by = (doc.byDate && typeof doc.byDate === 'object') ? doc.byDate : {};
    const next = { name: String(doc.name || '').trim(), cls: String(doc.cls || '').trim(), byDate: {} };
    Object.keys(by).forEach((k) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const v = by[k] || {};
      next.byDate[k] = { meal: String(v.meal || ''), timetable: String(v.timetable || '') };
    });
    const sig = schoolSigOf(next);
    if (sig === schoolSyncedSig) return;
    schoolSyncedSig = sig;                       // 서버에서 받은 값은 다시 보내지 않습니다
    if (!S.school) S.school = { name: '', cls: '', byDate: {} };
    if (next.name) S.school.name = next.name;
    if (next.cls) S.school.cls = next.cls;
    Object.keys(next.byDate).forEach((k) => { S.school.byDate[k] = next.byDate[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
    renderSchool();
  }

  async function editSchoolCard() {
    const today = schoolToday() || { meal: '', timetable: '' };
    const r = await askModal({
      title: '오늘 학교',
      hint: '학교 이름·반은 이 기기에 저장되고, 오늘 시간표·준비물과 급식은 날짜별로 저장됩니다.',
      fields: [
        { name: 'name', label: '학교 이름', value: S.school.name || '', placeholder: '예: ○○초등학교' },
        { name: 'cls', label: '반', value: S.school.cls || '', placeholder: '예: 2학년 3반' },
        { name: 'meal', label: '오늘 급식', type: 'textarea', value: today.meal || '', placeholder: '식단을 쉼표나 줄바꿈으로 적기' },
        { name: 'timetable', label: '오늘 시간표 · 준비물', type: 'textarea', value: today.timetable || '', placeholder: '수업과 필요한 준비물을 적기' },
      ],
      okText: '저장',
    });
    if (!r) return;
    S.school.name = (r.name || '').trim();
    S.school.cls = (r.cls || '').trim();
    saveSchoolDay({ meal: r.meal || '', timetable: r.timetable || '' });
    renderSettings();
    toast('오늘 학교 정보를 저장했어요', 'mint');
  }

  async function editSchoolDay(which) {
    const today = schoolToday() || { meal: '', timetable: '' };
    const isMeal = which === 'meal';
    const cur = isMeal ? (today.meal || '') : (today.timetable || '');
    const r = await askModal({
      title: isMeal ? '오늘 급식' : '오늘 시간표 · 준비물',
      hint: isMeal ? '급식 식단을 쉼표나 줄바꿈으로 나눠 적어 주세요.' : '오늘 수업과 필요한 준비물을 쉼표나 줄바꿈으로 적어 주세요.',
      fields: [{
        name: 'v',
        label: isMeal ? '급식 식단' : '시간표 · 준비물',
        type: 'textarea',
        value: cur,
        placeholder: isMeal ? '식단을 쉼표나 줄바꿈으로 적기' : '수업과 필요한 준비물을 적기',
      }],
      okText: '저장',
      extraAction: cur ? { label: '지우기', act: 'del' } : null,
    });
    if (r === 'del') { saveSchoolDay(isMeal ? { meal: '' } : { timetable: '' }); toast('지웠어요'); return; }
    if (!r) return;
    saveSchoolDay(isMeal ? { meal: r.v || '' } : { timetable: r.v || '' });
    toast('오늘 학교 정보를 저장했어요', 'mint');
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

  /* ------------------------------------------------------- 음성 입력(말로 쓰기) */
  // Web Speech API — 크롬·삼성 인터넷·엣지 등에서 동작하고, 아이폰 사파리는 지원이 들쭉날쭉합니다.
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let voiceStop = null;          // 지금 듣고 있는 인식기를 멈추는 함수(한 번에 하나만 듣습니다)
  const VOICE_MSG = {
    unsupported: '이 브라우저에서는 음성 인식을 지원하지 않아요. 키보드의 마이크 버튼을 이용해 주세요.',
    insecure: '음성 입력은 https 주소에서만 쓸 수 있어요. 키보드의 마이크 버튼을 이용해 주세요.',
    'not-allowed': '마이크 사용이 허락되지 않았어요. 주소창의 자물쇠에서 마이크를 허용하거나, 키보드의 마이크 버튼을 이용해 주세요.',
    'service-not-allowed': '이 브라우저에서는 음성 인식을 쓸 수 없어요. 키보드의 마이크 버튼을 이용해 주세요.',
    'audio-capture': '마이크를 찾지 못했어요. 마이크가 켜져 있는지 확인해 주세요.',
    'no-speech': '잘 안 들렸어요. 🎤 를 다시 누르고 또박또박 말해 주세요.',
    network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요.',
    'language-not-supported': '한국어 음성 인식을 쓸 수 없는 브라우저예요. 키보드의 마이크 버튼을 이용해 주세요.',
    aborted: '',
  };

  // 입력칸 하나에 🎤 버튼을 붙입니다. 한 번 누르면 듣고, 다시 누르면 멈춥니다.
  function attachVoiceInput({ input, btn, note = null, onEnd = null }) {
    let rec = null;
    let base = '';
    let finalText = '';
    let errored = false;
    const setNote = (msg, tone) => {
      if (!note) return;
      note.hidden = !msg;
      note.textContent = msg || '';
      note.classList.toggle('on', tone === 'on');
      note.classList.toggle('warn', tone === 'warn');
    };
    const setOn = (on) => {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? '듣기 멈추기' : '말로 쓰기');
      btn.title = on ? '듣기 멈추기' : '말로 쓰기(음성 입력)';
      btn.textContent = on ? '⏹' : '🎤';
    };
    const stop = () => { if (rec) { try { rec.stop(); } catch (e) { /* 이미 끝났으면 그냥 넘어갑니다 */ } } };
    const start = () => {
      if (!SpeechRec) { setNote(VOICE_MSG.unsupported, 'warn'); toast(VOICE_MSG.unsupported, '', 3800); return; }
      if (window.isSecureContext === false) { setNote(VOICE_MSG.insecure, 'warn'); toast(VOICE_MSG.insecure, '', 3800); return; }
      if (voiceStop) voiceStop();          // 다른 칸이 듣고 있었으면 먼저 멈춥니다
      voiceStop = stop;
      errored = false;
      finalText = '';
      base = input.value.trim() ? input.value.replace(/\s+$/, '') + ' ' : '';
      try { rec = new SpeechRec(); } catch (e) { setNote(VOICE_MSG.unsupported, 'warn'); return; }
      rec.lang = 'ko-KR';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        setOn(true);
        setNote('🎙️ 듣고 있어요… 말씀해 주세요 (끝나면 🎤 를 다시 눌러 주세요)', 'on');
      };
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        input.value = base + finalText + interim;   // 말하는 동안에도 입력칸에 바로 보입니다
      };
      rec.onerror = (ev) => {
        errored = true;
        const msg = VOICE_MSG[ev.error] || '음성 입력을 하지 못했어요. 잠시 뒤 다시 해 주세요.';
        setNote(msg, 'warn');
        if (ev.error !== 'aborted' && msg) toast(msg, '', 3600);
      };
      rec.onend = () => {
        setOn(false);
        if (!errored && note && note.classList.contains('on')) setNote('');
        const spoken = finalText.trim();
        rec = null;
        if (voiceStop === stop) voiceStop = null;
        if (onEnd) onEnd(spoken);
      };
      try { rec.start(); input.focus({ preventScroll: true }); }
      catch (e) { setNote('음성 입력을 시작하지 못했어요. 잠시 뒤 다시 해 주세요.', 'warn'); setOn(false); voiceStop = null; rec = null; }
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (rec) stop(); else start();
    });
    return stop;
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
        if (f.voice) {
          // 말로 쓰기 — 입력칸 옆에 🎤 버튼을 붙입니다(버튼은 label 밖에 두어 클릭이 입력칸으로 새지 않게)
          return `<div class="field voice-field">
            <label for="${id}">${esc(f.label)}</label>
            <span class="field-row">
              <input type="${f.type || 'text'}" name="${esc(f.name)}" id="${id}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"${f.inputmode ? ` inputmode="${esc(f.inputmode)}"` : ''}${f.maxlength ? ` maxlength="${Math.round(+f.maxlength)}"` : ''} autocomplete="off" />
              <button type="button" class="mic-btn" data-voice="${esc(f.name)}" aria-pressed="false" aria-label="말로 쓰기" title="말로 쓰기(음성 입력)">🎤</button>
            </span>
            <span class="voice-note" data-voicenote="${esc(f.name)}" hidden></span>
          </div>`;
        }
        if (f.type === 'days') {
          const cur = normDays(f.value);
          const onDay = (n) => (cur.length ? cur.indexOf(n) >= 0 : true);   // 비어 있으면 매일 = 7일 모두 켜짐
          return `<div class="field">${esc(f.label)}
            <span class="days-field" data-daysfield="${esc(f.name)}">
              <input type="hidden" name="${esc(f.name)}" id="${id}" value="${cur.join(',')}">
              <span class="quick-row">${DAY_QUICKS.map((q) => `<button type="button" class="qchip${sameDays(cur, q.days) ? ' on' : ''}" data-dayquick="${q.key}">${esc(q.label)}</button>`).join('')}</span>
              <span class="day-row">${DAY_ORDER.map((n) => `<button type="button" class="day-toggle${onDay(n) ? ' on' : ''}" data-day="${n}" aria-pressed="${onDay(n) ? 'true' : 'false'}">${DAYS[n]}</button>`).join('')}</span>
              <span class="day-sum" data-daysum>${esc(daysLabel(cur))}</span>
            </span>
          </div>`;
        }
        return `<label class="field">${esc(f.label)}<input type="${f.type || 'text'}" name="${esc(f.name)}" id="${id}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"${f.inputmode ? ` inputmode="${esc(f.inputmode)}"` : (f.type === 'number' ? ' inputmode="numeric"' : '')}${f.maxlength ? ` maxlength="${Math.round(+f.maxlength)}"` : ''}${f.autocomplete ? ` autocomplete="${esc(f.autocomplete)}"` : ''}>${f.quick && f.quick.length
          ? `<span class="quick-row">${f.quick.map((v) => `<button type="button" class="qchip" data-quick="${esc(f.name)}" data-val="${esc(v)}">${esc(v)}</button>`).join('')}</span>`
          : ''}</label>`;
      }).join('');

      // 🎤 말로 쓰기 — 필드에 voice: true 를 주면 입력칸 옆 마이크가 붙습니다
      $$('[data-voice]', modal).forEach((btn) => {
        const input = $('#mf_' + btn.dataset.voice);
        if (!input) return;
        attachVoiceInput({ input, btn, note: $(`[data-voicenote="${btn.dataset.voice}"]`, modal) });
      });

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

      // 요일 빠른 선택·개별 토글 — 숨은 입력에 '1,2,3' 형태로 담아 둡니다
      $$('[data-daysfield]', modal).forEach((box) => {
        const input = $('#mf_' + box.dataset.daysfield);
        if (!input) return;
        const setDays = (arr) => {
          const d = normDays(arr);
          input.value = d.join(',');
          const active = d.length ? d : [0, 1, 2, 3, 4, 5, 6];
          $$('.day-toggle', box).forEach((b) => {
            const on = active.indexOf(+b.dataset.day) >= 0;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          $$('[data-dayquick]', box).forEach((b) => {
            const q = DAY_QUICKS.find((x) => x.key === b.dataset.dayquick);
            b.classList.toggle('on', !!q && sameDays(d, q.days));
          });
          const sum = $('[data-daysum]', box);
          if (sum) sum.textContent = daysLabel(d);
        };
        $$('[data-dayquick]', box).forEach((b) => {
          b.onclick = (ev) => {
            ev.preventDefault();
            const q = DAY_QUICKS.find((x) => x.key === b.dataset.dayquick);
            if (q) setDays(q.days);
          };
        });
        $$('.day-toggle', box).forEach((b) => {
          b.onclick = (ev) => {
            ev.preventDefault();
            const cur = parseDays(input.value);
            const base = cur.length ? cur.slice() : [0, 1, 2, 3, 4, 5, 6];
            const n = +b.dataset.day;
            const i = base.indexOf(n);
            if (i >= 0) { if (base.length === 1) return; base.splice(i, 1); } else base.push(n);
            setDays(base);
          };
        });
      });

      const actions = $('.modal-actions', modal);
      actions.innerHTML = (extraAction ? `<button class="btn" type="button" data-extra style="margin-right:auto;color:var(--coral)">${esc(extraAction.label)}</button>` : '') +
        `<button class="btn" type="button" data-modal-cancel>취소</button>
         <button class="btn primary" type="button" data-modal-ok>${esc(okText)}</button>`;

      const finish = (val) => {
        if (voiceStop) { const s = voiceStop; voiceStop = null; s(); }   // 창을 닫으면 듣던 것도 멈춥니다
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
    if ($('#titleInput')) $('#titleInput').value = S.dashboardTitle || '';
    if ($('#adultToggle')) $('#adultToggle').checked = !!S.showAdultMissions;
    if ($('#pinInput')) $('#pinInput').value = '';
    $('#locPill').textContent = S.location ? `📍 ${S.location.name}` : '기본 위치(서울)';
    $('#latInput').value = S.location ? S.location.lat : '';
    $('#lonInput').value = S.location ? S.location.lon : '';
    $('#memberList').innerHTML = S.members.map((m) => `<span class="member-chip">
        <span class="mdot" style="background:${esc(m.color)}"></span>${esc(m.name)}
        <button class="btn icon sm ghost" data-act="member-edit" data-id="${m.id}" aria-label="이름 변경">✎</button>
      </span>`).join('');
    $('#quietToggle').checked = !!S.quiet;
    if ($('#schoolNameInput')) $('#schoolNameInput').value = (S.school && S.school.name) || '';
    if ($('#schoolClassInput')) $('#schoolClassInput').value = (S.school && S.school.cls) || '';
    if ($('#partnerPill')) $('#partnerPill').textContent = `${partnerOf(S.pokemon.key).label} 계열`;
    try {
      const bytes = new Blob([JSON.stringify(S)]).size;
      $('#storageNote').textContent = `지금 저장된 데이터 약 ${(bytes / 1024).toFixed(0)}KB · 브라우저 한도 약 5MB`;
    } catch (e) { $('#storageNote').textContent = ''; }
    renderAlarmSettings();      // ⏰ 맞춤 알람·소리 상태·다음 알람
  }

  // 설정은 보호자만 — 부모 모드가 잠겨 있으면 PIN을 먼저 받습니다
  function openSettings() {
    renderSettings();
    fbSyncInfo();
    $('#settingsModal').hidden = false;
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

  /* ---------------------------------------------- 파트너 포켓몬 터치 반응
     포켓몬을 누르면 점프 + 하트·반짝이 + 귀여운 말풍선이 나옵니다. */
  const POKE_LINES = [
    '히히, 간지러워!',
    '{n}, 오늘도 같이 놀자!',
    '미션 하나 끝내 볼까?',
    '한 번 더 불러 줘!',
    '같이 있으니까 신나!',
    '으라차! 힘내자!',
    '오늘도 최고야!',
    '뽀뽀~ 쪽!',
    '내가 응원할게!',
    '{n} 냠냠, 배고파!',
  ];
  let lastPokeLine = -1;
  function pokeLine(name) {
    let i = Math.floor(Math.random() * POKE_LINES.length);
    if (i === lastPokeLine) i = (i + 1) % POKE_LINES.length;
    lastPokeLine = i;
    return POKE_LINES[i].replace('{n}', name || '친구');
  }
  // 짧고 작은 소리 (절전 모드에서는 조용히)
  let pokeAudio = null;
  function pokeChirp() {
    if (S.quiet) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!pokeAudio) pokeAudio = new Ctx();
      if (pokeAudio.state === 'suspended') pokeAudio.resume();
      [1046, 1568].forEach((f, i) => {
        const o = pokeAudio.createOscillator();
        const g = pokeAudio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const t = pokeAudio.currentTime + i * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.1, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(pokeAudio.destination);
        o.start(t);
        o.stop(t + 0.18);
      });
    } catch (e) { /* 소리는 없어도 괜찮아요 */ }
  }

  /* host: 포켓몬 그림을 감싼 칸, say: 말풍선 요소 */
  function pokeReact(host, say, name, opts = {}) {
    if (!host) return;
    const img = host.querySelector('img');
    if (img) {
      img.classList.remove('poke-jump');
      void img.offsetWidth;
      img.classList.add('poke-jump');
      setTimeout(() => img.classList.remove('poke-jump'), 900);
    }
    host.classList.remove('poke-wiggle');
    if (opts.wiggle) {
      void host.offsetWidth;
      host.classList.add('poke-wiggle');
      setTimeout(() => host.classList.remove('poke-wiggle'), 700);
    }
    const fx = document.createElement('div');
    fx.className = 'poke-fx';
    fx.setAttribute('aria-hidden', 'true');
    const kinds = ['💛', '💖', '✨', '⭐', '💫', '💕', '🌟'];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.textContent = kinds[i % kinds.length];
      s.style.setProperty('--x', (Math.random() * 150 - 75).toFixed(0) + 'px');
      s.style.setProperty('--d', (i * 0.05).toFixed(2) + 's');
      s.style.setProperty('--r', (Math.random() * 70 - 35).toFixed(0) + 'deg');
      fx.appendChild(s);
    }
    host.appendChild(fx);
    setTimeout(() => fx.remove(), 1700);
    if (say) {
      say.textContent = String(opts.text || pokeLine(name));
      say.classList.remove('on');
      void say.offsetWidth;
      say.classList.add('on');
      clearTimeout(say._hideTimer);
      say._hideTimer = setTimeout(() => say.classList.remove('on'), opts.holdMs || 3200);
    }
    pokeChirp();
  }

  /* ==========================================================================
     🎪 가족 이벤트 (2026-11-18 추가)
       ① 3일 연속 콤보 보너스      ② 부모님 깜짝 보너스 · 주말 특별 미션
       ③ 생일·명절 2배 데이        ④ 오늘의 비밀 미션 상자
       ⑤ 월말 MVP 상장             ⑥ 50P마다 가족 쿠폰 뽑기

     저장 위치(규칙 확인 완료 — firestore.rules 수정 없음)
       · 이 기기: localStorage (S.event7)
       · 가족 공유: households/main/child_state/event_center
         → 기존 규칙 `match /households/{hh}/child_state/{docId}` : 가족 읽기 · 부모 쓰기
       · 기존 이벤트 보너스는 logs 문서에 남겨 정산(settleUnsettled) 때 합산합니다.
       · 공유 도장판의 +3P 는 stats/summary 의 진행 필드와 정산 트랜잭션에서 한 번 확정합니다.
     ========================================================================== */
  const SECRET_POOL = [
    '가족에게 안마 5분 ❤️', '고마운 사람에게 쪽지 한 장 ✍️', '책 10분 소리 내어 읽기 📚',
    '장난감 정리 5분 🧺', '물 한 컵 마시고 스트레칭 💧', '오늘 하루 칭찬 3번 듣기 🌟',
    '양말 정리 돕기 🧦', '식탁 닦기 한 번 🍽️',
  ];

  function event7Default() {
    return {
      combo: { on: true, bonus: 3 },
      doubleDays: [],
      secret: { date: '', title: '', points: 3, opened: false, done: false },
      stamps: { baseball: { n: 0, done: 0 }, reading: { n: 0, done: 0 } },
      gacha: {
        step: 50,
        rewards: [
          { id: 'g1', label: '아이스크림 🍦', weight: 26 },
          { id: 'g2', label: '게임 30분 🎮', weight: 22 },
          { id: 'g3', label: '좋아하는 간식 🍪', weight: 20 },
          { id: 'g4', label: '영화 한 편 🎬', weight: 14 },
          { id: 'g5', label: '늦잠 30분 😴', weight: 10 },
          { id: 'g6', label: '장난감 5,000원 🧸', weight: 8 },
        ],
        draws: [],
      },
    };
  }

  function normalizeEvent7(raw) {
    const base = event7Default();
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const combo = (src.combo && typeof src.combo === 'object') ? src.combo : {};
    const sc = (src.secret && typeof src.secret === 'object') ? src.secret : {};
    const st = (src.stamps && typeof src.stamps === 'object') ? src.stamps : {};
    const g = (src.gacha && typeof src.gacha === 'object') ? src.gacha : {};
    const board = (b) => {
      const x = (b && typeof b === 'object') ? b : {};
      return { n: clamp(Math.round(+x.n || 0), 0, 9), done: clamp(Math.round(+x.done || 0), 0, 999) };
    };
    const rewards = (Array.isArray(g.rewards) && g.rewards.length ? g.rewards : base.gacha.rewards)
      .filter((r) => r && String(r.label || '').trim())
      .slice(0, 12)
      .map((r, i) => ({
        id: String(r.id || `g${i + 1}`).slice(0, 12),
        label: String(r.label).trim().slice(0, 30),
        weight: clamp(Math.round(+r.weight || 1), 1, 100),
      }));
    return {
      combo: { on: combo.on !== false, bonus: clamp(Math.round(+combo.bonus || base.combo.bonus), 1, 10) },
      doubleDays: (Array.isArray(src.doubleDays) ? src.doubleDays : [])
        .filter((d) => d && isDateStr(d.date))
        .slice(0, 40)
        .map((d, i) => ({ id: String(d.id || `d${i + 1}`).slice(0, 12), date: d.date, label: String(d.label || '2배 데이').slice(0, 24) })),
      secret: {
        date: isDateStr(sc.date) ? sc.date : '',
        title: String(sc.title || '').slice(0, 40),
        points: clamp(Math.round(+sc.points || 3), 1, 20),
        opened: !!sc.opened,
        done: !!sc.done,
      },
      stamps: { baseball: board(st.baseball), reading: board(st.reading) },
      gacha: {
        step: clamp(Math.round(+g.step || 50), 10, 500),
        rewards: rewards.length ? rewards : base.gacha.rewards,
        draws: (Array.isArray(g.draws) ? g.draws : [])
          .filter((d) => d && isDateStr(d.date))
          .slice(-300)
          .map((d, i) => ({
            id: String(d.id || `r${i + 1}`).slice(0, 14),
            date: d.date,
            at: String(d.at || '').slice(0, 5),
            label: String(d.label || '').slice(0, 30),
            step: Math.max(0, Math.round(+d.step || 0)),
          })),
      },
    };
  }

  const EV = () => (S.event7 && typeof S.event7 === 'object' ? S.event7 : (S.event7 = event7Default()));

  /* ---- ③ 2배 데이 — 지정일 + 위키 생신·기념일 ---- */
  function doubleDayOn(dateStr = todayStr()) {
    const hit = (EV().doubleDays || []).find((d) => d.date === dateStr);
    if (hit) return { on: true, label: hit.label || '2배 데이', auto: false, id: hit.id };
    const marks = wikiMarksOn(dateStr);
    if (marks.length) return { on: true, label: marks[0], auto: true, id: '' };
    return { on: false, label: '', auto: false, id: '' };
  }

  /* ---- ① 3일 연속 콤보 — 어제·그제 같은 미션을 끝냈는지 ---- */
  function comboPrevOk(mid) {
    const d1 = fmtDate(addDays(new Date(), -1));
    const d2 = fmtDate(addDays(new Date(), -2));
    const has = (ds) => (S.logs || []).some((l) => l && l.mid === mid && l.date === ds && l.kind !== 'bonus');
    return has(d1) && has(d2);
  }
  function comboStreakToday() {
    const t = todayStr();
    const y = fmtDate(addDays(new Date(), -1));
    const mids = new Set((S.logs || []).filter((l) => l.date === t && l.kind !== 'bonus').map((l) => l.mid));
    return [...mids].filter((mid) => (S.logs || []).some((l) => l.mid === mid && l.date === y && l.kind !== 'bonus')).length;
  }

  /* ---- 보너스 포인트 적립 — 로그 1건 + 로컬 포인트 ----
     같은 날 같은 key 로는 한 번만 들어갑니다. 부모 기기(Firebase)면 같은 기록을
     logs/{date}_{mid}_m3 문서로도 남겨 정산에 합산됩니다(규칙: 부모 create 허용). */
  function awardBonus(pts, title, keyId, opts = {}) {
    const p = clamp(Math.round(+pts || 0), 0, 200);
    if (!p) return 0;
    const t = todayStr();
    const mid = String(keyId || ('bonus_' + uid())).slice(0, 60);
    if ((S.logs || []).some((l) => l && l.mid === mid && l.date === t)) return 0;
    const at = hmmSafe(opts.at);
    addPoints(KID_ID, p);
    if (!Array.isArray(S.logs)) S.logs = [];
    S.logs.unshift({
      id: mid, date: t, at, mid,
      title: String(title || '보너스').slice(0, 60), member: KID_ID,
      base: p, bonus: 0, earned: p, due: '', goalMet: false, kind: 'bonus',
    });
    S.logs = keepLogs(S.logs);
    save();
    fbPushBonusDoc({ date: t, at, mid, title: String(title || '보너스').slice(0, 60), points: p });
    return p;
  }
  const hmmSafe = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? pad(+String(v).split(':')[0]) + ':' + String(v).split(':')[1] : hhmm());

  /* ---- FB 상태 안전 접근 (모듈 초기화 전에도 안전) ---- */
  function fbReady() {
    try { return typeof FB === 'undefined' ? null : FB; } catch (e) { return null; }
  }
  function fbPushBonusDoc(entry) {
    const fb = fbReady();
    if (!fb || !fb.on || fb.role !== 'parent' || !fb.sync || typeof fb.sync.writeBonusLog !== 'function') return;
    fb.sync.writeBonusLog(entry).then((r) => {
      if (r && !r.ok && !r.cancelled) toast('보너스 기록을 서버에 못 보냈어요 (이 기기에는 남아 있어요)', '', 3800);
    }).catch(() => {});
  }

  /* ---- 이벤트 설정·상태 → Firestore child_state/event_center (부모만 쓰기) ---- */
  let evtSyncTimer = null;
  let evtSig = '';
  function eventCenterPayload() {
    const e = EV();
    return { combo: e.combo, doubleDays: e.doubleDays, secret: e.secret, stamps: e.stamps, gacha: e.gacha };
  }
  function evtSyncMaybe() {
    const fb = fbReady();
    if (!fb || !fb.on || fb.role !== 'parent' || !fb.sync || typeof fb.sync.pushEventCenter !== 'function') return;
    const payload = eventCenterPayload();
    const sig = JSON.stringify(payload);
    if (sig === evtSig) return;
    evtSig = sig;
    clearTimeout(evtSyncTimer);
    evtSyncTimer = setTimeout(() => {
      fb.sync.pushEventCenter(payload).catch(() => {});
    }, 700);
  }
  function applyEventCenterDoc(doc) {
    if (!doc || typeof doc !== 'object') return;
    const next = normalizeEvent7(Object.assign({}, eventCenterPayload(), {
      combo: doc.combo, doubleDays: doc.doubleDays, secret: doc.secret, stamps: doc.stamps, gacha: doc.gacha,
    }));
    const sig = JSON.stringify(next);
    if (sig === JSON.stringify(eventCenterPayload())) return;
    S.event7 = next;
    evtSig = sig;                                  // 서버에서 받은 값은 다시 보내지 않습니다
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
    renderMissions();
    if ($('#eventModal') && !$('#eventModal').hidden) renderEventCenter();
    renderEventBadge();
  }

  /* ---- 미션 체크 직후: 🔥 3일 연속 콤보 · 🎂 2배 데이 ----
     미션 자체의 로그(서버 교차 검증 대상)는 그대로 두고, 보너스는 별도 로그로 남깁니다. */
  function eventAfterCheck(c, r, at) {
    const t = todayStr();
    const cb = EV().combo;
    if (cb && cb.on && comboPrevOk(c.id)) {
      const got = awardBonus(cb.bonus, `🔥 ${c.title} 3일 연속!`, `combo_${c.id}_${t}`, { at });
      if (got) { confetti(70); beep('up'); toast(`🔥 3일 연속 콤보! +${got}P`, 'mint', 3200); }
    }
    const dd = doubleDayOn(t);
    if (dd.on && r && r.earned) {
      const got = awardBonus(r.earned, `🎂 2배 데이 (${c.title})`, `dbl_${c.id}_${t}`, { at });
      if (got) toast(`🎂 2배 데이! +${got}P 더`, 'mint', 3200);
    }
    renderEventBadge();
  }

  /* ---- ⑥ 뽑기 ---- */
  const gachaStep = () => clamp(Math.round(+((EV().gacha || {}).step || 50)), 10, 500);
  function gachaTickets() {
    const draws = ((EV().gacha || {}).draws || []).length;
    return Math.max(0, Math.floor(kidTotalPts() / gachaStep()) - draws);
  }
  function pickReward() {
    const list = (EV().gacha.rewards && EV().gacha.rewards.length) ? EV().gacha.rewards : event7Default().gacha.rewards;
    const total = list.reduce((s, r) => s + Math.max(1, +r.weight || 1), 0);
    let x = Math.random() * total;
    for (const r of list) { x -= Math.max(1, +r.weight || 1); if (x <= 0) return r; }
    return list[list.length - 1];
  }

  /* ---- ④ 비밀 미션 상자 ---- */
  function secretToday() {
    const s = EV().secret || {};
    return (s.date === todayStr() && String(s.title || '').trim()) ? s : null;
  }

  /* ---- ⑤ 월말 MVP 집계 ---- */
  function mvpStats(y, m) {
    const pre = `${y}-${pad(m + 1)}`;
    const logs = (S.logs || []).filter((l) => l && isDateStr(l.date) && l.date.slice(0, 7) === pre && (!l.member || l.member === KID_ID));
    const missions = logs.filter((l) => l.kind !== 'bonus');
    const bonus = logs.filter((l) => l.kind === 'bonus');
    const pts = logs.reduce((s, l) => s + Math.max(0, Math.round(+l.earned || 0)), 0);
    const eligible = missions.filter((l) => l.due);
    const met = eligible.filter((l) => l.goalMet);
    const dex = (S.pokemon.dex || []).filter((d) => String(d.at || '').slice(0, 7) === pre);
    const byDay = {};
    logs.forEach((l) => { byDay[l.date] = (byDay[l.date] || 0) + 1; });
    const bestDay = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0] || '';
    const byTitle = {};
    missions.forEach((l) => { byTitle[l.title] = (byTitle[l.title] || 0) + 1; });
    const topTitle = Object.keys(byTitle).sort((a, b) => byTitle[b] - byTitle[a])[0] || '';
    return {
      pts, count: missions.length,
      bonusPts: bonus.reduce((s, l) => s + Math.max(0, Math.round(+l.earned || 0)), 0),
      bonusCount: bonus.length,
      rate: eligible.length ? Math.round((met.length / eligible.length) * 100) : null,
      met: met.length, eligible: eligible.length,
      dex, days: Object.keys(byDay).length, bestDay,
      topTitle, topCount: byTitle[topTitle] || 0,
    };
  }

  /* ---- ② 깜짝 보너스 · 주말 특별 미션 · 쿠폰 후보 편집 (부모) ---- */
  async function surpriseBonus() {
    const r = await askModal({
      title: '⚡ 깜짝 칭찬 보너스',
      hint: `${kidLabel()} 님에게 바로 포인트를 선물해요. 로그에도 남아 정산에 함께 들어갑니다.`,
      fields: [
        { name: 'pts', label: '보너스 포인트', type: 'select', value: '3', options: [1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: `+${n}P` })) },
        { name: 'title', label: '칭찬 한마디', placeholder: '예: 스스로 가방 쌌어요 👍' },
      ],
      okText: '선물하기',
    });
    if (!r) return;
    const pts = clamp(Math.round(+r.pts || 0), 1, 20);
    const label = String(r.title || '').trim() || '부모님 깜짝 보너스';
    const got = awardBonus(pts, `⚡ ${label}`, `surprise_${Date.now()}`);
    if (!got) { toast('보너스를 넣지 못했어요', 'coral', 2400); return; }
    confetti(90); beep('up');
    toast(`⚡ ${kidLabel()} 님에게 +${got}P 깜짝 선물!`, 'mint', 3000);
    renderMissions(); renderEventCenter();
  }

  async function weekendMission() {
    await addMission({ days: [0, 6], titleHint: '주말' });
  }

  async function editGachaRewards() {
    const rows = (EV().gacha.rewards || []).map((r) => `${r.label}|${r.weight}`).join('\n');
    const r = await askModal({
      title: '🎰 쿠폰 후보 · 확률 편집',
      hint: '한 줄에 `쿠폰 이름|가중치` 로 적어 주세요. 가중치가 클수록 잘 나옵니다. (예: 아이스크림|30)',
      fields: [{ name: 'rows', label: '쿠폰 후보', type: 'textarea', value: rows }],
      okText: '저장',
    });
    if (!r) return;
    const list = String(r.rows || '').split('\n').map((line, i) => {
      const [label, w] = line.split('|');
      const name = String(label || '').trim();
      if (!name) return null;
      return { id: 'g' + (i + 1) + uid().slice(0, 3), label: name.slice(0, 30), weight: clamp(Math.round(+w || 10), 1, 100) };
    }).filter(Boolean).slice(0, 12);
    if (!list.length) { toast('후보를 1개 이상 적어 주세요', 'coral', 2600); return; }
    EV().gacha.rewards = list;
    save(); renderEventCenter();
    toast('쿠폰 후보를 저장했어요 🎰', 'mint', 2400);
  }

  async function addDoubleDay() {
    const r = await askModal({
      title: '🎂 2배 데이 추가',
      hint: '이 날 끝낸 미션 포인트를 2배로 더 받아요. 생신·명절·기념일을 적어 두면 좋아요.',
      fields: [
        { name: 'date', label: '날짜', type: 'date', value: todayStr() },
        { name: 'label', label: '무슨 날인가요?', placeholder: '예: 아이 생일 · 설날', value: '2배 데이' },
      ],
      okText: '추가',
    });
    if (!r || !isDateStr(r.date)) return;
    const list = EV().doubleDays;
    if (list.some((d) => d.date === r.date)) { toast('그 날은 이미 2배 데이예요', '', 2400); return; }
    list.push({ id: 'd' + uid().slice(0, 4), date: r.date, label: String(r.label || '2배 데이').slice(0, 24) });
    save(); renderEventCenter(); renderMissions();
    toast('🎂 2배 데이를 추가했어요', 'mint', 2400);
  }

  async function newSecretBox() {
    const pick = async (title, points) => {
      EV().secret = { date: todayStr(), title: String(title).slice(0, 40), points: clamp(Math.round(+points || 3), 1, 20), opened: false, done: false };
      save(); renderEventCenter(); renderMissions();
      toast('🎁 오늘의 비밀 미션 상자를 준비했어요', 'mint', 2600);
    };
    const rand = SECRET_POOL[Math.floor(Math.random() * SECRET_POOL.length)];
    const r = await askModal({
      title: '🎁 오늘의 비밀 미션 상자',
      hint: '상자는 아이 화면에 반짝이며 나타나고, 열어서 완료하면 포인트를 받아요.',
      fields: [
        { name: 'title', label: '미션 내용', value: rand, placeholder: '예: 가족에게 안마 5분' },
        { name: 'points', label: '완료 포인트', type: 'number', value: 3 },
      ],
      okText: '상자 놓기',
    });
    if (!r) return;
    await pick(String(r.title || '').trim() || rand, r.points);
  }

  /* ---- 이벤트 버튼 처리 (위임) ---- */
  async function onEventAct(act, id) {
    if (act === 'open-event') { openEventCenter(); return; }
    if (act === 'ev-secret-random' || act === 'ev-secret-custom') {
      await asParent('비밀 미션 상자는 보호자만 놓을 수 있어요.', newSecretBox);
      return;
    }
    if (act === 'ev-secret-open') {
      const s = secretToday();
      if (!s || s.done) return;
      s.opened = true; save(); confetti(90); beep('up');
      renderEventCenter(); renderMissions();
      return;
    }
    if (act === 'ev-secret-done') {
      const s = secretToday();
      if (!s || s.done) return;
      s.opened = true; s.done = true;
      const got = awardBonus(s.points, `🎁 비밀 미션 · ${s.title}`, `secret_${todayStr()}`);
      confetti(120); beep('up');
      save(); renderEventCenter(); renderMissions();
      if (got) toast(`🎁 비밀 미션 성공! +${got}P`, 'mint', 3000);
      return;
    }
    if (act === 'ev-gacha') {
      const tickets = gachaTickets();
      if (tickets <= 0) { toast(`${gachaStep()}P마다 뽑을 수 있어요`, '', 2400); return; }
      const wheel = $('#gachaWheel');
      if (wheel) wheel.classList.add('spin');
      const rew = pickReward();
      beep('up');
      setTimeout(() => {
        if (wheel) { wheel.classList.remove('spin'); wheel.classList.add('win'); }
        const g = EV().gacha;
        g.draws.push({ id: 'r' + uid().slice(0, 5), date: todayStr(), at: hhmm(), label: rew.label, step: gachaStep() });
        if (g.draws.length > 300) g.draws = g.draws.slice(-300);
        save(); renderEventCenter(); renderMissions();
        confetti(120); beep('up');
        toast(`🎉 ${rew.label} 당첨!`, 'mint', 3600);
      }, 1500);
      return;
    }
    if (act === 'ev-gacha-edit') { await asParent('쿠폰 후보는 보호자만 고칠 수 있어요.', editGachaRewards); return; }
    if (act === 'ev-dbl-add') { await asParent('2배 데이는 보호자만 정할 수 있어요.', addDoubleDay); return; }
    if (act === 'ev-dbl-del') {
      await asParent('2배 데이는 보호자만 지울 수 있어요.', () => {
        EV().doubleDays = EV().doubleDays.filter((d) => d.id !== id);
        save(); renderEventCenter(); renderMissions();
        toast('2배 데이를 지웠어요', '', 2000);
      });
      return;
    }
    if (act === 'ev-combo-toggle') {
      await asParent('콤보 보너스는 보호자만 바꿀 수 있어요.', () => {
        const c = EV().combo;
        c.on = !c.on;
        save(); renderEventCenter();
        toast(c.on ? '🔥 3일 연속 콤보 켜짐' : '콤보 보너스 잠깐 꺼둠', 'mint', 2200);
      });
      return;
    }
    if (act === 'ev-surprise') { await asParent('깜짝 보너스는 보호자만 줄 수 있어요.', surpriseBonus); return; }
    if (act === 'ev-weekend') { await asParent('미션 추가는 보호자만 할 수 있어요.', weekendMission); return; }
    if (act === 'ev-mvp') { openMvp(); return; }
    if (act === 'open-log') { openListModal('log'); return; }
    if (act === 'open-use') { openListModal('use'); return; }
  }

  /* ---- 🎪 이벤트 센터 화면 ---- */
  function renderEventCenter() {
    const box = $('#eventBody');
    if (!box) return;
    renderEventBadge();
    const s = secretToday();
    const dd = doubleDayOn();
    const tickets = gachaTickets();
    const draws = (EV().gacha.draws || []).slice(-4).reverse();
    const comboOn = !!EV().combo.on;
    const streak = comboStreakToday();

    const secretHtml = !s
      ? `<div class="ev-secret empty">
          <span class="es-ico">🎁</span>
          <div class="es-txt"><b>오늘 상자 없음</b><span>보호자가 놓으면 아이 화면에 반짝이며 나타나요</span></div>
          <div class="es-acts parent-only">
            <button type="button" class="btn sm" data-act="ev-secret-random" title="랜덤 미션">🎲</button>
            <button type="button" class="btn sm" data-act="ev-secret-custom" title="직접 정하기">✍️</button>
          </div>
        </div>`
      : `<div class="ev-secret${s.done ? ' done' : (s.opened ? ' opened' : '')}">
          <span class="es-ico">${s.done ? '✅' : '🎁'}</span>
          <div class="es-txt">
            <b>${s.done ? '비밀 미션 완료!' : (s.opened ? esc(s.title) : '비밀 미션 도착!')}</b>
            <span>${s.done ? `+${s.points}P 받았어요` : (s.opened ? `완료하면 +${s.points}P` : '톡 눌러서 열어 보세요')}</span>
          </div>
          <div class="es-acts">
            ${!s.opened && !s.done ? '<button type="button" class="btn sm primary" data-act="ev-secret-open">열기</button>' : ''}
            ${s.opened && !s.done ? '<button type="button" class="btn sm primary" data-act="ev-secret-done">완료 ✓</button>' : ''}
            ${s.done ? `<button type="button" class="btn sm ghost parent-only" data-act="ev-secret-random" title="내일도 상자 놓기">🎲</button>` : ''}
          </div>
        </div>`;

    const dblList = (EV().doubleDays || []).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
      .map((d) => `<span class="ev-chip dbl">🎂 ${esc(d.label)} <em>${esc(fmtMD(d.date))}</em>
          <button type="button" class="chip-x parent-only" data-act="ev-dbl-del" data-id="${esc(d.id)}" aria-label="지우기">✕</button></span>`).join('');

    box.innerHTML = `
      <div class="ev-status">
        <span class="ev-chip${dd.on ? ' hot' : ''}">${dd.on ? '🎂' : '🎈'} ${dd.on ? '2배 데이!' : '보통 날'}</span>
        <span class="ev-chip${comboOn && streak ? ' hot' : ''}">🔥 콤보 ${streak ? streak : 0}</span>
        <span class="ev-chip${tickets > 0 ? ' hot' : ''}">🎰 ${tickets}장</span>
      </div>

      <section class="ev-sec parent-only">
        <h4>①🔥 3일 연속 콤보 <span class="ev-note">같은 미션 3일 연속이면 +${EV().combo.bonus}P</span></h4>
        <div class="ev-row">
          <span class="ev-state ${comboOn ? 'on' : 'off'}">${comboOn ? '켜짐' : '꺼짐'}</span>
          <button type="button" class="btn sm" data-act="ev-combo-toggle">${comboOn ? '잠깐 끄기' : '켜기'}</button>
          <span class="ev-note">오늘 연속 중인 미션 ${streak}개</span>
        </div>
      </section>

      <section class="ev-sec parent-only">
        <h4>②⚡ 부모님 깜짝 보너스 <span class="ev-note">버튼 하나로 바로 +P</span></h4>
        <div class="ev-row">
          <button type="button" class="btn sm primary" data-act="ev-surprise">⚡ 깜짝 칭찬</button>
          <button type="button" class="btn sm" data-act="ev-weekend">🗓️ 주말 특별 미션</button>
        </div>
      </section>

      <section class="ev-sec parent-only">
        <h4>③🎂 2배 데이 <span class="ev-note">생신·명절·지정일</span></h4>
        <div class="ev-row wrap">${dblList || '<span class="ev-note">아직 지정한 날이 없어요 (위키 생신일은 자동 2배)</span>'}</div>
        <div class="ev-row"><button type="button" class="btn sm" data-act="ev-dbl-add">＋ 2배 데이</button></div>
      </section>

      <section class="ev-sec">
        <h4>④🎁 오늘의 비밀 미션 상자</h4>
        ${secretHtml}
      </section>

      <section class="ev-sec">
        <h4>⑤🏆 이번 달 상장</h4>
        <div class="ev-row"><button type="button" class="btn sm primary" data-act="ev-mvp">🏆 상장 보기</button></div>
      </section>

      <section class="ev-sec">
        <h4>⑥🎰 가족 쿠폰 뽑기 <span class="ev-note">${gachaStep()}P마다 1장</span></h4>
        <div class="ev-gacha">
          <div class="gacha-wheel" id="gachaWheel" aria-hidden="true"><span>🎁</span></div>
          <div class="gacha-side">
            <b class="gacha-left">${tickets > 0 ? `${tickets}장 남음` : '다음 50P에 1장'}</b>
            <button type="button" class="btn sm primary" data-act="ev-gacha"${tickets > 0 ? '' : ' disabled'}>${tickets > 0 ? '🎰 뽑기' : '아직 없음'}</button>
            <button type="button" class="btn sm ghost parent-only" data-act="ev-gacha-edit" title="쿠폰 후보 편집">✎ 후보</button>
          </div>
        </div>
        <div class="ev-draws">${draws.length ? draws.map((d) => `<span class="ev-chip">🎉 ${esc(d.label)} <em>${esc(fmtMD(d.date))}</em></span>`).join('') : '<span class="ev-note">아직 뽑은 쿠폰이 없어요</span>'}</div>
      </section>

`;
  }

  /* 🎪 이벤트는 늘 보이지 않고, 아이에게 실제 깜짝 이벤트가 열렸을 때만 나타납니다.
     (비밀 상자 · 뽑기 티켓 · 2배 데이 · 월말 상장). 부모 모드에서는 언제나 보입니다. */
  function eventSurprise() {
    const s = secretToday();
    const tickets = gachaTickets();
    const dd = doubleDayOn();
    const day = new Date().getDate();
    if (s && !s.done) return { on: true, kind: 'secret', ico: '🎁', label: '비밀 상자' };
    if (tickets > 0) return { on: true, kind: 'gacha', ico: '🎰', label: `뽑기 ${tickets}장` };
    if (dd.on) return { on: true, kind: 'double', ico: '✨', label: '2배 데이' };
    if (day >= 28) return { on: true, kind: 'mvp', ico: '🏆', label: '이번 달 상장' };
    return { on: false, kind: '', ico: '🎪', label: '이벤트' };
  }
  function renderEventBadge() {
    const badge = $('#evBadge');
    const s = secretToday();
    const pending = (s && !s.done ? 1 : 0) + (gachaTickets() > 0 ? 1 : 0);
    if (badge) { badge.hidden = !pending; badge.textContent = pending ? String(pending) : '0'; }
    const btn = $('#eventOpenBtn');
    const surprise = eventSurprise();
    const parent = parentUnlocked();
    if (btn) {
      // 잠긴 아이 화면: 깜짝 이벤트가 있을 때만 버튼이 나타납니다
      btn.hidden = !parent && !surprise.on;
      btn.classList.toggle('has', pending > 0 || surprise.on);
      btn.classList.toggle('surprise', !!surprise.on && !parent);
      btn.dataset.kind = surprise.on ? surprise.kind : '';
      const ico = btn.querySelector('.mb-ico');
      const txt = btn.querySelector('.mb-txt');
      if (ico) ico.textContent = surprise.on ? surprise.ico : '🎪';
      if (txt) txt.textContent = surprise.on ? surprise.label : '이벤트';
      btn.title = surprise.on ? `깜짝 이벤트 · ${surprise.label}` : '가족 이벤트';
    }
    const box = $('#secretBox');
    if (box) box.hidden = !(s && !s.done);
  }

  function openEventCenter() {
    renderEventCenter();
    $('#eventModal').hidden = false;
  }

  function openMvp() {
    renderMvp();
    $('#mvpModal').hidden = false;
  }

  function renderMvp() {
    const box = $('#mvpBody');
    if (!box) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const st = mvpStats(y, m);
    const { p } = { p: partnerOf(S.pokemon.key) };
    const stage = stagesOf()[stageIndex(S.pokemon.xp)];
    const medal = st.pts >= 250 ? '🥇' : st.pts >= 120 ? '🥈' : st.pts >= 50 ? '🥉' : '🌱';
    const line = st.pts >= 250 ? '이 달의 최고 미션왕' : st.pts >= 120 ? '이 달의 성실왕' : st.pts >= 50 ? '이 달의 노력왕' : '이 달의 새싹';
    box.innerHTML = `<div class="mvp-cert">
      <div class="mvp-star" aria-hidden="true">${medal}</div>
      <div class="mvp-title">${y}년 ${m + 1}월 · ${line}</div>
      <div class="mvp-who">${esc(kidLabel())} 님</div>
      <div class="mvp-poke">${pokeImg(stage, 'mvp-img', p.tint)}</div>
      <div class="mvp-rows">
        <div class="mvp-kpi"><span>이번 달 총점</span><b>${st.pts}P</b></div>
        <div class="mvp-kpi"><span>미션 달성</span><b>${st.count}회</b></div>
        <div class="mvp-kpi"><span>목표 시간 달성률</span><b>${st.rate == null ? '—' : st.rate + '%'}</b></div>
        <div class="mvp-kpi"><span>보너스 포인트</span><b>+${st.bonusPts}P</b></div>
        <div class="mvp-kpi"><span>기록한 날</span><b>${st.days}일</b></div>
        <div class="mvp-kpi"><span>포켓몬</span><b>${st.dex.length ? st.dex.map((d) => esc(d.finalName || d.label)).join(', ') : '성장 중'}</b></div>
      </div>
      <div class="mvp-foot">
        ${st.topTitle ? `<span>🏅 가장 많이 한 미션 <b>${esc(st.topTitle)}</b> (${st.topCount}회)</span>` : '<span>이번 달 기록을 모으는 중이에요</span>'}
        ${st.bestDay ? `<span>📅 제일 바빴던 날 <b>${esc(fmtMD(st.bestDay))}</b></span>` : ''}
      </div>
      <div class="mvp-sign">${esc(appTitle())}</div>
    </div>`;
    checkPokeImages();
  }

  /* ---- 기록 창 (완료 이력 · 포인트 사용) ---- */
  function openListModal(mode) {
    const m = $('#listModal');
    if (!m) return;
    const isUse = mode === 'use';
    $('#listTitle').textContent = isUse ? '🎁 포인트 사용' : '🕒 오늘 완료';
    $('#todayLog').hidden = isUse;
    $('#useList').hidden = !isUse;
    if ($('#logCount')) $('#logCount').hidden = isUse;
    if ($('#useCount')) $('#useCount').hidden = !isUse;
    renderLog();
    renderPointUses();
    m.hidden = false;
  }
  function closeListModal() { const m = $('#listModal'); if (m) m.hidden = true; }
  function closeEventCenter() { const m = $('#eventModal'); if (m) m.hidden = true; }
  function closeMvp() { const m = $('#mvpModal'); if (m) m.hidden = true; }

  /* ------------------------------------------- 🖼️ 대기화면 (거실 디지털 액자) */
  let standbyOn = false;
  let standbyTimer = null;
  const STANDBY_IDLE_MS = 2 * 60 * 1000;
  let standbyIdleTimer = null;
  let screenWakeLock = null;
  let wakeLockRequest = null;
  let sbPokeKey = '';
  let sbWxSig = '';
  let sbMissionSig = '';
  const standbyWakeClickGuard = window.FamilyStandbyGuard.createWakeClickGuard();
  /* 대기화면에서는 짧은 시간(1.5초) 안에 3번 터치해야 대시보드로 돌아갑니다.
     한 번 스치듯 누른 것으로는 나가지 않게 해 달라는 요청에 따른 동작입니다. */
  const standbyTapGate = window.FamilyStandbyGuard.createMultiTapGate({ taps: 3, windowMs: 1500 });
  let standbyHintTimer = null;

  function standbyPartnerStage() {
    const p = partnerOf(S.pokemon.key);
    return { p, stage: p.stages[stageIndex(S.pokemon.xp)] };
  }

  /* ---- 🌦️ 날씨(WMO)·시간대 → 대기화면 배경 ----
     낮 06~16시 · 노을 17~18시 · 밤 19~05시. 비/눈/흐림은 시간대보다 우선합니다.
     (코드 0~1 맑음 · 2~3·45~48 흐림 · 51~67/80~82/95~ 비 · 71~77/85~86 눈) */
  function wmoKind(code) {
    if (code == null) return 'clear';
    const c = +code;
    if (c === 0 || c === 1) return 'clear';
    if (c === 2 || c === 3 || c === 45 || c === 48) return 'cloud';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    return 'clear';
  }
  function todOf(h) {
    if (h >= 6 && h <= 16) return 'day';
    if (h >= 17 && h <= 18) return 'dusk';
    return 'night';
  }
  let sbSceneSig = '';
  function applyStandbyScene(now = new Date()) {
    const el = $('#standby');
    if (!el) return;
    const code = (W && W.now) ? W.now.weather_code : null;
    const wx = wmoKind(code);
    const tod = todOf(now.getHours());
    el.dataset.wx = wx;
    el.dataset.tod = tod;
    el.dataset.thunder = (code != null && +code >= 95) ? '1' : '0';
    const sig = `${wx}|${tod}`;
    if (sig === sbSceneSig) return;
    sbSceneSig = sig;
    const sky = $('#sbSky');
    if (!sky) return;
    let html = '';
    const clouds = (wx === 'rain' || wx === 'snow') ? 5 : (wx === 'cloud' ? 4 : 0);   // 맑은 날은 구름 없이
    for (let i = 0; i < clouds; i++) html += `<span class="sb-cloud c${i + 1}"></span>`;
    if (wx === 'rain') {
      for (let i = 0; i < 30; i++) {
        html += `<i class="sb-drop" style="left:${(i * 3.3 + Math.random() * 2.6).toFixed(1)}%;animation-delay:${(Math.random() * 1.5).toFixed(2)}s;animation-duration:${(0.62 + Math.random() * 0.6).toFixed(2)}s"></i>`;
      }
    }
    if (wx === 'snow') {
      for (let i = 0; i < 24; i++) {
        html += `<i class="sb-flake" style="left:${(i * 4.1 + Math.random() * 3.4).toFixed(1)}%;animation-delay:${(Math.random() * 7).toFixed(2)}s;animation-duration:${(6 + Math.random() * 5).toFixed(2)}s;font-size:${(9 + Math.random() * 9).toFixed(0)}px">❄</i>`;
      }
    }
    sky.innerHTML = html;
    sky.dataset.count = String(sky.children.length);
  }

  function renderStandby() {
    if (!standbyOn) return;
    const now = new Date();
    applyStandbyScene(now);          // 날씨 · 시간대에 맞춰 배경·효과가 자동으로 바뀝니다
    if ($('#sbTime')) $('#sbTime').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if ($('#sbSec')) $('#sbSec').textContent = pad(now.getSeconds());
    if ($('#sbDate')) {
      $('#sbDate').innerHTML = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 <b>${DAYS[now.getDay()]}요일</b>`;
    }

    // 오늘 날씨 · 미세먼지
    const loc = currentLoc();
    let wx = `<div class="sb-wx-now"><span class="sb-wx-ico">🌤️</span><b>—</b><span class="sb-wx-desc">날씨 불러오는 중</span></div>
      <div class="sb-wx-chips"><span class="sb-wx-place">📍 ${esc(W && W.locName ? W.locName : (loc.name || '우리 동네'))}</span></div>`;
    if (W && W.now) {
      const [icon, desc] = wmo(W.now.weather_code);
      const d0 = W.daily && W.daily[0];
      const chips = [];
      if (d0) chips.push(`<span>최고 <b>${Math.round(d0.max)}°</b> · 최저 <b>${Math.round(d0.min)}°</b></span>`);
      if (d0 && d0.pop != null) chips.push(`<span>☔ ${Math.round(d0.pop)}%</span>`);
      if (W.air) {
        const g1 = pm10Grade(W.air.pm10);
        const g2 = pm25Grade(W.air.pm25);
        if (g1) chips.push(`<span class="g ${g1[1]}">미세먼지 <b>${g1[0]}</b></span>`);
        if (g2) chips.push(`<span class="g ${g2[1]}">초미세 <b>${g2[0]}</b></span>`);
      }
      chips.push(`<span class="sb-wx-place">📍 ${esc(W.locName || loc.name || '우리 동네')}</span>`);
      wx = `<div class="sb-wx-now"><span class="sb-wx-ico">${icon}</span><b>${Math.round(W.now.temperature_2m)}°</b><span class="sb-wx-desc">${esc(desc)}</span></div>
        <div class="sb-wx-chips">${chips.join('')}</div>`;
    }
    if ($('#sbWeather')) {
      const wxSig = JSON.stringify([W && W.now && W.now.temperature_2m, W && W.now && W.now.weather_code, W && W.air, W && W.daily && W.daily[0], W && W.locName]);
      if (wxSig !== sbWxSig) { sbWxSig = wxSig; $('#sbWeather').innerHTML = wx; }
    }

    // 오늘 아이 미션 달성률 · 선물 코인
    const dow = now.getDay();
    const tg = kidTodayGoal(dow);
    const pct = tg.goal ? clamp(Math.round((tg.got / tg.goal) * 100), 0, 100) : 0;
    const doneCount = S.missions.filter((m) => m.member === KID_ID && m.doneOn === todayStr() && missionOnDay(m, dow)).length;
    const totalToday = S.missions.filter((m) => m.member === KID_ID && missionOnDay(m, dow)).length;
    if ($('#sbMission')) {
      const sig = [pct, tg.got, tg.goal, tg.left, doneCount, totalToday, balancePts(), Math.round(S.pokemon.xp)].join('|');
      if (sig === sbMissionSig) return sbSyncPartner();
      sbMissionSig = sig;
      // 진화 경험치는 '다음 진화 목표'를 분모로 보여 줍니다 (최종 단계에서만 200P)
      const sbStages = stagesOf();
      const sbLv = stageIndex(S.pokemon.xp);
      const sbXp = Math.round(S.pokemon.xp);
      const sbNext = sbStages[sbLv + 1] ? sbStages[sbLv + 1].min : FINAL_P;
      $('#sbMission').innerHTML = `
        <div class="sb-m-head"><span>🎯 오늘 미션</span><b>${doneCount} / ${totalToday} 완료</b></div>
        <div class="sb-ring" style="--p:${pct}">
          <div class="sb-ring-face">
            <b>${pct}%</b>
            <span>${tg.got}P / ${tg.goal}P</span>
          </div>
        </div>
        <div class="sb-stats">
          <div class="sb-stat coin"><span>🪙 선물 코인</span><b>${balancePts()}P</b></div>
          <div class="sb-stat xp"><span>⚡ 진화 경험치</span><b>${sbXp}/${sbNext}P</b></div>
        </div>
        <div class="sb-hint-line">${tg.goal && tg.got >= tg.goal ? '🎉 오늘 목표 달성! 최고예요' : tg.left ? `${tg.left}P 더 모으면 오늘 목표 달성!` : '오늘은 쉬어 가는 날이에요 🌴'}</div>`;
    }

    // 크게 살아 움직이는 파트너
    sbSyncPartner();
  }

  function sbSyncPartner() {
    const { p, stage } = standbyPartnerStage();
    const key = `${p.key}:${stage.id}:${stage.min}`;
    if (key !== sbPokeKey) {
      sbPokeKey = key;
      if ($('#sbStage')) {
        $('#sbStage').innerHTML = pokeImg(stage, 'sb-poke-img', p.tint, { eager: true })
          + (stage.crown ? '<span class="poke-crown" aria-hidden="true">👑</span>' : '')
          + (stage.shiny ? '<span class="poke-shiny" aria-hidden="true">✨</span>' : '');
      }
    }
    if ($('#sbName')) $('#sbName').textContent = stage.name;
    const nxt = p.stages[stageIndex(S.pokemon.xp) + 1];
    if ($('#sbSub')) {
      $('#sbSub').innerHTML = nxt
        ? `다음 진화 <b>${esc(nxt.name)}</b>까지 <b>${Math.max(0, nxt.min - Math.round(S.pokemon.xp))}P</b> 남았어요`
        : '최종 진화 완료! 🏆 도감에 저장됐어요';
    }
  }

  function enterStandby() {
    if (standbyOn) return;
    clearTimeout(standbyIdleTimer);
    standbyIdleTimer = null;
    standbyOn = true;
    sbPokeKey = '';
    sbWxSig = '';
    sbMissionSig = '';
    standbyTapGate.reset();
    standbyTapText('화면을 연속 3번 터치하면 대시보드로 돌아가요', '');
    const el = $('#standby');
    if (el) el.hidden = false;
    document.body.classList.add('standby-on');
    if ($('#sbTitle')) $('#sbTitle').textContent = appTitle();
    renderStandby();
    clearInterval(standbyTimer);
    standbyTimer = setInterval(renderStandby, 1000);
  }

  function exitStandby() {
    if (!standbyOn) return;
    standbyOn = false;
    clearInterval(standbyTimer);
    standbyTimer = null;
    standbyTapGate.reset();
    clearTimeout(standbyHintTimer);
    standbyHintTimer = null;
    const el = $('#standby');
    if (el) el.hidden = true;
    document.body.classList.remove('standby-on');
    resetStandbyIdleTimer();
  }

  function resetStandbyIdleTimer() {
    clearTimeout(standbyIdleTimer);
    standbyIdleTimer = null;
    if (document.hidden || standbyOn) return;
    standbyIdleTimer = setTimeout(() => {
      standbyIdleTimer = null;
      enterStandby();
    }, STANDBY_IDLE_MS);
  }

  function requestScreenWakeLock() {
    const api = window.navigator && window.navigator.wakeLock;
    if (!api || typeof api.request !== 'function' || document.hidden || screenWakeLock || wakeLockRequest) return;
    wakeLockRequest = api.request('screen').then((lock) => {
      if (document.hidden) { lock.release().catch(() => {}); return null; }
      screenWakeLock = lock;
      lock.addEventListener('release', () => {
        if (screenWakeLock === lock) screenWakeLock = null;
      }, { once: true });
      return lock;
    }).catch(() => null).finally(() => { wakeLockRequest = null; });
    return wakeLockRequest;
  }

  function releaseScreenWakeLock() {
    const lock = screenWakeLock;
    screenWakeLock = null;
    if (lock && !lock.released) lock.release().catch(() => {});
  }

  function standbyTapText(msg, tone) {
    const el = $('#sbTap');
    if (!el) return;
    el.textContent = msg;
    el.dataset.tone = tone || '';
  }
  function showStandbyTapHint(count, needed) {
    clearTimeout(standbyHintTimer);
    standbyTapText(`조금 더! (${count}/${needed})`, 'more');
    standbyHintTimer = setTimeout(() => {
      standbyHintTimer = null;
      standbyTapText('화면을 연속 3번 터치하면 대시보드로 돌아가요', '');
    }, 1500);
  }
  /* 1·2번째 터치는 대시보드를 열지 않고, 대기화면 속 포켓몬만 폴작이며 반응합니다.
     (아이가 지나가며 톡톡 건더도 실수로 플리지 않게) */
  function standbyTapReact(count, needed) {
    const { stage } = standbyPartnerStage();
    const name = (stage && stage.name) ? stage.name : '파트너';
    const text = count >= needed - 1
      ? `한 번 더 누르면 열려요! (${count}/${needed})`
      : `${name}! 콕! (${count}/${needed})`;
    pokeReact($('#sbStage'), $('#sbSay'), name, { text, wiggle: count % 2 === 0, holdMs: 2400 });
  }
  function handleStandbyActivity(event) {
    if (standbyOn) {
      // ESC는 기존 키보드 처리에서 대기화면을 닫고 타이머를 다시 시작합니다.
      if (event.type === 'keydown' || event.type === 'wheel' || event.type === 'scroll') return;
      if (event.type === 'pointerdown' || event.type === 'touchstart') {
        // 🏠 홈으로 버튼은 예전처럼 바로 나갑니다.
        const t = event.target;
        if (t && typeof t.closest === 'function' && t.closest('#standbyExit')) return;
        // ⏰ 알람 창의 '확인'은 대기화면 유지 탭으로 세지 않습니다
        if (t && typeof t.closest === 'function' && t.closest('#alarmPop')) { requestScreenWakeLock(); return; }
        const r = standbyTapGate.tap();
        if (r.done) {
          clearTimeout(standbyHintTimer);
          standbyHintTimer = null;
          standbyWakeClickGuard.arm();     // 마지막 세 번째 터치의 click이 뒤 화면 버튼을 누르지 않게
          exitStandby();
        } else {
          showStandbyTapHint(r.count, r.needed);
          standbyTapReact(r.count, r.needed);   // 1·2번째는 포켓몬이 반응만 합니다
        }
      }
      requestScreenWakeLock();
      return;
    }
    resetStandbyIdleTimer();
    requestScreenWakeLock();
  }

  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach((type) => {
    document.addEventListener(type, handleStandbyActivity, { passive: true, capture: true });
  });
  document.addEventListener('scroll', handleStandbyActivity, { passive: true, capture: true });
  document.addEventListener('click', (event) => { standbyWakeClickGuard.handleClick(event); }, true);

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
    applyTitle();
    renderParentBtn();
    renderFreeDay();
    renderSchedule();
    renderSchool();
    renderMissions();
    renderWish();
    renderShopping();
    renderLetters();
    renderWiki();
    renderTimer();
    renderLinks();
  }

  /* -------------------------------------------------------------------- events */
  // 전역 클릭 위임
  document.addEventListener('click', (e) => {
    if (e.target.closest('.chore-tools') && !e.target.closest('.chore-tools [data-act]')) return;
    const t = e.target.closest('[data-act]');
    if (t) {
      const act = t.dataset.act;
      const id = t.dataset.id;
      if (act === 'open-event' || act === 'open-log' || act === 'open-use'
        || ['ev-secret-random', 'ev-secret-custom', 'ev-secret-open', 'ev-secret-done',
          'ev-gacha', 'ev-gacha-edit', 'ev-dbl-add', 'ev-dbl-del', 'ev-combo-toggle',
          'ev-surprise', 'ev-weekend', 'ev-mvp'].indexOf(act) >= 0) {
        onEventAct(act, id);
        return;
      }
      if (act === 'ev-toggle') {
        const ev = S.events.find((x) => x.id === id);
        if (ev) { ev.done = !ev.done; save(); renderSchedule(); }
      } else if (act === 'ev-del') {
        asParent('일정 삭제는 보호자만 할 수 있어요.', () => {
          S.events = S.events.filter((x) => x.id !== id); save(); renderSchedule(); toast('일정을 삭제했어요');
        });
      } else if (act === 'ev-edit') {
        asParent('일정 수정은 보호자만 할 수 있어요.', () => editEvent(id));
      } else if (act === 'alarm-on') {
        asParent('맞춤 알람은 보호자만 바꿀 수 있어요.', () => toggleAlarm(id));
      } else if (act === 'alarm-edit') {
        asParent('맞춤 알람은 보호자만 바꿀 수 있어요.', () => editAlarm(id));
      } else if (act === 'alarm-del') {
        asParent('맞춤 알람은 보호자만 바꿀 수 있어요.', () => deleteAlarm(id));
      } else if (act === 'cal-day') {
        // 달력에서 날짜를 고르면 그 날 일정이 아래에 펼쳐집니다
        const ds = t.dataset.date;
        if (ds) {
          SCHED_UI.sel = ds;
          const d = new Date(ds + 'T00:00:00');
          SCHED_UI.y = d.getFullYear();
          SCHED_UI.m = d.getMonth();
          renderSchedule();
        }
      } else if (act === 'cal-add') {
        asParent('일정 추가는 보호자만 할 수 있어요.', () => addEvent({ date: t.dataset.date || SCHED_UI.sel }));
      } else if (act === 'sched-wiki') {
        setSchedTab('wiki');
      } else if (act === 'chore-toggle') {
        const rect = t.getBoundingClientRect();
        const res = toggleMission(id);
        if (res && res.checked && res.earned > 0) {
          floatEarn(rect, res.earned, res.isKid);
          if (res.isKid) pulseGauges();
        }
      } else if (act === 'chore-edit') {
        asParent('미션 수정은 보호자만 할 수 있어요.', () => editMission(id));
      } else if (act === 'chore-del') {
        asParent('미션 삭제는 보호자만 할 수 있어요.', async () => {
          const m = S.missions.find((x) => x.id === id);
          if (!await confirmStreakDeletion(m)) return;
          if (m && m.doneOn === todayStr()) {
            addPoints(m.member || '', -earnOf(m));
            if ((m.member || '') === KID_ID) S.pokemon.xp = clamp(S.pokemon.xp - earnOf(m), 0, FINAL_P);
            dropLog(m.id);
          }
          S.missions = S.missions.filter((x) => x.id !== id); save(); renderMissions();
        });
      } else if (act === 'dex-open') {
        openDex(+t.dataset.id || 0);
      } else if (act === 'play-poke') {
        playWithPoke(t);
      } else if (act === 'use-del') {
        asParent('포인트 사용 내역은 보호자만 되돌릴 수 있어요.', () => deletePointUse(id));
      } else if (act === 'shop-toggle') {
        asParent('장보기 목록은 보호자만 바꿀 수 있어요.', () => {
          const it = S.shopping.find((x) => x.id === id);
          if (it) { it.done = !it.done; save(); renderShopping(); }
        });
      } else if (act === 'shop-del') {
        asParent('장보기 목록은 보호자만 바꿀 수 있어요.', () => {
          S.shopping = S.shopping.filter((x) => x.id !== id); save(); renderShopping();
        });
      } else if (act === 'letter-open') {
        openLetter(id);
      } else if (act === 'letter-del') {
        asParent('편지 삭제는 보호자만 할 수 있어요.', () => {
          S.letters = S.letters.filter((x) => x.id !== id); save(); renderLetters();
        });
      } else if (act === 'wiki-edit') {
        asParent('우리 집 위키는 보호자만 고칠 수 있어요.', () => editWiki(id));
      } else if (act === 'wiki-del') {
        asParent('우리 집 위키는 보호자만 고칠 수 있어요.', () => {
          S.wiki = S.wiki.filter((x) => x.id !== id); save(); renderWiki();
        });
      } else if (act === 'link-edit') {
        editLink(id);
      } else if (act === 'link-del') {
        S.links = S.links.filter((x) => x.id !== id); save(); renderLinks();
      } else if (act === 'member-edit') {
        editMember(id);
      } else if (act === 'streak-info') {
        askModal({ title: '연속 달성 기록', hint: streakView().title, fields: [], okText: '확인' });
      } else if (act === 'wish-buy') {
        asParent('선물 사주기는 보호자만 할 수 있어요.', () => buyWish(id));
      } else if (act === 'wish-edit') {
        asParent('필요한 포인트와 이름은 보호자만 고칠 수 있어요.', () => editWish(id));
      } else if (act === 'wish-del') {
        asParent('사고 싶은 것 지우기는 보호자만 할 수 있어요.', () => deleteWish(id));
      }
      return;
    }
    // 날씨 새로고침
    if (e.target.closest('#weather')) refreshWeather(true);
  });

  $('#eventAddBtn').addEventListener('click', () => asParent('일정 추가는 보호자만 할 수 있어요.', () => {
    schedEnsure();
    addEvent({ date: SCHED_UI.sel || todayStr() });
  }));
  /* 🔔 알람 소리 — 헤더 버튼은 대기화면·아이 화면에서도 보이고, 아이도 켜고 끌 수 있습니다 */
  if ($('#alarmSoundBtn')) $('#alarmSoundBtn').addEventListener('click', toggleAlarmSoundByUser);
  if ($('#alarmSoundBtn2')) $('#alarmSoundBtn2').addEventListener('click', toggleAlarmSoundByUser);
  if ($('#alarmPreviewBtn')) $('#alarmPreviewBtn').addEventListener('click', previewAlarm);
  if ($('#alarmAddBtn')) $('#alarmAddBtn').addEventListener('click', () => asParent('맞춤 알람은 보호자만 바꿀 수 있어요.', addAlarm));
  if ($('#alarmPopOk')) $('#alarmPopOk').addEventListener('click', closeAlarmPop);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#alarmPop') && !$('#alarmPop').hidden) closeAlarmPop();
  });
  if ($('#calPrev')) $('#calPrev').addEventListener('click', () => schedShift(-1));
  if ($('#calNext')) $('#calNext').addEventListener('click', () => schedShift(1));
  if ($('#calToday')) $('#calToday').addEventListener('click', () => {
    const d = new Date();
    schedShowMonth(d.getFullYear(), d.getMonth());
  });
  if ($('#schoolEditBtn')) $('#schoolEditBtn').addEventListener('click', () => asParent('학교 정보는 보호자만 바꿀 수 있어요.', editSchoolCard));
  if ($('#schoolSaveBtn')) $('#schoolSaveBtn').addEventListener('click', () => {
    if (!S.school) S.school = { name: '', cls: '', byDate: {} };
    S.school.name = ($('#schoolNameInput').value || '').trim();
    S.school.cls = ($('#schoolClassInput').value || '').trim();
    save(); renderSchool(); renderSettings(); toast('학교 이름·반을 저장했어요', 'mint');
  });
  if ($('#schoolMealBtn')) $('#schoolMealBtn').addEventListener('click', () => editSchoolDay('meal'));
  if ($('#schoolTimeBtn')) $('#schoolTimeBtn').addEventListener('click', () => editSchoolDay('timetable'));
  if ($('#schoolClearBtn')) $('#schoolClearBtn').addEventListener('click', () => {
    if (S.school && S.school.byDate && S.school.byDate[todayStr()]) {
      delete S.school.byDate[todayStr()];
      save(); renderSchool(); renderSettings(); toast('오늘 학교 기록을 지웠어요');
    }
  });
  $('#choreAddBtn').addEventListener('click', () => asParent('미션 추가는 보호자만 할 수 있어요.', addMission));
  if ($('#specialChoreAddBtn')) $('#specialChoreAddBtn').addEventListener('click', () => asParent('특별 미션 추가는 보호자만 할 수 있어요.', addSpecialMission));
  $('#stickerResetBtn').addEventListener('click', () => asParent('포인트 초기화는 보호자만 할 수 있어요.', resetPoints));
  $('#pointUseBtn').addEventListener('click', () => asParent('포인트 사용은 보호자만 할 수 있어요.', usePoints));
  $('#wishAddBtn').addEventListener('click', addWish);      // 사고 싶은 것 적기는 아이도 자유롭게
  if ($('#wishMicBtn')) $('#wishMicBtn').addEventListener('click', wishVoiceToggle);   // 카드에서 바로 말로 적기
  $('#adoptBtn').addEventListener('click', () => {
    if (S.pokemon.xp < FINAL_P) { toast(`최종 진화(${FINAL_P}P)를 마치면 새 포켓몬을 입양할 수 있어요`, '', 2600); return; }
    openPartnerPicker('adopt');
  });
  $('#dexClose').addEventListener('click', () => { $('#dexModal').hidden = true; });
  if ($('#dexCloseBtn')) $('#dexCloseBtn').addEventListener('click', () => { $('#dexModal').hidden = true; });
  $('#dexModal').addEventListener('click', (e) => { if (e.target.id === 'dexModal') $('#dexModal').hidden = true; });
  if ($('#dexGrid')) $('#dexGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-dexid]');
    if (cell) selectDex(cell.dataset.dexid);
  });
  if ($('#dexSide')) $('#dexSide').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dexpick]');
    if (!b) return;
    partnerMode = 'change';
    pickPartner(b.dataset.dexpick);
    renderDexSide();
  });
  if ($('#dexSearch')) $('#dexSearch').addEventListener('input', (e) => {
    DEXUI.q = e.target.value || '';
    renderDexGrid();
  });
  if ($('#dexFilter')) $('#dexFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dexfilter]');
    if (b) setDexFilter(b.dataset.dexfilter);
  });
  // 도감 열기 (카드 안의 작은 도감 제목도 버튼)
  if ($('#dexOpenBtn')) $('#dexOpenBtn').addEventListener('click', () => openDex(0));
  // 파트너 포켓몬 톡톡
  if ($('#charStage')) $('#charStage').addEventListener('click', () => {
    const st = stagesOf()[stageIndex(S.pokemon.xp)];
    pokeReact($('#charStage'), $('#charSay'), st ? st.name : '');
  });
  if ($('#sbStage')) $('#sbStage').addEventListener('click', () => {
    // 대기화면에서는 아래 pointerdown 처리(연속 탭 반응)가 포켓몬을 움직입니다.
    if (standbyOn) return;
    const { stage } = standbyPartnerStage();
    pokeReact($('#sbStage'), $('#sbSay'), stage ? stage.name : '');
  });
  // ⛶ 전체 화면 — 주소창·작업 표시줄까지 가려 화면을 가장 넓게 (2026-11-19)
  const fsBtn = $('#fullscreenBtn');
  const fsMode = (name) => Boolean(window.matchMedia && window.matchMedia('(display-mode: ' + name + ')').matches);
  const fullscreenCtl = (fsBtn && window.FamilyFullscreen)
    ? window.FamilyFullscreen.createFullscreenController({
        doc: document,
        onUnsupported: (msg) => {
          // 이미 홈 화면 앱으로 열었다면 '홈 화면에 추가'를 안내할 이유가 없습니다.
          const installed = fsMode('standalone') || fsMode('fullscreen');
          toast(installed ? '이 브라우저에서는 전체 화면 버튼을 쓸 수 없어요. 홈 화면 앱은 열 때 전체 화면으로 떠요.' : msg, '', 5200);
        },
      })
    : null;

  function syncFullscreenBtn() {
    if (!fsBtn || !fullscreenCtl) return;
    const on = fullscreenCtl.isOn();
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsBtn.title = fullscreenCtl.label();
    fsBtn.setAttribute('aria-label', on ? '전체 화면 나가기' : '전체 화면');
  }

  if (fsBtn && fullscreenCtl) {
    // 브라우저가 화면을 바꾸는 데 잠깐 걸리므로 상태는 fullscreenchange에서 맞춥니다.
    fsBtn.addEventListener('click', () => { fullscreenCtl.toggle().then(syncFullscreenBtn, syncFullscreenBtn); });
    ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach((ev) =>
      document.addEventListener(ev, syncFullscreenBtn));
    // 일부 웹뷰는 이벤트를 안 보내므로 화면으로 돌아올 때도 한 번 더 맞춥니다.
    document.addEventListener('visibilitychange', syncFullscreenBtn);
    syncFullscreenBtn();
    // 홈 화면 앱이 이미 풀스크린 모드로 떠 있으면 이 버튼이 할 일이 없습니다.
    if (fsMode('fullscreen') && !fullscreenCtl.isOn()) fsBtn.hidden = true;
  }

  // 🖼️ 대기화면 ↔ 홈
  if ($('#standbyBtn')) $('#standbyBtn').addEventListener('click', enterStandby);
  if ($('#standbyExit')) $('#standbyExit').addEventListener('click', exitStandby);

  // 📅 달력 범위 — 기본 1달, [2주]를 누르면 이번 주와 다음 주
  $$('#calMode .cmb').forEach((b) => b.addEventListener('click', () => setCalMode(b.dataset.calmode)));
  setCalMode('1m');

  // 🕒 기록 창 · 🎪 이벤트 창 · 🏆 상장 창
  ['#listClose', '#listCloseBtn'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('click', closeListModal); });
  if ($('#listModal')) $('#listModal').addEventListener('click', (e) => { if (e.target.id === 'listModal') closeListModal(); });
  ['#evClose', '#evCloseBtn'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('click', closeEventCenter); });
  if ($('#eventModal')) $('#eventModal').addEventListener('click', (e) => { if (e.target.id === 'eventModal') closeEventCenter(); });
  ['#mvpClose', '#mvpCloseBtn'].forEach((sel) => { const el = $(sel); if (el) el.addEventListener('click', closeMvp); });
  if ($('#mvpModal')) $('#mvpModal').addEventListener('click', (e) => { if (e.target.id === 'mvpModal') closeMvp(); });
  renderEventBadge();

  // 월간·연간 달성 현황
  $('#histOpenBtn').addEventListener('click', openHistory);
  $('#histClose').addEventListener('click', closeHistory);
  $('#histCloseBtn').addEventListener('click', closeHistory);
  $('#histPrev').addEventListener('click', () => histShift(-1));
  $('#histNext').addEventListener('click', () => histShift(1));
  $('#histToday').addEventListener('click', histGoToday);
  $('#historyModal').addEventListener('click', (e) => {
    if (e.target.id === 'historyModal') { closeHistory(); return; }
    const tab = e.target.closest('[data-histview]');
    if (tab) {
      const v = tab.dataset.histview;
      if (v !== HIST.view) {
        HIST.view = v;
        if (v === 'year') HIST.day = '';
        renderHistory();
      }
      return;
    }
    const chip = e.target.closest('[data-histmember]');
    if (chip) { HIST.member = chip.dataset.histmember; HIST.day = ''; renderHistory(); return; }
    const day = e.target.closest('[data-histday]');
    if (day) { HIST.day = day.dataset.histday; renderHistory(); return; }
    const mon = e.target.closest('[data-histmonth]');
    if (mon) {
      HIST.view = 'month';
      HIST.m = Math.max(0, Math.min(11, Math.round(+mon.dataset.histmonth || 0)));
      HIST.day = '';
      renderHistory();
    }
  });
  $('#wikiAddBtn').addEventListener('click', () => asParent('우리 집 위키는 보호자만 고칠 수 있어요.', () => editWiki(null)));
  $('#linkAddBtn').addEventListener('click', () => editLink(null));

  $('#shopAddBtn').addEventListener('click', () => asParent('장보기 목록은 보호자만 바꿀 수 있어요.', addShopItem));
  $('#shopInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); asParent('장보기 목록은 보호자만 바꿀 수 있어요.', addShopItem); } });
  if ($('#shopMicBtn')) attachVoiceInput({ input: $('#shopInput'), btn: $('#shopMicBtn') });   // 장보기도 말로 적기
  $$('[data-shoptab]').forEach((b) => b.addEventListener('click', () => { shopTab = b.dataset.shoptab; renderShopping(); renderWish(); }));
  // 가족 일정 카드 안의 달력 · 우리 집 위키 탭
  $$('[data-schedtab]').forEach((b) => b.addEventListener('click', () => setSchedTab(b.dataset.schedtab)));
  setSchedTab('cal');

  // 상단 3탭 — 대시보드 · 손글씨 편지 · 포켓몬 놀이방
  $$('.apptabs .at').forEach((b) => b.addEventListener('click', () => setAppTab(b.dataset.apptab)));
  $$('.apptabs .at').forEach((b) => b.addEventListener('keydown', (e) => {
    const i = APP_TABS.indexOf(b.dataset.apptab);
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = APP_TABS[(i + (e.key === 'ArrowRight' ? 1 : APP_TABS.length - 1)) % APP_TABS.length];
    setAppTab(next);
    const btn = document.querySelector(`.apptabs .at[data-apptab="${next}"]`);
    if (btn) btn.focus();
  }));
  if ($('#playDexBtn')) $('#playDexBtn').addEventListener('click', () => openDex(0));
  setAppTab('dash');

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
    asParent('편지 삭제는 보호자만 할 수 있어요.', () => {
      S.letters = S.letters.filter((x) => x.id !== id);
      save(); renderLetters(); $('#letterModal').hidden = true; toast('편지를 삭제했어요');
    });
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

  $('#exportBtn').addEventListener('click', () => asParent('백업 내보내기는 보호자만 할 수 있어요.', exportJSON));
  $('#importBtn').addEventListener('click', () => asParent('백업 불러오기는 보호자만 할 수 있어요.', () => $('#importFile').click()));
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });

  $('#settingsBtn').addEventListener('click', () => asParent('설정은 보호자만 바꿀 수 있어요.', openSettings));

  // 🔒 부모 모드 버튼 — 잠겨 있으면 PIN을 받아 열고, 열려 있으면 누르는 즉시 잠급니다
  if ($('#parentBtn')) {
    $('#parentBtn').addEventListener('click', async () => {
      if (parentUnlocked()) { lockParent(false); return; }
      const ok = await askParentPin('보호자가 쓰는 기능이에요. 4자리 PIN을 넣으면 부모 모드가 열립니다.');
      if (!ok) return;
      parentSession.unlockedAt = Date.now();
      renderParentBtn();
      toast('🔓 부모 모드 열림 · 5분 뒤 자동으로 잠겨요', 'mint', 2800);
    });
  }

  // 대시보드 이름 · 어른 미션 보기 · 부모 PIN (설정 안 — 이미 보호자 확인을 거쳤습니다)
  if ($('#titleSaveBtn')) $('#titleSaveBtn').addEventListener('click', () => {
    const v = String($('#titleInput').value || '').trim().slice(0, 40);
    S.dashboardTitle = v;
    save(); applyTitle();
    toast(v ? `이름을 '${v}'(으)로 바꿨어요` : '기본 이름으로 돌려놨어요', 'mint', 2600);
  });
  if ($('#titleInput')) $('#titleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#titleSaveBtn').click(); }
  });
  if ($('#adultToggle')) $('#adultToggle').addEventListener('change', (e) => {
    S.showAdultMissions = !!e.target.checked;
    save(); renderMissions(); renderSettings();
    toast(S.showAdultMissions ? '어른 미션도 함께 보여요' : '아이 미션만 보여요', 'mint', 2400);
  });
  if ($('#pinSaveBtn')) $('#pinSaveBtn').addEventListener('click', async () => {
    const v = String($('#pinInput').value || '').replace(/\D/g, '');
    if (!/^\d{4}$/.test(v)) { toast('PIN은 숫자 4자리로 정해 주세요', 'coral', 2800); return; }
    if (FB.on && FB.role === 'parent' && FB.sync && FB.sync.saveParentPin) {
      const session = FB.session;
      const result = await FB.sync.saveParentPin({ pin: v, by: FB.uid });
      if (session !== FB.session) return;
      if (!result || !result.ok) {
        toast('PIN을 가족 기기에 동기화하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.', 'coral', 4200);
        return;
      }
    }
    S.parentPin = v;
    save();
    parentSession.unlockedAt = 0;                 // PIN을 바꾸면 부모 모드는 바로 잠깁니다
    renderParentBtn();
    $('#pinInput').value = '';
    toast(FB.on && FB.role === 'parent' ? '부모 모드 PIN을 가족 기기에 동기화했어요 🔒' : '부모 모드 PIN을 이 기기에 저장했어요 🔒', 'mint', 3000);
  });
  $('#settingsClose').addEventListener('click', () => { $('#settingsModal').hidden = true; });
  $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') $('#settingsModal').hidden = true; });
  $('#helpBtn').addEventListener('click', () => { $('#helpModal').hidden = false; });
  $('#helpClose').addEventListener('click', () => { $('#helpModal').hidden = true; });
  $('#helpModal').addEventListener('click', (e) => { if (e.target.id === 'helpModal') $('#helpModal').hidden = true; });

  // 파트너 포켓몬 고르기
  $('#partnerBtn').addEventListener('click', () => openPartnerPicker('change'));
  $('#partnerBtn2').addEventListener('click', () => openPartnerPicker('change'));
  $('#partnerClose').addEventListener('click', () => { $('#partnerModal').hidden = true; });
  if ($('#partnerSearch')) $('#partnerSearch').addEventListener('input', (e) => {
    partnerQuery = e.target.value || '';
    renderPartnerGrid();
  });
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
  function renderLegacySyncInfo() {
    const note = $('#legacySyncNote');
    const button = $('#legacySyncOffBtn');
    const hasSaved = LEGACY_SYNC.hasSavedConfig(localStorage);
    if (note) note.textContent = hasSaved
      ? '이 기기에 예전 Apps Script 주소/PIN이 저장되어 있지만 자동 연결은 꺼져 있어요. 원하면 저장된 연결 정보만 이 기기에서 지울 수 있습니다.'
      : '예전 Apps Script 자동 연결은 꺼져 있어요. 이 기기에 저장된 연결 정보가 없습니다.';
    if (button) button.hidden = !hasSaved;
  }

  if ($('#syncBadge')) $('#syncBadge').addEventListener('click', () =>
    asParent('동기화 설정은 보호자만 바꿀 수 있어요.', openSettings));
  if ($('#legacySyncOffBtn')) $('#legacySyncOffBtn').addEventListener('click', () => {
    const cleared = LEGACY_SYNC.disable(localStorage);
    renderLegacySyncInfo();
    toast(cleared ? '예전 Apps Script 연결 정보를 이 기기에서 지웠어요' : '연결 정보를 지우지 못했어요', cleared ? 'mint' : 'coral', 3200);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (standbyOn) { exitStandby(); return; }
    ['#modal', '#letterModal', '#settingsModal', '#helpModal', '#partnerModal', '#dexModal', '#historyModal'].forEach((sel) => {
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

  /* =======================================================================
     🔥 Firebase 연동 (Google 로그인 + Firestore 가족 동기화)
     ───────────────────────────────────────────────────────────────────────
     · 로그인: Google 계정을 팝업으로 받습니다(서드파티 쿠키를 막는 브라우저에서도 동작).
             팝업이 차단되거나 지원되지 않을 때만 redirect 로 넘어갑니다.
     · 권한: 서버 Custom Claims(role) 만 믿습니다. role 이 없는 계정이면
             즉시 signOut + 모든 onSnapshot 리스너 해제 + 안내 화면(차단).
     · 읽기: missions·members·events·wiki·links·pointUses·wishlist·shopping·letters
             + 이번 달 logs + 미정산 logs + stats/summary + child_state/partner
     · 쓰기: save() 가 만든 변경분(diff)만 firebase-sync.pushPatch 로 보냅니다.
             아이 기기는 오늘·본인 로그, 위시 추가/본인 것 삭제, 장보기·편지 등
             허용된 것만 보내고 나머지는 보내기 전에 막습니다.
     · 정산: 보호자 기기 + 부모 모드가 열렸을 때만 '미정산 기록 정산' 버튼이 보입니다.
     · 계산: 포인트·경험치는 저장하지 않고 summary + 미정산 로그로 매번 계산.
     · 백업: role === 'parent' 일 때만. 아이 기기에서는 진입 자체를 막습니다.
     · 모듈이 없거나(오프라인) 로그인 전이면 기존 localStorage 모드로 그대로 동작합니다.
     ======================================================================= */
  const FB = {
    on: false, role: '', uid: '', sync: null, core: null, session: 0,
    blocked: false, busy: false, settling: false, timer: null, snap: null,
    parentPinReady: false,
    readyData: false, received: new Set(), requiredData: new Set(),
    summary: null, partner: {}, monthLogs: [], pendingLogs: [], lastStats: null,
    notedDenied: '', pill: null, gate: null, card: null,
    schoolSeeded: false,
    alarmsSeeded: false,
    deleted: new Map(),          // 방금 취소한 로그 문서 ID → 시각 (늦게 도착한 스냅샷이 되살리지 않게)
  };

  /* ---- 상태 표시(작은 알약) ---- */
  function fbPillEl() {
    if (FB.pill) return FB.pill;
    const el = document.createElement('div');
    el.className = 'fb-pill';
    el.id = 'fbPill';
    el.innerHTML = '<span class="fb-dot"></span><span class="fb-text">로컬 모드</span>';
    el.addEventListener('click', () => { if (!FB.on) fbSignIn(); });
    const host = document.querySelector('.top-actions') || document.querySelector('.topbar') || document.body;
    host.appendChild(el);
    FB.pill = el;
    return el;
  }
  function fbStatus(text, kind) {
    const el = fbPillEl();
    el.dataset.kind = kind || 'off';
    el.querySelector('.fb-text').textContent = text;
    el.title = kind === 'on' ? '가족 기록이 실시간으로 오갑니다' : '아직 Firebase 에 연결되지 않았어요 · 눌러서 로그인';
    const badge = $('#syncBadge');
    if (badge) {
      const state = kind === 'on' ? 'ok' : (kind === 'busy' ? 'busy' : (kind === 'bad' ? 'err' : 'off'));
      const icon = kind === 'on' ? '☁️' : (kind === 'busy' ? '🔄' : (kind === 'bad' ? '⚠️' : '📴'));
      const word = kind === 'on' ? '동기화됨' : (kind === 'busy' ? '확인 중' : (kind === 'bad' ? '연결 확인' : '로컬 전용'));
      badge.dataset.state = state;
      badge.innerHTML = `<span aria-hidden="true">${icon}</span><span class="sync-word">${word}</span>`;
      badge.title = text;
    }
  }

  function fbResetSession({ dropPin = true } = {}) {
    FB.session += 1;
    clearTimeout(FB.timer); FB.timer = null;
    if (FB.sync && FB.sync.stopAll) FB.sync.stopAll();
    FB.on = false; FB.role = ''; FB.uid = ''; FB.blocked = false;
    FB.busy = false; FB.settling = false; FB.snap = null;
    FB.streak = null; FB.streakSig = ''; FB.streakBusy = false;
    FB.parentPinReady = false;
    FB.readyData = false; FB.received = new Set(); FB.requiredData = new Set();
    FB.summary = null; FB.partner = {}; FB.monthLogs = []; FB.pendingLogs = []; FB.lastStats = null;
    stampCompletedSeen = null; stampCompletingUntil = 0;
    FB.deleted.clear();
    window.FamilyParentSessionGuard.reset({ session: parentSession, state: S, storage: localStorage, key: KEY, dropPin });
    renderParentBtn();
    renderStampBoards();
    if (FB.gate) fbGate(false);
    return FB.session;
  }

  /* ---- 로그인 / 로그아웃 / 설정 화면 상태 ---- */
  function fbSignIn() {
    const boot = window.FamilySyncBoot;
    if (!boot || !boot.signIn) { toast('로그인 모듈을 아직 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'coral', 3200); return; }
    fbStatus('로그인 창을 여는 중…', 'busy');
    Promise.resolve(boot.signIn()).then((r) => {
      if (!r || r.cancelled) { fbStatus('로그인 전 · 눌러서 로그인', 'off'); return; }
      if (r.redirected) fbStatus('로그인 확인 중…', 'busy');
    }).catch((e) => {
      const code = (e && e.code) || '';
      fbStatus('로그인 전 · 눌러서 로그인', 'off');
      if (code === 'auth/unauthorized-domain') toast('이 주소에서는 로그인할 수 없어요. 관리자에게 도메인 승인을 요청해 주세요.', 'coral', 5200);
      else if (code === 'auth/blocked-by-popup-policy' || code === 'auth/popup-blocked') toast('팝업이 막혔어요. 브라우저의 팝업 차단을 꺼 주세요.', 'coral', 4600);
      else toast('로그인하지 못했어요 (' + (code || '알 수 없는 오류') + ')', 'coral', 4600);
    });
  }
  async function fbSignOut() {
    const boot = window.FamilySyncBoot;
    if (!boot || !boot.signOut) return;
    if (GCAL.on) gcalDisconnect(true);
    fbResetSession();
    fbStatus('로그인 전 · 눌러서 로그인', 'off');
    fbSyncInfo();
    try { await boot.signOut(); toast('로그아웃했어요 · 이 기기 기록만 따로 보입니다', '', 2800); }
    catch (e) {
      toast('로그아웃하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'coral', 3400);
      if (boot.auth && boot.auth.currentUser) await fbHandleAuthUser(boot, boot.auth.currentUser);
    }
  }

  /* ---- 설정 화면: 로그인 상태 문구 + (보호자·부모 모드) 미정산 정산 버튼 ---- */
  function fbSyncInfo() {
    const n = (FB.pendingLogs || []).length;
    const note = $('#fbSyncNote');
    if (note) {
      note.textContent = !FB.on
        ? (FB.blocked ? '이 계정에는 가족 권한(role)이 없어 읽기를 막았어요 · 보호자에게 이 계정의 가족 권한을 요청해 주세요.' : '아직 Firebase에 연결되지 않았어요 · 로그인하면 가족 기록을 함께 씁니다.')
        : (FB.role === 'parent' ? `보호자 기기로 연결됨 · 미정산 기록 ${n}건` : `아이 기기로 연결됨 · 정산은 보호자만 할 수 있어요 (미정산 ${n}건)`);
    }
    const inBtn = $('#fbSignInBtn');
    const outBtn = $('#fbSignOutBtn');
    if (inBtn) inBtn.hidden = !!FB.on;
    if (outBtn) outBtn.hidden = !FB.on;

    const canSettle = FB.on && FB.role === 'parent' && parentUnlocked();
    const row = $('#fbSettleRow');
    const btn = $('#fbSettleBtn');
    if (row) row.hidden = !canSettle;
    if (btn) {
      btn.disabled = !n || !!FB.settling;
      btn.textContent = FB.settling ? '정산하는 중…' : (n > 0 ? `✅ 미정산 기록 ${n}건 정산하기` : '✅ 정산할 기록이 없어요');
    }
    const sn = $('#fbSettleNote');
    if (sn) {
      sn.hidden = !canSettle;
      sn.textContent = canSettle
        ? (n > 0 ? '정산하면 아이 화면의 포인트·경험치가 확정되고, 정산된 기록은 아이가 취소할 수 없어요.' : '지금은 정산할 기록이 없어요. 아이가 미션을 끝내면 이 버튼이 살아납니다.')
        : '';
    }
  }

  async function fbSettleNow() {
    if (!FB.on || FB.role !== 'parent' || !FB.sync || !FB.sync.settleUnsettled) return;
    if (FB.settling) return;
    const session = FB.session;
    const n = (FB.pendingLogs || []).length;
    if (!n) { toast('정산할 기록이 없어요', '', 2200); return; }
    FB.settling = true; fbSyncInfo();
    try {
      const r = await FB.sync.settleUnsettled({ by: FB.uid });
      if (session !== FB.session) return;
      if (r && r.ok) toast(`✅ ${r.count}건 정산 완료 · 미션 +${r.total}P${r.bonusPoints ? ` · 도장판 +${r.bonusPoints}P` : ''}`, 'mint', 3600);
      else toast('정산하지 못했어요 — ' + ((r && r.message) || '잠시 뒤 다시 시도해 주세요.'), 'coral', 4600);
    } catch (e) {
      if (session !== FB.session) return;
      toast('정산하지 못했어요 — 잠시 뒤 다시 시도해 주세요.', 'coral', 4600);
    } finally { if (session === FB.session) { FB.settling = false; fbSyncInfo(); } }
  }

  parentSynced = fbSyncInfo;              // 부모 모드가 열리고 잠길 때 설정 화면을 다시 그립니다
  if ($('#fbSignInBtn')) $('#fbSignInBtn').addEventListener('click', fbSignIn);
  if ($('#fbSignOutBtn')) $('#fbSignOutBtn').addEventListener('click', fbSignOut);
  if ($('#fbSettleBtn')) $('#fbSettleBtn').addEventListener('click', fbSettleNow);

  /* ---- 차단/안내 화면 ---- */
  function fbGate(show, info = {}) {
    if (!FB.gate) {
      const el = document.createElement('div');
      el.className = 'fb-gate';
      el.id = 'fbGate';
      el.hidden = true;
      el.innerHTML = `<div class="fb-gate-card" role="dialog" aria-modal="true">
        <div class="fb-gate-ico">🔒</div>
        <h3 class="fb-gate-title"></h3>
        <p class="fb-gate-msg"></p>
        <div class="fb-actions"></div>
      </div>`;
      document.body.appendChild(el);
      FB.gate = el;
    }
    const el = FB.gate;
    if (!show) { el.hidden = true; document.body.classList.remove('fb-blocked'); return; }
    document.body.classList.add('fb-blocked');
    el.querySelector('.fb-gate-title').textContent = info.title || '이 기기에서는 가족 기록을 열 수 없어요';
    el.querySelector('.fb-gate-msg').textContent = info.message || '보호자에게 이 계정의 가족 권한(role) 설정을 요청해 주세요.';
    const box = el.querySelector('.fb-actions');
    box.innerHTML = '';
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); };
    if (window.FamilySyncBoot && window.FamilySyncBoot.signIn) mk('다른 계정으로 로그인', 'primary', () => fbSignIn());
    mk('이 기기만 쓰기', 'ghost', () => { FB.blocked = false; fbGate(false); fbStatus('로컬 모드', 'off'); toast('이 기기 기록만 따로 쓰고 있어요', '', 2600); });
    el.hidden = false;
  }

  /* ---- 실패 안내 + 재시도 카드 (자정·오프라인 거절 UX) ---- */
  function fbRetryCard(info = {}) {
    const kind = info.kind || 'unknown';
    if (!FB.card) {
      const el = document.createElement('div');
      el.className = 'fb-card';
      el.id = 'fbCard';
      el.hidden = true;
      el.innerHTML = `<div class="fb-card-ico">⏰</div>
        <div class="fb-card-body"><b class="fb-card-title"></b><span class="fb-card-msg"></span></div>
        <div class="fb-card-actions"></div>`;
      document.body.appendChild(el);
      FB.card = el;
    }
    const el = FB.card;
    el.querySelector('.fb-card-ico').textContent = kind === 'offline' ? '📡' : (kind === 'settled' ? '✅' : (kind === 'midnight' ? '🌙' : '⏰'));
    el.querySelector('.fb-card-title').textContent = info.title || '보내지 못했어요';
    el.querySelector('.fb-card-msg').textContent = info.message || '잠시 뒤 다시 시도해 주세요.';
    const box = el.querySelector('.fb-card-actions');
    box.innerHTML = '';
    if (info.retryable !== false) {
      const b = document.createElement('button');
      b.className = 'btn sm primary'; b.textContent = '다시 시도';
      b.onclick = () => { el.hidden = true; fbPushNow(); };
      box.appendChild(b);
    }
    const c = document.createElement('button');
    c.className = 'btn sm ghost'; c.textContent = '닫기';
    c.onclick = () => { el.hidden = true; };
    box.appendChild(c);
    el.hidden = false;
    if (notifyParentIfNeeded(info)) toast('보호자에게 알림을 남겼어요', 'mint', 2200);
  }
  // 아이가 실패를 알리면 부모 확인용 메모를 남깁니다(가족 문서는 부모만 쓰므로 아이는 남길 수 없어 로컬 메모).
  function notifyParentIfNeeded(info) {
    if (FB.role !== 'child' || !info || info.retryable !== false) return false;
    try {
      const k = 'family-dashboard:needs-parent';
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      arr.unshift({ at: hhmm(), title: info.title || '', kind: info.kind || '', message: info.message || '' });
      localStorage.setItem(k, JSON.stringify(arr.slice(0, 20)));
    } catch (e) { /* noop */ }
    return true;
  }

  /* ---- 서버 문서 → 화면 상태 ---- */
  function fbMergeLogs() {
    const seen = new Set();
    const now = Date.now();
    FB.deleted.forEach((at, k) => { if (now - at > 20000) FB.deleted.delete(k); });
    return [...FB.monthLogs, ...FB.pendingLogs]
      .map((d) => ({ ...d, id: d.id || `${d.date}_${d.mid}_${d.member || KID_ID}` }))
      // 방금 취소한 기록은 서버 스냅샷이 늦게 도착해도 되살리지 않습니다(취소 직후 20초)
      .filter((l) => !FB.deleted.has(fbDocIdOf(l)))
      .filter((l) => { if (seen.has(l.id)) return false; seen.add(l.id); return true; });
  }
  const fbDocIdOf = (l) => `${l.date}_${l.mid}_${l.member || KID_ID}`;
  function fbMergeCollection(key, docs) {
    const items = docs.map((d) => { const { id, ...rest } = d; return { ...rest, id: rest.id || id }; });
    if (key === 'missions') { S.missions = items; return; }
    if (key === 'members') { if (items.length) S.members = items; return; }
    if (['events', 'wiki', 'links', 'pointUses', 'wishlist', 'shopping', 'letters'].includes(key)) S[key] = items;
  }
  let stampCompletedSeen = null;
  let stampCompletingUntil = 0;
  function renderStampBoards() {
    const cells = $('#readingCells');
    if (!cells) return;
    const stats = FB.on ? FB.lastStats : null;
    const connected = !!stats;
    const progress = connected ? clamp(Math.round(+stats.stampProgress || 0), 0, 9) : 0;
    const completed = connected ? Math.max(0, Math.round(+stats.stampBoardsCompleted || 0)) : 0;
    const pendingBonus = connected ? Math.max(0, Math.round(+stats.stampBonusPending || 0)) : 0;
    const totalBonus = connected ? Math.max(0, Math.round(+stats.stampBonusPoints || completed * 3)) : 0;
    if (connected && stampCompletedSeen == null) stampCompletedSeen = completed;
    else if (connected && completed > stampCompletedSeen) {
      const newBoards = completed - stampCompletedSeen;
      stampCompletedSeen = completed;
      stampCompletingUntil = Date.now() + 1800;
      confetti(28);
      toast(`🎉 도장판 10/10 · +${newBoards * 3}P${pendingBonus ? ' 정산 대기' : ' 적립'}`, 'mint', 3600);
      setTimeout(() => { stampCompletingUntil = 0; renderStampBoards(); }, 1850);
    }
    const completing = Date.now() < stampCompletingUntil;
    const visibleCount = completing ? 10 : progress;
    Array.from(cells.children).forEach((cell, i) => {
      cell.classList.toggle('filled', i < visibleCount);
      cell.title = i < visibleCount ? '미션 성공 도장' : '아직 채우지 않음';
    });
    $('#readingProgress').textContent = `${visibleCount}/10`;
    $('#readingBadges').textContent = `🏅 완주 ${completed}회`;
    $('#readingReward').textContent = `누적 +${totalBonus}P`;
    $('#readingPoints').textContent = connected
      ? `모든 미션 성공 ${completed * 10 + progress}회`
      : '가족 동기화 전 · 성공 기록은 연결 후 표시돼요';
    $('#readingNote').textContent = completing
      ? `🎉 도장판 완성 · 기본 미션 포인트와 별도로 +3P${pendingBonus ? ' 정산 대기' : ' 반영'} · 다음 판 시작`
      : (connected
        ? `미션 성공 1회마다 도장 1개 · 기본 미션 포인트와 별도 · 도장판 10/10 때만 +3P${pendingBonus ? ` · +${pendingBonus}P 정산 대기` : ''}`
        : '미션 성공 1회마다 도장 1개 · 기본 미션 포인트와 별도 · 도장판 10/10 완성 시 +3P');
    const board = cells.closest('.stamp-board');
    if (board) board.classList.toggle('is-completing', completing);
  }
  function streakView() {
    if (!FB.on || !FB.readyData || !window.FamilyStreak) return { text: '연속 연결 전', title: '보호자 기기가 연결되면 오늘부터 날짜별 대상 미션을 기록합니다. 과거 기록은 추정하지 않아요.' };
    const date = window.FamilyStreak.kstDate();
    const raw = window.FamilyStreak.normalize(FB.streak || {});
    const view = raw.days[date] ? window.FamilyStreak.observe(raw, { date, monthStart: date, logs: fbMergeLogs() }) : raw;
    const st = window.FamilyStreak.status(view, date);
    return {
      text: st.known ? `연속 ${st.count}${st.capped ? '+' : ''}일 · ${st.started.slice(5).replace('-', '/')}~` : '연속 기록 준비 중',
      title: st.started
        ? `${st.started}부터 확인된 기록만 계산 · 한국 시간 기준 · 매일 처음 기록한 아이·공용 미션 전부 완료=1일 · 일요일은 접속 없이 건너뜀 · 미션 없는 날은 관찰된 날만 건너뜀 · 오늘 미완료는 자정까지 유예 · 기록 없는 날은 연결하지 않음 · 당일 미션 편집은 다음 날 기준에 반영 · 점수 추가 없음`
        : '보호자 기기가 연결되면 오늘부터 기록합니다. 과거 연속 일수는 추정하지 않아요. 점수 추가 없음',
    };
  }
  function streakObserveMaybe() {
    if (!FB.on || !FB.readyData || FB.role !== 'parent' || !FB.sync || !FB.sync.observeStreak || !window.FamilyStreak || FB.streakBusy) return;
    const date = window.FamilyStreak.kstDate(), dow = new Date(date + 'T12:00:00Z').getUTCDay();
    const required = (S.missions || []).filter((m) => m.special !== true && (m.member === KID_ID || !m.member) && missionOnDay(m, dow)).map((m) => m.id);
    const input = { date, required, skip: dow === 0 || !required.length, logs: fbMergeLogs().filter((l) => l.member === KID_ID && l.kind !== 'bonus').map((l) => ({ date: l.date, mid: l.mid, member: l.member, kind: l.kind || '' })) };
    const sig = JSON.stringify(input);
    if (sig === FB.streakSig) return;
    const session = FB.session;
    FB.streakBusy = true;
    FB.sync.observeStreak(input).then((out) => {
      if (session !== FB.session) return;
      if (out.ok) { FB.streakSig = sig; FB.streak = out.data; renderMissions(); }
    }).finally(() => { if (session === FB.session) FB.streakBusy = false; });
  }
  const fbHatchPending = new Set();
  function fbHatchMaybe() {
    const growth = PartnerGrowthCore.normalized(S.pokemon.growth);
    if (!FB.on || !FB.readyData || !FB.sync || !FB.sync.claimPartnerHatch || !growth || growth.hatched || S.pokemon.xp < 5) return;
    const session=FB.session, cycleId=growth.cycleId, key=S.pokemon.key, pending=session+':'+cycleId;
    if(fbHatchPending.has(pending))return;
    fbHatchPending.add(pending);
    FB.sync.claimPartnerHatch({cycleId}).then(result=>{
      if(session!==FB.session)return;
      if(!result.ok){if(!result.cancelled)fbRetryCard(result.error);return;}
      if(result.claimed && S.pokemon.key===key && S.pokemon.growth && S.pokemon.growth.cycleId===cycleId){
        S.pokemon.growth={cycleId,hatched:true,celebrated:true};
        try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
        renderMissions();
        if(window.PokemonEvolutionEffect)PokemonEvolutionEffect.show({from:{egg:true,name:'새 파트너 알'},to:stagesOf()[stageIndex(S.pokemon.xp)],xp:S.pokemon.xp,hatch:true});
      }
    }).finally(()=>fbHatchPending.delete(pending));
  }
  function fbRecalc() {
    // Partial snapshots must not erase cached totals/completions before all inputs arrive.
    if (!FB.on || !FB.core || !FB.readyData) return;
    const logs = fbMergeLogs();
    S.logs = logs;
    const stats = FB.core.computeScreenStats({
      summary: FB.summary || {},
      logs,
      pointUses: S.pointUses || [],
      partner: FB.partner || {},
      stageCount: (S.pokemon && stagesOf().length) || 4,
    });
    FB.lastStats = stats;
    streakObserveMaybe();
    // 모든 구성원의 오늘 완료 표시는 로그에서 복원합니다. 미션 문서에는 완료 상태를 저장하지 않습니다.
    const t = todayStr();
    FB.core.reconcileMissionCompletions(S.missions || [], logs, t);
    S.points = { total: Object.values(stats.byMember || {}).reduce((a, b) => a + Math.max(0, Math.round(+b || 0)), 0), byMember: stats.byMember };
    if (FB.partner.key) S.pokemon.key = resolvePartnerKey(FB.partner.key);
    S.pokemon.growth = PartnerGrowthCore.normalized(FB.partner.growth);
    S.pokemon.xp = Math.min(FINAL_P, Math.round(stats.partnerXp));
    // 서버에서 받은 값은 다시 보내지 않습니다(에코 방지) — localStorage 에만 조용히 반영
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
    FB.snap = fbSnapOf();
    fbSyncInfo();
    renderMissions();
    if (typeof renderLog === 'function') renderLog();
    if (typeof renderDex === 'function') renderDex();
    fbHatchMaybe();
  }
  function fbSnapOf() {
    // Keep the baseline independent of in-place edits (unshift/splice/field changes).
    return JSON.parse(JSON.stringify({
      missions: S.missions, logs: S.logs, members: S.members, events: S.events,
      wiki: S.wiki, links: S.links, pointUses: S.pointUses, wishlist: S.wishlist,
      shopping: S.shopping, letters: S.letters,
    }));
  }
  function fbOnData(detail) {
    if (!FB.on || !detail) return;
    const { key, docs } = detail;
    if (key === 'summary') FB.summary = docs[0] || null;
    else if (key === 'partner') FB.partner = docs[0] ? { key: docs[0].partnerKey, sinceXp: docs[0].sinceXp, growth: PartnerGrowthCore.normalized(docs[0].growth) } : {};
    else if (key === 'parentConfig') {
      FB.parentPinReady = true;
      const remotePin = String((docs[0] && docs[0].parentPin) || '');
      if (/^\d{4,12}$/.test(remotePin) && remotePin !== S.parentPin) {
        S.parentPin = remotePin;
        parentSession.unlockedAt = 0;
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
        renderParentBtn();
      }
    }
    else if (key === 'streak') { FB.streak = docs[0] || null; }
    else if (key === 'pendingLogs') FB.pendingLogs = docs;
    else if (key === 'logs') FB.monthLogs = docs;
    else if (key === 'eventCenter') applyEventCenterDoc(docs[0] || null);
    else if (key === 'school') {
      // 서버에 아직 문서가 없고 이 기기(부모)에 학교 정보가 있으면 자동으로 한 번 올립니다
      const doc = docs[0] || null;
      if (doc) applySchoolDoc(doc);
      else if (FB.role === 'parent' && !FB.schoolSeeded) {
        const sc = S.school || {};
        if (String(sc.name || '').trim() || String(sc.cls || '').trim() || Object.keys(sc.byDate || {}).length) {
          FB.schoolSeeded = true;
          schoolSyncMaybe(true);
        }
      }
    }
    else if (key === 'alarms') {
      // ⏰ 맞춤 알람 — 서버에 아직 문서가 없고 이 기기(부모)에 알람이 있으면 한 번 올립니다
      const doc = docs[0] || null;
      if (doc) applyAlarmDoc(doc);
      else if (FB.role === 'parent' && !FB.alarmsSeeded) {
        FB.alarmsSeeded = true;
        if ((S.alarms || []).length) alarmSyncMaybe(true);
      }
    }
    else fbMergeCollection(key, docs);
    FB.received.add(key);
    if (!FB.readyData && [...FB.requiredData].every((required) => FB.received.has(required))) {
      FB.readyData = true;
      FB.snap = fbSnapOf();
      schoolSyncMaybe();          // 서버 문서를 다 받은 뒤에만 이 기기의 학교 정보를 비교해 올립니다
    }
    fbRecalc();
  }
  function fbOnError(info) {
    if (!info) return;
    if (info.reason === 'no-role' || info.state === 'denied') { FB.on = false; FB.blocked = true; fbGate(true, info); fbStatus('권한 없음', 'off'); return; }
    fbStatus('연결 끊김 · 다시 연결 중', 'bad');
    if (info.kind === 'permission') fbGate(true, { title: '가족 문서를 읽지 못했어요', message: info.message });
  }

  /* ---- 로컬 변경분 보내기 ---- */
  function fbLocalChanged() {
    if (!FB.on || !FB.readyData || !FB.sync) return;
    clearTimeout(FB.timer);
    FB.timer = setTimeout(() => { fbPushNow(); }, 500);
  }
  async function fbPushNow() {
    if (!FB.on || !FB.readyData || !FB.sync) return { ok: true, written: [], denied: [] };
    if (FB.busy) { clearTimeout(FB.timer); FB.timer = setTimeout(() => { fbPushNow(); }, 500); return { ok: true, written: [], denied: [] }; }
    const session = FB.session;
    const prev = FB.snap || {};
    const next = fbSnapOf();
    FB.busy = true;
    let res;
    // 로그는 writeLog()/deleteLog() 로 한 건씩 직접 다룹니다(빠른 체크·취소에도 유령 기록이 남지 않게)
    try { res = await FB.sync.pushPatch({ prev, next, by: FB.uid, r: FB.role, skipLogs: true }); }
    catch (e) { res = { ok: false, written: [], denied: [], errors: [FB.core.classifyFirestoreError(e)] }; }
    finally { if (session === FB.session) FB.busy = false; }
    if (session !== FB.session) return { ok: false, cancelled: true, written: [], denied: [], errors: [] };
    if (res && res.cancelled) return res;
    if (res.denied && res.denied.length) {
      const d = res.denied[0];
      const sig = `${d.collection}:${d.reason}`;
      if (FB.notedDenied !== sig) {
        FB.notedDenied = sig;
        toast(`이 기기에서는 ${d.reason}`, '', 3200);
      }
    }
    if (!res.ok && res.errors && res.errors.length) fbRetryCard(res.errors[0]);
    else FB.snap = next;
    return res;
  }

  /* ---- 부모 전용 백업 (부모 기기에서만) ---- */
  async function fbBackupDownload() {
    if (!FB.on || !FB.sync) { exportJSONLocal(); return; }
    if (FB.role !== 'parent') {
      toast('Firestore 백업은 보호자 기기에서만 만들 수 있어요', '', 3200);
      return;
    }
    const session = FB.session;
    fbStatus('백업 만드는 중…', 'busy');
    const b = await FB.sync.createBackup({ r: FB.role });
    if (session !== FB.session) return;
    fbStatus('보호자 기기 연결됨', 'on');
    if (b.skipped) { toast('백업을 만들지 못했어요' + (b.reason ? ` (${b.reason})` : ''), 'coral', 3400); return; }
    const payload = { app: 'family-dashboard', kind: 'firestore-backup', version: 1, createdAt: b.createdAt, docCount: b.docCount, totalBytes: b.totalBytes, checksum: b.checksum, chunks: b.chunks };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `family-dashboard-firestore-${fmtDate(new Date())}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast(`백업 완료 · ${b.docCount}건 · ${b.chunks.length}조각(최대 ${Math.round((b.maxChunkBytes || 0) / 1024)}KB)`, 'mint', 4000);
  }

  /* ---- Firebase 시작 ---- */
  async function fbHandleAuthUser(boot, user, { initial = false } = {}) {
    if (!user) {
      if (FB.blocked) return;
      fbResetSession({ dropPin: !initial });
      fbStatus('로그인 전 · 눌러서 로그인', 'off');
      fbSyncInfo();
      return;
    }
    const session = fbResetSession();
    fbStatus('로그인 확인 중…', 'busy');
    const r = await boot.sync.applyAuthUser(user);
    if (session !== FB.session || r.state === 'stale') return;
    if (r.state === 'ready') {
      FB.on = true; FB.role = r.role; FB.uid = r.uid; FB.blocked = false;
      FB.requiredData = new Set([
        ...(FB.core.PLAIN_COLLECTIONS || []), 'logs', 'pendingLogs', 'summary', 'partner', 'eventCenter', 'school', 'alarms', 'streak',
        ...(r.role === 'parent' ? ['parentConfig'] : []),
      ]);
      fbGate(false);
      const sub = boot.sync.startSubscriptions();
      fbStatus(r.role === 'parent' ? '보호자 기기 연결됨' : '아이 기기 연결됨', 'on');
      if (sub && sub.error) fbOnError({ kind: 'permission', message: '구독을 시작하지 못했어요' });
    } else {
      FB.on = false; FB.role = ''; FB.uid = ''; FB.blocked = true;
      fbOnError(r);
    }
    fbSyncInfo();
  }

  function fbStart(boot) {
    if (!boot || !boot.sync || !window.FamilySync) return false;
    FB.sync = boot.sync;
    FB.core = window.FamilySync;
    // 📅 같은 창 OAuth(Google 인가 화면)로 돌아온 경우: 결과를 바로 안내하고 일정을 읽습니다
    const calReturn = (boot.calendar && typeof boot.calendar.takeOAuthResult === 'function') ? boot.calendar.takeOAuthResult() : null;
    if (calReturn) {
      if (calReturn.ok) {
        GCAL.on = true; GCAL.at = 0;
        gcalLoad({ force: true });
        toast('📅 구글 캘린더 연결됨', 'mint', 3200);
      } else if (calReturn.reason === 'cancelled') {
        gcalNote('연결을 취소했어요 · 필요하면 다시 눌러 주세요');
      } else if (calReturn.reason === 'no-token') {
        gcalNote('Google에서 ‘일정 읽기’ 허용이 끝나지 않았어요 · 다시 눌러 주세요', 'warn');
      } else {
        gcalNote('구글 캘린더를 연결하지 못했어요 · 잠시 뒤 다시 시도해 주세요', 'warn');
      }
    } else if (boot.calendar && typeof boot.calendar.current === 'function' && boot.calendar.current()) {
      // 📅 이 탭에 아직 살아 있는 구글 캘린더 토큰이 있으면 일정을 조용히 다시 읽습니다
      GCAL.on = true;
      gcalLoad();
    }
    window.addEventListener('family-sync-data', (e) => fbOnData(e.detail));
    window.addEventListener('family-sync-error', (e) => fbOnError(e.detail));
    fbStatus('로그인 확인 중…', 'busy');
    let authStateSeen = false;
    boot.sync.watchAuthState((user) => {
      const initial = !authStateSeen;
      authStateSeen = true;
      fbHandleAuthUser(boot, user, { initial });
    });
    /* redirect 로 돌아온 경우: 결과를 조용히 삼키지 않고 이유를 보여 줍니다 */
    if (boot.sync.getRedirectResult) {
      boot.sync.getRedirectResult().then((r) => {
        if (r && r.user) fbStatus('로그인 확인 중…', 'busy');
        /* 캘린더 연결이 redirect 로 다녀온 경우: 돌아온 결과에서 토큰을 이어받아 바로 읽습니다 */
        const cal = boot.calendar;
        if (cal && typeof cal.consumeRedirect === 'function') {
          const got = cal.consumeRedirect(r);
          if (got) { GCAL.on = true; GCAL.at = 0; gcalLoad({ force: true }); }
          else if (cal.redirectFailed) gcalNote('Google 화면에서 ‘일정 읽기’ 허용이 끝나지 않았어요 · 다시 연결해 주세요', 'warn');
        }
      }).catch((e) => {
        const code = (e && e.code) || '';
        fbStatus('로그인 전 · 눌러서 로그인', 'off');
        if (boot.calendar && typeof boot.calendar.consumeRedirect === 'function') boot.calendar.consumeRedirect(null);
        if (code && code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          toast('로그인을 마무리하지 못했어요 (' + code + ') · 다시 시도해 주세요.', 'coral', 5200);
        }
      });
    }
    return true;
  }
  function fbBootWait(tries = 0) {
    if (window.FamilySyncBoot && window.FamilySyncBoot.ready && window.FamilySync) { fbStart(window.FamilySyncBoot); return; }
    if (tries > 40) { fbStatus('로컬 모드', 'off'); return; }   // 12초 안에 모듈이 없으면 로컬 모드 유지
    setTimeout(() => fbBootWait(tries + 1), 300);
  }

  /* ---- 기존 함수에 Firebase 동작을 덧입히기 ---- */
  // 1) 미션 체크: 로컬 반영 후 로그를 서버로 보내고, 거절되면 화면을 되돌리고 안내 카드
  const fbBaseToggle = toggleMission;
  toggleMission = function (id) {
    const session = FB.session;
    const c = S.missions.find((x) => x.id === id);
    const wasDone = !!(c && c.doneOn === todayStr());
    const member = c ? (c.member || KID_ID) : KID_ID;
    const completionLog = c && (S.logs || []).find((x) => x.mid === id && x.date === todayStr() && (x.member || KID_ID) === member);
    if (wasDone && FB.on && completionLog && completionLog.settled === true) {
      toast('이미 정산된 기록은 취소할 수 없어요', '', 3000);
      return;
    }
    if (wasDone && FB.on && completionLog) {
      FB.deleted.set(fbDocIdOf(completionLog), Date.now());
    }
    const out = fbBaseToggle(id);
    if (!FB.on || !c) return out;
    if (!wasDone) {
      FB.sync.writeLog(c, { by: FB.uid, member }).then((r) => {
        if (session !== FB.session) return;
        if (!r.ok && !r.cancelled) {
          fbBaseToggle(id);                 // 체크를 원래대로 되돌림
          toast('기록을 보내지 못해 체크를 되돌렸어요', 'coral', 3000);
          fbRetryCard(r.error);
        }
      });
    } else {
      FB.sync.deleteLog({ date: todayStr(), mid: c.id, member, settled: !!(completionLog && completionLog.settled) }).then((r) => {
        if (session !== FB.session) return;
        if (!r.ok && !r.cancelled) fbRetryCard(r.error);
      });
    }
    fbPushNow();
    return out;
  };

  // 2) 보호자 동작: 아이 계정 기기에서는 서버 권한이 없으므로 미리 막습니다
  const fbBaseAsParent = asParent;
  asParent = function (reason, run) {
    if (FB.on && FB.role === 'child') {
      toast('이 기기는 아이 계정이에요. 보호자 기기에서 해 주세요.', '', 3400);
      return Promise.resolve();
    }
    return fbBaseAsParent(reason, run);
  };

  // 3) 파트너 입양/변경 → child_state/partner (아이가 쓸 수 있는 유일한 문서)
  const fbBasePickPartner = pickPartner;
  pickPartner = function (key) {
    const session = FB.session;
    const beforeKey = S.pokemon.key, beforeGrowth = JSON.stringify(S.pokemon.growth);
    fbBasePickPartner(key);
    if (!FB.on || (S.pokemon.key === beforeKey && JSON.stringify(S.pokemon.growth) === beforeGrowth)) return;
    const sinceXp = Math.max(0, Math.round(kidTotalPts() - Math.min(FINAL_P, Math.round(+S.pokemon.xp || 0))));
    FB.sync.adoptPartner({ key: S.pokemon.key, sinceXp, growth: S.pokemon.growth }).then((r) => { if (session === FB.session && !r.ok && !r.cancelled) fbRetryCard(r.error); });
  };

  // 4) 백업 내보내기: 부모만 · Firestore 전체 백업(1MiB 미만 조각)
  const exportJSONLocal = exportJSON;
  exportJSON = function () { fbBackupDownload(); };

  // 5) 백업 불러오기: 부모만 · 확인 후 복원
  const importJSONLocal = importJSON;
  importJSON = function (file) {
    if (!FB.on) return importJSONLocal(file);
    if (FB.role !== 'parent') { toast('복원은 보호자 기기에서만 할 수 있어요', '', 3200); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('백업 파일을 읽지 못했어요', 'coral', 3600); return; }
      const isFs = data && data.kind === 'firestore-backup' && Array.isArray(data.chunks);
      const ok = await askModal({
        title: '⬆︎ 백업 복원',
        hint: isFs
          ? `Firestore 백업 ${data.docCount || '?'}건(${(data.chunks || []).length}조각)을 그대로 덮어씁니다. 지금 기록 중 덮어쓰이지 않은 것은 남지 않아요.`
          : '이 기기(localStorage) 백업 파일이에요. 화면 상태를 이 파일로 바꿉니다.',
        fields: [], okText: '복원',
      });
      if (!ok) return;
      if (!isFs) {
        S = mergeState(data); syncDex(); save(); applyTheme(); renderAll(); renderSettings();
        toast('백업을 불러왔어요', 'mint');
        return;
      }
      fbStatus('복원 중…', 'busy');
      const session = FB.session;
      const res = await FB.sync.restoreBackup(data, { r: FB.role });
      if (session !== FB.session) return;
      fbStatus('보호자 기기 연결됨', 'on');
      if (res.ok) toast(`복원 완료 · ${res.written}건 · 확인 ${res.verified.matched}/${res.written}`, 'mint', 4000);
      else toast(`복원 실패 · ${(res.error && res.error.title) || res.reason || '오류'}`, 'coral', 4200);
    };
    reader.readAsText(file);
  };

  fbPillEl();
  fbBootWait();
  // 10분마다 구글 캘린더를 조용히 새로 읽습니다 (토큰이 살아 있을 때만)
  setInterval(() => { if (GCAL.on && !document.hidden) gcalLoad(); }, 10 * 60 * 1000);

  /* ---------------------------------------------------------------------- init */
  // 예전 #sync 링크와 family-dashboard:sync 의 Apps Script 주소/PIN은 자동으로 읽지 않습니다.
  // 기존 localStorage 값은 지우거나 전송하지 않고 그대로 둡니다.
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
  setInterval(() => { if (!document.hidden) { updateDueChips(); streakObserveMaybe(); } }, 20000);

  // 레거시 PIN 동기화는 자동 시작하지 않습니다. Firebase 시작은 위 fbBootWait()가 담당합니다.
  renderLegacySyncInfo();
  startAlarmClock();          // ⏰ 알람 감시 시작 (미션 마감·일정·맞춤)
  resetStandbyIdleTimer();
  requestScreenWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(standbyIdleTimer);
      standbyIdleTimer = null;
      releaseScreenWakeLock();
      return;
    }
    resetStandbyIdleTimer();
    requestScreenWakeLock();
    checkAlarms();              // 화면으로 돌아오면 지난 1~2분 안의 알람을 한 번 확인합니다
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(standbyIdleTimer);
    standbyIdleTimer = null;
    releaseScreenWakeLock();
  });

  window.FamilyDashboard = {
    get state() { return S; },
    version: APP_VERSION,
    now: () => hhmm(),
    kid: () => ({ id: KID_ID, name: kidLabel() }),
    settings: () => ({
      title: appTitle(),
      showAdultMissions: !!S.showAdultMissions,
      parentUnlocked: parentUnlocked(),
      hasPin: /^\d{4,12}$/.test(String(S.parentPin || '')),
    }),
    wishlist: () => (S.wishlist || []).map((w) => ({ id: w.id, title: w.title, need: w.need, cat: w.cat || 'etc', boughtAt: w.boughtAt })),
    wishCats: () => WISH_CATS.map((c) => ({ key: c.key, label: c.label })),
    parent: () => ({ unlocked: parentUnlocked(), leftMs: parentUnlocked() ? Math.max(0, PARENT_MS - (Date.now() - parentSession.unlockedAt)) : 0 }),
    pokemon: () => ({
      key: S.pokemon.key,
      label: partnerOf(S.pokemon.key).label,
      xp: Math.round(S.pokemon.xp),
      stage: stagesOf()[stageIndex(S.pokemon.xp)].name,
      totalXp: kidTotalPts(),
      balance: balancePts(),
      spent: spentPts(),
      dex: (S.pokemon.dex || []).map((d) => ({ key: d.key, finalName: d.finalName, at: d.at, times: d.times })),
      dexCount: caughtCount(),
      caught: Object.keys(S.pokemon.caught || {}).map(Number).sort((a, b) => a - b),
    }),
    lines: () => ({ gen1: GEN1_LINES.length, extra: EXTRA_LINES.length, total: LINES.length, species: POKE_NOS.length }),
    standby: () => ({ on: standbyOn, text: standbyOn ? ($('#sbTime') || {}).textContent : '', idleTimeoutMs: STANDBY_IDLE_MS, screenAwake: !!(screenWakeLock && !screenWakeLock.released) }),
    alarms: () => ({
      sound: alarmSoundPref, live: alarmAudioLive, open: !!($('#alarmPop') && !$('#alarmPop').hidden),
      list: (S.alarms || []).map((a) => ({ id: a.id, time: a.time, title: a.title, days: (a.days || []).slice(), on: a.on !== false })),
      today: alarmItemsOn(todayStr()).map((i) => ({ key: i.key, kind: i.kind, title: i.title, time: i.time })),
    }),
    alarmCheck: () => checkAlarms().map((h) => ({ key: h.key, slot: h.slot, kind: h.kind, title: h.title })),
    alarmPreview: () => previewAlarm(),
    pokemonStatus: () => $$('img[data-poke]').map((i) => ({
      name: i.dataset.pokeName || i.alt, id: i.dataset.poke,
      ok: i.naturalWidth > 0, width: i.naturalWidth,
      fallbackUsed: i.dataset.fb === '1',
    })),
  };
})();
