import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_EMULATOR_CONFIG, firebaseConfigForRuntime } from '../firebase-runtime.js';

const productionConfig = Object.freeze({
  apiKey: 'public-config-only',
  projectId: 'family-bcfe4',
  authDomain: 'family-bcfe4.firebaseapp.com',
  emulator: false,
});

test('loopback always selects the demo emulator config, ignoring configured project', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const resolved = firebaseConfigForRuntime({ hostname, configured: productionConfig });
    assert.equal(resolved.projectId, 'demo-family-dashboard');
    assert.equal(resolved.emulator, true);
    assert.equal(resolved.emulatorHost, '127.0.0.1');
  }
  assert.equal(DEMO_EMULATOR_CONFIG.projectId, 'demo-family-dashboard');
});

test('remote host uses only explicit non-emulator config', () => {
  const resolved = firebaseConfigForRuntime({ hostname: 'boy7902-code.github.io', configured: productionConfig });
  assert.equal(resolved.projectId, 'family-bcfe4');
  assert.equal(resolved.emulator, false);
  assert.notEqual(resolved, productionConfig);
});

test('remote host refuses missing or emulator-only production configuration', () => {
  assert.throws(() => firebaseConfigForRuntime({ hostname: 'boy7902-code.github.io' }), /configuration is missing/);
  assert.throws(() => firebaseConfigForRuntime({
    hostname: 'boy7902-code.github.io',
    configured: { apiKey: 'demo', projectId: 'demo-family-dashboard', emulator: true },
  }), /permitted only on a loopback hostname/);
  assert.throws(() => firebaseConfigForRuntime({
    hostname: 'temporary-preview.example.net', configured: productionConfig,
  }), /disabled on unrecognized hosts/);
});
