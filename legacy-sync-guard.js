/* Legacy Apps Script credentials are never auto-restored. This helper only detects
   that local credentials exist and removes them when the user explicitly asks. */
(function installLegacySyncGuard(root) {
  const STORAGE_KEY = 'family-dashboard:sync';
  const DISABLED_KEY = 'family-dashboard:legacy-sync-disabled';
  const safeStorage = (storage) => storage || root.localStorage;

  root.FamilyLegacySync = Object.freeze({
    storageKey: STORAGE_KEY,
    disabledKey: DISABLED_KEY,
    autoStartAllowed: () => false,
    hasSavedConfig(storage) {
      try { return safeStorage(storage).getItem(STORAGE_KEY) != null; }
      catch (e) { return false; }
    },
    isDisabled(storage) {
      try { return safeStorage(storage).getItem(DISABLED_KEY) === '1'; }
      catch (e) { return true; }
    },
    disable(storage) {
      try {
        const target = safeStorage(storage);
        target.removeItem(STORAGE_KEY);
        target.setItem(DISABLED_KEY, '1');
        return true;
      } catch (e) { return false; }
    },
  });
})(globalThis);
