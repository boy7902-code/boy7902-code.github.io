/* Parent-mode credentials are local UI state, not child-session state. */
(function installParentSessionGuard(root) {
  const DEFAULT_STATE_KEY = 'family-dashboard:v1';
  const safeStorage = (storage) => storage || root.localStorage;

  root.FamilyParentSessionGuard = Object.freeze({
    canPromptForPin({ firebaseOn = false, role = '' } = {}) {
      return !firebaseOn || role === 'parent';
    },
    reset({ session, state, storage, key = DEFAULT_STATE_KEY } = {}) {
      if (session && typeof session === 'object') session.unlockedAt = 0;
      if (state && typeof state === 'object') delete state.parentPin;
      try {
        if (!state || typeof state !== 'object') return false;
        safeStorage(storage).setItem(key, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    },
  });
})(globalThis);
