import test from 'node:test';
import assert from 'node:assert/strict';
import '../mission-rewards.js';

const rewards = globalThis.MissionRewards;

test('early bonus uses the requested 5- and 10-minute tiers', () => {
  assert.equal(rewards.earlyBonusOf('08:00', '07:56'), 0);
  assert.equal(rewards.earlyBonusOf('08:00', '07:55'), 1);
  assert.equal(rewards.earlyBonusOf('08:00', '07:51'), 1);
  assert.equal(rewards.earlyBonusOf('08:00', '07:50'), 2);
  assert.equal(rewards.earlyBonusOf('08:00', '07:00'), 2, 'the bonus is capped at +2P');
  assert.equal(rewards.earlyBonusOf('08:00', '08:00'), 0);
  assert.equal(rewards.earlyBonusOf('08:00', '08:01'), 0);
});

test('legacy on-time bonus is ignored and early bonus is added separately to base points', () => {
  const reward = rewards.calculateMissionReward(
    { points: 5, due: '08:00', bonus: 3 },
    '07:50',
  );
  assert.deepEqual(reward, {
    base: 5,
    bonus: 0,
    earlyBonus: 2,
    goalMet: true,
    earned: 7,
  });
});

test('no deadline, malformed times, and at/after deadline award no timing bonus', () => {
  assert.deepEqual(rewards.calculateMissionReward({ points: 5, due: '', bonus: 3 }, '07:00'), {
    base: 5, bonus: 0, earlyBonus: 0, goalMet: false, earned: 5,
  });
  assert.deepEqual(rewards.calculateMissionReward({ points: 5, due: '08:00', bonus: 3 }, '08:00'), {
    base: 5, bonus: 0, earlyBonus: 0, goalMet: true, earned: 5,
  });
  assert.deepEqual(rewards.calculateMissionReward({ points: 5, due: '08:00', bonus: 3 }, '08:01'), {
    base: 5, bonus: 0, earlyBonus: 0, goalMet: false, earned: 5,
  });
  assert.equal(rewards.earlyBonusOf('24:00', '07:00'), 0);
  assert.equal(rewards.earlyBonusOf('08:00', '7:50'), 0);
});

test('maximum possible early bonus is added only for a valid deadline', () => {
  assert.equal(rewards.maximumEarlyBonus('08:00'), 2);
  assert.equal(rewards.maximumEarlyBonus(''), 0);
  assert.equal(rewards.maximumEarlyBonus('24:00'), 0);
});
