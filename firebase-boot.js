/* ============================================================================
   firebase-boot.js — 브라우저에서 Firebase 모듈을 불러와 app.js에 연결하는 얇은 다리
   (테스트 사본 전용 · 실제 사이트에는 아직 넣지 않았습니다)

   • 여기에는 **비밀키도, 가족 이메일도** 없습니다.
     `firebase-config.js` 의 공개 설정(apiKey·projectId 등)만 씁니다.
   • 지금은 에뮬레이터를 향하도록 되어 있습니다(emulator: true).
     실제 프로젝트에 붙일 때는 firebase-config.js 의 emulator 를 false 로 바꾸고
     콘솔에서 받은 설정값을 넣으면 됩니다.
   ========================================================================== */
import * as Sync from './firebase-sync.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import * as authSdk from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import * as fsSdk from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const CONFIG = window.FAMILY_FIREBASE_CONFIG || {
  apiKey: 'demo-emulator-placeholder',
  authDomain: 'demo-family-dashboard.firebaseapp.com',
  projectId: 'demo-family-dashboard',
  appId: '1:000000000000:web:0000000000000000000000',
  emulator: true,
};

const app = initializeApp(CONFIG);
const auth = authSdk.getAuth(app);
const db = fsSdk.getFirestore(app);

if (CONFIG.emulator) {
  authSdk.connectAuthEmulator(auth, `http://${CONFIG.emulatorHost || '127.0.0.1'}:9099`, { disableWarnings: true });
  fsSdk.connectFirestoreEmulator(db, CONFIG.emulatorHost || '127.0.0.1', 8080);
}

/* firebase-sync.js 는 SDK 함수 묶음을 주입받습니다 — 브라우저에서는 이렇게 넘깁니다. */
const sdk = { ...fsSdk, ...authSdk };
const sync = Sync.createFamilySync({
  sdk, auth, db,
  onData: (payload) => window.dispatchEvent(new CustomEvent('family-sync-data', { detail: payload })),
  onError: (info) => window.dispatchEvent(new CustomEvent('family-sync-error', { detail: info })),
});

window.FamilySync = Sync;                 // 순수 계산 함수(화면 통계·오류 분류)를 app.js 가 씁니다
window.FamilySyncBoot = {
  sync, auth, db, sdk, config: CONFIG,
  signIn: () => authSdk.signInWithRedirect(auth, new authSdk.GoogleAuthProvider()),
  ready: true,
};
window.dispatchEvent(new CustomEvent('family-sync-ready'));
