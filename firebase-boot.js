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

/* ── 📅 구글 캘린더(읽기 전용) 연결 ────────────────────────────────────────
   가족 대시보드는 Google 계정의 '일정 읽기'만 받아 옵니다.
   토큰은 이 탭의 메모리(sessionStorage)에만 두고, Firestore·깃허브·백업 파일에는 남기지 않습니다.
   액세스 토큰은 1시간이면 만료되므로, 화면은 만료를 확인해 스스로 다시 연결을 시도합니다. */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_MARGIN_MS = 60 * 1000;
const REDIRECT_FLAG = 'family-dashboard:gcal-redirect';   // redirect 로 다녀오는 중인지 표시(이 탭에만)

function tokenFromCredential(cred) {
  const resp = (cred && cred._tokenResponse) || {};
  /* modular SDK 의 공식 경로를 먼저 확인합니다 — 팝업·redirect 결과 모두 여기로 옵니다. */
  let oauthCred = null;
  try {
    oauthCred = cred ? authSdk.GoogleAuthProvider.credentialFromResult(cred) : null;
  } catch (e) { oauthCred = null; }
  const token = (oauthCred && oauthCred.accessToken) || (cred && cred.accessToken) || resp.oauthAccessToken || '';
  const seconds = Number(resp.oauthExpireTime || (cred && cred.expiresIn) || 0);
  const expiresAt = Date.now() + (seconds > 0 ? seconds * 1000 : 55 * 60 * 1000);
  return token ? { token, expiresAt: expiresAt - TOKEN_MARGIN_MS } : null;
}

function calendarProvider() {
  const provider = new authSdk.GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters({ prompt: 'consent' });   // 이미 허용한 계정도 토큰을 다시 받도록
  return provider;
}

const calendar = {
  token: '', expiresAt: 0,
  current() {
    return (this.token && this.expiresAt > Date.now()) ? { token: this.token, expiresAt: this.expiresAt } : null;
  },
  adopt(tokenInfo) {
    if (!tokenInfo || !tokenInfo.token) return null;
    this.token = tokenInfo.token;
    this.expiresAt = tokenInfo.expiresAt;
    try { sessionStorage.setItem('family-dashboard:gcal-token', JSON.stringify({ token: this.token, expiresAt: this.expiresAt })); } catch (e) { /* 저장 못 해도 동작 */ }
    return this.current();
  },
  restore() {
    try {
      const raw = sessionStorage.getItem('family-dashboard:gcal-token');
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && v.token && v.expiresAt > Date.now()) { this.token = v.token; this.expiresAt = v.expiresAt; }
    } catch (e) { /* noop */ }
    return this.current();
  },
  clear() {
    this.token = ''; this.expiresAt = 0;
    try { sessionStorage.removeItem('family-dashboard:gcal-token'); } catch (e) { /* noop */ }
  },
  /** redirect 로 돌아왔을 때 getRedirectResult 결과에서 '일정 읽기' 토큰을 이어받습니다. */
  consumeRedirect(cred) {
    let pending = false;
    try { pending = sessionStorage.getItem(REDIRECT_FLAG) === '1'; } catch (e) { /* noop */ }
    if (!pending) return null;
    try { sessionStorage.removeItem(REDIRECT_FLAG); } catch (e) { /* noop */ }
    const info = tokenFromCredential(cred);
    return info ? this.adopt(info) : null;
  },
  /** 사용자가 누를 때만 실행 — Google 팝업에서 '일정 읽기'를 허용받아 토큰을 받습니다. */
  async connect() {
    if (!auth.currentUser) return { ok: false, reason: 'signed-out' };
    let cred;
    try {
      /* reauthenticate 계열의 첫 인자는 auth 가 아니라 로그인한 사용자 객체입니다. */
      cred = await authSdk.reauthenticateWithPopup(auth.currentUser, calendarProvider());
    } catch (e) {
      const code = (e && e.code) || '';
      if (QUIET_CODES.includes(code)) return { ok: false, reason: 'cancelled', code };
      if (REDIRECT_CODES.includes(code)) {
        if (!auth.currentUser) return { ok: false, reason: 'signed-out' };
        try {
          try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch (e2) { /* 저장 못 하면 돌아온 뒤 다시 눌러야 합니다 */ }
          await authSdk.reauthenticateWithRedirect(auth.currentUser, calendarProvider());
        } catch (e2) {
          try { sessionStorage.removeItem(REDIRECT_FLAG); } catch (e3) { /* noop */ }
          return { ok: false, reason: 'error', code: (e2 && e2.code) || code, message: (e2 && e2.message) || '' };
        }
        return { ok: false, reason: 'redirected', code };
      }
      return { ok: false, reason: 'error', code, message: (e && e.message) || '' };
    }
    const info = tokenFromCredential(cred);
    if (!info) return { ok: false, reason: 'no-token' };
    const cur = this.adopt(info);
    return { ok: true, token: cur.token, expiresAt: cur.expiresAt };
  },
};
calendar.restore();

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
  sync, auth, db, sdk, config: CONFIG, calendar,
  signIn: signInWithGoogle,
  signOut: () => { calendar.clear(); return authSdk.signOut(auth); },
  ready: true,
};
window.dispatchEvent(new CustomEvent('family-sync-ready'));
