/* Pure mission reward rules shared by the dashboard and Firebase sync module. */
(function installMissionRewards(root) {
  'use strict';

  const MAX_EARLY_BONUS = 2;
  const minuteOf = (value) => {
    const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const intOf = (value) => Math.max(0, Math.round(+value || 0));

  function earlyBonusOf(due, at) {
    const dueMinute = minuteOf(due);
    const atMinute = minuteOf(at);
    if (dueMinute == null || atMinute == null) return 0;
    const minutesEarly = dueMinute - atMinute;
    if (minutesEarly >= 10) return MAX_EARLY_BONUS;
    if (minutesEarly >= 5) return 1;
    return 0;
  }

  function calculateMissionReward(mission, at) {
    const source = mission && typeof mission === 'object' ? mission : {};
    const base = intOf(source.points);
    const dueMinute = minuteOf(source.due);
    const atMinute = minuteOf(at);
    const goalMet = dueMinute != null && atMinute != null && atMinute <= dueMinute;
    const bonus = 0; // Legacy mission deadline bonus is intentionally ignored.
    const earlyBonus = goalMet ? earlyBonusOf(source.due, at) : 0;
    return { base, bonus, earlyBonus, goalMet, earned: base + bonus + earlyBonus };
  }

  function maximumEarlyBonus(due) {
    return minuteOf(due) == null ? 0 : MAX_EARLY_BONUS;
  }

  root.MissionRewards = Object.freeze({
    MAX_EARLY_BONUS,
    minuteOf,
    earlyBonusOf,
    calculateMissionReward,
    maximumEarlyBonus,
  });
})(globalThis);
