import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const layoutCheck = readFileSync(new URL('./dashboard-layout-check.py', import.meta.url), 'utf8');

test('Firebase status pill stays in the header flow instead of covering a card', () => {
  assert.match(app, /document\.querySelector\('\.top-actions'\).*?host\.appendChild\(el\)/s);
  assert.match(css, /\.fb-pill\s*\{[^}]*position:\s*static/);
  assert.doesNotMatch(css, /\.fb-pill\s*\{[^}]*position:\s*fixed/);
});

test('short desktop columns scroll and mission rows snap to readable positions', () => {
  assert.match(css, /@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-height:\s*640px\)\s*\{[^}]*\.col\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.col-right\s*>\s*#cardChores\s*\{\s*flex:\s*0\s*0\s*440px;\s*min-height:\s*440px;/);
  assert.match(css, /\.card\.chores\s+\.chore-list\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.card\.chores\s+\.chore-list\s*\{[^}]*scroll-snap-type:\s*y proximity/s);
  assert.match(css, /\.card\.chores\s+\.chore-list\s*>\s*\.chore\s*\{[^}]*scroll-snap-align:\s*start/);
  assert.match(css, /\.card\.chores\s+\.chore-title\s*\{[^}]*white-space:\s*normal/);
  assert.match(css, /\.chore-check\s*\{[^}]*width:\s*44px/);
});

test('school rows expose every chip without a disclosure control', () => {
  assert.match(css, /\.card\.school\s+\.card-body\s*\{[^}]*overflow-x:\s*hidden;\s*overflow-y:\s*auto/s);
  assert.doesNotMatch(app, /data-act="school-chips-toggle"/);
  assert.match(app, /return arr\.map\(\(x\) => `<span class="sch-chip/);
});

test('wish balance shares a single header line and preserves a usable list viewport', () => {
  assert.doesNotMatch(html, /id="wishBalance"/);
  assert.match(html, /id="wishSub"/);
  assert.match(app, /function wishHeaderSubtitle\(left =/);
  assert.match(app, /🪙 \$\{balancePts\(\)\}P · 위시 \$\{waiting\}개/);
  assert.match(css, /#cardWish #wishSub\s*\{[^}]*display:\s*block\s*!important;[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.card\.wish\s+\.wish-list\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.card\.wish\s+\.wish-list\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*1023px\)\s*\{\s*#cardWish\s*\{\s*height:\s*auto;\s*min-height:\s*0;\s*max-height:\s*none/s);
});

test('layout checker verifies the last wish item, minimum list height, and 6-week Sunday case', () => {
  assert.match(layoutCheck, /result\["wish"\]\["lastItemFullyReachable"\]/);
  assert.match(layoutCheck, /result\["wish"\]\["clientH"\]\s*>=\s*32/);
  assert.match(layoutCheck, /weekCount[^\n]*== 6/);
  assert.match(layoutCheck, /cellCount[^\n]*== 42/);
  assert.match(layoutCheck, /isSunday/);
});

test('stamp-board status and reward policy are separate, without repeated accrual guidance', () => {
  assert.equal((html.match(/id="readingPoints"/g) || []).length, 1);
  assert.equal((html.match(/id="readingNote"/g) || []).length, 1);
  assert.match(html, /id="readingPoints">총 미션 성공 횟수는 가족 동기화 후 표시돼요/);
  assert.match(app, /\$\('#readingPoints'\)\.textContent = connected[\s\S]*?성공 기록은 연결 후 표시돼요/);
  assert.match(app, /기본 미션 포인트와 별도 · 도장판 10\/10 때만 \+3P/);
  assert.match(app, /stampBonusPending/);
});
