import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('locked parent mode hides parent-only controls instead of disabling them', async () => {
  const css = await read('style.css');
  const html = await read('index.html');
  assert.match(css, /body\[data-parent="off"\] \.parent-only \{ display: none !important; \}/);
  assert.match(html, /<body data-parent="off" class="dashboard-refresh">/);
  for (const id of ['settingsBtn', 'syncBadge', 'eventAddBtn', 'wikiAddBtn', 'schoolEditBtn', 'specialChoreAddBtn', 'choreAddBtn', 'partnerBtn', 'pointUseBtn', 'adoptBtn', 'stickerResetBtn']) {
    const re = new RegExp(`class="[^"]*parent-only[^"]*" id="${id}"`);
    assert.match(html, re, `${id} must be parent-only`);
  }
  // 아이가 쓸 수 있는 것은 그대로 보입니다
  const shown = /class="mic-btn wish-mic" id="wishMicBtn"/.test(html) && /class="btn icon sm" id="wishAddBtn"/.test(html);
  assert.ok(shown, 'wishlist + and mic stay available to the child');
  assert.match(css, /\.parent-only/);
});

test('item level parent tools carry parent-only while the child check buttons do not', async () => {
  const app = await read('app.js');
  for (const act of ['chore-edit', 'chore-del', 'ev-del', 'use-del', 'shop-toggle', 'shop-del', 'letter-del', 'wiki-edit', 'wiki-del', 'wish-buy', 'wish-edit', 'wish-del']) {
    const re = new RegExp(`class="[^"]*parent-only[^"]*" data-act="${act}"`);
    assert.match(app, re, `${act} must be parent-only`);
  }
  assert.match(app, /data-act="chore-toggle" data-id="\$\{c\.id\}"/);
  assert.doesNotMatch(app, /class="chore-check[^"]*parent-only/);
  assert.match(app, /data-act="cal-add" data-date="\$\{sel\}"[\s\S]{0,40}parent-only|cal-add parent-only/);
});

test('the schedule opens in month view by default', async () => {
  const app = await read('app.js');
  const html = await read('index.html');
  assert.match(app, /const SCHED_UI = \{ y: null, m: null, sel: null, tab: 'cal', mode: '1m' \}/);
  assert.match(app, /setCalMode\('1m'\);/);
  assert.match(html, /data-calmode="1m" aria-pressed="true"/);
});

test('the event center hides parent setups while the shared mission stamp board has no manual reset action', async () => {
  const app = await read('app.js');
  const html = await read('index.html');
  const active = await read('app-dex-integrated.js');
  assert.doesNotMatch(active, /comboPrevOk|ev-combo-toggle|3일 연속 콤보/);
  assert.match(app, /<section class="ev-sec parent-only">\s*<h4>②⚡ 부모님 깜짝 보너스/);
  assert.match(app, /<section class="ev-sec parent-only">\s*<h4>③🎂 2배 데이/);
  assert.match(app, /class="btn sm ghost parent-only" data-act="ev-gacha-edit"/);
  // 아이 참여 영역은 유지하되, 새 공유 도장판에는 수동 적립·초기화 액션이 없습니다.
  assert.match(app, /data-act="ev-secret-open"/);
  assert.match(app, /data-act="ev-gacha"\$\{tickets > 0 \? '' : ' disabled'\}/);
  assert.match(app, /data-act="ev-mvp"/);
  assert.doesNotMatch(app, /data-act="ev-stamp(?:-reset)?"/);
  assert.match(html, /class="reading-stamp-board stamp-board mission-stamp-board"[^>]*aria-labelledby="readingBoardTitle"/);
  assert.match(html, /id="readingCells" aria-label="미션 성공 도장 10칸"/);
  assert.match(html, /id="readingNote">미션 성공 1회마다 도장 1개 · 기본 미션 포인트와 별도 · 10\/10 완성 시 \+1P/);
  assert.match(app, /성공 1회마다 도장 1개/);
  assert.match(app, /10\/10 때만 \+3P/);
});

test('the event button is a surprise on the child screen and always there in parent mode', async () => {
  const app = await read('app.js');
  assert.match(app, /function eventSurprise\(\)/);
  assert.match(app, /if \(s && !s\.done\) return \{ on: true, kind: 'secret'/);
  assert.match(app, /if \(tickets > 0\) return \{ on: true, kind: 'gacha'/);
  assert.match(app, /if \(dd\.on\) return \{ on: true, kind: 'double'/);
  assert.match(app, /if \(day >= 28\) return \{ on: true, kind: 'mvp'/);
  assert.match(app, /btn\.hidden = !parent && !surprise\.on;/);
  assert.match(app, /btn\.classList\.toggle\('surprise', !!surprise\.on && !parent\)/);
  // 부모 모드를 열거나 잠글 때 바로 다시 계산됩니다
  assert.match(app, /renderParentBtn[\s\S]{0,400}renderEventBadge\(\)/);
});


test('current composition is native without the old boot conversion', async () => {
 const html=await read('index.html'),refresh=await read('dashboard-refresh.js'),selected=await read('selected-dashboard.js');
 for(const c of ['selected-top','selected-lower','partner-art-summary','partner-bottom-metrics','refresh-record-details','width-access-tools'])assert.ok(html.includes(c),c);
 assert.doesNotMatch(html,/app-booting|appBootStatus|화면 준비 중/);
 assert.doesNotMatch(refresh,/createElement|createComment|appendChild|insertBefore/);
 assert.doesNotMatch(selected,/createComment|home\(|homes|restore\(|append\(overview/);
});
test('old combo is retired without removing five-completion stars or other bonuses', async () => {
 const active=await read('app-dex-integrated.js');
 assert.doesNotMatch(active,/comboPrevOk|ev-combo-toggle|3일 연속 콤보|comboOn|comboStreakToday/);
 assert.match(active,/doubleDayOn/);assert.match(active,/awardBonus/);
 assert.match(await read('streak-core.js'),/MissionStars/);
});
