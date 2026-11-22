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

  function deadlineOf(mission, date, holidays = root.FamilyHolidays) {
    const source = mission || {};
    const weekday = minuteOf(source.due) == null ? '' : source.due;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return weekday;
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    const rest = day === 0 || day === 6 || !!holidays?.name(date);
    return rest && minuteOf(source.weekendDue) != null ? source.weekendDue : weekday;
  }

  function calculateMissionReward(mission, at, date, holidays) {
    const source = mission && typeof mission === 'object' ? mission : {};
    const base = intOf(source.points);
    const due = deadlineOf(source, date, holidays);
    const dueMinute = minuteOf(due);
    const atMinute = minuteOf(at);
    const goalMet = dueMinute != null && atMinute != null && atMinute <= dueMinute;
    const bonus = 0; // Legacy mission deadline bonus is intentionally ignored.
    const earlyBonus = goalMet ? earlyBonusOf(due, at) : 0;
    return { base, bonus, earlyBonus, goalMet, earned: base + bonus + earlyBonus };
  }

  function maximumEarlyBonus(due) {
    return minuteOf(due) == null ? 0 : MAX_EARLY_BONUS;
  }

  root.MissionRewards = Object.freeze({
    MAX_EARLY_BONUS,
    minuteOf,
    deadlineOf,
    earlyBonusOf,
    calculateMissionReward,
    maximumEarlyBonus,
  });
})(globalThis);

/* The household board deliberately runs five minutes ahead. Wall-clock
   decisions share this offset; elapsed durations continue to use Date.now(). */
(function(root){
 const OFFSET_MS=5*60*1000;
 root.FamilyBoardClock=Object.freeze({OFFSET_MS,now:(real=Date.now())=>new Date(Number(real)+OFFSET_MS)});
})(globalThis);
