/* Firebase runtime selection. Local development must never point at the family project. */
export const DEMO_EMULATOR_CONFIG = Object.freeze({
  apiKey: 'demo-emulator-placeholder',
  authDomain: 'localhost',
  projectId: 'demo-family-dashboard',
  appId: '1:000000000000:web:0000000000000000000000',
  emulator: true,
  emulatorHost: '127.0.0.1',
});

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PRODUCTION_HOSTS = new Set(['boy7902-code.github.io']);

/**
 * Local browser testing is forced onto the disposable demo project and emulators.
 * Non-local hosts require the explicitly configured production Firebase app and
 * refuse emulator mode so a public deployment cannot silently target localhost.
 */
export function firebaseConfigForRuntime({ hostname = '', configured = null } = {}) {
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (LOOPBACK_HOSTS.has(host)) return { ...DEMO_EMULATOR_CONFIG };
  if (!PRODUCTION_HOSTS.has(host)) {
    throw new Error('Firebase is disabled on unrecognized hosts; use localhost emulators for review.');
  }
  if (!configured || !configured.apiKey || !configured.projectId) {
    throw new Error('Firebase production configuration is missing; refusing to initialize.');
  }
  if (configured.emulator === true) {
    throw new Error('Firebase emulators are permitted only on a loopback hostname.');
  }
  return { ...configured, emulator: false };
}
