/* ============================================================================
   firebase-boot.js — Firebase 모듈을 app.js에 연결하는 얇은 다리

   • localhost/127.0.0.1 에서는 demo 프로젝트 + 로컬 Auth/Firestore 에뮬레이터만 사용.
   • 원격 도메인에서는 firebase-config.js 설정을 사용하고 emulator=true 면 실패 처리.
   • 로그인은 팝업 우선, 팝업이 막힌 경우에만 redirect 로 넘어갑니다.
   ========================================================================== */
import * as Sync from './firebase-sync.js?v=sealed-20261127-1';
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

/* ── 같은 창 OAuth 2.0(직접 연결) ──────────────────────────────────────────
   Firebase Auth 의 팝업(reauthenticateWithPopup)은 모바일 브라우저(삼성 인터넷·모바일 크롬)에서
   Google 로그인·경고·동의 화면을 거치는 동안 window.opener 가 끊겨 auth/popup-closed-by-user 로
   실패합니다. 그래서 캘린더는 Firebase Auth 를 거치지 않고 Google OAuth 2.0 으로 '같은 창'에서
   이동했다 돌아오는 방식(response_type=token)을 씁니다.
   - 돌아온 주소의 #access_token=… 에서 바로 읽고, 즉시 history.replaceState 로 해시를 지웁니다.
   - state 는 sessionStorage 에 두었다가 대조합니다(CSRF 방지).
   * redirect_uri 는 GCP 콘솔에 등록된 값과 글자까지 같아야 합니다. */
const GCAL_CLIENT_ID = '190598784130-pbgif2prtfa5lms78s5rf3hdqgq2q06k.apps.googleusercontent.com';
const GCAL_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_STATE_KEY = 'family-dashboard:gcal-oauth-state';

/* 승인된 리디렉션 URI 는 이 주소 하나뿐입니다 — 다른 주소(localhost 개발 등)에서는 예전 팝업 방식을 씁니다. */
function gcalRedirectUri() {
  const origin = window.location.origin || '';
  return origin === 'https://boy7902-code.github.io' ? 'https://boy7902-code.github.io/' : '';
}

function oauthState() {
  try {
    const a = new Uint8Array(16);
    window.crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 's' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/* 인가 화면에서 돌아온 주소의 해시를 읽습니다. 돌아온 흔적이 없으면 null.
   #sync= 같은 예전 해시와 섞이지 않도록 access_token=/error= 가 있을 때만 처리합니다. */
function parseOAuthHash() {
  let raw = '';
  try { raw = window.location.hash || ''; } catch (e) { return null; }
  if (raw.length < 2) return null;
  const body = raw.slice(1);
  if (!/(^|&)(access_token|error)=/.test(body)) return null;
  const params = new URLSearchParams(body);
  const token = params.get('access_token') || '';
  const error = params.get('error') || '';
  const state = params.get('state') || '';
  const expiresIn = Number(params.get('expires_in') || 0);
  let savedState = '';
  try {
    savedState = sessionStorage.getItem(OAUTH_STATE_KEY) || '';
    sessionStorage.removeItem(OAUTH_STATE_KEY);
  } catch (e) { /* 저장소가 없으면 아래 검증에서 응답을 거절합니다. */ }
  /* 주소창에서 토큰을 곧바로 지웁니다 — 기록·공유·스크린샷에 남지 않도록 */
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* noop */ }
  if (!savedState || !state || savedState !== state) {
    return { ok: false, reason: 'error', code: 'oauth/state-mismatch', message: '요청과 돌아온 응답의 state 가 다릅니다' };
  }
  if (error) {
    return {
      ok: false,
      reason: error === 'access_denied' ? 'cancelled' : 'error',
      code: 'oauth/' + error,
      message: params.get('error_description') || '',
    };
  }
  if (!token) return { ok: false, reason: 'no-token', code: 'oauth/no-token', message: '돌아온 주소에 access token 이 없습니다' };
  const seconds = expiresIn > 0 ? expiresIn : 55 * 60;
  return { ok: true, token, expiresAt: Date.now() + seconds * 1000 - TOKEN_MARGIN_MS };
}

/* 연결 실패를 화면이 구분해 안내할 수 있도록 사유를 나눕니다.
   - CAL_CANCEL_CODES: 사용자가 창을 닫았거나 Google 이 허용을 끝내지 않은 경우
   - CAL_POPUP_FALLBACK_CODES: 이 기기에서 팝업 자체가 안 되는 경우(막힘·미지원) → 이동(redirect) 방식으로 안내 */
const CAL_CANCEL_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
const CAL_POPUP_FALLBACK_CODES = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];

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
  token: '', expiresAt: 0, redirectFailed: false,
  direct: !!gcalRedirectUri(),      // true 면 팝업 없이 같은 창 OAuth 로 연결합니다
  oauthResult: null,                // 돌아온 결과 안내(화면이 한 번 가져갑니다)
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
    this.redirectFailed = false;
    let pending = false;
    try { pending = sessionStorage.getItem(REDIRECT_FLAG) === '1'; } catch (e) { /* noop */ }
    if (!pending) return null;
    try { sessionStorage.removeItem(REDIRECT_FLAG); } catch (e) { /* noop */ }
    const info = tokenFromCredential(cred);
    if (!info) { this.redirectFailed = true; return null; }
    return this.adopt(info);
  },
  /** 같은 창 OAuth 로 돌아왔을 때 토큰을 이어받고, 결과를 화면이 볼 수 있게 남깁니다. */
  captureOAuthReturn() {
    const r = parseOAuthHash();
    if (!r) return null;
    if (r.ok) this.adopt({ token: r.token, expiresAt: r.expiresAt });
    this.oauthResult = r;
    return r;
  },
  /** 화면이 결과 안내를 한 번만 가져가도록 비웁니다. */
  takeOAuthResult() {
    const r = this.oauthResult;
    this.oauthResult = null;
    return r;
  },
  /** 팝업 없이 '같은 창'에서 Google 인가 화면으로 이동합니다(모바일에서 끊기지 않음). */
  connectDirect() {
    if (!auth.currentUser) return { ok: false, reason: 'signed-out', code: 'auth/no-current-user' };
    const redirectUri = gcalRedirectUri();
    const state = oauthState();
    try { sessionStorage.setItem(OAUTH_STATE_KEY, state); } catch (e) { /* 저장 못 하면 state 대조만 건너뜁니다 */ }
    const params = new URLSearchParams({
      client_id: GCAL_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: CALENDAR_SCOPE,
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    const email = (auth.currentUser && auth.currentUser.email) || '';
    if (email) params.set('login_hint', email);
    try {
      window.location.assign(GCAL_AUTH_ENDPOINT + '?' + params.toString());
    } catch (e) {
      try { sessionStorage.removeItem(OAUTH_STATE_KEY); } catch (e2) { /* noop */ }
      return { ok: false, reason: 'error', code: 'oauth/navigate-failed', message: (e && e.message) || '' };
    }
    return { ok: false, reason: 'redirected', code: 'oauth/redirect' };
  },
  /** 같은 탭에서 Google 화면으로 이동했다 돌아오는 방식 — 팝업이 막히는 기기용 폴백입니다. */
  async connectByRedirect(cause) {
    if (!auth.currentUser) return { ok: false, reason: 'signed-out', code: 'auth/no-current-user', cause: cause || '' };
    try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch (e) { /* 저장 못 하면 돌아온 뒤 다시 눌러야 합니다 */ }
    try {
      await authSdk.reauthenticateWithRedirect(auth.currentUser, calendarProvider());
    } catch (e) {
      try { sessionStorage.removeItem(REDIRECT_FLAG); } catch (e3) { /* noop */ }
      return { ok: false, reason: 'error', code: (e && e.code) || 'auth/redirect-failed', message: (e && e.message) || '', cause: cause || '' };
    }
    return { ok: false, reason: 'redirected', code: cause || 'redirect' };
  },
  /** 사용자가 누를 때만 실행 — Google 팝업에서 '일정 읽기'를 허용받아 토큰을 받습니다.
     connect({ redirect: true }) 로 부르면 처음부터 이동(redirect) 방식으로 연결합니다. */
  async connect(options) {
    const opts = options || {};
    /* 이 주소에서는 같은 창 직접 OAuth — 팝업을 아예 쓰지 않습니다. */
    if (gcalRedirectUri()) return this.connectDirect();
    if (opts.redirect === true) return this.connectByRedirect('requested');
    if (!auth.currentUser) return { ok: false, reason: 'signed-out', code: 'auth/no-current-user' };
    let cred;
    try {
      /* reauthenticate 계열의 첫 인자는 auth 가 아니라 로그인한 사용자 객체입니다. */
      cred = await authSdk.reauthenticateWithPopup(auth.currentUser, calendarProvider());
    } catch (e) {
      const code = (e && e.code) || '';
      const message = (e && e.message) || '';
      console.warn('[gcal] connect 실패', { code, message });
      if (CAL_CANCEL_CODES.includes(code)) return { ok: false, reason: 'cancelled', code, message };
      if (CAL_POPUP_FALLBACK_CODES.includes(code)) return { ok: false, reason: 'popup-blocked', code, message };
      return { ok: false, reason: 'error', code, message };
    }
    const info = tokenFromCredential(cred);
    if (!info) {
      /* 창은 닫혔는데 access token 이 없음 — Google 쪽 허용이 끝나지 않았거나 계정이 달라진 경우입니다. */
      console.warn('[gcal] connect 결과에 access token 이 없습니다', { provider: (cred && cred.providerId) || '', operationType: (cred && cred.operationType) || '' });
      return { ok: false, reason: 'no-token', code: 'no-token', message: 'Google 응답에 access token 이 없습니다' };
    }
    const cur = this.adopt(info);
    return { ok: true, token: cur.token, expiresAt: cur.expiresAt };
  },
};
calendar.restore();
/* 같은 창 OAuth 로 돌아왔다면 여기서 토큰을 이어받습니다(주소창 해시는 즉시 지움). */
calendar.captureOAuthReturn();

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
