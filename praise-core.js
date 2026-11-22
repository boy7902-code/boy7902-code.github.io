/* Immutable parent-issued praise gifts. No earnings are written by this pure module. */
(function (root) {
  'use strict';
  const POLICY = Object.freeze({ approved: true, version: 'praise-20261122-v1', dailyLimit: null, weeklyLimit: null,
    rewards: Object.freeze([{ points: 1, weight: 60 }, { points: 2, weight: 28 }, { points: 3, weight: 9 }, { points: 5, weight: 2 }, { points: 10, weight: 1 }].map(Object.freeze)) });
  const giftIdOk = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  const logId = id => { if (!giftIdOk(id)) throw new Error('Bad praise gift ID'); return `praise_${id}`; };
  function validatePolicy(policy = POLICY) {
    return policy.approved === true && policy.version === POLICY.version && Array.isArray(policy.rewards)
      && policy.rewards.length === 5 && policy.rewards.every((r, i) => r.points === [1, 2, 3, 5, 10][i] && Number.isInteger(r.weight) && r.weight > 0)
      && policy.rewards.reduce((s, r) => s + r.weight, 0) === 100;
  }
  function secureRoll(crypto = root.crypto) {
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('Secure random unavailable');
    const a = new Uint32Array(1), ceiling = Math.floor(4294967296 / 100) * 100;
    for (let i = 0; i < 100; i++) { crypto.getRandomValues(a); if (a[0] < ceiling) return a[0] % 100; }
    throw new Error('Secure random failed');
  }
  function pickPoints(policy = POLICY, roll = secureRoll()) {
    if (!validatePolicy(policy) || !Number.isInteger(roll) || roll < 0 || roll >= 100) throw new Error('Praise policy is not ready');
    let boundary = 0;
    for (const row of policy.rewards) { boundary += row.weight; if (roll < boundary) return row.points; }
    throw new Error('Bad reward distribution');
  }
  function newId(crypto = root.crypto) {
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('Secure random unavailable');
    const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function validGift(gift) {
    return gift && giftIdOk(gift.id) && gift.member === 'm3' && typeof gift.reason === 'string' && gift.reason.trim().length > 0 && gift.reason.length <= 40
      && [1, 2, 3, 5, 10].includes(gift.points) && gift.policyVersion === POLICY.version && ['ready', 'claimed'].includes(gift.state);
  }
  root.FamilyPraiseCore = Object.freeze({ POLICY, giftIdOk, logId, validatePolicy, secureRoll, pickPoints, newId, validGift });
})(globalThis);
