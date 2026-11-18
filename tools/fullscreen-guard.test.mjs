import test from 'node:test';
import assert from 'node:assert/strict';
import '../fullscreen-guard.js';

const { createFullscreenController, LABEL_ON, LABEL_OFF, UNSUPPORTED_TOAST } = globalThis.FamilyFullscreen;

function fakeDoc({ fullscreenEnabled = true, outcome = 'ok', initial = null, webkit = false } = {}) {
  const doc = {
    fullscreenElement: initial,
    fullscreenEnabled,
    documentElement: {},
    calls: [],
    exitFullscreen() {
      doc.calls.push('exit');
      doc.fullscreenElement = null;
      return Promise.resolve();
    },
  };
  const request = (opts) => {
    doc.calls.push(opts ? 'request:opts' : 'request');
    if (outcome === 'reject') return Promise.reject(new Error('denied'));
    if (outcome === 'throwOnce') {
      // 옵션 인자를 모르는 브라우저처럼 첫 호출만 동기 오류
      if (opts) throw new TypeError('options not supported');
    }
    doc.fullscreenElement = doc.documentElement;
    return Promise.resolve();
  };
  if (webkit) doc.documentElement.webkitRequestFullscreen = () => request(null);
  else doc.documentElement.requestFullscreen = request;
  return doc;
}

test('지원하지 않는 브라우저에서는 안내 문구만 띄우고 화면을 바꾸지 않는다', async () => {
  const doc = { documentElement: {}, exitFullscreen() {} };
  const shown = [];
  const ctl = createFullscreenController({ doc, onUnsupported: (m) => shown.push(m) });
  assert.equal(ctl.supported(), false);
  assert.equal(await ctl.toggle(), false);
  assert.deepEqual(shown, [UNSUPPORTED_TOAST]);
  assert.equal(shown[0], "브라우저 메뉴의 '홈 화면에 추가'로 전체 화면을 쓸 수 있어요");
});

test('한 번 누르면 들어가고 다시 누르면 나온다 — 버튼 이름도 따라 바뀐다', async () => {
  const doc = fakeDoc();
  const ctl = createFullscreenController({ doc });
  assert.equal(ctl.supported(), true);
  assert.equal(ctl.isOn(), false);
  assert.equal(ctl.label(), LABEL_ON);

  assert.equal(await ctl.toggle(), true);
  assert.deepEqual(doc.calls, ['request:opts']);
  assert.equal(ctl.isOn(), true);
  assert.equal(ctl.label(), LABEL_OFF);

  assert.equal(await ctl.toggle(), false);
  assert.deepEqual(doc.calls, ['request:opts', 'exit']);
  assert.equal(ctl.isOn(), false);
  assert.equal(ctl.label(), LABEL_ON);
});

test('이미 전체 화면이면 토글이 곧바로 나가기로 동작한다', async () => {
  const doc = fakeDoc();
  doc.fullscreenElement = doc.documentElement;
  const ctl = createFullscreenController({ doc });
  assert.equal(await ctl.toggle(), false);
  assert.deepEqual(doc.calls, ['exit']);
});

test('옵션 인자를 모르는 브라우저는 인자 없이 다시 시도해 들어간다', async () => {
  const doc = fakeDoc({ outcome: 'throwOnce' });
  const ctl = createFullscreenController({ doc });
  assert.equal(await ctl.enter(), true);
  assert.deepEqual(doc.calls, ['request:opts', 'request']);
});

test('웹킷 접두어(구형 사파리·안드로이드 웹뷰)도 처리한다', async () => {
  const doc = fakeDoc({ webkit: true });
  doc.webkitFullscreenElement = null;
  const ctl = createFullscreenController({ doc });
  assert.equal(ctl.supported(), true);
  assert.equal(await ctl.enter(), true);
  doc.webkitFullscreenElement = doc.documentElement;
  assert.equal(ctl.isOn(), true);
  assert.equal(ctl.label(), LABEL_OFF);
});

test('사용자가 거절해 약속이 거부돼도 오류를 밖으로 던지지 않는다', async () => {
  const doc = fakeDoc({ outcome: 'reject' });
  const ctl = createFullscreenController({ doc });
  assert.equal(await ctl.enter(), false);
  assert.equal(ctl.isOn(), false);
});

test('문서가 없어도 죽지 않는다', async () => {
  const ctl = createFullscreenController({ doc: null });
  assert.equal(ctl.supported(), false);
  assert.equal(ctl.isOn(), false);
  assert.equal(await ctl.toggle(), false);
});
