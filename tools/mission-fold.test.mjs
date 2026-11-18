import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('a mission checked today leaves the today list and folds into "오늘 끝낸 미션"', async () => {
  const app = await read('app.js');
  assert.match(app, /const doneListToday = todayList\.filter\(\(c\) => c\.doneOn === t\)/);
  assert.match(app, /const todoList = todayList\.filter\(\(c\) => c\.doneOn !== t\)/);
  assert.match(app, /✅ 오늘 끝낸 미션/);
  assert.match(app, /id="choreDone"/);
  // 기본은 접힘이고, 펼친 상태는 다시 그려도 유지됩니다
  assert.match(app, /const doneOpen = !!\(document\.getElementById\('choreDone'\) && document\.getElementById\('choreDone'\)\.open\)/);
  assert.match(app, /'#choreList'\)\.innerHTML = todayHtml \+ doneHtml \+ offHtml/);
  // 끝낸 카드도 같은 체크 버튼을 쓰므로 펼치면 되돌릴 수 있습니다
  assert.match(app, /data-act="chore-toggle" data-id="\$\{c\.id\}"/);
});

test('the mission card hint explains the completed fold', async () => {
  const html = await read('index.html');
  assert.match(html, /오늘 끝낸 미션은 목록에서 사라져 아래 <b>[^<]*<\/b> 접힘 줄로 내려가고, 펼치면 체크를 되돌릴 수 있습니다/);
});

test('the school sync never pushes before the first server snapshot arrives', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(!fb\.readyData\) return;\s*\n\s*const payload = schoolDocPayload\(\);/);
  assert.match(app, /schoolSyncMaybe\(\); {10}\/\/ 서버 문서를 다 받은 뒤에만/);
});
