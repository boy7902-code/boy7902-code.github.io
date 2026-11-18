/* Prevent the gesture that wakes the standby screen from activating a dashboard control. */
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

  root.FamilyStandbyGuard = Object.freeze({ createWakeClickGuard });
})(globalThis);
