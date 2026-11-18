/* Prevent the gesture that wakes the standby screen from activating a dashboard control,
   and require a deliberate multi-tap before the standby screen hands the dashboard back. */
(function installStandbyGuard(root) {
  function createWakeClickGuard({
    setTimeoutFn = root.setTimeout.bind(root),
    clearTimeoutFn = root.clearTimeout.bind(root),
    timeoutMs = 1500,
  } = {}) {
    let pending = false;
    let timer = null;

    function clearPending() {
      pending = false;
      if (timer !== null) clearTimeoutFn(timer);
      timer = null;
    }

    return Object.freeze({
      arm() {
        clearPending();
        pending = true;
        timer = setTimeoutFn(() => {
          pending = false;
          timer = null;
        }, timeoutMs);
      },
      handleClick(event) {
        if (!pending) return false;
        clearPending();
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      },
      clear: clearPending,
    });
  }

  /**
   * 대기화면 복귀용 연속 탭 문 — 짧은 시간(windowMs) 안에 taps번 누르면 done:true.
   * 한 번 누를 때마다 { count, needed, done } 을 돌려주어 "조금 더! (1/3)" 안내에 씁니다.
   */
  function createMultiTapGate({
    taps = 3,
    windowMs = 1500,
    setTimeoutFn = root.setTimeout.bind(root),
    clearTimeoutFn = root.clearTimeout.bind(root),
  } = {}) {
    const needed = Math.max(1, Math.min(10, taps));
    let count = 0;
    let timer = null;

    function clearPending() {
      count = 0;
      if (timer !== null) clearTimeoutFn(timer);
      timer = null;
    }

    return Object.freeze({
      tap() {
        if (timer !== null) clearTimeoutFn(timer);
        timer = null;
        count += 1;
        if (count >= needed) {
          clearPending();
          return { count: needed, needed, done: true };
        }
        timer = setTimeoutFn(() => {
          count = 0;
          timer = null;
        }, windowMs);
        return { count, needed, done: false };
      },
      get count() { return count; },
      get needed() { return needed; },
      reset: clearPending,
    });
  }

  root.FamilyStandbyGuard = Object.freeze({ createWakeClickGuard, createMultiTapGate });
})(globalThis);
