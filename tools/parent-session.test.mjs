import test from 'node:test';
import assert from 'node:assert/strict';
import '../parent-session-guard.js';

const guard = globalThis.FamilyParentSessionGuard;
const STATE_KEY = 'family-dashboard:v1';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('parent unlock and cached PIN do not survive logout into child or local mode', () => {
  const state = { v: 3, parentPin: '2468', dashboardTitle: 'Family' };
  const session = { unlockedAt: Date.now() };
  const storage = memoryStorage({ [STATE_KEY]: JSON.stringify(state) });

  assert.equal(guard.canPromptForPin({ firebaseOn: true, role: 'parent' }), true);
  assert.notEqual(session.unlockedAt, 0);

  const reset = guard.reset({ session, state, storage, key: STATE_KEY });
  assert.equal(reset, true);
  assert.equal(session.unlockedAt, 0);
  assert.equal(Object.hasOwn(state, 'parentPin'), false);

  const persisted = JSON.parse(storage.getItem(STATE_KEY));
  assert.equal(Object.hasOwn(persisted, 'parentPin'), false);
  assert.equal(persisted.dashboardTitle, 'Family');
  assert.equal(guard.canPromptForPin({ firebaseOn: true, role: 'child' }), false);
  assert.equal(guard.canPromptForPin({ firebaseOn: false, role: '' }), true);
});

test('initial signed-out auth resolution locks parent mode but preserves a local PIN', () => {
  const state = { v: 3, parentPin: '1357', dashboardTitle: 'Family' };
  const session = { unlockedAt: Date.now() };
  const storage = memoryStorage({ [STATE_KEY]: JSON.stringify(state) });

  guard.reset({ session, state, storage, key: STATE_KEY, dropPin: false });

  assert.equal(session.unlockedAt, 0);
  assert.equal(state.parentPin, '1357');
  assert.equal(JSON.parse(storage.getItem(STATE_KEY)).parentPin, '1357');
});

const appSource = await (await import('node:fs/promises')).readFile(new URL('../app.js', import.meta.url), 'utf8');

test('app logout and auth reset use the tested parent cleanup and child PIN gate', () => {
  const resetBlock = appSource.match(/function fbResetSession\([^)]*\) \{([\s\S]*?)\n  \}/);
  const signOutBlock = appSource.match(/async function fbSignOut\(\) \{([\s\S]*?)\n  \}/);
  const authHandlerBlock = appSource.match(/async function fbHandleAuthUser\(boot, user,[\s\S]*?\) \{([\s\S]*?)\n  \}/);
  const authStartBlock = appSource.match(/function fbStart\(boot\) \{([\s\S]*?)\n  \}/);
  const pinPromptBlock = appSource.match(/async function askParentPin\(reason\) \{([\s\S]*?)\n  \}/);

  assert.ok(resetBlock, 'fbResetSession should exist');
  assert.ok(signOutBlock, 'fbSignOut should exist');
  assert.ok(authHandlerBlock, 'fbHandleAuthUser should exist');
  assert.ok(authStartBlock, 'fbStart should exist');
  assert.ok(pinPromptBlock, 'askParentPin should exist');
  assert.match(resetBlock[1], /FamilyParentSessionGuard\.reset\(/);
  assert.match(resetBlock[1], /dropPin/);
  assert.match(signOutBlock[1], /fbResetSession\(\)/);
  assert.match(authHandlerBlock[1], /dropPin: !initial/);
  assert.match(authStartBlock[1], /let authStateSeen = false/);
  assert.match(authStartBlock[1], /const initial = !authStateSeen/);
  assert.match(pinPromptBlock[1], /FamilyParentSessionGuard\.canPromptForPin\(/);
});
