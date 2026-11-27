/* 특별 미션 정책 — 부모가 만든 뒤 아이에게 한 번만 보여 주는 오늘 미션.
   포인트는 동일하게 보이는 1~5칸 돌림판이지만 실제 선택은 승인된 가중치를 따릅니다. */
(function installSpecialMissionCore(root) {
  'use strict';

  const POLICY_VERSION = 'special-mission-20261126-v1';
  const SEALED_POLICY_VERSION = 'special-mission-20261127-sealed-v1';
  const POLICY = Object.freeze({
    version: POLICY_VERSION,
    totalWeight: 1000,
    rewards: Object.freeze([
      Object.freeze({ points: 1, weight: 795 }),
      Object.freeze({ points: 2, weight: 150 }),
      Object.freeze({ points: 3, weight: 25 }),
      Object.freeze({ points: 4, weight: 20 }),
      Object.freeze({ points: 5, weight: 10 }),
    ]),
  });

  // 기존 도감/PokeAPI 이미지와 바로 연결되는 1세대~9세대 친숙한 포켓몬 번호입니다.
  const POKEMON_POOL = Object.freeze([
    1, 4, 7, 25, 37, 39, 52, 54, 58, 77, 79, 94, 131, 132, 133, 137, 143, 149,
    175, 183, 194, 216, 222, 252, 255, 258, 280, 403, 448, 470, 471, 700, 778,
    810, 813, 816, 906, 909, 912, 921,
  ]);

  function validatePolicy(policy = POLICY) {
    const rewards = Array.isArray(policy && policy.rewards) ? policy.rewards : [];
    if (!rewards.length) return false;
    let total = 0;
    const seen = new Set();
    for (const reward of rewards) {
      const points = Math.round(Number(reward && reward.points));
      const weight = Math.round(Number(reward && reward.weight));
      if (!Number.isInteger(points) || points < 1 || points > 5 || seen.has(points)) return false;
      if (!Number.isInteger(weight) || weight <= 0) return false;
      seen.add(points);
      total += weight;
    }
    return total === Math.round(Number(policy.totalWeight));
  }

  function secureRoll(maxExclusive = POLICY.totalWeight) {
    const max = Math.floor(Number(maxExclusive));
    if (!Number.isSafeInteger(max) || max <= 0 || max > 0xffffffff) throw new Error('invalid random range');
    const cryptoObj = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (!cryptoObj || !cryptoObj.getRandomValues) throw new Error('secure random unavailable');
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do { cryptoObj.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function pointsFromRoll(roll, policy = POLICY) {
    if (!validatePolicy(policy)) throw new Error('invalid special mission policy');
    const value = Math.floor(Number(roll));
    if (!Number.isSafeInteger(value) || value < 0 || value >= policy.totalWeight) throw new Error('invalid special mission roll');
    let cursor = 0;
    for (const reward of policy.rewards) {
      cursor += reward.weight;
      if (value < cursor) return reward.points;
    }
    throw new Error('special mission roll overflow');
  }

  // 마감 판정(순수 함수): HH:MM 마감의 정각(HH:MM:00)까지 제때, 다음 초부터 지각. secOfDay = 실제 KST 하루 중 초.
  function isPastDue(dueHM, secOfDay) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(dueHM || ''));
    if (!m || +m[1] > 23 || +m[2] > 59 || !Number.isFinite(secOfDay)) return false;
    return secOfDay > (+m[1] * 60 + +m[2]) * 60;
  }

  function pickPoints(policy = POLICY) {
    return pointsFromRoll(secureRoll(policy.totalWeight), policy);
  }

  function pickPokemon(pool = POKEMON_POOL) {
    const values = (Array.isArray(pool) ? pool : [])
      .map((v) => Math.round(Number(v)))
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!values.length) throw new Error('empty special mission pokemon pool');
    return values[secureRoll(values.length)];
  }

  root.FamilySpecialMissionCore = Object.freeze({
    POLICY,
    POLICY_VERSION,
    SEALED_POLICY_VERSION,
    POKEMON_POOL,
    validatePolicy,
    secureRoll,
    pointsFromRoll,
    pickPoints,
    isPastDue,
    pickPokemon,
  });
})(typeof window !== 'undefined' ? window : globalThis);
