/* ============================================================================
   firebase-config.js — 화면에 그대로 보여도 되는 공개 설정만 둡니다
   ⚠️ 서비스 계정 키(JSON)·가족 이메일 목록·부모 PIN 은 절대 여기에 넣지 않습니다.
      부모/아이 구분은 서버 Custom Claims(role)만 믿습니다.

   실제 프로젝트: family-bcfe4 (Firebase 콘솔 → 프로젝트 설정 → 내 앱 → family-dashboard)
   - Firestore: asia-northeast3(서울) · Spark(무료) 플랜
   - 이 값들은 공개되어도 되는 식별자입니다(비밀번호·키가 아님).
   ========================================================================== */
window.FAMILY_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBDdMkHTkjQRBFGVxJD3ryoggyUvsZawx4',
  authDomain: 'family-bcfe4.firebaseapp.com',
  projectId: 'family-bcfe4',
  storageBucket: 'family-bcfe4.firebasestorage.app',
  messagingSenderId: '190598784130',
  appId: '1:190598784130:web:687fbf0e0aa750caa3809b',
  emulator: false,           // ← 실제 Firebase 프로젝트로 붙습니다
};
