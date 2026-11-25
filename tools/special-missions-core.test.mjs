import test from 'node:test';
import assert from 'node:assert/strict';
import '../special-missions-core.js';
import '../streak-core.js';

const core = globalThis.FamilySpecialMissionCore;
const { POLICY } = core;

test('special mission policy is the approved weighted 1~5P wheel', () => {
  assert.equal(core.validatePolicy(), true);
  assert.equal(POLICY.version, 'special-mission-20261126-v1');
  assert.deepEqual(POLICY.rewards.map((reward) => [reward.points, reward.weight]), [
    [1, 795],
    [2, 150],
    [3, 25],
    [4, 20],
    [5, 10],
  ]);
  assert.equal(POLICY.rewards.reduce((sum, reward) => sum + reward.weight, 0), 1000);
});

test('roll boundaries map exactly to the approved distribution', () => {
  assert.equal(core.pointsFromRoll(0), 1);
  assert.equal(core.pointsFromRoll(794), 1);
  assert.equal(core.pointsFromRoll(795), 2);
  assert.equal(core.pointsFromRoll(944), 2);
  assert.equal(core.pointsFromRoll(945), 3);
  assert.equal(core.pointsFromRoll(969), 3);
  assert.equal(core.pointsFromRoll(970), 4);
  assert.equal(core.pointsFromRoll(989), 4);
  assert.equal(core.pointsFromRoll(990), 5);
  assert.equal(core.pointsFromRoll(999), 5);
  assert.throws(() => core.pointsFromRoll(-1), /invalid special mission roll/);
  assert.throws(() => core.pointsFromRoll(1000), /invalid special mission roll/);
});

test('random point picks stay within the five approved outcomes', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.ok([1, 2, 3, 4, 5].includes(core.pickPoints()));
  }
});

test('random Pokémon picks come from the stored valid pool', () => {
  assert.ok(core.POKEMON_POOL.length >= 30);
  assert.equal(new Set(core.POKEMON_POOL).size, core.POKEMON_POOL.length);
  for (let i = 0; i < 100; i += 1) {
    assert.ok(core.POKEMON_POOL.includes(core.pickPokemon()));
  }
});


test('mission-star and daily-streak schedules do not include one-day special missions', () => {
  const regular = { id: 'regular-1', member: 'm3', days: [] };
  const special = { id: 'special-1', member: 'm3', days: [4], special: true, specialDate: '2026-11-26' };
  assert.deepEqual(globalThis.FamilyMissionStars.schedule([regular, special]), [{ id: 'regular-1', days: [] }]);
});
