/* ============================================================================
   firebase-boot.js — Firebase 모듈을 app.js에 연결하는 얇은 다리

   • localhost/127.0.0.1 에서는 demo 프로젝트 + 로컬 Auth/Firestore 에뮬레이터만 사용.
   • 원격 도메인에서는 firebase-config.js 설정을 사용하고 emulator=true 면 실패 처리.
   • 로그인은 팝업 우선, 팝업이 막힌 경우에만 redirect 로 넘어갑니다.
   ========================================================================== */
import * as Sync from './firebase-sync.js';
import { firebaseConfigForRuntime } from './firebase-runtime.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import * as authSdk from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import * as fsSdk from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const CONFIG = firebaseConfigForRuntime({
  hostname: window.location.hostname,
  configured: window.FAMILY_FIREBASE_CONFIG || null,
});

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
