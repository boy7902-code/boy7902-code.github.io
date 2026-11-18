import test from 'node:test';
import assert from 'node:assert/strict';
import '../legacy-sync-guard.js';

const legacy = globalThis.FamilyLegacySync;
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('saved Apps Script credentials are detectable but never auto-restored', () => {
  const storage = memoryStorage({ [legacy.storageKey]: '{"url":"https://example.test/exec","pin":"not-a-real-pin"}' });
  assert.equal(legacy.hasSavedConfig(storage), true);
  assert.equal(legacy.autoStartAllowed(), false);
  assert.equal(legacy.isDisabled(storage), false);
});

test('explicit disable removes only the saved legacy credentials and persists the opt-out', () => {
  const storage = memoryStorage({
    [legacy.storageKey]: '{"url":"https://example.test/exec","pin":"not-a-real-pin"}',
    'family-dashboard:v1': '{"v":3}',
  });
  assert.equal(legacy.disable(storage), true);
  assert.equal(legacy.hasSavedConfig(storage), false);
  assert.equal(legacy.isDisabled(storage), true);
  assert.equal(storage.getItem('family-dashboard:v1'), '{"v":3}');
  assert.equal(legacy.autoStartAllowed(), false);
});
