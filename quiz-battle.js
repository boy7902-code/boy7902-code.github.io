/* ==========================================================================
   퀴즈 배틀 B·D — quiz-battle.js
   B 기술에너지 배틀 + D 탐험·포획 수집을 가족보드 별도 게임 탭에 붙이는 모듈.

   범위 메모 (2026-11-20):
   - 사용자 승인: B·D 두 방식을 가족보드에 넣을 버전 개발 (실제 배포는 별도 확인).
   - 사용자 승인(WhatsApp 2026-11-20 22:27): 개발본에 실제 포켓몬 이름·이미지를
     출처 표시와 함께 넣는 방향. 단 출처 표시가 사용 허가 확인은 아니며,
     실제 사이트 배포는 별도 확인. 부리 권리 검토(row 38)와 별개.
   - 이미지는 런타임에 PokeAPI sprites 저장소에서 불러오고(핫링크), 저장소에
     사본을 두지 않습니다. 로드 실패 시 이모지/이니셜 대체 표시로 내려갑니다.
   - 미션 포인트·진화 경험치·Firestore와 완전히 분리. 저장은 이 기기
     localStorage('quizBattle.*')만 사용합니다.
   ========================================================================== */
((root) => {
  'use strict';

  /* ------------------------------------------------------------- 데이터 */
  /* 실제 포켓몬 도감 번호(no)와 한국어 이름. art는 ART_BASE + no + '.png'.
     emoji/initial/color는 이미지 로드 실패 시의 대체 표시용입니다. */
  const ART_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  /* 권리자 명칭은 인용 출처(PokeAPI/sprites 저장소 LICENCE: "All image contents within are Copyright The Pokémon Company.") 기준에 맞춤 */
  const CREDIT = '포켓몬 그림의 권리는 The Pokémon Company에 있습니다 · 포켓몬 이름과 그림의 출처: PokeAPI sprites 저장소';

  const DEFAULT_SPECIES = [
    { id: 'pikachu',    no: 25,  name: '피카츄',   emoji: '⚡', initial: '피', color: '#fde047', hp: 100, region: '시작',   skills: [ { name: '전기충격', cost: 1, dmg: 16 }, { name: '스파크', cost: 2, dmg: 28 }, { name: '천둥번개', cost: 3, dmg: 42 } ] },
    { id: 'bulbasaur',  no: 1,   name: '이상해씨', emoji: '🌱', initial: '이', color: '#86efac', hp: 95,  region: '들판',   skills: [ { name: '잎날가르기', cost: 1, dmg: 15 }, { name: '덩굴채찍', cost: 2, dmg: 27 }, { name: '꽃폭풍', cost: 3, dmg: 41 } ] },
    { id: 'charmander', no: 4,   name: '파이리',   emoji: '🔥', initial: '파', color: '#fdba74', hp: 88,  region: '들판',   skills: [ { name: '불꽃튀기기', cost: 1, dmg: 14 }, { name: '화염바람', cost: 2, dmg: 26 }, { name: '대화염', cost: 3, dmg: 40 } ] },
    { id: 'squirtle',   no: 7,   name: '꼬부기',   emoji: '💧', initial: '꼬', color: '#7dd3fc', hp: 90,  region: '들판',   skills: [ { name: '물대포', cost: 1, dmg: 15 }, { name: '파도타기', cost: 2, dmg: 26 }, { name: '해일', cost: 3, dmg: 40 } ] },
    { id: 'eevee',      no: 133, name: '이브이',   emoji: '🐾', initial: '이', color: '#e7c08a', hp: 85,  region: '숲길',   skills: [ { name: '몸통박치기', cost: 1, dmg: 14 }, { name: '구르기', cost: 2, dmg: 25 }, { name: '힘껏치기', cost: 3, dmg: 38 } ] },
    { id: 'jigglypuff', no: 39,  name: '푸린',     emoji: '🌸', initial: '푸', color: '#f9a8d4', hp: 85,  region: '숲길',   skills: [ { name: '노래하기', cost: 1, dmg: 14 }, { name: '통통펀치', cost: 2, dmg: 25 }, { name: '하이퍼보이스', cost: 3, dmg: 39 } ] },
    { id: 'meowth',     no: 52,  name: '나옹',     emoji: '🐱', initial: '나', color: '#fcd9a8', hp: 82,  region: '숲길',   skills: [ { name: '할퀴기', cost: 1, dmg: 14 }, { name: '연속긁기', cost: 2, dmg: 25 }, { name: '냥냥펀치', cost: 3, dmg: 38 } ] },
    { id: 'diglett',    no: 50,  name: '디그다',   emoji: '🕳️', initial: '디', color: '#d6b894', hp: 92,  region: '바위산', skills: [ { name: '구멍파기', cost: 1, dmg: 15 }, { name: '땅고르기', cost: 2, dmg: 26 }, { name: '지진', cost: 3, dmg: 40 } ] },
    { id: 'ditto',      no: 132, name: '메타몽',   emoji: '🫧', initial: '메', color: '#d8b4fe', hp: 88,  region: '바위산', skills: [ { name: '변신', cost: 1, dmg: 15 }, { name: '흉내내기', cost: 2, dmg: 27 }, { name: '모조파괴', cost: 3, dmg: 41 } ] },
    { id: 'snorlax',    no: 143, name: '잠만보',   emoji: '💤', initial: '잠', color: '#a5b4fc', hp: 110, region: '바위산', skills: [ { name: '누르기', cost: 1, dmg: 15 }, { name: '돌진', cost: 2, dmg: 26 }, { name: '파괴광선', cost: 3, dmg: 40 } ] },
    { id: 'charizard',  no: 6,   name: '리자몽',   emoji: '🐉', initial: '리', color: '#fca5a5', hp: 160, region: '보스 성', skills: [ { name: '불꽃튀기기', cost: 1, dmg: 18 }, { name: '화염방사', cost: 2, dmg: 30 }, { name: '대폭발', cost: 3, dmg: 46 } ] },
  ];
  DEFAULT_SPECIES.forEach((s) => { s.art = ART_BASE + s.no + '.png'; });

  const REGIONS = [
    { id: 'field',    name: '들판',   emoji: '🌾', pool: ['bulbasaur', 'charmander', 'squirtle'] },
    { id: 'forest',   name: '숲길',   emoji: '🌳', pool: ['eevee', 'jigglypuff', 'meowth'] },
    { id: 'mountain', name: '바위산', emoji: '⛰️', pool: ['diglett', 'ditto', 'snorlax'] },
  ];
  const BOSS_ID = 'charizard';
  const STARTER_ID = 'pikachu';
  const ENERGY_MAX = 5;
  const ENERGY_START = 3;
  const ENERGY_QUIZ_GAIN = 2;
  const ENERGY_TURN_GAIN = 1;
  const BOSS_QUIZ_COUNT = 3;
  const XP_BATTLE_WIN = 10;
  const XP_CAPTURE = 5;

  /* 학원 교재(I Can Read 파닉스) 수준의 3~4글자(CVC/CVCC) 모음 빈칸 채우기.
     뜻 힌트를 항상 보여 줘 정답이 하나로 좁혀지게 합니다. */
  const CVC_WORDS = [
    { spell: 'got',  hint: "'가졌다' (get의 과거형)", vowel: 'o' },
    { spell: 'not',  hint: "'~이 아니다'",            vowel: 'o' },
    { spell: 'lots', hint: "'많은 양'",               vowel: 'o' },
    { spell: 'hot',  hint: "'뜨겁다'",                vowel: 'o' },
    { spell: 'dog',  hint: "'개'",                    vowel: 'o' },
    { spell: 'pen',  hint: "'펜'",                    vowel: 'e' },
    { spell: 'bus',  hint: "'버스'",                  vowel: 'u' },
    { spell: 'map',  hint: "'지도'",                  vowel: 'a' },
  ];

  /* ------------------------------------------------------------- 퀴즈 엔진 (순수 함수, 테스트 대상) */
  const rnd = (n) => Math.floor(Math.random() * n);

  function makeMath(rand) {
    const r = rand || rnd;
    const a = 10 + r(80), b = 10 + r(80), ans = a + b;
    const opts = new Set([ans]);
    const deltas = [10, -10, 1, -1, 2, -2, 11, -9];
    let guard = 0;
    while (opts.size < 4 && guard++ < 100) {
      const d = ans + deltas[r(deltas.length)];
      if (d > 0) opts.add(d);
    }
    return { id: Math.random(), subject: '수학', q: a + ' + ' + b + ' = ?', hint: null, opts: shuffle(Array.from(opts), r).map(String), answer: String(ans) };
  }

  function makeEnglish(rand) {
    const r = rand || rnd;
    const w = CVC_WORDS[r(CVC_WORDS.length)];
    /* 사용자 요청(Telegram441, 11/20 21:03)의 영어 두 형식: ① 빠진 철자(모음) 채우기 ② 뜻에 맞는 단어 고르기 */
    if (r(2) === 1) {
      const opts = [w.spell];
      let pick = 0;
      while (opts.length < 4 && pick++ < 50) {
        const o = CVC_WORDS[r(CVC_WORDS.length)].spell;
        if (opts.indexOf(o) < 0) opts.push(o);
      }
      return { id: Math.random(), subject: '영어', q: '뜻에 맞는 단어를 골라요', hint: '뜻: ' + w.hint, opts: shuffle(opts, r), answer: w.spell };
    }
    const vi = w.spell.indexOf(w.vowel);
    const q = w.spell.slice(0, vi) + ' _ ' + w.spell.slice(vi + 1);
    const opts = [w.vowel];
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    let guard = 0;
    while (opts.length < 4 && guard++ < 50) {
      const v = vowels[r(5)];
      if (opts.indexOf(v) < 0) opts.push(v);
    }
    return { id: Math.random(), subject: '영어', q, hint: '뜻 힌트: ' + w.hint, opts: shuffle(opts, r), answer: w.vowel };
  }

  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (r || rnd)(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function makeQuiz(rand) { return (rand || rnd)(2) === 0 ? makeMath(rand) : makeEnglish(rand); }

  /* ------------------------------------------------------------- 저장 (이 기기만, Firebase 무관) */
  const LS = {
    read(key, fallback) {
      try { const v = root.localStorage && root.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    write(key, value) {
      try { root.localStorage && root.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
  };
  const KEY_COLLECTION = 'quizBattle.collection.v1';
  const KEY_CLEARED = 'quizBattle.cleared.v1';

  /* ------------------------------------------------------------- 게임 상태 */
  let species = DEFAULT_SPECIES.slice();
  const byId = (id) => species.filter((s) => s.id === id)[0];

  function configure(opts) {
    if (opts && Array.isArray(opts.species) && opts.species.length) species = opts.species.slice();
  }

  /* 예전 버전(임시 종) 등 현재 도감에 없는 id가 저장돼 있어도 깨지지 않게 정리 */
  function sanitizeCollection(list) {
    const seen = {};
    const known = (Array.isArray(list) ? list : []).filter((id) => {
      if (!byId(id) || seen[id]) return false;
      seen[id] = true; return true;
    });
    if (known.indexOf(STARTER_ID) < 0) known.unshift(STARTER_ID);
    return known;
  }

  /* ------------------------------------------------------------- DOM */
  function init(mount) {
    const el = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!el) return false;

    const state = {
      mode: 'home',           // home | battle | explore
      xp: 0,                  // 이 판 안에서만 쓰는 시험 점수 (미션 포인트와 무관)
      collection: sanitizeCollection(LS.read(KEY_COLLECTION, [STARTER_ID])),
      cleared: LS.read(KEY_CLEARED, []),
      // battle
      fighter: null, enemy: null, php: 0, ehp: 0, energy: ENERGY_START, over: null,
      battleGen: 0,        // 배틀 세대 — 이탈·재시작 뒤에도 지연된 적 턴이 새 배틀을 건드리지 못하게 하는 가드
      // explore
      meet: null, bossStep: 0,
      quiz: null, picked: null, log: '방식을 골라요!',
      confirmReset: false,
    };
    const save = () => { LS.write(KEY_COLLECTION, state.collection); LS.write(KEY_CLEARED, state.cleared); };
    const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    /* 얼굴 표시: 실제 일러스트(<img>) 우선, 로드 실패 시 이모지/이니셜 배지로 대체 */
    function textFace(s, base) {
      const emoji = s.emoji || '❔';
      if (emojiOk(emoji)) return h('span', base, emoji);
      const d = h('span', base + ' qb-face-alt', s.initial || String(s.name || '?').charAt(0));
      d.style.background = s.color || '#c7d2fe';
      return d;
    }
    function face(s, cls) {
      const base = cls || 'qb-emoji';
      if (s.art) {
        const img = document.createElement('img');
        img.className = base + ' qb-art';
        img.src = s.art;
        img.alt = String(s.name || '포켓몬');
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          if (img.parentNode) img.parentNode.replaceChild(textFace(s, base), img);
        });
        return img;
      }
      return textFace(s, base);
    }
    const btn = (cls, text, onClick, disabled) => { const b = h('button', cls, text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); if (disabled) b.disabled = true; return b; };

    /* ---- 퀴즈 카드: 문제마다 새로 렌더 (이전 선택 상태가 남지 않도록) ---- */
    function renderQuiz(host, onDone, note) {
      host.textContent = '';
      const quiz = state.quiz;
      const card = h('div', 'qb-quiz');
      card.appendChild(h('div', 'qb-quiz-head', '❓ 퀴즈 · ' + quiz.subject));
      card.appendChild(h('div', 'qb-quiz-q', quiz.q));
      if (quiz.hint) card.appendChild(h('div', 'qb-quiz-hint', quiz.hint));
      const opts = h('div', 'qb-quiz-opts');
      quiz.opts.forEach((o) => {
        opts.appendChild(btn('qb-opt', o, (ev) => {
          if (state.picked) return;
          state.picked = o;
          Array.from(opts.children).forEach((c) => {
            if (c.textContent === quiz.answer) c.classList.add('right');
            else if (c.textContent === o) c.classList.add('wrong');
          });
          setTimeout(() => {
            state.picked = null;
            if (state.quiz !== quiz) return; // 정오 표시 중 화면을 나갔거나 새 문제가 열리면 이전 선택은 무시
            onDone(o === quiz.answer);
          }, 650);
        }));
      });
      card.appendChild(opts);
      card.appendChild(h('div', 'qb-quiz-note', note));
      host.appendChild(card);
    }

    /* ---- B: 기술에너지 배틀 ---- */
    function startBattle(id) {
      const foes = species.filter((s) => s.id !== id);
      state.fighter = byId(id);
      state.enemy = foes[rnd(foes.length)];
      state.php = state.fighter.hp;
      state.ehp = state.enemy.hp;
      state.energy = ENERGY_START;
      state.over = null; state.quiz = null;
      state.battleGen += 1;
      state.log = '야생의 ' + state.enemy.name + '(이)가 나타났다!';
      render();
    }
    function enemyTurn(nextEhp, nextEnergy) {
      if (nextEhp <= 0) {
        state.over = 'win'; state.xp += XP_BATTLE_WIN;
        state.log = '이겼다! +' + XP_BATTLE_WIN + ' XP (시험용 게임 점수)';
      } else {
        const dmg = 8 + rnd(9);
        state.php = Math.max(0, state.php - dmg);
        state.energy = Math.min(ENERGY_MAX, nextEnergy + ENERGY_TURN_GAIN);
        if (state.php <= 0) {
          state.over = 'lose';
          state.log = state.enemy.name + '에게 졌어요. 얻은 것은 그대로예요. 다시 도전할 수 있어요!';
        } else state.log = state.enemy.name + '의 반격! ' + dmg + ' 데미지.';
      }
      render();
    }
    function attack(sk) {
      if (state.over || state.energy < sk.cost) return;
      const ne = Math.max(0, state.ehp - sk.dmg);
      state.ehp = ne;
      state.log = state.fighter.name + '의 ' + sk.name + '! ' + sk.dmg + ' 데미지!';
      state.energy -= sk.cost;
      render();
      const gen = state.battleGen;
      setTimeout(() => { if (gen === state.battleGen) enemyTurn(ne, state.energy); }, 700); // 세대 가드: 나간 뒤 시작한 새 배틀에 이전 반격이 닿지 않게
    }
    function battleQuizDone(ok) {
      state.quiz = null;
      if (ok) {
        state.energy = Math.min(ENERGY_MAX, state.energy + ENERGY_QUIZ_GAIN);
        state.log = '정답! 에너지 +' + ENERGY_QUIZ_GAIN + ' 충전 (' + state.energy + '/' + ENERGY_MAX + ')';
      } else state.log = '아쉬워요, 충전은 다음에! 에너지는 줄지 않아요.';
      render();
      const gen = state.battleGen;
      setTimeout(() => { if (gen === state.battleGen) enemyTurn(state.ehp, state.energy); }, 700); // 세대 가드
    }

    /* ---- D: 탐험·포획 ---- */
    const bossOpen = () => state.cleared.length >= REGIONS.length;
    function enterRegion(r) {
      const s = byId(r.pool[rnd(r.pool.length)]);
      state.meet = { species: s, region: r.id, boss: false };
      state.quiz = makeQuiz();
      state.log = '풀숲에서 ' + s.name + '(이)가 나타났다!';
      render();
    }
    function enterBoss() {
      state.meet = { species: byId(BOSS_ID), region: 'boss', boss: true };
      state.bossStep = 0;
      state.quiz = makeQuiz();
      state.log = '보스 ' + byId(BOSS_ID).name + ' 등장! ' + BOSS_QUIZ_COUNT + '문 연속 정답이면 포획!';
      render();
    }
    function exploreQuizDone(ok) {
      const meet = state.meet;
      if (!meet) return;
      if (meet.boss) {
        if (ok && state.bossStep < BOSS_QUIZ_COUNT - 1) {
          state.bossStep += 1;
          state.quiz = makeQuiz();
          state.log = '정답! (' + state.bossStep + '/' + BOSS_QUIZ_COUNT + ')';
        } else if (ok) {
          if (state.collection.indexOf(BOSS_ID) < 0) state.collection.push(BOSS_ID);
          state.xp += XP_BATTLE_WIN;
          state.log = '대단해요! ' + byId(BOSS_ID).name + '을 포획했어요! +' + XP_BATTLE_WIN + ' XP (시험용)';
          state.meet = null; state.quiz = null; save();
        } else {
          state.log = '보스가 물러났어요. 잃는 것은 없어요. 다시 도전!';
          state.meet = null; state.quiz = null;
        }
      } else {
        if (ok) {
          const already = state.collection.indexOf(meet.species.id) >= 0;
          if (!already) state.collection.push(meet.species.id);
          if (state.cleared.indexOf(meet.region) < 0) state.cleared.push(meet.region);
          state.xp += XP_CAPTURE;
          state.log = '정답! ' + meet.species.name + ' 포획' + (already ? ' (이미 있음)' : '') + '! +' + XP_CAPTURE + ' XP (시험용)';
          save();
        } else {
          state.log = meet.species.name + '(이)가 도망갔어요. 잃는 것은 없어요. 다시 만날 수 있어요!';
        }
        state.meet = null; state.quiz = null;
      }
      render();
    }

    /* ---- 렌더 ---- */
    function hpCard(s, hp, tag) {
      const c = h('div', 'qb-hpcard');
      const b = h('b', null, s.name);
      if (tag) { const i = h('i', null, tag); b.appendChild(i); }
      c.appendChild(b);
      const bar = h('div', 'qb-hpbar');
      const fill = h('i');
      fill.style.width = Math.max(0, Math.round(hp / s.hp * 100)) + '%';
      bar.appendChild(fill); c.appendChild(bar);
      c.appendChild(h('span', null, hp + ' / ' + s.hp));
      return c;
    }
    function pips(n) {
      const p = h('span', 'qb-pips');
      for (let i = 0; i < ENERGY_MAX; i++) p.appendChild(h('i', i < n ? 'on' : ''));
      return p;
    }

    function render() {
      el.textContent = '';
      const top = h('div', 'qb-topbar');
      if (state.mode !== 'home') {
        top.appendChild(btn('qb-btn', '← 방식 선택으로', () => { state.mode = 'home'; state.meet = null; state.quiz = null; state.battleGen += 1; render(); }));
        top.appendChild(h('span', 'qb-xp', '게임 XP ' + state.xp + ' · 시험용, 이 판 안에서만'));
      }
      el.appendChild(top);

      if (state.mode === 'home') renderHome();
      else if (state.mode === 'battle') renderBattle();
      else renderExplore();

      /* 출처 표시는 모든 화면에 항상 보이게 */
      el.appendChild(h('div', 'qb-credit', CREDIT));
    }

    function renderHome() {
      const modes = h('div', 'qb-modes');
      modes.appendChild(btn('qb-mode', '', () => { state.mode = 'battle'; state.fighter = null; state.log = '출전할 파트너를 골라요.'; render(); }));
      modes.lastChild.appendChild(h('span', 'qb-mode-t', 'B. 기술에너지 배틀'));
      modes.lastChild.appendChild(h('span', 'qb-mode-d', '퀴즈 정답으로 에너지를 채워 원하는 기술 발동'));
      modes.appendChild(btn('qb-mode', '', () => { state.mode = 'explore'; state.log = '지역을 골라 탐험해요!'; render(); }));
      modes.lastChild.appendChild(h('span', 'qb-mode-t', 'D. 탐험 · 포획 수집'));
      modes.lastChild.appendChild(h('span', 'qb-mode-d', '지역을 탐험하고 퀴즈 정답으로 포켓몬 포획'));
      el.appendChild(modes);

      el.appendChild(h('div', 'qb-sub', '내 포켓몬 (' + state.collection.length + '마리)'));
      const dex = h('div', 'qb-dex');
      state.collection.forEach((id) => {
        const s = byId(id);
        const cell = h('div', 'qb-cell');
        cell.appendChild(face(s, 'qb-cellemoji'));
        cell.appendChild(h('b', null, s.name));
        cell.appendChild(h('i', null, s.region === '시작' ? '시작 파트너' : s.region));
        dex.appendChild(cell);
      });
      el.appendChild(dex);

      if (!state.confirmReset) {
        el.appendChild(btn('qb-btn qb-small', '수집 기록 지우기', () => { state.confirmReset = true; render(); }));
      } else {
        const row = h('div', 'qb-rowbtns');
        row.appendChild(h('span', null, '정말 지울까요?'));
        row.appendChild(btn('qb-btn qb-go', '네, 지워요', () => {
          state.collection = [STARTER_ID]; state.cleared = []; save();
          state.confirmReset = false; render();
        }));
        row.appendChild(btn('qb-btn', '아니요', () => { state.confirmReset = false; render(); }));
        el.appendChild(row);
      }
      el.appendChild(h('div', 'qb-foot', '시험판: 실제 미션 포인트·진화 경험치와 무관 · 수집 기록은 이 기기에만 저장'));
    }

    function renderBattle() {
      if (!state.fighter) {
        el.appendChild(h('div', 'qb-sub', '출전할 파트너를 골라요 (보유한 포켓몬 중 선택)'));
        const pick = h('div', 'qb-pick');
        state.collection.forEach((id) => {
          const s = byId(id);
          const b = btn('qb-pickbtn', '', () => startBattle(id));
          b.appendChild(face(s, 'qb-pickemoji'));
          b.appendChild(h('b', null, s.name));
          b.appendChild(h('i', null, 'HP ' + s.hp));
          pick.appendChild(b);
        });
        el.appendChild(pick);
        return;
      }
      const arena = h('div', 'qb-arena');
      const me = h('div', 'qb-fighter');
      me.appendChild(face(state.fighter));
      me.appendChild(hpCard(state.fighter, state.php, '내 파트너'));
      const foe = h('div', 'qb-fighter');
      foe.appendChild(face(state.enemy));
      foe.appendChild(hpCard(state.enemy, state.ehp, '야생'));
      arena.appendChild(me); arena.appendChild(foe);
      el.appendChild(arena);

      const en = h('div', 'qb-energy');
      en.appendChild(h('b', null, '기술에너지'));
      en.appendChild(pips(state.energy));
      en.appendChild(h('span', null, state.energy + ' / ' + ENERGY_MAX));
      el.appendChild(en);
      el.appendChild(h('div', 'qb-msg', state.log));

      if (state.quiz) {
        const host = h('div');
        el.appendChild(host);
        renderQuiz(host, battleQuizDone, '정답이면 에너지 +' + ENERGY_QUIZ_GAIN + ' · 틀려도 에너지는 줄지 않아요 · 시간 제한 없음');
      } else if (state.over) {
        const row = h('div', 'qb-rowbtns');
        row.appendChild(btn('qb-btn qb-go', '한 번 더', () => startBattle(state.fighter.id)));
        row.appendChild(btn('qb-btn', '파트너 바꾸기', () => { state.fighter = null; render(); }));
        el.appendChild(row);
      } else {
        const acts = h('div', 'qb-actions');
        state.fighter.skills.forEach((sk) => {
          const b = btn('qb-act', '', () => attack(sk), state.energy < sk.cost);
          b.appendChild(h('b', null, sk.name));
          b.appendChild(h('span', null, '에너지 ' + sk.cost + ' · 데미지 ' + sk.dmg));
          acts.appendChild(b);
        });
        const q = btn('qb-act qb-quizbtn', '', () => { state.quiz = makeQuiz(); render(); });
        q.appendChild(h('b', null, '❓ 퀴즈로 충전'));
        q.appendChild(h('span', null, '수학/영어 · 정답이면 +' + ENERGY_QUIZ_GAIN));
        acts.appendChild(q);
        el.appendChild(acts);
      }
      el.appendChild(h('div', 'qb-foot', '턴이 지나도 에너지가 조금 차서 퀴즈는 선택 보너스 · 숫자는 시험용 예시'));
    }

    function renderExplore() {
      if (!state.meet) {
        const map = h('div', 'qb-map');
        REGIONS.forEach((r) => {
          const done = state.cleared.indexOf(r.id) >= 0;
          const b = btn('qb-node' + (done ? ' done' : ''), '', () => enterRegion(r));
          b.appendChild(h('span', null, r.emoji));
          b.appendChild(h('b', null, r.name));
          b.appendChild(h('i', null, done ? '클리어 ✓' : '탐험하기'));
          map.appendChild(b);
        });
        const open = bossOpen();
        const boss = btn('qb-node boss' + (open ? '' : ' lock'), '', open ? enterBoss : null, !open);
        boss.appendChild(h('span', null, '🏰'));
        boss.appendChild(h('b', null, '보스 성'));
        boss.appendChild(h('i', null, open ? '도전!' : REGIONS.length + '지역 클리어 시 열림'));
        map.appendChild(boss);
        el.appendChild(map);
        el.appendChild(h('div', 'qb-msg', state.log));
      } else {
        const arena = h('div', 'qb-arena small');
        const f = h('div', 'qb-fighter');
        f.appendChild(face(state.meet.species));
        /* 보스전은 실제 HP 전투 없이 퀴즈 포획이라, HP 바를 남은 문항 수에 비례해 표시해 단계 표시(n/3)와 맞춘다 */
        const dispHp = state.meet.boss ? Math.max(1, Math.round(state.meet.species.hp * (BOSS_QUIZ_COUNT - state.bossStep) / BOSS_QUIZ_COUNT)) : state.meet.species.hp;
        f.appendChild(hpCard(state.meet.species, dispHp, state.meet.boss ? '보스 · ' + state.bossStep + '/' + BOSS_QUIZ_COUNT : '야생'));
        arena.appendChild(f);
        el.appendChild(arena);
        el.appendChild(h('div', 'qb-msg', state.log));
        if (state.quiz) {
          const host = h('div');
          el.appendChild(host);
          renderQuiz(host, exploreQuizDone, state.meet.boss
            ? '연속 ' + BOSS_QUIZ_COUNT + '문 정답이면 포획 · 틀려도 잃는 것은 없어요'
            : '정답이면 포획 성공 · 틀리면 도망갈 뿐 잃는 것은 없어요');
        } else {
          el.appendChild(btn('qb-btn qb-go', '지도로 돌아가기', () => { state.meet = null; render(); }));
        }
      }
      el.appendChild(h('div', 'qb-foot', '수집 기록은 이 기기에만 저장 · 도장판·미션 포인트 연계 없음'));
    }

    render();
    return true;
  }

  /* 이모지 글꼴 지원 판별: 캔버스 픽셀이 tofu(결손 글리프)나 공백과 같으면 미지원 */
  const emojiOkCache = {};
  function emojiOk(ch) {
    if (emojiOkCache[ch] !== undefined) return emojiOkCache[ch];
    let ok = true;
    try {
      const size = 32;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.font = '28px sans-serif';
      const pix = (t) => { ctx.clearRect(0, 0, size, size); ctx.fillText(t, 0, 26); return ctx.getImageData(0, 0, size, size).data.join(','); };
      const tofu = pix('\u{10FFFE}');
      const blank = pix('');
      const mine = pix(ch);
      ok = mine !== tofu && mine !== blank;
    } catch (e) { ok = true; }
    emojiOkCache[ch] = ok; return ok;
  }

  root.QuizBattle = Object.freeze({
    version: '0.2.3',
    ENERGY_MAX, ENERGY_START, ENERGY_QUIZ_GAIN, ENERGY_TURN_GAIN, BOSS_QUIZ_COUNT,
    XP_BATTLE_WIN, XP_CAPTURE,
    CVC_WORDS, REGIONS, BOSS_ID, STARTER_ID,
    ART_BASE, CREDIT,
    DEFAULT_SPECIES,
    makeMath, makeEnglish, makeQuiz,
    emojiOk,
    configure, init,
  });
})(typeof window !== 'undefined' ? window : globalThis);
