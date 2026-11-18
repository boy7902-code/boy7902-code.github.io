/* ============================================================================
   firebase-boot.js — 브라우저에서 Firebase 모듈을 불러와 app.js에 연결하는 얇은 다리
   (지금 공개 사이트에서 실제로 쓰는 Firebase 동기화 모듈)

   • 여기에는 **비밀키도, 가족 이메일도** 없습니다.
     `firebase-config.js` 의 공개 설정(apiKey·projectId 등)만 씁니다.
   • 실제 프로젝트(family-bcfe4)에 붙습니다 — firebase-config.js 의 emulator 가 false.
   • 로그인은 **팝업 우선**: 서드파티 쿠키를 막는 브라우저에서도 결과를 받을 수 있습니다.
     팝업이 차단되거나 지원되지 않을 때만 redirect 로 넘어갑니다.
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

/* ── Google 로그인: 팝업 우선 → (차단·미지원일 때만) redirect ──────────────── */
const REDIRECT_CODES = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/cancelled-popup-request',
];
const QUIET_CODES = ['auth/popup-closed-by-user'];

async function signInWithGoogle() {
  const provider = new authSdk.GoogleAuthProvider();
  // 기기마다 계정을 고르게 합니다 — 태블릿에 부모 계정이 남아 있어도 아이 계정을 선택할 수 있게
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await authSdk.signInWithPopup(auth, provider);
    return cred && cred.user ? { ok: true, uid: cred.user.uid } : { ok: false, cancelled: true };
  } catch (e) {
    const code = (e && e.code) || '';
    if (REDIRECT_CODES.includes(code)) {
      await authSdk.signInWithRedirect(auth, provider);   // 결과는 돌아온 뒤 getRedirectResult 가 받습니다
      return { ok: true, redirected: true };
    }
    if (QUIET_CODES.includes(code)) return { ok: false, cancelled: true, code };
    throw e;
  }
}

window.FamilySync = Sync;                 // 순수 계산 함수(화면 통계·오류 분류)를 app.js 가 씁니다
window.FamilySyncBoot = {
  sync, auth, db, sdk, config: CONFIG,
  signIn: signInWithGoogle,
  signOut: () => authSdk.signOut(auth),
  ready: true,
};
window.dispatchEvent(new CustomEvent('family-sync-ready'));
