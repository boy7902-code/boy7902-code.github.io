/* ⛶ 전체 화면 — 브라우저 주소창과 위·아래 작업 표시줄까지 가리는 버튼의 규칙.
   실제 화면 전환은 브라우저 API가 하므로, 여기서는 "언제 무엇을 부를지"와
   "버튼에 무엇을 보여 줄지"만 정합니다. document를 바꿔 끼울 수 있게 해 두어
   브라우저 없이도 시험할 수 있습니다(tools/fullscreen-guard.test.mjs). */
(function installFullscreenGuard(root) {
  const LABEL_ON = '전체 화면';
  const LABEL_OFF = '전체 화면 나가기';
  const UNSUPPORTED_TOAST = "브라우저 메뉴의 '홈 화면에 추가'로 전체 화면을 쓸 수 있어요";

  function createFullscreenController({ doc = root.document, onUnsupported = null } = {}) {
    const target = () => ((doc && doc.documentElement) || null);

    /** 지금 전체 화면인 요소(없으면 null). 표준·웹킷·구형 엣지 이름을 모두 봅니다. */
    function element() {
      if (!doc) return null;
      return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
    }

    function isOn() {
      return Boolean(element());
    }

    /** 이 브라우저가 전체 화면을 지원하는지 — iOS 아이폰 Safari처럼 빠진 곳이 있습니다. */
    function supported() {
      if (!doc) return false;
      const el = target();
      if (!el) return false;
      if (doc.fullscreenEnabled || doc.webkitFullscreenEnabled || doc.msFullscreenEnabled) return true;
      return Boolean(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
    }

    /** 버튼 글자·툴팁에 쓸 이름 — 지금 상태에서 눌렀을 때 될 일을 적습니다. */
    function label() {
      return isOn() ? LABEL_OFF : LABEL_ON;
    }

    function quiet(fn) {
      try {
        const p = fn();
        return p && typeof p.then === 'function' ? p.catch(() => {}) : Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }

    async function enter() {
      const el = target();
      if (!el) return false;
      if (el.requestFullscreen) {
        try {
          await quiet(() => el.requestFullscreen({ navigationUI: 'hide' }));
        } catch (e) {
          // 옵션 인자를 모르는 브라우저는 인자 없이 한 번 더
          try { await quiet(() => el.requestFullscreen()); } catch (e2) { /* 아래에서 상태로 판단 */ }
        }
      } else if (el.webkitRequestFullscreen) {
        try { await quiet(() => el.webkitRequestFullscreen()); } catch (e) { /* 상태로 판단 */ }
      } else if (el.msRequestFullscreen) {
        try { await quiet(() => el.msRequestFullscreen()); } catch (e) { /* 상태로 판단 */ }
      }
      return isOn();
    }

    async function exit() {
      if (!doc) return false;
      const fn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (fn) {
        try { await quiet(() => fn.call(doc)); } catch (e) { /* 상태로 판단 */ }
      }
      return isOn();
    }

    async function toggle() {
      if (!supported()) {
        if (typeof onUnsupported === 'function') onUnsupported(UNSUPPORTED_TOAST);
        return false;
      }
      return isOn() ? exit() : enter();
    }

    return Object.freeze({ element, isOn, supported, label, enter, exit, toggle });
  }

  root.FamilyFullscreen = Object.freeze({
    createFullscreenController,
    LABEL_ON,
    LABEL_OFF,
    UNSUPPORTED_TOAST,
  });
})(globalThis);
